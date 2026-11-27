import config from './config.js';
import { handleAuthExpired } from './auth.js';
import { showLoading, hideLoading } from './loading.js';

/**
 * 构造上传接口的鉴权 header
 * 与 utils/request.js、utils/stream-request.js 保持同一套规则：
 * 从本地缓存取 token，拼成 Authorization: Bearer <token>
 * @param {string} [token] 可选，显式指定 token；不传则读本地缓存
 * @returns {Object} 需要附加的请求头
 */
function buildAuthHeader(token) {
    const finalToken = token || uni.getStorageSync('token');
    return finalToken ? { Authorization: 'Bearer ' + finalToken } : {};
}

/**
 * 鉴权失败（401）统一处理：清掉登录态并回登录页
 *
 * 之前这里只 removeStorageSync('token')，userInfo 留在本地，于是留下「有用户信息、
 * 没凭证」的半登录态：页面以为还登录着，继续发请求，后端全部回 401「未登录」。
 * 现在统一交给 handleAuthExpired（token 和 userInfo 一起清 + 跳登录页）。
 */
function handleUnauthorized() {
    handleAuthExpired('登录已失效，请重新登录');
}

/**
 * 通用文件上传工具（支持多文件，最多3个）
 * 上传接口：/file/upload_file
 * 返回：上传成功的文件列表 { filename, url }
 */
export async function uploadFiles() {
    return new Promise((resolve, reject) => {
        // 1. 选择文件（最多3个，不限类型）
        uni.chooseImage({
            count: 3,
            sizeType: ['compressed'],
            // 允许相册 + 拍照（如果要纯文件选择，可改成 type:all）
            sourceType: ['album', 'camera'],
            success: async (res) => {
                const tempFilePaths = res.tempFilePaths
                const uploadResults = []

                try {
                    // 2. 循环上传
                    for (const filePath of tempFilePaths) {
                        const result = await uploadSingleFile(filePath)
                        uploadResults.push(result)
                    }

                    // 3. 返回所有成功上传的文件
                    resolve(uploadResults)
                } catch (err) {
                    reject(err)
                }
            },
            fail: (err) => {
                reject(err)
            }
        })
    })
}

/**
 * 上传单个文件（内部方法）
 * @param {string} filePath 临时文件路径
 * @returns {Promise<{filename, url}>}
 */
function uploadSingleFile(filePath) {
    return new Promise((resolve, reject) => {
        showLoading('上传中...')

        uni.uploadFile({
            url: config.baseURL + '/file/upload_file',
            filePath: filePath,
            name: 'file',
            // 鉴权：带当前登录 token，未登录时不加（此时后端会返回 401）
            header: buildAuthHeader(),
            method: 'POST',
            success: (uploadRes) => {
                // 401 和其它接口一样走统一处理（清登录态 + 回登录页），
                // 不要当成普通业务失败只弹一句 toast，否则用户会一直停留在半登录态
                if (uploadRes.statusCode === 401) {
                    handleUnauthorized()
                    reject('未登录或登录已失效')
                    return
                }
                try {
                    const data = JSON.parse(uploadRes.data)
                    if (data.code === 200 || data.code === '200') {
                        resolve(data.data)
                    } else {
                        uni.showToast({
                            title: data.msg || '上传失败',
                            icon: 'none'
                        })
                        reject(data.msg)
                    }
                } catch (e) {
                    uni.showToast({ title: '解析失败', icon: 'none' })
                    reject(e)
                }
            },
            fail: () => {
                uni.showToast({ title: '上传请求失败', icon: 'none' })
                reject('上传失败')
            },
            complete: () => {
                hideLoading()
            }
        })
    })
}


/**
 * 通用单文件上传（对外暴露，页面直接调用）
 * 上传接口：/file/upload_file（需要登录鉴权）
 * @param {string} filePath 临时文件路径
 * @param {string} [token] 可选，显式指定 token；不传则自动读本地缓存 'token'
 * @returns {Promise<{filename: string, url: string}>} 上传结果
 */
export async function uploadSingleSpeciallyFile(filePath, token) {
    return new Promise((resolve, reject) => {
        // ================== 可选：图片格式校验（取消注释即可开启） ==================
        // const extMatch = filePath.match(/\.(\w+)$/)
        // const ext = extMatch ? extMatch[1].toLowerCase() : ''
        // const allowExt = ['jpg', 'jpeg', 'png']
        // if (!allowExt.includes(ext)) {
        //   uni.showToast({ title: '仅支持 jpg、jpeg、png', icon: 'none' })
        //   reject('格式不支持')
        //   return
        // }

        showLoading('上传中...')

        uni.uploadFile({
            url: config.baseURL + '/file/upload_file',
            filePath: filePath,
            name: 'file',
            // 鉴权：带当前登录 token，未登录时不加（此时后端会返回 401）
            header: buildAuthHeader(token),
            method: 'POST',
            success: (uploadRes) => {
                // 未登录 / token 过期：后端返回 401
                if (uploadRes.statusCode === 401) {
                    handleUnauthorized()
                    reject('未登录或登录已失效')
                    return
                }
                try {
                    const data = JSON.parse(uploadRes.data)
                    if (data.code === 200 || data.code === '200') {
                        resolve(data.data)
                    } else {
                        uni.showToast({ title: data.msg || '上传失败', icon: 'none' })
                        reject(data.msg)
                    }
                } catch (e) {
                    uni.showToast({ title: '上传解析失败', icon: 'none' })
                    reject(e)
                }
            },
            fail: () => {
                uni.showToast({ title: '上传请求失败', icon: 'none' })
                reject('上传失败')
            },
            complete: () => {
                hideLoading()
            }
        })
    })
}