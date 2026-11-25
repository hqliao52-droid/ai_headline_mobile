import { request } from '@/utils/request.js';
import { getUserInfo } from '@/utils/user.js';
import { getReadHistory } from '@/utils/history.js';
import { streamRequest } from '@/utils/stream-request.js';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-light.css';
import { onLoad } from 'uview-ui/libs/mixin/mixin';
import { uploadSingleSpeciallyFile } from "@/utils/uploadFile.js"
import { openChatStream } from '@/utils/chat-socket.js';

export default {
  data() {
    return {
      userInfo: null,
      newSessionWindowLoading: true,
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

      textareaHeight: 50,
      maxLines: 4,
      lineHeight: 40,

      currentSessionId: null,
      isStreaming: false,
      statusText: '',
      // 当前聊天流句柄（utils/chat-socket.js 返回），非响应式数据，仅用于主动断开
      chatStream: null,

      mermaidDiagrams: {},

      // u-parse 的标签样式，用于在富文本里保持与气泡一致的字体/换行/列表展示
      bubbleTagStyle: {
        h1: 'margin:10rpx 0;padding:0;font-size:34rpx;font-weight:700;line-height:1.4;',
        h2: 'margin:8rpx 0;padding:0;font-size:32rpx;font-weight:600;line-height:1.4;',
        h3: 'margin:6rpx 0;padding:0;font-size:30rpx;font-weight:600;line-height:1.4;',
        h4: 'margin:4rpx 0;padding:0;font-size:28rpx;font-weight:600;line-height:1.4;',
        h5: 'margin:4rpx 0;padding:0;font-size:26rpx;font-weight:600;line-height:1.4;',
        h6: 'margin:4rpx 0;padding:0;font-size:24rpx;font-weight:600;line-height:1.4;color:#666;',

        p: 'margin:0;padding:0;font-size:28rpx;line-height:1.6;word-break:break-all;',
        br: 'display:block;',
        strong: 'font-weight:700;',
        em: 'font-style:italic;',
        ol: 'margin:0;padding-left:44rpx;',
        ul: 'margin:0;padding-left:44rpx;',
        li: 'margin:4rpx 0;',

        pre: 'background:#f6f8fa;padding:16rpx;border-radius:8rpx;overflow-x:auto;margin:10rpx 0;',
        code: 'font-family:monospace;font-size:24rpx;background:#f0f0f0;padding:2rpx 6rpx;border-radius:4rpx;'
      },

      scrollTop: 0,
      recentHistory: [],
      isHistoryExpanded: false,

      selectedNewsIds: [],

      showPlusMenu: false,
      recentFiles: [],
      showRecentFilesList: false,
      attachedFiles: [],

    };
  },
  onShow() {
    this.loadUserInfo();
    this.loadRecentHistory();
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
  },

  methods: {
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
        uni.showLoading({ title: '上传中...' });
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
          uni.hideLoading();
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

      // 3. 重置高度
      this.textareaHeight = 50;

      // 4. 可选：给个轻微提示
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
        // 恢复后清空暂存区，或者保留以便多次粘贴？通常清空比较好，避免混淆
        // 这里选择保留，直到用户再次删除或手动清空，或者你可以选择清空：
        // this.lastDeletedText = ''; 

        // 重新计算高度
        this.$nextTick(() => {
          // 触发一次 input 事件来重新计算高度，或者直接调用 onInput 模拟
          const mockEvent = { detail: { value: this.inputText } };
          this.onInput(mockEvent);
        });
      }
    },
    onInput(e) {
      const value = e.detail.value;
      this.inputText = value;

      // 简单估算行数：根据换行符 \n 和 字符长度
      // 这里做一个简化的估算，更精确的需要获取光标位置或渲染后测量
      // 假设每行约 20 个中文字符（根据字体大小调整）
      const lines = value.split('\n');
      let estimatedLines = 0;

      lines.forEach(line => {
        // 每 25 个字符算一行（根据实际字体大小微调）
        estimatedLines += Math.ceil(line.length / 25) || 1;
      });

      // 限制最大行数
      if (estimatedLines > this.maxLines) {
        estimatedLines = this.maxLines;
      }

      // 计算新高度：基础 padding + 行数 * 行高
      // 假设 padding 上下各 20rpx，行高 40rpx
      const newHeight = 40 + (estimatedLines * this.lineHeight);

      // 更新高度
      this.textareaHeight = newHeight;
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
            that.$set(msg, 'content', '抱歉，出现了一些问题，请稍后重试。');
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
          if (msg && !msg.content) {
            that.$set(msg, 'content', '抱歉，出现了一些问题，请稍后重试。');
          }
          if (msg && !msg.renderedHtml) {
            that.$set(msg, 'renderedHtml', that.renderMarkdownToHtml(msg.content || ''));
          }
          uni.showToast({ title: (err && err.message) || '发送失败', icon: 'none' });
          that.scrollToBottom();
        }
      });
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
      if (!content || this.isStreaming) return;

      if (!this.userInfo || !this.userInfo.id) {
        uni.showToast({ title: '请先登录', icon: 'none' });
        return;
      }

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

      // 1. 先加用户消息到列表
      const userMsg = {
        role: "user",
        content: content,
        created_time: this.formatMessageTime(new Date()),
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
        llm_refer_data: [],
        created_time: this.formatMessageTime(new Date()),
        suggestions: [],
        sources: []
      };
      this.messageList.push(aiMsg);

      // 确保 AI 消息是响应式的
      this.$set(this.messageList, aiMsgIndex, aiMsg);

      const aiIndex = aiMsgIndex; // 保存索引供后续使用

      console.log("发送消息:", content, "session_id:", this.currentSessionId || 0, "关联新闻ID:", newsIds, "附件:", files);

      this.inputText = "";
      this.textareaHeight = 50;
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
    async loadUserInfo() {
      const userInfo = getUserInfo();
      console.log('用户信息：', userInfo);
      if (userInfo) {
        this.nikeName = userInfo.nickname;
        this.avatar = userInfo.avatar || '/static/images/default-avatar.png';
        this.userInfo = userInfo;
      } else {
        // 未登录
        // uni.redirectTo({ url: '/pages/login/login' });
      }
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

      if (!this.userInfo || !this.userInfo.id) {
        // 如果未登录，可能无法获取会话，视情况而定
        console.log('用户未登录，跳过会话初始化');
        return;
      }

      try {
        uni.showLoading({ title: '加载中...' });

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
            // 注意：确保后端返回的时间格式能被 Date 解析，通常是 ISO 字符串或时间戳
            sessions.sort((a, b) => {
              const timeA = (this.parseMessageTime(a.update_time || a.created_time) || new Date(0)).getTime();
              const timeB = (this.parseMessageTime(b.update_time || b.created_time) || new Date(0)).getTime();
              return timeB - timeA; // 降序
            });

            const latestSession = sessions[0];
            console.log('加载最新会话:', latestSession);

            // 3. 设置当前会话 ID 并加载消息
            this.currentSessionId = latestSession.id;

            // 更新侧边栏数据（可选，为了保持状态一致）
            this.sessionList = sessions;
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
        // 异常情况下，也尝试创建新会话，保证用户可用
        await this.createAndInitNewSession();
      } finally {
        uni.hideLoading();
        this.newSessionWindowLoading = true; // 恢复按钮状态
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
        uni.showToast({ title: '网络请求失败', icon: 'none' });
        this.messageList = [];
      }
    },

    // 【修改】创建新会话并初始化（不直接操作 messageList，由调用者决定）
    async createAndInitNewSession() {
      if (!this.userInfo || !this.userInfo.id) {
        uni.showToast({ title: '请先登录', icon: 'none' });
        return;
      }

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
        uni.showToast({ title: '网络请求失败', icon: 'none' });
      }
    },
    async newSession() {
      this.closeChatStream();
      this.newSessionWindowLoading = false;
      this.messageList = [];
      this.currentSessionId = null;

      await this.createAndInitNewSession();

      this.newSessionWindowLoading = true;
    },
    async getSessions() {
      if (this.showSidebar) {
        this.showSidebar = false;
        return;
      }

      if (!this.userInfo || !this.userInfo.id) {
        uni.showToast({ title: '请先登录', icon: 'none' });
        return;
      }

      try {
        uni.showLoading({ title: '加载中...' });

        const res = await request({
          url: '/session/get_sessions',
          method: "GET",
          data: { user_id: parseInt(this.userInfo.id) }
        });

        if (res.code === 200 || res.code === '200') {
          this.sessionList = res.data || [];
          this.groupSessionsByDate(this.sessionList);
          this.showSidebar = true;
        } else {
          uni.showToast({ title: res.msg || '拉取会话列表失败', icon: 'none' });
        }

      } catch (err) {
        console.error('Get Sessions Error:', err.data);
        uni.showToast({ title: '网络请求失败', icon: 'none' });
      } finally {
        uni.hideLoading();
      }
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
        const dateObj = this.parseMessageTime(item.update_time || item.created_time);
        if (!dateObj) {
          // 时间解析不出来时归到“更早”，不要让分组整体错位
          const fallbackLabel = '更早';
          if (fallbackLabel !== lastDateLabel) {
            groups.push({ label: fallbackLabel, items: [item] });
            lastDateLabel = fallbackLabel;
          } else {
            groups[groups.length - 1].items.push(item);
          }
          return;
        }

        // 获取今天的日期对象（清零时间部分以便比较）
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const targetDate = new Date(dateObj);
        targetDate.setHours(0, 0, 0, 0);

        let label = '';
        const diffTime = today.getTime() - targetDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          label = '今天';
        } else if (diffDays === 1) {
          label = '昨天';
        } else {
          // 格式化为 MM月DD日
          const month = dateObj.getMonth() + 1;
          const day = dateObj.getDate();
          label = `${month}月${day}日`;
        }

        // 如果当前标签与上一个不同，创建新组
        if (label !== lastDateLabel) {
          groups.push({
            label: label,
            items: [item]
          });
          lastDateLabel = label;
        } else {
          // 否则加入当前组
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
    selectSession(session) {
      this.closeChatStream();
      this.currentSessionId = session.id;
      console.log('选中会话:', session);
      // TODO: 这里可以添加跳转逻辑或加载该会话的历史消息
      // 例如: this.loadSessionMessages(session.id);

      if (!this.userInfo || !this.userInfo.id) {
        uni.showToast({ title: '请先登录', icon: 'none' });
        return;
      }

      try {
        uni.showLoading({ title: '加载中...' });

        request({
          url: '/chatMessage/get_by_session_id',
          method: "GET",
          data: { session_id: session.id }
        }).then(res => {
          if (res.code === 200 || res.code === '200') {
            console.log('会话消息返回：', res);
            this.messageList = this.decorateHistoryMessages(res.data || []);
          } else {
            uni.showToast({ title: res.msg || '拉取会话消息失败', icon: 'none' });
          }
        })
      } catch (err) {
        console.error('Get Session Messages Error:', err);
      }
      finally {
        uni.hideLoading();
      }
      this.closeSidebar();
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

    // 历史消息统一补上格式化后的展示时间（服务端返回的是原始 ISO 字符串）
    decorateHistoryMessages(list) {
      return this.dedupeAdjacentUserMessages(list).map(m => {
        if (!m) return m;
        const decorated = {
          ...m,
          created_time: this.formatMessageTime(m.created_time || m.created_at)
        };
        if (m.role === 'assistant') {
          decorated.renderedHtml = this.renderMarkdownToHtml(m.content || '');
        }
        return decorated;
      });
    }
  }
};