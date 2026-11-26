<template>
  <!-- 页面最外层只做两件事：裁掉滑入时的横向溢出、给 .bottom-bar 留一个不在动画里的落点 -->
  <view class="page-root">
    <!-- 整页容器：page-enter 让页面从右侧滑入，内部 .anim-item 依次"排开"。
         App 端由 pages.json 的 animationType 走原生转场，CSS 里的滑入已用条件编译排除 -->
    <view class="container page-enter">
      <!-- 顶部导航栏 -->
      <view class="navbar">
        <view class="nav-back" @click="goBack">
          <image src="/static/back.png" mode="aspectFit"></image>
        </view>
        <view class="nav-title">深度分析详情</view>
        <view class="nav-share">
          <image src="/static/share.png" mode="aspectFit"></image>
        </view>
      </view>

      <!-- 详情接口失败：给一个可点的重试条，别让页面一直停在骨架上 -->
      <view class="detail-error" v-if="detailError" @click="reloadDetail">
        <text>加载失败，点击重试</text>
      </view>

      <!-- AI核心摘要模块 -->
      <!-- 加载失败且一条摘要都没有时整块收起，页面只留上面的重试条，
           免得出现一张空卡片 -->
      <view class="card summary-card anim-item anim-1" v-if="!detailError || aiSummaryList.length > 0">
        <view class="summary-header">
          <image class="summary-icon" src="/static/ai-icon.png" mode="aspectFit"></image>
          <text class="summary-title">AI 核心摘要</text>
        </view>
        <!-- 接口没回来：先用三条灰条占住这块的高度，页面不会空一大片 -->
        <view class="summary-list" v-if="summarySkeleton">
          <view class="summary-item" v-for="n in 3" :key="'sk-summary-' + n">
            <view class="sk-dot"></view>
            <view class="sk-bar" :style="{ width: (90 - n * 10) + '%' }"></view>
          </view>
        </view>
        <view class="summary-list" v-else>
          <view v-for="(item, index) in aiSummaryList" :key="index" class="summary-item">
            <view class="check-icon"></view>
            <text class="summary-text" :class="{ highlight: index === 0 }">{{ item }}</text>
          </view>
        </view>
        <!-- 风险提示 -->
        <view class="risk-tip" v-if="risk === true">
          <view class="risk-header">
            <image src="/static/warning.png" mode="aspectFit"></image>
            <text class="risk-title">风险提示</text>
          </view>
          <text class="risk-text"><span style="font-weight: bold;">市场/运营风险：</span>{{market_risk}}</text><br>
          <text class="risk-text"><span style="font-weight: bold;">政策/合规要点：</span>{{policy_compliance}}</text>
        </view>
      </view>

      <!-- 文章标题和来源 -->
      <view class="article-section anim-item anim-2">
        <!-- 标题：首页点进来时已经把列表里的标题递过来了，首帧就是真文字，不用等接口 -->
        <view class="article-title" v-if="news_title">{{news_title}}</view>
        <view class="article-title-skeleton" v-else-if="detailLoading">
          <view class="sk-bar sk-h1"></view>
          <view class="sk-bar sk-h1 sk-h1-second"></view>
        </view>
        <view class="article-meta">
          <image src="/static/book.png" mode="aspectFit"></image>
          <!-- 来源名同样可能来自上一页，先有就先用 -->
          <text class="meta-text" v-if="rss_name">{{ rss_name }}</text>
          <view class="sk-bar sk-meta" v-else-if="detailLoading"></view>
          <!-- 字数要等正文回来才准，加载中就不显示「约 0 字」这种误导文案 -->
          <text class="meta-text" v-if="!detailLoading">约 {{content.length}} 字</text>
        </view>
        <view class="article-desc">
          <!-- 正文没回来：用 4 行灰条模拟段落高度，避免页面被接口"抽高"一下 -->
          <block v-if="detailLoading">
            <view
              class="sk-bar sk-paragraph"
              v-for="n in 4"
              :key="'sk-paragraph-' + n"
              :style="{ width: (96 - n * 8) + '%' }"
            ></view>
          </block>
          <block v-else>
            <text>{{ processedContent }}</text>
            <text 
              v-if="!isContentExpanded && content.length > 50" 
              class="show-more-link" 
              @click="toggleContent"
            >显示全文</text>
          </block>
        </view>
        <view class="tag-list">
          <text v-for="(tag, index) in articleTags" :key="index" class="tag-item">#{{ tag }}</text>
        </view>
      </view>

      <!-- AI提取关键词 -->
      <view class="keyword-section anim-item anim-3">
        <view class="keyword-header">
          <image src="/static/key.png" mode="aspectFit"></image>
          <text class="keyword-title">AI 提取关键词</text>
        </view>
        <view class="keyword-list" v-if="detailLoading">
          <view class="sk-chip" v-for="n in 5" :key="'sk-keyword-' + n"></view>
        </view>
        <view class="keyword-list" v-else>
          <view v-for="(item, index) in keywordList" :key="index" class="keyword-item">{{ item }}</view>
        </view>
      </view>

      <!-- 关联政策与案例：目前是静态示例数据，不依赖接口，所以不摆骨架 -->
      <view class="relation-section anim-item anim-4">
        <view class="relation-header">
          <view class="left">
            <image src="/static/check.png" mode="aspectFit"></image>
            <text class="relation-title">关联政策与案例</text>
          </view>
          <view class="right" @click="viewAll">
            <text class="view-all">查看全部 →</text>
          </view>
        </view>
        <view class="relation-list">
          <view v-for="(item, index) in relationList" :key="index" class="relation-item">
            <view class="item-header">
              <text class="item-type">{{ item.type }}</text>
              <text class="item-rate">关联度 {{ item.rate }}%</text>
            </view>
            <view class="item-title">{{ item.title }}</view>
            <view class="item-desc">{{ item.desc }}</view>
          </view>
        </view>
      </view>

      <!-- 合规雷达推送
      <view class="radar-card">
        <view class="radar-header">
          <view class="radar-icon"></view>
          <view class="radar-info">
            <text class="radar-title">合规雷达推送已开启</text>
            <text class="radar-desc">系统将实时监测印尼电商政策的二阶段细则，并为您精准推送。</text>
          </view>
        </view>
        <view class="radar-setting" @click="openSetting">
          <text>配置推送规则</text>
        </view>
      </view> -->
    </view>

    <!-- 底部输入框：故意放在 .container 外面。
         .container 上跑的是 transform 动画，会成为 fixed 子元素的定位参照，
         放在里面的话滑入的那 340ms 里输入栏会被甩到页面最底部 -->
    <view class="bottom-bar">
      <view class="input-area">
        <view class="avatar">
          <image src="/static/avatar.png" mode="aspectFill"></image>
        </view>
        <view class="input-box">
          <input 
            type="text" 
            v-model="inputValue"
            placeholder="针对此文章询问 AI ..." 
            confirm-type="send"
            @confirm="sendQuestion" 
          />
          <view class="send-btn">
            <image src="/static/send.png" mode="aspectFit"></image>
          </view>
        </view>
      </view>
      <view class="hint-text clickable" @click="fillInputFromHint">
        <text class="hint-prefix">↳ 尝试问：“这篇文章对 </text>
        
        <!-- 关键词滚动容器 -->
        <view class="keyword-roller">
          <text :key="dynamicHintKeyword" class="rolling-keyword animate-slide-up">
            {{ dynamicHintKeyword }}
          </text>
        </view>
        
        <text class="hint-suffix"> 有什么具体影响？”</text>
      </view>
    </view>
  </view>
</template>

<script src="./news-detail.js"></script>

<style src="./news-detail.scss" scoped lang="scss"></style>
