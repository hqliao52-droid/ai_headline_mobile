import { request } from '@/utils/request.js';
import { getUserInfo, clearLoginStatus } from '@/utils/user.js';
import { getReadHistory, MAX_HISTORY_COUNT } from '@/utils/history.js';
import { streamRequest } from '@/utils/stream-request.js';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-light.css';
import { onLoad } from 'uview-ui/libs/mixin/mixin';
import { uploadSingleSpeciallyFile } from "@/utils/uploadFile.js"
import { openChatStream } from '@/utils/chat-socket.js';
// 底部 tab 切换的进入动画：每次 onShow 重新算一次方向
import { resolveTabEnterClass } from '@/utils/tab-transition.js';
// 引用计数的 Loading：并发请求下 show/hide 才配得上对
import { showLoading, hideLoading, resetLoading } from '@/utils/loading.js';

export default {
  data() {
    return {
      userInfo: null,
      // 抽屉「新建」防连点
      creatingSession: false,
      // 聊天消息列表
      messageList: [],
      nikeName: '',
      avatar: '',
      // 常用查询标签
      quickTags: [],

      // 侧边栏
      showSidebar: false,
      sessionList: [],
      groupedSessions: [],

      inputText: '',
      lastDeletedText: '',

      currentSessionId: null,
      isStreaming: false,
      statusText: '',
      // 当前聊天流句柄（utils/chat-socket.js 返回），非响应式数据，仅用于主动断开
      chatStream: null,

      mermaidDiagrams: {},

      // u-parse 的标签样式，用于在富文本里保持与气泡一致的字体/换行/列表展示
      bubbleTagStyle: {
        h1: 'margin:12rpx 0;padding:0;font-size:36rpx;font-weight:700;line-height:1.4;color:#16202E;',
        h2: 'margin:10rpx 0;padding:0;font-size:34rpx;font-weight:600;line-height:1.4;color:#16202E;',
        h3: 'margin:8rpx 0;padding:0;font-size:32rpx;font-weight:600;line-height:1.4;color:#16202E;',
        h4: 'margin:6rpx 0;padding:0;font-size:30rpx;font-weight:600;line-height:1.4;color:#16202E;',
        h5: 'margin:6rpx 0;padding:0;font-size:28rpx;font-weight:600;line-height:1.4;color:#16202E;',
        h6: 'margin:6rpx 0;padding:0;font-size:26rpx;font-weight:600;line-height:1.4;color:#5A6B82;',

        p: 'margin:0;padding:0;font-size:30rpx;line-height:1.65;color:#16202E;word-break:break-word;',
        br: 'display:block;',
        strong: 'font-weight:700;',
        em: 'font-style:italic;',
        ol: 'margin:0;padding-left:44rpx;',
        ul: 'margin:0;padding-left:44rpx;',
        li: 'margin:6rpx 0;font-size:30rpx;line-height:1.65;',

        pre: 'background:#F1F5FB;padding:16rpx;border-radius:12rpx;overflow-x:auto;margin:10rpx 0;',
        code: 'font-family:monospace;font-size:26rpx;background:#EAF2FE;color:#0146AD;padding:2rpx 6rpx;border-radius:4rpx;'
      },

      scrollTop: 0,
      recentHistory: [],
      // 最近阅读最多保留条数（与 utils/history.js 保持一致）
      maxHistoryCount: MAX_HISTORY_COUNT,
      isHistoryExpanded: false,

      selectedNewsIds: [],

      showPlusMenu: false,
      recentFiles: [],
      showRecentFilesList: false,
      attachedFiles: [],

      // tab 切换时的进入动画 class，由 onShow 里重新计算（见 utils/tab-transition.js）
      tabEnterClass: '',

    };
  },
  computed: {
    // 输入框有内容才能发送（PRD 4.3：为空时发送按钮置灰不可点）。
    // 流式回复期间也置灰：同一时刻只允许一轮问答
    canSend() {
      return !!(this.inputText && this.inputText.trim()) && !this.isStreaming;
    }
  },
  onShow() {
    // 先刷新用户信息再决定要不要拉会话：token 被清掉后（退出登录、401 统一处理）
    // userInfo 可能还残留，这里会一并判掉，避免带着空 token 去请求
    this.loadUserInfo();
    this.loadRecentHistory();
    // tab 切换动画：原生 tabBar 没有转场，靠这里给消息区重新播一遍进入动画
    this.tabEnterClass = resolveTabEnterClass('/pages/ai-chat/ai-chat');
    this.$nextTick(() => {
      this.initDefaultSession();
    });
  },
  onLoad() {
    this.loadRecentFiles();
  },
  onUnload() {
    // 离开页面时断开聊天流，避免后台空跑连接
    this.closeChatStream();
    // Loading 计数兜底清零：页面都走了还挂着 Loading 会把全局 Loading 卡死
    resetLoading();
  },

  methods: {
    // 遮罩上的 touchmove.stop.prevent 需要一个空处理器
    noop() {},

    togglePlusMenu() {
      this.showPlusMenu = !this.showPlusMenu;
      // 如果关闭菜单，同时也关闭右侧文件列表
      if (!this.showPlusMenu) {
        this.showRecentFilesList = false;
      }
    },
    closePlusMenu() {
      this.showPlusMenu = false;
      this.showRecentFilesList = false;
    },
    toggleRecentFiles() {
      this.showRecentFilesList = !this.showRecentFilesList;
    },
    async handleUploadAttachment() {
      let isLoadingShown = false; // 标记 Loading 是否已显示
      // 最大上传10MB的文件
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      try {
        let filePath = '';
        let fileName = '';
        let fileSize = 0;

        // #ifdef H5
        // H5 端使用 chooseFile
        const h5Res = await new Promise((resolve, reject) => {
          uni.chooseFile({
            count: 1,
            extension: ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.txt', '.jpg', '.png'],
            success: resolve,
            fail: reject
          });
        });
        if (h5Res && h5Res.tempFiles && h5Res.tempFiles.length > 0) {
          filePath = h5Res.tempFiles[0].path;
          fileName = h5Res.tempFiles[0].name;
          fileSize = h5Res.tempFiles[0].size;
        } else {
          return;
        }
        // #endif

        // #ifdef MP-WEIXIN
        // 微信小程序使用 chooseMessageFile
        const wxRes = await new Promise((resolve, reject) => {
          uni.chooseMessageFile({
            count: 1,
            type: 'all',
            success: resolve,
            fail: reject
          });
        });
        if (wxRes && wxRes.tempFiles && wxRes.tempFiles.length > 0) {
          filePath = wxRes.tempFiles[0].path;
          fileName = wxRes.tempFiles[0].name;
          fileSize = wxRes.tempFiles[0].size;
        } else {
          return;
        }
        // #endif

        // #ifdef APP-PLUS
        // App 端简单处理，提示或使用 chooseImage (视具体需求而定，这里暂时提示)
        // uni.showToast({ title: 'App端暂不支持此功能', icon: 'none' });
        // return;
        // #endif

        if (!filePath) {
          return;
        }

        // 检查文件大小
        if (fileSize > MAX_FILE_SIZE) {
          uni.showToast({
            title: `文件大小超过限制(10MB)，当前: ${(fileSize / 1024 / 1024).toFixed(2)}MB`,
            icon: 'none',
            duration: 3000
          });
          return;
        }

        // 只有在成功获取到文件路径后，才显示 Loading
        showLoading('上传中...');
        isLoadingShown = true;

        // 调用单文件上传工具
        const uploadResult = await uploadSingleSpeciallyFile(filePath, fileName);

        console.log('上传成功:', uploadResult);

        uni.showToast({
          title: '上传成功',
          icon: 'success'
        });

        // TODO: 处理上传结果，保存到 this.attachedFiles
        if (this.attachedFiles) {
          this.attachedFiles.push(uploadResult);
          this.recentFiles.push(uploadResult);
        }

      } catch (err) {
        console.error('上传过程异常:', err);

        // 1. 处理用户取消选择的情况
        if (err.errMsg && (err.errMsg.includes('cancel') || err.errMsg.includes('fail cancel'))) {
          console.log('用户取消了文件选择');
          return; // 直接返回，不执行后续的 hideLoading 和 toast
        }

        // 2. 处理其他真实错误
        uni.showToast({
          title: '上传失败',
          icon: 'none'
        });
      } finally {
        // 3. 只有当 Loading 真正显示过时，才执行 hideLoading
        if (isLoadingShown) {
          hideLoading();
        }
        this.closePlusMenu();
      }
    },
    loadRecentFiles() {
      // TODO: 从本地缓存或服务器获取最近使用的5个文件
      // this.recentFiles = [...];
    },
    selectRecentFile(file) {
      console.log('选中近期文件:', file);
      // TODO: 将文件添加到待发送列表或直接作为上下文
      uni.showToast({
        title: `已选择: ${file.filename}`,
        icon: 'none'
      });
      this.closePlusMenu();
    },

    toggleNewsSelection(item) {
      const id = item.id;
      const index = this.selectedNewsIds.indexOf(id);

      if (index > -1) {
        // 已选中，则取消选中
        this.selectedNewsIds.splice(index, 1);
      } else {
        // 未选中，则加入
        // 可选：限制最大选中数量，例如最多5篇
        if (this.selectedNewsIds.length >= 5) {
          uni.showToast({ title: '最多同时参考5篇文章', icon: 'none' });
          return;
        }
        this.selectedNewsIds.push(id);
      }
    },
    clearSelectedNews() {
      this.selectedNewsIds = [];
    },
    clearInputWithBackup() {
      if (!this.inputText) return;

      // 1. 备份当前内容
      this.lastDeletedText = this.inputText;

      // 2. 清空输入框
      this.inputText = '';

      // 3. 可选：给个轻微提示
      uni.showToast({
        title: '已暂存，可点击恢复',
        icon: 'none',
        duration: 500
      });
    },
    clearInputWithbackUpBar() {
      if (!this.lastDeletedText) return;
      this.lastDeletedText = "";

    },
    restoreDeletedText() {
      if (this.lastDeletedText) {
        this.inputText = this.lastDeletedText;
      }
    },
    onInput(e) {
      // 输入框高度交给 textarea 的 auto-height 自己算，这里只同步值，
      // 保证「有内容才能发送」的按钮态和清空按钮及时更新
      this.inputText = e.detail.value;
    },
    toggleHistory() {
      this.isHistoryExpanded = !this.isHistoryExpanded;
    },
    loadRecentHistory() {
      if (this.userInfo && this.userInfo.id) {
        this.recentHistory = getReadHistory(this.userInfo.id);
      } else {
        this.recentHistory = [];
      }
    },

    // 简易 Markdown -> HTML（只覆盖你当前需求：加粗、换行、编号列表/列表项）
    // 在 renderMarkdownToHtml 方法中，修改代码块和Mermaid的处理逻辑

    renderMarkdownToHtml(md) {
      if (!md) return '';

      const src = String(md)
        .replace(/\[\[END\]\]/g, '')
        .replace(/\[\[ERROR\]\]/g, '')
        .replace(/\r\n/g, '\n');

      // 存储提取的代码块
      const codeBlocks = [];
      const mermaidBlocks = [];

      let processed = src;

      // 1. 提取Mermaid代码块 - 修复正则表达式，正确匹配结束标记
      processed = processed.replace(/```mermaid\s*\n([\s\S]*?)```/g, (match, code) => {
        const id = `MERMAID_${mermaidBlocks.length}`;
        // 去除可能的尾部空白，但保留缩进
        const cleanCode = code.replace(/\n+$/, '').trimEnd();
        mermaidBlocks.push({
          id,
          code: cleanCode
        });
        // 返回一个占位符，用特殊标记包裹
        return `\n<!--MERMAID_START--><div class="mermaid-placeholder" data-mermaid-id="${id}">${this.escapeHtml(cleanCode)}</div><!--MERMAID_END-->\n`;
      });

      // 2. 提取普通代码块 - 同样修复正则表达式
      processed = processed.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (match, lang, code) => {
        // 跳过mermaid（已经在上面处理了）
        if (lang.toLowerCase() === 'mermaid') {
          return match;
        }

        const id = `CODE_${codeBlocks.length}`;
        const cleanCode = code.replace(/\n+$/, '').trimEnd();

        // 高亮处理
        let highlightedCode = '';
        if (lang && hljs.getLanguage(lang)) {
          try {
            highlightedCode = hljs.highlight(cleanCode, { language: lang }).value;
          } catch (e) {
            highlightedCode = this.escapeHtml(cleanCode);
          }
        } else {
          highlightedCode = this.escapeHtml(cleanCode);
        }

        codeBlocks.push({
          id,
          lang: lang || 'text',
          code: cleanCode,
          highlighted: highlightedCode
        });

        return `\n<!--CODEBLOCK_START--><div class="code-block-wrapper" data-code-id="${id}">
          <div class="code-block-header">
            <span class="code-lang">${lang || 'text'}</span>
            <span class="code-copy-btn" data-code="${this.escapeHtml(cleanCode).replace(/"/g, '&quot;')}">复制</span>
          </div>
          <pre><code class="hljs ${lang ? 'language-' + lang : ''}">${highlightedCode}</code></pre>
        </div><!--CODEBLOCK_END-->\n`;
      });

      // 3. 处理行内代码（注意：不要影响已处理的代码块）
      processed = processed.replace(/(?<!`)`([^`\n]+)`(?!`)/g, '<code inline>$1</code>');

      // 4. 处理其他Markdown元素
      const lines = processed.split('\n');
      let out = [];
      let inOl = false;
      let inBlock = false; // 标记是否在特殊块中

      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];

        // 检查是否是特殊块的开始/结束标记
        if (rawLine.includes('<!--MERMAID_START-->') || rawLine.includes('<!--CODEBLOCK_START-->')) {
          // 如果在列表中，先闭合
          if (inOl) {
            inOl = false;
            out.push('</ol>');
          }
          inBlock = true;
          // 移除注释标记，保留实际内容
          const cleanLine = rawLine.replace(/<!--(?:MERMAID|CODEBLOCK)_START-->/g, '');
          out.push(cleanLine);
          continue;
        }

        if (rawLine.includes('<!--MERMAID_END-->') || rawLine.includes('<!--CODEBLOCK_END-->')) {
          const cleanLine = rawLine.replace(/<!--(?:MERMAID|CODEBLOCK)_END-->/g, '');
          out.push(cleanLine);
          inBlock = false;
          continue;
        }

        // 如果当前在代码块中，直接输出
        if (inBlock) {
          out.push(rawLine);
          continue;
        }

        // 标题处理
        const headerMatch = rawLine.match(/^(\#{1,6})\s+(.*)$/);
        if (headerMatch) {
          if (inOl) {
            inOl = false;
            out.push('</ol>');
          }
          const level = headerMatch[1].length;
          const content = this.renderInline(headerMatch[2]);
          out.push(`<h${level}>${content}</h${level}>`);
          continue;
        }

        // 有序列表处理
        const line = rawLine || '';
        const m = line.match(/^\s*(\d+)\.\s+(.*)$/);
        if (m) {
          if (!inOl) {
            inOl = true;
            out.push('<ol>');
          }
          const content = m[2] ?? '';
          out.push('<li>' + this.renderInline(content) + '</li>');
          continue;
        }

        // 空行处理
        if (!line.trim()) {
          if (inOl) {
            inOl = false;
            out.push('</ol>');
          }
          out.push('<br/>');
          continue;
        }

        // 非列表行
        if (inOl) {
          inOl = false;
          out.push('</ol>');
        }

        out.push('<p>' + this.renderInline(line) + '</p>');
      }

      if (inOl) out.push('</ol>');

      return out.join('');
    },

    /**
     * 行内元素渲染
     */
    renderInline(text) {
      if (!text) return '';
      let t = text;
      // 先转义HTML
      t = this.escapeHtml(t);
      // 加粗：**text**
      t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // 斜体：*text*
      t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
      return t;
    },

    /**
     * HTML转义
     */
    escapeHtml(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    /**
     * 渲染Mermaid图表（如果平台支持）
     * 注意：小程序环境可能不支持动态渲染Mermaid
     */
    renderMermaid(id, code) {
      // 在小程序/H5环境中，Mermaid需要特殊处理
      // 这里返回一个包含原始代码的pre标签，或者使用图片替代
      return `<pre class="mermaid-code">${this.escapeHtml(code)}</pre>`;
    },

    // 后端 ws_chat_with_ai 目前会把同一条用户消息写两次（路由里写一次、ai_service 里又写一次），
    // 渲染历史时去掉相邻的重复用户消息；后端修好后这段逻辑不会有副作用。
    dedupeAdjacentUserMessages(list) {
      const result = [];
      (list || []).forEach(item => {
        const prev = result[result.length - 1];
        if (
          item && item.role === 'user' && prev && prev.role === 'user' &&
          (item.content || '') === (prev.content || '')
        ) {
          return;
        }
        result.push(item);
      });
      return result;
    },

    // 主动断开当前聊天流（新建会话 / 切换会话 / 页面卸载时调用）
    closeChatStream() {
      if (this.chatStream) {
        this.chatStream.close();
        this.chatStream = null;
      }
      // 让上一轮遗留的批量刷新定时器失效
      this._chatStreamSeq = (this._chatStreamSeq || 0) + 1;
      this.isStreaming = false;
      this.statusText = '';
    },

    // 与后端建立聊天流：/chatMessage/ws/chat_with_ai
    // 连接建立后先发一条 ChatMsg，随后逐帧接收 JSON：
    //   analyzing / retrieving / reading -> 只更新状态文案
    //   generating                       -> 追加回答正文
    //   连接关闭                          -> 本轮结束（服务端不再补发 done 帧）
    startChatStream(payload, aiIndex) {
      const that = this;

      // 每次开流自增，用于丢弃上一轮遗留的批量刷新定时器
      const streamSeq = (this._chatStreamSeq || 0) + 1;
      this._chatStreamSeq = streamSeq;
      const isCurrentStream = () => that._chatStreamSeq === streamSeq;

      // 流式分片先攒起来，定时批量刷新，避免每个 token 都整篇重渲染
      // 注意：流式期间只更新纯文本 content，不做 markdown 解析。
      // u-parse 每次 content 变化都会整篇解析并起一个 350ms 的量测定时器
      // （内部用 uni.createSelectorQuery 量高），逐帧喂给它既卡又会刷出 createSelectorQuery 报错，
      // 所以等流结束（onDone）时再一次性解析成 renderedHtml。
      let pending = '';
      let pendingReasoning = '';
      let flushTimer = null;
      let reasoningStartAt = 0;
      let reasoningEnded = false;

      const flush = () => {
        flushTimer = null;
        if (!isCurrentStream()) {
          pending = '';
          pendingReasoning = '';
          return;
        }
        const msg = that.messageList[aiIndex];
        if (!msg) return;

        if (pendingReasoning) {
          const nextReasoning = (msg.reasoning || '') + pendingReasoning;
          pendingReasoning = '';
          that.$set(msg, 'reasoning', nextReasoning);
          if (msg.isReasoningExpanded) that.scrollToBottom();
        }
        if (pending) {
          const next = (msg.content || '') + pending;
          pending = '';
          that.$set(msg, 'content', next);
          that.scrollToBottom();
        }
      };

      const scheduleFlush = () => {
        if (flushTimer) return;
        flushTimer = setTimeout(flush, 80);
      };

      // 收尾前把剩下的分片刷进气泡
      const flushNow = () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flush();
      };

      // 思考过程结束（开始输出正文或整轮结束）时结算耗时
      const endReasoning = () => {
        if (reasoningEnded) return;
        reasoningEnded = true;
        if (!reasoningStartAt) return;
        const msg = that.messageList[aiIndex];
        if (msg) that.$set(msg, 'reasoningMs', Date.now() - reasoningStartAt);
      };

      this.chatStream = openChatStream({
        payload,
        onStatus(text) {
          if (text) that.statusText = text;
        },
        onReasoning(text) {
          if (!text) return;
          const msg = that.messageList[aiIndex];
          if (msg && !reasoningStartAt) {
            reasoningStartAt = Date.now();
            // 第一次拿到思考内容时自动展开，让用户看到进度（用户手动收起的除外）
            if (!msg.reasoningTouched) that.$set(msg, 'isReasoningExpanded', true);
          }
          pendingReasoning += text;
          scheduleFlush();
        },
        onChunk(text) {
          if (!text) return;
          // 正文开始了，思考阶段结束：用户没手动操作过就自动收起
          endReasoning();
          const msg = that.messageList[aiIndex];
          if (msg && msg.isReasoningExpanded && !msg.reasoningTouched) {
            that.$set(msg, 'isReasoningExpanded', false);
          }
          pending += text;
          scheduleFlush();
        },
        onDone(info) {
          that.chatStream = null;
          endReasoning();
          flushNow();
          that.isStreaming = false;
          that.statusText = '';

          const msg = that.messageList[aiIndex];
          if (!msg) return;
          if (!msg.content) {
            // 连接结束了却一个字都没收到：服务端异常 / 服务端没部署该接口 / 断流
            console.warn('[chat] 连接已关闭但未收到任何内容', info);
            // 不用假文案糊住，标成失败，让用户在消息旁点重试
            that.$set(msg, '_failed', true);
          }
          // 流结束后一次性解析成 markdown 再渲染
          that.$set(msg, 'renderedHtml', that.renderMarkdownToHtml(msg.content || ''));
          that.scrollToBottom();
        },
        onError(err) {
          that.chatStream = null;
          endReasoning();
          flushNow();
          that.isStreaming = false;
          that.statusText = '';

          console.error('[chat] 聊天连接异常', err);
          const msg = that.messageList[aiIndex];
          if (msg) {
            // 已收到的部分保留，整体标为失败并提供重试入口
            that.$set(msg, '_failed', true);
            if (!msg.renderedHtml) {
              that.$set(msg, 'renderedHtml', that.renderMarkdownToHtml(msg.content || ''));
            }
          }
          uni.showToast({ title: (err && err.message) || '发送失败', icon: 'none' });
          that.scrollToBottom();
        }
      });
    },

    // 失败重试：把这条失败的回复清空，用同一个提问重新开流（不新增气泡）
    retryMessage(index) {
      if (this.isStreaming) {
        uni.showToast({ title: 'AI 正在回复，请稍候', icon: 'none' });
        return;
      }

      const msg = this.messageList[index];
      if (!msg || msg.role !== 'assistant') return;

      let userIndex = -1;
      for (let i = index - 1; i >= 0; i--) {
        if (this.messageList[i].role === 'user') {
          userIndex = i;
          break;
        }
      }
      if (userIndex < 0) return;

      if (!this.ensureLogin({ redirect: true })) return;

      const userMsg = this.messageList[userIndex];
      this.$set(msg, '_failed', false);
      this.$set(msg, 'content', '');
      this.$set(msg, 'renderedHtml', '');
      this.$set(msg, 'reasoning', '');
      this.$set(msg, 'reasoningMs', 0);
      this.$set(msg, 'isReasoningExpanded', false);

      this.isStreaming = true;
      this.statusText = '正在连接...';
      this.scrollToBottom();

      this.startChatStream({
        query: userMsg.content,
        user_id: parseInt(this.userInfo.id),
        session_id: this.currentSessionId || 0,
        news_ids: userMsg._newsIds || [],
        files: userMsg._files || []
      }, index);
    },

    // 展开/折叠某条 AI 消息的思考过程
    toggleReasoning(index) {
      const msg = this.messageList[index];
      if (!msg || !msg.reasoning) return;
      // 标记用户手动操作过，后续不再自动展开/收起
      this.$set(msg, 'reasoningTouched', true);
      this.$set(msg, 'isReasoningExpanded', !msg.isReasoningExpanded);
    },

    // 思考区标题：思考中显示进度，结束后显示耗时
    reasoningHeaderText(msg, index) {
      const streaming = this.isStreaming && index === this.messageList.length - 1;
      if (streaming && !msg.content) return '正在深度思考…';
      const seconds = msg.reasoningMs ? Math.max(1, Math.round(msg.reasoningMs / 1000)) : 0;
      return seconds ? `已深度思考（用时 ${seconds} 秒）` : '已深度思考';
    },
    // 发送消息：直接走 WebSocket（/chatMessage/ws/chat_with_ai）
    // 不再先调 insert_message 换 task_id，用户消息由后端在收到 ChatMsg 后落库
    async sendMessage() {
      const content = this.inputText?.trim();
      if (!content) return;

      if (this.isStreaming) {
        uni.showToast({ title: 'AI 正在回复，请稍候', icon: 'none' });
        return;
      }

      if (!this.ensureLogin({ redirect: true })) return;

      // 检查会话ID (如果没有，先创建新会话)
      if (!this.currentSessionId) {
        await this.createAndInitNewSession();
        if (!this.currentSessionId) return; // 创建失败则中止
      }

      const llm_refer_data = this.getReferencedTitles();
      const newsIds = [...this.selectedNewsIds]; // 拷贝一份用于发送
      // 附件上传结果形如 { filename, url }，后端 files 字段只收地址列表
      const files = (this.attachedFiles || [])
        .map(item => (item && (item.url || item.filename)) || '')
        .filter(Boolean);

      const now = new Date();
      const dateLabel = this.dateLabelOf(now);

      // 1. 先加用户消息到列表
      const userMsg = {
        role: "user",
        content: content,
        created_time: this.formatMessageTime(now),
        _dateLabel: dateLabel,
        // 供「重新生成」复用上一轮提问的参数
        _newsIds: newsIds,
        _files: files,
        llm_refer_data: llm_refer_data,
        isReferencesExpanded: false
      };
      this.messageList.push(userMsg);

      // 2. 加一个空的AI消息（用来流式打字）- 使用 $set 确保响应式
      const aiMsgIndex = this.messageList.length;
      const aiMsg = {
        role: "assistant",
        content: "",
        renderedHtml: "",
        // 思考过程（analyzing 帧），在气泡里可折叠展示
        reasoning: "",
        isReasoningExpanded: false,
        reasoningMs: 0,
        // 点赞 / 点踩：'' | 'like' | 'dislike'，互斥单选
        feedback: '',
        _dateLabel: dateLabel,
        llm_refer_data: [],
        created_time: this.formatMessageTime(now),
        suggestions: [],
        sources: []
      };
      this.messageList.push(aiMsg);

      // 确保 AI 消息是响应式的
      this.$set(this.messageList, aiMsgIndex, aiMsg);

      const aiIndex = aiMsgIndex; // 保存索引供后续使用

      console.log("发送消息:", content, "session_id:", this.currentSessionId || 0, "关联新闻ID:", newsIds, "附件:", files);

      this.inputText = "";
      this.selectedNewsIds = [];
      this.attachedFiles = [];

      this.isStreaming = true;
      this.statusText = '正在连接...';
      this.scrollToBottom();

      // 3. 建立 WebSocket，连上后把 ChatMsg 发过去，随后逐帧接收回答
      this.startChatStream({
        query: content,
        user_id: parseInt(this.userInfo.id),
        session_id: this.currentSessionId || 0,
        news_ids: newsIds,
        files: files
      }, aiIndex);
    },
    toggleUserReference(index) {
      if (this.messageList[index]) {
        // 使用 $set 确保响应式更新
        this.$set(this.messageList[index], 'isReferencesExpanded', !this.messageList[index].isReferencesExpanded);
      }
    },
    getReferencedTitles() {
      if (!this.selectedNewsIds.length) return [];
      return this.recentHistory
        .filter(item => this.selectedNewsIds.includes(item.id))
        .map(item => item.title);
    },

    // ---- 消息操作行 ----

    // 该条 AI 回复是否展示操作行：内容已产出、没失败，且不是正在流式输出的最后一条
    canShowActions(msg, index) {
      if (!msg || msg.role !== 'assistant') return false;
      if (!msg.content || msg._failed) return false;
      return !(this.isStreaming && index === this.messageList.length - 1);
    },

    // 复制整条回复
    copyMessage(msg) {
      const text = (msg && msg.content) || '';
      if (!text) {
        uni.showToast({ title: '暂无可复制内容', icon: 'none' });
        return;
      }
      uni.setClipboardData({
        data: text,
        success: () => uni.showToast({ title: '已复制', icon: 'none' }),
        fail: () => uni.showToast({ title: '复制失败，请重试', icon: 'none' })
      });
    },

    // 点赞 / 点踩：互斥单选，再次点击取消
    toggleFeedback(index, type) {
      const msg = this.messageList[index];
      if (!msg || msg.role !== 'assistant') return;
      const next = msg.feedback === type ? '' : type;
      this.$set(msg, 'feedback', next);
      // TODO: 反馈上报接口就绪后在这里提交（type: like / dislike / ''）
    },

    // 重新生成：基于该条回复对应的上一轮提问再问一次，原回复保留、新回复追加在末尾
    async regenerateMessage(index) {
      if (this.isStreaming) {
        uni.showToast({ title: 'AI 正在回复，请稍候', icon: 'none' });
        return;
      }

      const msg = this.messageList[index];
      if (!msg || msg.role !== 'assistant') return;

      // 往回找这条回复对应的提问
      let userIndex = -1;
      for (let i = index - 1; i >= 0; i--) {
        if (this.messageList[i].role === 'user') {
          userIndex = i;
          break;
        }
      }
      if (userIndex < 0) {
        uni.showToast({ title: '没有可重新生成的提问', icon: 'none' });
        return;
      }

      if (!this.ensureLogin({ redirect: true })) return;
      if (!this.currentSessionId) {
        await this.createAndInitNewSession();
        if (!this.currentSessionId) return;
      }

      const userMsg = this.messageList[userIndex];
      const aiMsgIndex = this.messageList.length;
      this.$set(this.messageList, aiMsgIndex, {
        role: 'assistant',
        content: '',
        renderedHtml: '',
        reasoning: '',
        isReasoningExpanded: false,
        reasoningMs: 0,
        feedback: '',
        _dateLabel: userMsg._dateLabel || this.dateLabelOf(new Date()),
        llm_refer_data: [],
        created_time: this.formatMessageTime(new Date()),
        suggestions: [],
        sources: []
      });

      this.isStreaming = true;
      this.statusText = '正在连接...';
      this.scrollToBottom();

      this.startChatStream({
        query: userMsg.content,
        user_id: parseInt(this.userInfo.id),
        session_id: this.currentSessionId || 0,
        news_ids: userMsg._newsIds || [],
        files: userMsg._files || []
      }, aiMsgIndex);
    },

    // ---- 时间分组 ----

    // 消息流按天分组：返回该条消息前面是否需要插入分组时间
    showDateDivider(index) {
      const msg = this.messageList[index];
      if (!msg || !msg._dateLabel) return false;
      if (index === 0) return true;
      return msg._dateLabel !== this.messageList[index - 1]._dateLabel;
    },

    // 消息分组标签：M月D日
    dateLabelOf(value) {
      const date = this.parseMessageTime(value);
      if (!date) return '';
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    },

    // 会话列表的相对时间：当天 HH:mm，昨天「昨天」，更早 M月D日
    formatSessionTime(value) {
      const date = this.parseMessageTime(value);
      if (!date) return '';

      const pad = n => String(n).padStart(2, '0');
      const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);

      if (diffDays <= 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
      if (diffDays === 1) return '昨天';
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    },
    async loadUserInfo() {
      const userInfo = getUserInfo();
      console.log('用户信息：', userInfo);
      if (userInfo) {
        this.nikeName = userInfo.nickname;
        // 用户头像：优先用登录信息里的头像，没有就用项目内的默认头像
        this.avatar = userInfo.avatar || '/static/default-avatar.png';
        this.userInfo = userInfo;
      } else {
        this.userInfo = null;
      }
    },

    // 是否已登录：userInfo 和 token 必须都在。
    // 只有 userInfo 没有 token 是「半登录」脏状态（退出登录 / 上传 401 只清了 token 就会这样），
    // 这时候发请求后端一定回 401「未登录」，所以本地先拦住。
    // 本页所有接口都挂 Depends(get_current_user)，没登录留在页面上什么也做不了，直接回登录页。
    ensureLogin(options = {}) {
      const token = uni.getStorageSync('token');
      if (this.userInfo && this.userInfo.id && token) return true;

      // 半登录态顺手清干净，别让残留的 userInfo 继续误导其它页面
      clearLoginStatus();

      if (!options.silent) {
        uni.showToast({ title: '请先登录', icon: 'none' });
      }

      setTimeout(() => {
        uni.reLaunch({ url: '/pages/login/login' });
      }, options.silent ? 0 : 600);

      return false;
    },
    scrollToBottom() {
      // 使用 $nextTick 确保 DOM 更新后再滚动
      this.$nextTick(() => {
        // 增加一点延迟，确保内容渲染完成
        setTimeout(() => {
          this.scrollTop = 999999;
        }, 50);
      });
    },
    async initDefaultSession() {
      // 正在流式接收回答时不要把列表刷掉（例如从其他页面切回来触发 onShow）
      if (this.isStreaming) return;

      // 没登录 / 半登录态就别发请求了：后端每个 session 接口都挂 Depends(get_current_user)，
      // 发了也只会拿到 401「未登录」。ensureLogin 会顺手清掉脏登录态并回登录页
      if (!this.ensureLogin({ silent: true })) {
        console.log('未登录或缺少 token，跳过会话初始化');
        return;
      }

      try {
        showLoading('加载中...');

        // 1. 获取所有会话
        const res = await request({
          url: '/session/get_sessions',
          method: "GET",
          data: { user_id: parseInt(this.userInfo.id) }
        });

        if (res.code === 200 || res.code === '200') {
          const sessions = res.data || [];

          if (sessions && sessions.length > 0) {
            // 2. 按 update_time 降序排列，取第一个（最新的）
            const sorted = this.sortSessionsByTime(sessions);

            const latestSession = sorted[0];
            console.log('加载最新会话:', latestSession);

            // 3. 设置当前会话 ID 并加载消息
            this.currentSessionId = latestSession.id;

            // 更新侧边栏数据（可选，为了保持状态一致）
            this.sessionList = sorted;
            this.groupSessionsByDate(this.sessionList);

            // 4. 加载该会话的消息
            await this.loadSessionMessages(latestSession.id);
          } else {
            // 如果没有历史会话，则创建一个新会话
            console.log('无历史会话，创建新会话');
            await this.createAndInitNewSession();
          }
        } else {
          // 获取列表失败，降级处理：创建新会话
          console.warn('获取会话列表失败，创建新会话');
          await this.createAndInitNewSession();
        }
      } catch (err) {
        console.error('初始化会话失败:', err);
        // 401 已经由 request.js 统一提示并跳登录页了，这里再补一次「创建新会话」
        // 只会又撞一次 401，白刷两条错误日志
        if (err && err.isAuthError) return;
        // 其它异常（网络抖动等）降级创建新会话，保证用户可用
        await this.createAndInitNewSession();
      } finally {
        hideLoading();
      }
    },

    // 【新增】加载指定会话的消息
    async loadSessionMessages(sessionId) {
      if (!sessionId) return;

      try {
        const res = await request({
          url: '/chatMessage/get_by_session_id',
          method: "GET",
          data: { session_id: sessionId }
        });

        if (res.code === 200 || res.code === '200') {
          // 统一格式化时间 + 生成 renderedHtml
          this.messageList = this.decorateHistoryMessages(res.data || []);

          // 滚动到底部
          this.scrollToBottom();
          console.log('会话消息加载完成，数量:', this.messageList.length);
        } else {
          uni.showToast({ title: res.msg || '拉取会话消息失败', icon: 'none' });
          this.messageList = []; // 失败则清空
        }
      } catch (err) {
        console.error('Load Session Messages Error:', err);
        if (!(err && err.isAuthError)) {
          uni.showToast({ title: '网络请求失败', icon: 'none' });
        }
        this.messageList = [];
      }
    },

    // 【修改】创建新会话并初始化（不直接操作 messageList，由调用者决定）
    async createAndInitNewSession() {
      if (!this.ensureLogin({ redirect: true })) return;

      try {
        const res = await request({
          url: '/session/new_session',
          method: 'PUT',
          data: { user_id: parseInt(this.userInfo.id) }
        });

        if (res.code === 200 || res.code === '200') {
          this.currentSessionId = res.data.id;
          this.messageList = []; // 新会话当然没有消息
          console.log('新会话创建成功 ID:', this.currentSessionId);
        } else {
          uni.showToast({ title: res.msg || '创建新会话失败', icon: 'none' });
        }
      } catch (err) {
        console.error('New Session Error:', err);
        // 401 已由 request.js 统一处理，这里不要再叠一条「网络请求失败」误导排查
        if (!(err && err.isAuthError)) {
          uni.showToast({ title: '网络请求失败', icon: 'none' });
        }
      }
    },
    async newSession() {
      // 防连点：连点两次会创建两个空会话
      if (this.creatingSession) return;
      this.creatingSession = true;
      try {
        this.closeChatStream();
        this.messageList = [];
        this.currentSessionId = null;

        await this.createAndInitNewSession();
      } finally {
        this.creatingSession = false;
      }
    },

    // 抽屉里的「新建」：开空白会话并收起抽屉
    async createSessionFromDrawer() {
      await this.newSession();
      this.closeSidebar();
    },

    async getSessions() {
      if (this.showSidebar) {
        this.showSidebar = false;
        return;
      }

      if (!this.ensureLogin({ redirect: true })) return;

      try {
        showLoading('加载中...');

        const res = await request({
          url: '/session/get_sessions',
          method: "GET",
          data: { user_id: parseInt(this.userInfo.id) }
        });

        if (res.code === 200 || res.code === '200') {
          this.sessionList = this.sortSessionsByTime(res.data || []);
          this.groupSessionsByDate(this.sessionList);
          this.showSidebar = true;
        } else {
          uni.showToast({ title: res.msg || '拉取会话列表失败', icon: 'none' });
        }

      } catch (err) {
        console.error('Get Sessions Error:', err);
        if (!(err && err.isAuthError)) {
          uni.showToast({ title: '网络请求失败', icon: 'none' });
        }
      } finally {
        hideLoading();
      }
    },

    // 会话按更新时间倒序：分组依赖顺序，接口不保证有序时先自己排一遍
    sortSessionsByTime(list) {
      return (list || []).slice().sort((a, b) => {
        const timeA = (this.parseMessageTime(a.update_time || a.created_time) || new Date(0)).getTime();
        const timeB = (this.parseMessageTime(b.update_time || b.created_time) || new Date(0)).getTime();
        return timeB - timeA;
      });
    },

    // 按日期分组会话
    groupSessionsByDate(list) {
      if (!list || list.length === 0) {
        this.groupedSessions = [];
        return;
      }

      const groups = [];
      let lastDateLabel = '';

      list.forEach(item => {
        // 分组标签统一用「M月D日」，和列表项里的相对时间（10:34 / 昨天 / 11月23日）互补
        const label = this.dateLabelOf(item.update_time || item.created_time) || '更早';

        if (label !== lastDateLabel) {
          groups.push({ label: label, items: [item] });
          lastDateLabel = label;
        } else {
          groups[groups.length - 1].items.push(item);
        }
      });

      this.groupedSessions = groups;
    },
    // --- 点击蒙版或会话项关闭侧边栏 ---
    closeSidebar() {
      this.showSidebar = false;
    },

    // --- 点击某个会话 ---
    async selectSession(session) {
      if (!session) return;

      // 点当前会话：只收起抽屉，不重载（避免打断正在流式输出的回答）
      if (session.id === this.currentSessionId) {
        this.closeSidebar();
        return;
      }

      this.closeSidebar();

      if (!this.ensureLogin({ redirect: true })) return;

      this.closeChatStream();
      this.currentSessionId = session.id;
      console.log('选中会话:', session);

      showLoading('加载中...');
      try {
        const res = await request({
          url: '/chatMessage/get_by_session_id',
          method: "GET",
          data: { session_id: session.id }
        });
        if (res.code === 200 || res.code === '200') {
          this.messageList = this.decorateHistoryMessages(res.data || []);
          this.scrollToBottom();
        } else {
          uni.showToast({ title: res.msg || '拉取会话消息失败', icon: 'none' });
        }
      } catch (err) {
        console.error('Get Session Messages Error:', err);
        if (!(err && err.isAuthError)) {
          uni.showToast({ title: '网络请求失败', icon: 'none' });
        }
      } finally {
        hideLoading();
      }
    },

    // --- 会话项「…」菜单 ---
    openSessionMenu(session) {
      uni.showActionSheet({
        itemList: ['删除会话'],
        success: res => {
          if (res.tapIndex === 0) this.deleteSession(session);
        }
      });
    },

    // 删除会话：/delete_sessions（DELETE，body: { session_ids: [] }）
    async deleteSession(session) {
      if (!session || !session.id) return;

      const topic = session.session_topic || '未命名会话';
      const confirmed = await new Promise(resolve => {
        uni.showModal({
          title: '删除会话',
          content: `确定删除「${topic}」吗？删除后不可恢复。`,
          confirmText: '删除',
          confirmColor: '#E5484D',
          cancelText: '取消',
          success: res => resolve(!!res.confirm),
          fail: () => resolve(false)
        });
      });
      if (!confirmed) return;

      showLoading('删除中...');
      try {
        const res = await request({
          url: '/delete_sessions',
          method: 'DELETE',
          data: { session_ids: [session.id] }
        });

        if (res && (res.code === 200 || res.code === '200')) {
          this.sessionList = (this.sessionList || []).filter(item => item.id !== session.id);
          this.groupSessionsByDate(this.sessionList);

          // 删掉的是当前会话：回到空白新会话
          if (this.currentSessionId === session.id) {
            this.closeChatStream();
            this.currentSessionId = null;
            this.messageList = [];
          }
          uni.showToast({ title: '已删除', icon: 'none' });
        } else {
          uni.showToast({ title: (res && res.msg) || '删除失败', icon: 'none' });
        }
      } catch (err) {
        console.error('Delete Session Error:', err);
        if (!(err && err.isAuthError)) {
          uni.showToast({ title: '删除失败', icon: 'none' });
        }
      } finally {
        hideLoading();
      }
    },
    // 把后端返回的时间安全地解析成 Date。
    // 后端给的是 Python 的 ISO 字符串，形如 2026-11-24T10:34:55.171674（6 位微秒，无时区）。
    // iOS Safari 只认 3 位小数、也不认空格分隔，直接 new Date() 会得到 Invalid Date，
    // 所以这里先做归一化再解析。
    parseMessageTime(value) {
      if (value === null || value === undefined || value === '') return null;
      if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
      }
      if (typeof value === 'number') {
        const fromNumber = new Date(value);
        return isNaN(fromNumber.getTime()) ? null : fromNumber;
      }

      let text = String(value).trim();
      if (!text) return null;

      // 1. 小数秒截断到 3 位（.171674 -> .171）
      text = text.replace(/(\.\d{3})\d+/, '$1');
      // 2. 'YYYY-MM-DD HH:mm:ss' 换成 'T' 分隔，兼容 iOS
      if (/^\d{4}-\d{2}-\d{2}\s+\d/.test(text)) {
        text = text.replace(/\s+/, 'T');
      }
      // 3. 只有日期没有时间时补上 00:00，避免被当成 UTC 解析而差 8 小时
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        text += 'T00:00:00';
      }

      const date = new Date(text);
      return isNaN(date.getTime()) ? null : date;
    },

    // 消息时间展示：今天只显示时分，昨天加“昨天”，今年显示月日，跨年才显示完整年月日。
    // 比直接甩一个 2026-11-24T10:34:55.171674 可读得多。
    formatMessageTime(value) {
      const date = this.parseMessageTime(value);
      if (!date) return '';

      const pad = n => String(n).padStart(2, '0');
      const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

      const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const now = new Date();
      // 按“自然日”算差值，避免用毫秒除法在跨月/夏令时上算错
      const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

      if (diffDays <= 0) return hm;              // 今天（含设备时钟略快的未来时间）
      if (diffDays === 1) return `昨天 ${hm}`;
      if (date.getFullYear() === now.getFullYear()) {
        return `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
      }
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
    },

    // 历史消息统一补上格式化后的展示时间 + 分组日期（服务端返回的是原始 ISO 字符串）
    decorateHistoryMessages(list) {
      return this.dedupeAdjacentUserMessages(list).map(m => {
        if (!m) return m;
        const rawTime = m.created_time || m.created_at;
        const decorated = {
          ...m,
          created_time: this.formatMessageTime(rawTime),
          _dateLabel: this.dateLabelOf(rawTime)
        };
        if (m.role === 'assistant') {
          decorated.renderedHtml = this.renderMarkdownToHtml(m.content || '');
          decorated.feedback = '';
        }
        return decorated;
      });
    }
  }
};