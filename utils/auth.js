// utils/auth.js
// 登录态失效的统一处理：清态 -> 收 Loading -> 提示 -> 回登录页
//
// 这个逻辑原先散在 utils/request.js 和 utils/uploadFile.js 里，两边都只清了 token、
// 没清 userInfo，留下「有用户信息、没凭证」的半登录态：页面看到 userInfo 还在，
// 就继续发鉴权请求，然后全部被后端判成 401「未登录」。统一收在这里，只留一份实现。
import { clearLoginStatus } from './user.js';
import { resetLoading } from './loading.js';

// 多个请求同时 401 时只跳一次登录页
let redirecting = false;

function currentRoute() {
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const current = pages[pages.length - 1];
    return (current && (current.route || current.__route__)) || '';
  } catch (e) {
    return '';
  }
}

export function isOnLoginPage() {
  return currentRoute().indexOf('pages/login/login') > -1;
}

/**
 * 登录态失效（401）统一处理
 * @param {string} [detail] 后端返回的 detail，如「未登录」「Token无效」「Token已失效」
 */
export function handleAuthExpired(detail) {
  // token 和 userInfo 必须一起清。只清 token 是之前 401 反复出现的原因：
  // 残留的 userInfo 会让各页面误以为还登录着。
  clearLoginStatus();

  // Loading 和 Toast 在 uni 里是同一个浮层，先收掉 Loading 再弹提示，
  // 否则调用方后面的 hideLoading 会对不上号（控制台报「必须配对使用」）
  resetLoading();

  if (redirecting || isOnLoginPage()) return;
  redirecting = true;

  uni.showToast({
    title: detail || '登录已失效，请重新登录',
    icon: 'none',
    duration: 1500
  });

  setTimeout(() => {
    uni.reLaunch({ url: '/pages/login/login' });
    redirecting = false;
  }, 800);
}
