import {
  getReadHistory,
  removeReadHistory,
  clearReadHistory
} from '@/utils/history.js';
import { getUserInfo } from '@/utils/user.js';

// 补零：9 → '09'
function pad(value) {
  return value < 10 ? '0' + value : '' + value;
}

/**
 * 把存储里的时间文本转成 Date
 * 存储里可能是时间戳，也可能是 'YYYY-MM-DD HH:mm:ss' / ISO 串；
 * iOS 不认 '2026-11-25 10:00:00'，统一换成 '2026/11/25 10:00:00'
 * @param {Number|String|Date} raw
 * @returns {Date|null}
 */
function parseDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number') return new Date(raw);
  const text = String(raw).replace('T', ' ').replace(/-/g, '/');
  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

// 取某天 0 点的时间戳，用来算「今天 / 昨天」
function dayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export default {
  name: 'RecentClock',
  data() {
    return {
      // 最近看过记录（最新的在最前），同时驱动角标数字
      historyList: [],
      // 浮层是否展开
      sheetVisible: false,
      // 浮层高度：屏幕高度的 30%，进页面时按 windowHeight 算好（不用 vh，各端更稳）
      sheetHeight: 0,
      // 列表区高度：浮层高度减去标题栏（scroll-view 在小程序端需要确定高度）
      sheetBodyHeight: 0,
      // 指针角度：用「连续角度」（可超过 360），避免 359.9° → 0.1° 时倒转一整圈
      minuteDeg: 0,
      hourDeg: 0,
      // 校准时关掉过渡，让指针直接落到正确角度
      handsSnap: true,
      clockTimer: null,
      snapTimer: null
    };
  },
  computed: {
    // 条数为 0 时整个红色角标不显示
    hasBadge() {
      return this.historyList.length > 0;
    },
    badgeText() {
      return this.historyList.length > 99 ? '99+' : String(this.historyList.length);
    },
    minuteHandStyle() {
      return { transform: `rotate(${this.minuteDeg}deg)` };
    },
    hourHandStyle() {
      return { transform: `rotate(${this.hourDeg}deg)` };
    },
    // 浮层高度：屏幕（页面可用区）高度的 30%
    sheetStyle() {
      return { height: this.sheetHeight + 'px' };
    },
    // 列表区高度 = 浮层高度 - 标题栏高度（92rpx）
    sheetBodyStyle() {
      return { height: this.sheetBodyHeight + 'px' };
    }
  },
  created() {
    // 组件加载时立即读取系统时间，指针直接落到当前角度，不从 12 点起步旋转
    const base = this.readClockBase();
    this.minuteDeg = base.minute;
    this.hourDeg = base.hour;
    this.initSheetSize();
  },
  mounted() {
    // 先渲染一帧，再启动定时器，避免首屏出现从零点扫过来的动画
    this.$nextTick(() => {
      this.handsSnap = false;
      this.startClock();
    });
    this.refreshHistory();

    // H5：页面切后台 / 切回来时统一暂停、校准
    // #ifdef H5
    this.onVisibilityChange = () => {
      if (document.hidden) {
        this.pauseClock();
      } else {
        this.resumeClock();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    // #endif
  },
  beforeDestroy() {
    this.stopClock();
    this.clearSnapTimer();
    // #ifdef H5
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
    // #endif
  },
  methods: {
    /**
     * 算浮层与列表区高度
     * 浮层 = 屏幕高度的 30%，用 windowHeight（页面可用区，已扣掉 TabBar）而不是
     * screenHeight，这样浮层不会压在 TabBar 上；取不到时按 667 兜底
     * 列表区 = 浮层高度 - 标题栏高度，scroll-view 在小程序端必须有确定高度
     */
    initSheetSize() {
      let windowHeight = 667;
      try {
        const info = uni.getSystemInfoSync();
        if (info && info.windowHeight) {
          windowHeight = info.windowHeight;
        }
      } catch (e) {
        console.error('读取屏幕高度失败', e);
      }
      const sheetHeight = Math.max(Math.round(windowHeight * 0.3), 180);
      const headerHeight = Math.round(uni.upx2px(92));
      this.sheetHeight = sheetHeight;
      this.sheetBodyHeight = Math.max(sheetHeight - headerHeight, 0);
    },

    /* ------------------------- 时钟 ------------------------- */

    /**
     * 读取系统时间，算出两根指针的基准角（0~360）
     * 内部统一按 24 小时制读取，时针计算时再 % 12
     * @returns {{ minute: Number, hour: Number }}
     */
    readClockBase() {
      const now = new Date();
      const seconds = now.getSeconds();
      const minutes = now.getMinutes();
      const hours = now.getHours();
      return {
        // 分针：随秒连续走动
        minute: minutes * 6 + seconds * 0.1,
        // 时针：必须加分钟偏移（3:30 指向 3.5），秒偏移为可选项
        hour: (hours % 12) * 30 + minutes * 0.5 + seconds * (0.5 / 60)
      };
    },
    /**
     * 把 0~360 的基准角接到上一次角度之后
     * 359.9° 的下一个基准是 0.1°，要让它前进 0.2° 而不是倒退 359.8°
     * @param {Number} base - 0~360 的基准角
     * @param {Number} prev - 上一次写入的角度
     */
    toContinuous(base, prev) {
      let deg = Math.floor(prev / 360) * 360 + base;
      if (deg < prev - 180) {
        deg += 360;
      }
      return deg;
    },
    // 每秒重算一次角度：直接取本地时间，不做角度累加（累加会漂移）
    tickClock() {
      const base = this.readClockBase();
      this.minuteDeg = this.toContinuous(base.minute, this.minuteDeg);
      this.hourDeg = this.toContinuous(base.hour, this.hourDeg);
    },
    startClock() {
      if (this.clockTimer) return;
      this.clockTimer = setInterval(() => {
        this.tickClock();
      }, 1000);
    },
    stopClock() {
      if (this.clockTimer) {
        clearInterval(this.clockTimer);
        this.clockTimer = null;
      }
    },
    /**
     * 立即校准：关掉过渡直接把指针摆到当前时间
     * 用于后台休眠回来（角度可能已经漂了很久），避免看到指针慢慢追
     */
    snapClock() {
      this.clearSnapTimer();
      this.handsSnap = true;
      const base = this.readClockBase();
      this.minuteDeg = base.minute;
      this.hourDeg = base.hour;
      this.snapTimer = setTimeout(() => {
        this.handsSnap = false;
        this.snapTimer = null;
      }, 60);
    },
    clearSnapTimer() {
      if (this.snapTimer) {
        clearTimeout(this.snapTimer);
        this.snapTimer = null;
      }
    },
    // 页面隐藏 / 切后台：暂停定时器
    pauseClock() {
      this.stopClock();
    },
    // 页面显示 / 回前台：先重新校准，再继续走
    resumeClock() {
      this.snapClock();
      this.startClock();
    },

    /* ----------------------- 最近看过 ----------------------- */

    // 当前登录用户 ID（未登录返回 null，历史按用户隔离）
    currentUserId() {
      const userInfo = getUserInfo();
      return userInfo && userInfo.id ? userInfo.id : null;
    },
    // 重新读一次本地记录：回到首页、删除、清空后都要调它，角标跟着刷新
    refreshHistory() {
      this.historyList = getReadHistory(this.currentUserId());
    },
    openSheet() {
      this.refreshHistory();
      this.sheetVisible = true;
    },
    closeSheet() {
      this.sheetVisible = false;
    },
    // 一键清除：带二次确认
    onClearAll() {
      if (this.historyList.length === 0) return;
      uni.showModal({
        title: '清空最近看过',
        content: '清空后无法恢复，确定清除全部记录吗？',
        confirmColor: '#2981F0',
        success: (res) => {
          if (!res.confirm) return;
          clearReadHistory(this.currentUserId());
          this.refreshHistory();
        }
      });
    },
    // 单条删除：立即生效，角标同步刷新
    onRemoveItem(item) {
      this.historyList = removeReadHistory(item.id, this.currentUserId());
    },
    // 点某条记录：收起浮层并进入详情
    openItem(item) {
      this.closeSheet();
      const rssId = item.rss_id || '';
      uni.navigateTo({
        url: `/pages/news-detail/news-detail?id=${item.id}&rss_id=${rssId}`,
        fail: (err) => {
          console.error('打开最近看过失败', err);
          uni.showToast({ title: '打开失败，请重试', icon: 'none' });
        }
      });
    },
    /**
     * 浏览时间文案：今天 14:32 / 昨天 09:10 / 11-20 09:10 / 2025-11-20 09:10
     * 老记录没有 viewed_at，用 published_at 兜底，避免次行空着
     */
    formatViewTime(item) {
      const date = parseDate(item.viewed_at || item.published_at);
      if (!date) return '';
      const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
      const today = new Date();
      const diffDays = Math.round((dayStart(today) - dayStart(date)) / 86400000);
      if (diffDays === 0) return `今天 ${hm}`;
      if (diffDays === 1) return `昨天 ${hm}`;
      if (date.getFullYear() === today.getFullYear()) {
        return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hm}`;
      }
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hm}`;
    }
  }
};
