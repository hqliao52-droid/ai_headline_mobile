<template>
  <view class="recent-clock-root">
    <!-- 「刚才看过」入口：单实例常驻悬浮，位于回顶按钮正上方（间距 12px） -->
    <view class="recent-clock" @click="openSheet">
      <view class="clock-dial">
        <!-- 时针：短粗，每秒重算（含分、秒偏移），线性过渡 -->
        <view
          class="hand hand-hour"
          :class="{ 'is-snap': handsSnap }"
          :style="hourHandStyle"
        ></view>
        <!-- 分针：细长，每秒重算（含秒偏移），线性过渡 -->
        <view
          class="hand hand-minute"
          :class="{ 'is-snap': handsSnap }"
          :style="minuteHandStyle"
        ></view>
        <!-- 指针旋转圆心 -->
        <view class="clock-center"></view>
        <!-- 角标：条数；为 0 时整个不渲染 -->
        <view class="clock-badge" v-if="hasBadge">
          <text class="badge-text">{{ badgeText }}</text>
        </view>
      </view>
    </view>

    <!-- 【最近看过】浮层：底部弹出，宽 75%、高 30%，点遮罩收起 -->
    <template v-if="sheetVisible">
      <view class="recent-mask" @click="closeSheet" @touchmove.stop.prevent></view>
      <view class="recent-sheet" :style="sheetStyle">
        <!-- 标题栏 -->
        <view class="sheet-header">
          <text class="sheet-title">最近看过</text>
          <view class="sheet-clear" v-if="historyList.length > 0" @click="onClearAll">
            <text class="clear-text">一键清除</text>
          </view>
        </view>

        <!-- 浏览记录列表：仅最近 5 篇 -->
        <scroll-view class="sheet-body" :style="sheetBodyStyle" scroll-y>
          <view class="sheet-empty" v-if="historyList.length === 0">
            <text class="empty-text">暂无最近看过的内容</text>
          </view>
          <view
            class="sheet-item"
            v-for="item in historyList"
            :key="item.id"
            @click="openItem(item)"
          >
            <view class="item-main">
              <text class="item-title">{{ item.title || '无标题' }}</text>
              <text class="item-time">{{ formatViewTime(item) }}</text>
            </view>
            <view class="item-del" @click.stop="onRemoveItem(item)">
              <text class="del-glyph">×</text>
            </view>
          </view>
        </scroll-view>
      </view>
    </template>
  </view>
</template>

<script src="./recent-clock.js"></script>
<style src="./recent-clock.scss" lang="scss" scoped></style>
