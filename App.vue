<script>
	export default {
		onLaunch: function() {
			console.log('App Launch')
			
			// 检查本地是否有 token
			const token = uni.getStorageSync('token');
			if (token) {
				// 如果已登录，直接跳转到首页 (TabBar 页面)
				uni.switchTab({
					url: '/pages/index/index'
				});
			} else {
				// 未登录，停留在当前启动页 (login)，或者显式跳转
				// uni.reLaunch({ url: '/pages/login/login' }); 
			}
		},
		onShow: function() {
			console.log('App Show')
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style>
/* ==================== 底部 tab 切换动画 ====================
 * 原生 tabBar 由框架绘制，它自己的动画改不了；能决定的是"切过去之后页面怎么出现"。
 * 这段样式和 utils/tab-transition.js 配套：往右边的 tab 切，内容从右侧滑入；
 * 往左边切，从左侧滑入，读起来像一次推入，而不是硬切。
 *
 * 为什么每个方向都写了两份一模一样的 keyframes（-1 / -2）：
 * 切回同一个 tab 时，如果元素的 class 和上次完全一样，浏览器会认为 animation
 * 没变化、不重播，页面就又变回硬切。让 class 里的序号在 1 / 2 之间交替，
 * 动画名跟着变，每次进入才会真的重新播一遍。
 *
 * 放在 App.vue 而不是各页面：这里编译成全局样式只出一份，
 * 三个 tab 页各写一遍会把同一段 keyframes 复制三份。
 */

/* 向右切：内容从右侧滑入 */
@keyframes tab-in-right-1 {
  from { opacity: 0; transform: translate3d(56rpx, 0, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes tab-in-right-2 {
  from { opacity: 0; transform: translate3d(56rpx, 0, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}

/* 向左切：内容从左侧滑入 */
@keyframes tab-in-left-1 {
  from { opacity: 0; transform: translate3d(-56rpx, 0, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes tab-in-left-2 {
  from { opacity: 0; transform: translate3d(-56rpx, 0, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}

/* 首次进入 / 从后台或非 tab 页回来：没有方向感，改成轻微上浮 */
@keyframes tab-in-first-1 {
  from { opacity: 0; transform: translate3d(0, 16rpx, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes tab-in-first-2 {
  from { opacity: 0; transform: translate3d(0, 16rpx, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}

/* fill-mode 用 backwards：动画结束后元素回到常态，不残留 transform，
   否则它会变成内部 fixed 元素的定位参照，回顶按钮之类会错位 */
.tab-enter-right.tab-enter-step-1 { animation: tab-in-right-1 0.3s cubic-bezier(0.22, 0.61, 0.36, 1) backwards; }
.tab-enter-right.tab-enter-step-2 { animation: tab-in-right-2 0.3s cubic-bezier(0.22, 0.61, 0.36, 1) backwards; }
.tab-enter-left.tab-enter-step-1  { animation: tab-in-left-1 0.3s cubic-bezier(0.22, 0.61, 0.36, 1) backwards; }
.tab-enter-left.tab-enter-step-2  { animation: tab-in-left-2 0.3s cubic-bezier(0.22, 0.61, 0.36, 1) backwards; }
.tab-enter-first.tab-enter-step-1 { animation: tab-in-first-1 0.32s ease-out backwards; }
.tab-enter-first.tab-enter-step-2 { animation: tab-in-first-2 0.32s ease-out backwards; }
</style>