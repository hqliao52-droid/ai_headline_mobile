// utils/request.js
import config from './config.js';
import { handleAuthExpired } from './auth.js';

export function request(options) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token');
    const url = config.baseURL + options.url;

    const header = {
      'Content-Type': 'application/json'
    };

    if (token) {
      header['Authorization'] = 'Bearer ' + token;
    }

    uni.request({
      //  使用统一配置的 baseURL
      url,
      method: options.method || 'GET',
      data: options.data || {},
      header: header,
      timeout: config.timeout,
      success: res => {
        // HTTP 层面就失败时（404/500 等），body 通常不是业务结构，
        // 例如 FastAPI 的 {"detail":"Not Found"}。直接 resolve 会让调用方拿到
        // 一个没有 code 的对象，最后只报出一句含糊的「请求失败」。
        if (res.statusCode >= 400) {
          // 把后端的 detail 透出来：401 到底是「未登录」（没带 Authorization 头）
          // 还是「Token无效」（token 过期/被改），直接决定排查方向，日志里必须能看见
          const body = res.data || {};
          const detail = typeof body.detail === 'string' ? body.detail
            : (typeof body.msg === 'string' ? body.msg : '');
          const message = detail ? `[${res.statusCode}] ${detail}` : `[${res.statusCode}] ${options.url}`;

          // token 是否存在也打出来：报「未登录」时一眼能确认是本地没 token 还是头没拼上
          console.error(
            '[request] HTTP 错误',
            res.statusCode,
            options.method || 'GET',
            options.url,
            'token=' + (token ? `已携带(${String(token).length}字符)` : '缺失'),
            body
          );

          if (res.statusCode === 401) {
            handleAuthExpired(detail);
          }

          const error = new Error(message);
          error.statusCode = res.statusCode;
          // 401 已由 handleAuthExpired 统一提示并跳登录页，
          // 调用方 catch 里不要再弹一遍「网络请求失败」，否则提示叠在一起更难看懂
          error.isAuthError = res.statusCode === 401;
          reject(error);
          return;
        }
        resolve(res.data);
      },
      fail: err => {
        // 带上 URL 打日志，否则只看到“网络请求失败”无法判断是哪台服务器/哪个接口
        console.error('[request] 请求失败', url, err && err.errMsg ? err.errMsg : err)
        reject(err)
      }
    })
  })
}
