/**
 * 引用计数的 Loading
 *
 * 直接用 uni.showLoading / uni.hideLoading 有两个坑：
 * 1. 并发请求时（比如进页面同时拉会话列表和消息），后一个 showLoading 会把前一个顶掉，
 *    两次 hideLoading 里第二次就找不到可关的 Loading，uni 会打印「showLoading 与 hideLoading 必须配对使用」。
 * 2. Loading 和 Toast 在 uni 里是同一个浮层，中间插一个 showToast 也会让后面的 hideLoading 对不上号。
 *
 * 这里按引用计数统一开关：第一个 show 才真正弹，最后一个 hide 才真正关；
 * 已经收掉之后再调 hide 直接忽略，不再触发 uni 的配对告警。
 *
 * 注意：show 之后一定要在 finally 里 hide，否则计数会泄漏，后续 Loading 就弹不出来了。
 * 异常场景（401 跳登录、页面卸载）用 resetLoading() 兜底清零。
 */

let count = 0;
let visible = false;

export function showLoading(title = '加载中...') {
  count += 1;
  if (!visible) {
    visible = true;
    uni.showLoading({ title, mask: true });
  }
}

export function hideLoading() {
  // 已经被 resetLoading 收掉（例如 401 统一处理），不要再调 uni.hideLoading
  if (count === 0) return;

  count -= 1;
  if (count === 0 && visible) {
    visible = false;
    uni.hideLoading();
  }
}

/**
 * 兜底重置：401 跳登录、页面卸载等场景把计数清零，避免 Loading 卡死
 */
export function resetLoading() {
  count = 0;
  if (visible) {
    visible = false;
    uni.hideLoading();
  }
}
