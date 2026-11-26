<template>
  <view class="container">
    <!-- tab 切换动画的包裹层：动画只作用在这一层。
         下面的时钟和回顶按钮是 fixed 的，必须留在外面——
         被 transform 的祖先会变成它们的定位参照，动画那 300ms 里会被甩偏。
         这层横跨整页内容，所以里面 category-head 的 sticky 吸附范围不受影响 -->
    <view class="tab-enter" :class="tabEnterClass">
      <!-- 顶部头部：滚动时【推荐】+头像吸顶，问候语淡出、搜索框上移 -->
      <view class="page-header" :class="{ 'is-scrolled': headerProgress > 0 }">
        <view class="header-row">
          <view class="header-titles">
            <view class="header-title">推荐</view>
            <view class="header-greeting" :style="greetingStyle">{{ greeting }}，发现今天的行业新动态</view>
          </view>
          <!-- 头像 + 昵称：已登录进个人中心，未登录去登录 -->
          <view class="header-user" @click="onAvatarTap">
            <view class="avatar-circle">
              <!-- 有 avatar-url 就显示用户头像，为空（或加载失败）才回落到缺省头像 -->
              <image
                v-if="avatar && !avatarError"
                class="avatar-img"
                :src="avatar"
                mode="aspectFill"
                @error="onAvatarError"
              ></image>
            </view>
            <text class="header-nickname">{{ displayName }}</text>
          </view>
        </view>

        <!-- 搜索入口：收起时半透明，点击一次唤醒、再点一次进入输入 -->
        <view
          class="search-bar"
          :class="{ 'is-locked': isSearchLocked, 'is-active': searchActive, 'is-focused': searchFocused }"
          :style="searchBarStyle"
          @click="onSearchTap"
        >
          <view class="search-icon"></view>
          <input
            class="search-input"
            v-model="searchKeyword"
            :focus="searchFocused"
            type="text"
            confirm-type="search"
            placeholder="搜索热词 / 行业 / 资讯"
            placeholder-style="color:#9AA8BD;font-size:28rpx"
            @confirm="onSearchConfirm"
            @blur="onSearchBlur"
          />
        </view>
      </view>

      <!-- 今日热词概览 -->
      <view class="hot-section">
        <view class="section-title">
          <text class="title-icon">↗</text>
          <text class="title-text">今日热词概览</text>
        </view>
        <view class="hot-tags">
          <view class="tag tag-blue">TikTok Shop</view>
          <view class="tag tag-orange">印尼物流新规</view>
          <view class="tag tag-green">SHEIN 半托管</view>
          <view class="tag tag-normal">中东支付网关</view>
          <view class="tag tag-normal">AI 营销工具</view>
        </view>
      </view>

      <!-- 分类标题：吸顶。像 VSCode 里的函数签名，下面的内容滚过去时它停在头部下方；
           点它回到分类列表开头。
           注意：它必须是 .container 的直接子节点——sticky 的吸附范围被父容器高度限制，
           套在小容器里会在容器滚出屏幕时一起消失 -->
      <view class="category-head" @click="onCategoryHeadTap">
        <text class="category-head-title">全部分类</text>
        <!-- 当前分类切换器：‹ 科技与数字服务 ›
             左右箭头切上一个 / 下一个，下方标签区同步高亮（都走 switchCategory） -->
        <view class="category-switcher">
          <view
            class="switch-arrow"
            :class="{ 'is-disabled': !hasPrevCategory }"
            @click.stop="switchToPrevCategory"
          >
            <view class="arrow-glyph arrow-left"></view>
          </view>
          <!-- 当前选中的分类：收起时也能一眼看到筛选条件 -->
          <view class="category-current" :class="{ 'is-all': currentCategoryId === 'all' }" @click="onCategoryCurrentTap">
            <text class="current-text">{{ currentCategoryName }}</text>
          </view>
          <view
            class="switch-arrow"
            :class="{ 'is-disabled': !hasNextCategory }"
            @click.stop="switchToNextCategory"
          >
            <view class="arrow-glyph arrow-right"></view>
          </view>

          <!-- 名字被截断时的完整名称：切换后自动浮出 1s，也可点胶囊再次唤起 -->
          <view class="category-tip" v-if="categoryTipVisible">
            <text class="tip-text">{{ categoryTipText }}</text>
          </view>
        </view>
        <!-- 分类数量不多时不显示切换按钮，避免点了没反应 -->
        <view class="category-toggle" v-if="hasMoreCategories" @click.stop="toggleCategoryExpand">
          <text class="toggle-text">{{ categoryExpanded ? '收起' : '展开' }}</text>
          <view class="toggle-arrow" :class="{ 'is-open': categoryExpanded }"></view>
        </view>
      </view>

      <!-- 分类标签区：高度由 JS 实测后写成 px，配合 CSS 的 0.7s 过渡实现向下展开 / 向上收起 -->
      <view class="category-wrap" :class="{ 'no-transition': !categoryWrapReady }" :style="categoryWrapStyle">
        <view class="category-bar">
          <view
            class="category-item"
            :class="{ 'active': currentCategoryId === 'all' }"
            @click="switchCategory('all')"
          >
            全部
          </view>
          <!-- 分类接口回来前先摆几个等宽的骨架胶囊：
               否则这一行会先只剩「全部」，等接口回来再"长"出四个标签，页面高度会跳一下 -->
          <block v-if="categoriesLoading && categories.length === 0">
            <view
              class="category-item is-skeleton"
              v-for="n in 4"
              :key="'category-skeleton-' + n"
            ></view>
          </block>
          <view
            class="category-item"
            v-for="item in visibleCategories"
            :key="item.id"
            :class="{ 'active': currentCategoryId === item.id }"
            @click="switchCategory(item)"
          >
            {{ item.tag_name }}
          </view>
        </view>
      </view>

      <!-- 定制化情报推送 -->
      <view class="info-card" @click="goToPersonalize">
        <view class="info-icon"></view>
        <view class="info-content">
          <view class="info-title">定制化情报推送</view>
          <view class="info-desc">基于您的企业经营范围实时更新</view>
        </view>
        <view class="info-cta">
          <text>去设置</text>
          <text class="cta-arrow">›</text>
        </view>
      </view>

      <!-- AI聚合资讯标题 -->
      <view class="news-header">
        <view class="news-title">AI 聚合资讯</view>
        <view class="news-subtitle">实时聚合 194 个海内外行业频道</view>
      </view>

      <view class="news-list">
        <!-- 首屏骨架：列表还空着、请求又在路上时，先铺 3 张和真实卡片同结构的灰块。
             结构（来源行 / 两行标题 / 底部摘要条）和间距都与真卡片一致，
             数据回来后直接原地换成真内容，页面高度几乎不动，不会出现"先空一片再跳一下" -->
        <block v-if="showNewsSkeleton">
          <view class="news-item is-skeleton" v-for="n in 3" :key="'news-skeleton-' + n">
            <view class="news-main">
              <view class="news-source">
                <view class="sk-bar sk-source"></view>
                <view class="sk-bar sk-time"></view>
              </view>
              <view class="sk-bar sk-title"></view>
              <view class="sk-bar sk-title sk-title-second"></view>
              <view class="news-ai-summary">
                <view class="sk-bar sk-summary"></view>
                <view class="sk-bar sk-summary sk-summary-second"></view>
              </view>
            </view>
          </view>
        </block>

        <view 
          class="news-item" 
          v-for="item in newsList" 
          :key="item.id" 
          v-if="item.is_policy === 1"
          @click="toDetail(item)"
        >
          <view class="news-main">
            <view class="news-source">
              <text class="source-name">{{ item.rss_tag }}</text>
              <text class="source-time">{{ item.published_at }}</text>
            </view>
            <view class="news-title-text">{{ item.title }}</view>
            <view class="news-ai-summary">
              <text class="summary-label">AI 摘要：</text>
              <text class="summary-text">{{ item.one_sentence_summary }}</text>
            </view>
          </view>
    
          <!-- <view class="news-img" :style="{backgroundColor: item.bgColor}"></view> -->
        </view>

        <!-- 首屏就失败时别留一片空白：给一个可点的重试入口 -->
        <view
          class="load-status is-error"
          v-if="newsLoadFailed && newsList.length === 0"
          @click="reloadNews"
        >
          <text>加载失败，点击重试</text>
        </view>
        <view class="load-status" v-else-if="!showNewsSkeleton">
          <text v-if="isLoading">加载中...</text>
          <text v-else-if="isFinished">—— 我是有底线的 ——</text>
          <text v-else>上拉加载更多</text>
        </view>
      </view>
    </view>

    <!-- 「刚才看过」入口：时钟常驻悬浮，停在回顶按钮正上方 12px -->
    <recent-clock ref="recentClock" />

    <!-- 回到顶部按钮 -->
    <view 
      class="back-to-top-btn" 
      v-if="showBackToTop" 
      @click="backToTop"
    >
      <text class="top-icon">↑</text>
    </view>
  </view>
</template>

<script src="./index.js"></script>
<style src="./index.scss" lang="scss" scoped></style>