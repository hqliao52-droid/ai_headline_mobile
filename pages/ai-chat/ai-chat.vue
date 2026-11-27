<template>
  <view class="chat-page">
    <!-- 顶部导航栏 -->
    <view class="navbar">
      <view class="nav-left" hover-class="nav-hit" @click="getSessions">
        <image class="nav-icon" src="/static/liner.png" mode="aspectFit"></image>
      </view>
      <view class="nav-center">
        <text class="nav-title">AI 战略助手</text>
        <text class="nav-subtitle">在线</text>
      </view>
      <view class="nav-right" hover-class="nav-hit" @click="newSession">
        <image class="nav-icon nav-icon--new" src="/static/new_session.png" mode="aspectFit"></image>
      </view>
    </view>

    <!-- 消息流
         只给消息区加切换动画：顶栏和输入区是消息区的兄弟节点，不会被 transform 甩偏 -->
    <scroll-view class="chat-content" :class="tabEnterClass" scroll-y :scroll-top="scrollTop" scroll-with-animation>
      <!-- 空态：新会话还没有任何消息时给一句引导，避免整屏空白 -->
      <view v-if="messageList.length === 0" class="chat-empty">
        <image class="chat-empty__icon" src="/static/ai.png" mode="aspectFit"></image>
        <text class="chat-empty__text">把你想了解的官方文章发给我</text>
        <text class="chat-empty__text">我来为你做出海解读和落地建议</text>
      </view>

      <view v-for="(msg, index) in messageList" :key="index" class="msg-block">
        <!-- 按天分组的时间分隔 -->
        <view v-if="showDateDivider(index)" class="date-divider">
          <text class="date-divider__label">{{ msg._dateLabel }}</text>
        </view>

        <view class="message-item" :class="msg.role === 'user' ? 'user-msg' : 'ai-msg'">
          <!-- 消息气泡 -->
          <view class="bubble-wrapper">
            <view class="bubble" :class="msg.role === 'user' ? 'user-bubble' : 'ai-bubble'">
              <!-- 失败且没有任何内容：气泡里给一句说明，避免出现空气泡 -->
              <text
                v-if="msg.role === 'assistant' && msg._failed && !msg.content && !isStreaming"
                class="failed-placeholder"
              >网络或服务异常，本次回答未生成</text>

              <!-- 等待首个分片时的状态提示 -->
              <view
                v-if="msg.role === 'assistant' && isStreaming && index === messageList.length - 1 && !msg.content && !msg.reasoning"
                class="thinking-status"
              >
                <view class="thinking-dots">
                  <view class="dot"></view>
                  <view class="dot"></view>
                  <view class="dot"></view>
                </view>
                <text class="status-text">{{ statusText }}</text>
              </view>

              <!-- 思考过程：可折叠，流式期间自动展开，开始输出正文后自动收起 -->
              <view v-if="msg.role === 'assistant' && msg.reasoning" class="reasoning-panel">
                <view class="reasoning-header" @click="toggleReasoning(index)">
                  <view
                    v-if="isStreaming && index === messageList.length - 1 && !msg.content"
                    class="reasoning-dots"
                  >
                    <view class="dot"></view>
                    <view class="dot"></view>
                    <view class="dot"></view>
                  </view>
                  <text class="reasoning-title">{{ reasoningHeaderText(msg, index) }}</text>
                  <view class="reasoning-arrow" :class="{ 'expanded': msg.isReasoningExpanded }"></view>
                </view>
                <view v-if="msg.isReasoningExpanded" class="reasoning-body">
                  <text class="reasoning-text">{{ msg.reasoning }}</text>
                </view>
              </view>

              <!-- 1. Assistant 消息：流式接收中先用纯文本实时显示，结束后再交给 u-parse 渲染 Markdown -->
              <block v-if="msg.role === 'assistant'">
                <text
                  v-if="isStreaming && index === messageList.length - 1"
                  class="stream-plain-text"
                >{{ msg.content }}</text>
                <u-parse
                  v-else-if="msg.renderedHtml"
                  :content="msg.renderedHtml"
                  :tag-style="bubbleTagStyle"
                />
              </block>

              <!-- 2. User 消息：文本 + 引用折叠区 -->
              <view v-else class="user-message-container">
                <text class="bubble-text">{{ msg.content }}</text>

                <!-- 用户消息的引用区域 (仅当有引用文章时显示) -->
                <view v-if="msg.llm_refer_data && msg.llm_refer_data.length > 0" class="user-references">
                  <!-- 状态 A: 折叠态 (默认) -->
                  <view v-if="!msg.isReferencesExpanded" class="ref-collapsed" @click="toggleUserReference(index)">
                    <text class="ref-icon">📎</text>
                    <text class="ref-summary">参考了 {{ msg.llm_refer_data.length }} 篇文章</text>
                  </view>

                  <!-- 状态 B: 展开态 -->
                  <view v-else class="ref-expanded">
                    <view class="ref-header" @click="toggleUserReference(index)">
                      <text class="ref-title">参考文章 ({{ msg.llm_refer_data.length }})</text>
                      <view class="ref-arrow expanded"></view>
                    </view>
                    <view class="ref-list">
                      <view v-for="(title, tIndex) in msg.llm_refer_data" :key="tIndex" class="ref-item">
                        <text class="ref-dot">•</text>
                        <text class="ref-text">{{ title }}</text>
                      </view>
                    </view>
                  </view>
                </view>
              </view>

              <!-- 流式加载光标 (仅 Assistant) -->
              <text v-if="msg.role === 'assistant' && isStreaming && index === messageList.length - 1 && msg.content" class="cursor">|</text>
              <text v-else-if="msg.role === 'assistant' && isStreaming && index === messageList.length - 1 && !msg.content && !msg.reasoning" class="cursor blinking">|</text>

              <!-- 策略建议 (仅 Assistant) -->
              <view v-if="msg.role === 'assistant' && msg.suggestions && msg.suggestions.length" class="suggestions">
                <view class="suggest-title">策略建议</view>
                <view class="suggest-list">
                  <view v-for="(item, i) in msg.suggestions" :key="i" class="suggest-item">• {{ item }}</view>
                </view>
              </view>

              <!-- 引用来源 (仅 Assistant) -->
              <view v-if="msg.role === 'assistant' && msg.sources && msg.sources.length" class="sources">
                <view class="source-title">引用来源</view>
                <view v-for="(source, i) in msg.sources" :key="i" class="source-item">
                  <image class="source-icon" src="/static/book.png" mode="aspectFit"></image>
                  <text class="source-name">{{ source.name }}</text>
                </view>
              </view>
            </view>

            <!-- 生成失败：消息旁给重试入口，不影响其它消息 -->
            <view v-if="msg.role === 'assistant' && msg._failed && !isStreaming" class="msg-failed">
              <text class="msg-failed__text">回答生成失败</text>
              <view class="msg-failed__retry" hover-class="msg-failed__retry--hover" @click="retryMessage(index)">重试</view>
            </view>

            <!-- 操作栏 (仅 Assistant，且该条回复已生成完成) -->
            <view v-if="canShowActions(msg, index)" class="msg-action">
              <view class="action-btn" hover-class="action-btn--hover" @click="copyMessage(msg)">
                <image class="action-icon" src="/static/copy.png" mode="aspectFit"></image>
              </view>
              <view class="action-btn" hover-class="action-btn--hover" @click="regenerateMessage(index)">
                <image class="action-icon" src="/static/again.png" mode="aspectFit"></image>
              </view>
              <view
                class="action-btn"
                :class="{ 'is-active': msg.feedback === 'like' }"
                hover-class="action-btn--hover"
                @click="toggleFeedback(index, 'like')"
              >
                <image
                  class="action-icon"
                  :src="msg.feedback === 'like' ? '/static/like-active.png' : '/static/like.png'"
                  mode="aspectFit"
                ></image>
              </view>
              <view
                class="action-btn"
                :class="{ 'is-active': msg.feedback === 'dislike' }"
                hover-class="action-btn--hover"
                @click="toggleFeedback(index, 'dislike')"
              >
                <image
                  class="action-icon"
                  :src="msg.feedback === 'dislike' ? '/static/dislike-active.png' : '/static/dislike.png'"
                  mode="aspectFit"
                ></image>
              </view>
            </view>
          </view>

          <!-- 用户头像 (右侧) -->
          <view v-if="msg.role === 'user'" class="avatar">
            <image class="avatar-img" :src="avatar" mode="aspectFill"></image>
          </view>
        </view>
      </view>

      <view class="chat-bottom-space"></view>
    </scroll-view>

    <!-- 底部输入区域 -->
    <view class="input-area">
      <!-- 最近阅读：选择要一起带上的文章 -->
      <view class="recent-read" v-if="recentHistory.length > 0">
        <view class="recent-read__head" @click="toggleHistory">
          <image class="recent-icon" src="/static/recent.png" mode="aspectFit"></image>
          <text class="recent-title">最近阅读 {{ recentHistory.length }}/{{ maxHistoryCount }}</text>
          <view class="chevron" :class="{ 'is-up': isHistoryExpanded }"></view>
        </view>

        <view class="recent-list-wrap" :class="{ 'is-expanded': isHistoryExpanded }">
          <view class="recent-list">
            <view
              class="recent-item"
              :class="{ 'is-selected': selectedNewsIds.includes(item.id) }"
              v-for="item in recentHistory"
              :key="item.id"
              @click="toggleNewsSelection(item)"
            >
              <text class="recent-item__title">{{ item.title }}</text>
              <view v-if="selectedNewsIds.includes(item.id)" class="recent-badge">
                {{ selectedNewsIds.indexOf(item.id) + 1 }}
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 清空输入后的暂存恢复条 -->
      <view v-if="lastDeletedText" class="deleted-backup-bar" @click="restoreDeletedText">
        <text class="backup-icon">↺</text>
        <text class="backup-text">点击恢复</text>
        <text class="backup-preview">{{ lastDeletedText.substring(0, 20) }}{{ lastDeletedText.length > 20 ? '...' : '' }}</text>
        <view class="deleted-icon-btn" @click.stop="clearInputWithbackUpBar">
          <image class="deleted-icon" src="/static/delete.png" mode="aspectFit"></image>
        </view>
      </view>

      <!-- 已选附件标签 -->
      <view v-if="attachedFiles.length > 0" class="attached-tags">
        <view
          v-for="file in attachedFiles"
          :key="file.url"
          class="attached-tag"
          @click="inputText = file.filename"
        >{{ file.filename }}</view>
      </view>

      <!-- 输入框 -->
      <view class="input-box">
        <view class="plus-trigger" hover-class="plus-trigger--hover" @click.stop="togglePlusMenu">
          <image class="plus-icon" src="/static/plus.png" mode="aspectFit"></image>
        </view>

        <view class="input-wrapper">
          <textarea
            v-model="inputText"
            placeholder="请输入..."
            placeholder-class="textarea-placeholder"
            class="input-textarea"
            :auto-height="true"
            :show-confirm-bar="false"
            confirm-type="send"
            @confirm="sendMessage"
            @input="onInput"
          ></textarea>
        </view>

        <!-- 清空按钮：仅当有内容且未处于发送状态时显示 -->
        <view v-if="inputText && !isStreaming" class="action-icon-btn" @click.stop="clearInputWithBackup">
          <image class="deleted-icon" src="/static/delete.png" mode="aspectFit"></image>
        </view>

        <view class="send-btn" :class="{ 'is-disabled': !canSend }" hover-class="send-btn--hover" @click="sendMessage">
          <image class="send-icon" src="/static/send2.png" mode="aspectFit"></image>
        </view>

        <view v-if="showPlusMenu" class="plus-menu-popover">
          <!-- 左侧：操作入口 -->
          <view class="menu-left">
            <view class="menu-item" @click="handleUploadAttachment">
              <image class="menu-icon" src="/static/attach.png" mode="aspectFit"></image>
              <text class="menu-text">上传附件</text>
            </view>
            <view class="menu-item" @click="toggleRecentFiles">
              <image class="menu-icon" src="/static/recent.png" mode="aspectFit"></image>
              <text class="menu-text">近期文件</text>
            </view>
          </view>

          <!-- 右侧：近期文件列表 -->
          <view v-if="showRecentFilesList" class="menu-right">
            <view class="recent-file-header">
              <text class="rf-title">近期文件</text>
              <text class="rf-close" @click.stop="showRecentFilesList = false">×</text>
            </view>
            <scroll-view scroll-y class="recent-file-list">
              <view v-for="(file, index) in recentFiles" :key="index" class="rf-item" @click="selectRecentFile(file)">
                <image class="rf-icon" src="/static/book.png" mode="aspectFit"></image>
                <text class="rf-name">{{ file.filename }}</text>
              </view>
              <view v-if="recentFiles.length === 0" class="rf-empty">暂无近期文件</view>
            </scroll-view>
          </view>
        </view>
      </view>

      <view class="disclaimer">AI 生成内容仅供参考</view>
    </view>

    <!-- 历史会话抽屉：遮罩与面板是兄弟节点，滑动只走 transform，不触发重排 -->
    <view class="drawer-root" :class="{ 'is-open': showSidebar }">
      <view class="drawer-mask" @click="closeSidebar" @touchmove.stop.prevent="noop"></view>

      <!-- 面板不拦 touchmove：里面是 scroll-view，拦了会滑不动 -->
      <view class="drawer-panel">
        <view class="drawer-header">
          <view class="drawer-back" hover-class="drawer-hit" @click="closeSidebar">
            <view class="chevron chevron--left"></view>
          </view>
          <text class="drawer-title">历史会话</text>
          <text class="drawer-new" @click="createSessionFromDrawer">新建</text>
        </view>

        <scroll-view class="drawer-body" scroll-y>
          <!-- 空态 -->
          <view v-if="groupedSessions.length === 0" class="drawer-empty">
            <image class="drawer-empty__icon" src="/static/ai.png" mode="aspectFit"></image>
            <text class="drawer-empty__text">暂无历史会话</text>
          </view>

          <view v-for="(group, gIndex) in groupedSessions" :key="gIndex" class="date-group">
            <view class="date-label">{{ group.label }}</view>
            <view
              v-for="session in group.items"
              :key="session.id"
              class="session-item"
              :class="{ 'is-current': session.id === currentSessionId }"
              @click="selectSession(session)"
            >
              <view class="session-main">
                <text class="session-topic">{{ session.session_topic || '未命名会话' }}</text>
                <text class="session-time">{{ formatSessionTime(session.update_time || session.created_time) }}</text>
              </view>
              <view class="session-more" hover-class="session-more--hover" @click.stop="openSessionMenu(session)">
                <view class="more-dots">
                  <view class="dot"></view>
                  <view class="dot"></view>
                  <view class="dot"></view>
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script src="./ai-chat.js"></script>
<style src="./ai-chat.scss" scoped lang="scss"></style>
