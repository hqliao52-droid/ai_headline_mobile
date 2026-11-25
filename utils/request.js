// utils/request.js
import config from './config.js';

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
          console.error('[request] HTTP 错误', res.statusCode, url, res.data)
          reject(new Error(`[${res.statusCode}] ${options.url}`))
          return
        }
        resolve(res.data)
      },
      fail: err => {
        // 带上 URL 打日志，否则只看到“网络请求失败”无法判断是哪台服务器/哪个接口
        console.error('[request] 请求失败', url, err && err.errMsg ? err.errMsg : err)
        reject(err)
      }
    })
  })
}