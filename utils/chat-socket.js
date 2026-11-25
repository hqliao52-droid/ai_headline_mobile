// utils/chat-socket.js
// 聊天流式输出：对接后端 /chatMessage/ws/chat_with_ai
//
// 协议（见 ai_headline_mobile/app/api/chat_message_api.py 的 ws_chat_with_ai +
//       app/services/ai_service.py 的 websocket_stream）：
//   1. 连接建立后，客户端先发一条 ChatMsg：
//        { query, user_id, session_id, news_ids, files }
//   2. 服务端持续推送 JSON 帧：
//        { status: 'analyzing' | 'retrieving' | 'generating', content, trace_id, ... }
//      analyzing 帧的 content 是模型的思考内容（reasoning_content），不是回答正文，
//      单独回调给页面做折叠展示；只有 generating 帧的 content 才是回答正文。
//   3. 回答结束（或异常）时服务端直接关闭连接，不会再补发 done 帧，
//      所以「连接关闭」即视为本轮结束，最终内容由服务端持久化。
import config from './config.js';

/** 聊天流接口路径（不含 ws 协议与域名） */
export const CHAT_STREAM_PATH = '/chatMessage/ws/chat_with_ai';

/** 后端 status 字段 -> 前端提示文案 */
export const CHAT_STATUS_TEXT = {
  analyzing: '正在分析问题...',
  reading: '正在阅读用户提供的资料...',
  retrieving: '正在检索资料...',
  generating: '正在生成回复...'
};

/** 默认连接超时（毫秒） */
const CONNECT_TIMEOUT = 15000;

/**
 * 打开一条聊天流。
 *
 * @param {Object} options
 * @param {Object} options.payload 发送给后端的 ChatMsg
 * @param {(text: string) => void} [options.onStatus] 状态变化（用于展示“正在分析...”等提示）
 * @param {(text: string) => void} [options.onReasoning] 思考过程增量（analyzing 帧，可折叠展示）
 * @param {(text: string) => void} [options.onChunk]  回答正文增量
 * @param {(info: {gotContent: boolean, gotReasoning: boolean, code?: number, reason?: string}) => void} [options.onDone] 本轮正常结束
 * @param {(err: Error) => void} [options.onError] 本轮异常结束
 * @param {number} [options.timeout] 连接超时（毫秒）
 * @returns {{ close: () => void, isClosed: () => boolean }} 用于中途主动断开
 */
export function openChatStream({
  payload,
  onStatus,
  onReasoning,
  onChunk,
  onDone,
  onError,
  timeout = CONNECT_TIMEOUT
}) {
  const url = `${config.wsURL}${CHAT_STREAM_PATH}`;

  let task = null;
  let settled = false; // onDone / onError 是否已回调，避免重复收尾
  let gotContent = false; // 是否收到过正文
  let gotReasoning = false; // 是否收到过思考过程
  let timer = null;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const finishDone = (info = {}) => {
    if (settled) return;
    settled = true;
    clearTimer();
    if (onDone) onDone({ gotContent, gotReasoning, ...info });
  };

  const finishError = (err) => {
    if (settled) return;
    settled = true;
    clearTimer();
    const error = err instanceof Error ? err : new Error(String(err || '聊天连接异常'));
    if (onError) onError(error);
  };

  // 解析服务端推送的一帧
  const handleFrame = (raw) => {
    if (settled || raw === null || raw === undefined) return;

    let frame = raw;
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (!text) return;
      try {
        frame = JSON.parse(text);
      } catch (e) {
        // 非 JSON：当作纯文本增量（兼容旧的 [[STATUS:xxx]] 协议）
        gotContent = true;
        if (onChunk) onChunk(raw);
        return;
      }
    }
    if (!frame || typeof frame !== 'object') return;

    const status = frame.status;
    const content = typeof frame.content === 'string' ? frame.content : '';

    if (status === 'done') {
      finishDone();
      return;
    }
    if (status === 'exception') {
      finishError(new Error(frame.error_content || 'AI 服务异常，请稍后重试'));
      return;
    }
    if (status === 'analyzing' || status === 'retrieving' || status === 'reading') {
      // 推理内容不进回答正文，单独走 onReasoning，由页面折叠展示
      const reasoning =
        status === 'analyzing'
          ? content || (typeof frame.reasoning_content === 'string' ? frame.reasoning_content : '')
          : '';
      if (reasoning) {
        gotReasoning = true;
        if (onReasoning) onReasoning(reasoning);
      }
      if (onStatus) onStatus(CHAT_STATUS_TEXT[status] || '');
      return;
    }
    if (status === 'generating') {
      if (onStatus) onStatus(CHAT_STATUS_TEXT[status] || '');
      if (content) {
        gotContent = true;
        if (onChunk) onChunk(content);
      }
      return;
    }
    // 没有 status 字段的帧：只取 content
    if (content) {
      gotContent = true;
      if (onChunk) onChunk(content);
    }
  };

  const noopHandle = { close() {}, isClosed: () => true };

  try {
    task = uni.connectSocket({
      url,
      // 传 complete 是官方推荐写法，保证各端都返回 SocketTask
      complete: () => {}
    });
  } catch (e) {
    finishError(e);
    return noopHandle;
  }

  if (!task || typeof task.onOpen !== 'function') {
    finishError(new Error('当前环境不支持 WebSocket'));
    return noopHandle;
  }

  // 连接阶段看门狗：连不上时不要让用户一直等
  timer = setTimeout(() => {
    finishError(new Error('连接超时，请检查网络后重试'));
    try {
      task.close({});
    } catch (e) {
      /* ignore */
    }
  }, timeout);

  task.onOpen(() => {
    if (settled) {
      try {
        task.close({});
      } catch (e) {
        /* ignore */
      }
      return;
    }
    clearTimer();
    console.log('[chat] WebSocket 已连接', url);
    try {
      // 连接建立后再把 ChatMsg 发给后端
      task.send({ data: JSON.stringify(payload || {}) });
    } catch (e) {
      finishError(e);
    }
  });

  task.onMessage((res) => {
    handleFrame(res ? res.data : null);
  });

  task.onError((err) => {
    console.error('[chat] WebSocket 错误', err);
    finishError(new Error((err && (err.errMsg || err.message)) || '聊天连接失败'));
  });

  task.onClose((res) => {
    if (settled) return;
    const code = res && res.code;
    const reason = (res && res.reason) || '';
    console.log('[chat] WebSocket 关闭', { code, reason, gotContent });
    // 没收到正文就非正常关闭（例如 1008 ChatMsg 校验失败）
    if (!gotContent && code && code !== 1000) {
      finishError(new Error(reason || `连接已关闭（${code}）`));
      return;
    }
    // 后端回答结束时直接关连接，没有 done 帧
    finishDone({ code, reason });
  });

  return {
    /** 主动断开（不再触发 onDone / onError） */
    close() {
      settled = true;
      clearTimer();
      try {
        task.close({});
      } catch (e) {
        /* ignore */
      }
    },
    isClosed() {
      return settled;
    }
  };
}
