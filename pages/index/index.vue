<template>
  <view class="container">
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
        :class="{ 'is-locked': isSearchLocked, 'is-active': searchActive }"
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
          placeholder-style="color:#727174;font-size:28rpx"
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
        <view class="tag tag-red">印尼物流新规</view>
        <view class="tag tag-green">SHEIN 半托管</view>
        <view class="tag tag-normal">中东支付网关</view>
        <view class="tag tag-normal">AI 营销工具</view>
      </view>
    </view>

    <!-- 分类标签栏 -->
    <view class="category-tit" style="margin-bottom: 10rpx;font-size: 30rpx;font-weight: 600;">
      <text>全部分类</text>  
    </view>
    <scroll-view class="category-scroll" scroll-x="true" show-scrollbar="false">
      <view class="category-bar">
        <view class="category-item"
          :class="{ 'active': currentCategoryId === 'all' }" 
          @click="switchCategory('all')">
          全部
        </view>
        <view 
          class="category-item" 
          v-for="item in categories" 
          :key="item.id"
          :class="{ 'active': currentCategoryId === item.id }"
          @click="switchCategory(item)"
        >
          {{ item.tag_name }}
        </view>
      </view>
    </scroll-view>

    <!-- 定制化情报推送 -->
    <view class="info-card" @click="goToPersonalize">
      <view class="info-icon"></view>
      <view class="info-content">
        <view class="info-title">定制化情报推送</view>
        <view class="info-desc">基于您的企业经营范围实时更新</view>
      </view>
      <view class="info-arrow">→</view>
    </view>

    <!-- AI聚合资讯标题 -->
    <view class="news-header">
      <view class="news-title">AI 聚合资讯</view>
      <view class="news-subtitle">实时聚合 194 个海内外行业频道</view>
    </view>

    <view class="news-list">
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

      <view class="load-status">
        <text v-if="isLoading">加载中...</text>
        <text v-else-if="isFinished">—— 我是有底线的 ——</text>
        <text v-else>上拉加载更多</text>
      </view>
    </view>

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