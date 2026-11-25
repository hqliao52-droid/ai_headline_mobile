#!/usr/bin/env node
/**
 * 聊天 WebSocket 自检：直接连后端 /chatMessage/ws/chat_with_ai，把服务端推的每一帧打印出来。
 *
 * 用途：前端只看到“没回复”或连接被关时，用这个脚本判断是
 *   1) 接口不存在（握手就被拒，HTTP 404/403）
 *   2) 连通了但服务端没吐内容（LLM/检索报错，服务端内部 catch 掉了）
 *   3) 正常流式返回
 *
 * 用法（需要 Node 22+，用内置 WebSocket，不依赖第三方包）：
 *   node scripts/probe-chat-ws.js --user-id=1 --session-id=1 --query="你好"
 *   node scripts/probe-chat-ws.js --user-id=1 --query="你好" --news-ids=12,13
 *
 * 退出码：0 = 收到正文；2 = 连上了但没收到正文；1 = 连不上/参数错误。
 */
const serverConfig = require('../config/server.config.js');

const CHAT_STREAM_PATH = '/chatMessage/ws/chat_with_ai';
const DEFAULT_TIMEOUT = 60000;

function parseArgs(argv) {
    const options = {
        userId: null,
        sessionId: null,
        query: '你好',
        newsIds: [],
        files: [],
        timeout: DEFAULT_TIMEOUT,
    };

    for (const arg of argv) {
        const [key, ...rest] = arg.split('=');
        const value = rest.join('=');
        switch (key) {
            case '--user-id':
                options.userId = Number(value);
                break;
            case '--session-id':
                options.sessionId = value ? Number(value) : null;
                break;
            case '--query':
                options.query = value || options.query;
                break;
            case '--news-ids':
                options.newsIds = value
                    ? value.split(',').map(item => Number(item.trim())).filter(Number.isFinite)
                    : [];
                break;
            case '--files':
                options.files = value ? value.split(',').filter(Boolean) : [];
                break;
            case '--timeout':
                options.timeout = Number(value) || DEFAULT_TIMEOUT;
                break;
            default:
                break;
        }
    }
    return options;
}

function short(text, max = 80) {
    const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    return value.length > max ? `${value.slice(0, max)}…` : value;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!Number.isFinite(options.userId) || !options.userId) {
        console.error('缺少 --user-id，例如：node scripts/probe-chat-ws.js --user-id=1 --query="你好"');
        process.exitCode = 1;
        return;
    }
    if (typeof WebSocket !== 'function') {
        console.error('当前 Node 版本没有内置 WebSocket（需要 Node 22+）');
        process.exitCode = 1;
        return;
    }

    const url = `${serverConfig.wsBaseURL}${CHAT_STREAM_PATH}`;
    const payload = {
        query: options.query,
        user_id: options.userId,
        session_id: options.sessionId || 0,
        news_ids: options.newsIds,
        files: options.files,
    };

    console.log(`[chat-ws] 目标：${url}`);
    console.log(`[chat-ws] 发送：${JSON.stringify(payload)}`);

    const socket = new WebSocket(url);
    let content = '';
    let frames = 0;
    const startedAt = Date.now();

    const timer = setTimeout(() => {
        console.log(`[chat-ws] ⏱ 超过 ${options.timeout}ms 仍未结束，主动断开`);
        try {
            socket.close();
        } catch (e) {
            /* ignore */
        }
    }, options.timeout);

    socket.addEventListener('open', () => {
        console.log('[chat-ws] ✅ 握手成功，发送 ChatMsg');
        socket.send(JSON.stringify(payload));
    });

    socket.addEventListener('message', event => {
        frames += 1;
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        let frame = null;
        try {
            frame = JSON.parse(raw);
        } catch (e) {
            console.log(`[chat-ws] #${frames} 非 JSON 帧：${short(raw)}`);
            content += raw;
            return;
        }

        const status = frame.status || '(无 status)';
        const body = frame.content || frame.final_content || frame.error_content || '';
        console.log(`[chat-ws] #${frames} status=${status} content=${short(body)}`);
        if (status === 'generating' && frame.content) content += frame.content;
        if (status === 'exception') content += `[exception] ${frame.error_content || ''}`;
    });

    socket.addEventListener('error', event => {
        console.error('[chat-ws] ❌ 连接错误：', (event && (event.message || event.error)) || 'unknown');
    });

    socket.addEventListener('close', event => {
        clearTimeout(timer);
        const elapsed = Date.now() - startedAt;
        console.log('[chat-ws] 连接关闭', {
            code: event.code,
            reason: event.reason || '',
            elapsed: `${elapsed}ms`,
            frames,
            gotContent: Boolean(content),
        });

        if (content) {
            console.log(`[chat-ws] ✅ 共收到正文 ${content.length} 字`);
            console.log(`[chat-ws] 正文前 200 字：${short(content, 200)}`);
            return;
        }

        console.log('[chat-ws] ❌ 连接建立/关闭了，但一帧正文都没收到');
        console.log('     常见原因：');
        console.log('       1) 后端没有部署这个 websocket 路由（握手阶段会直接 403/404，日志里 code 多为 1006）');
        console.log('       2) 后端内部报错被 catch 掉了（看后端日志：LLM 密钥、Redis、checkpointer 是否正常）');
        console.log(`       3) 关闭码 ${event.code}：1000=正常关闭但无内容，1008=ChatMsg 校验失败，1011=服务端异常`);
        process.exitCode = 2;
    });
}

main();
