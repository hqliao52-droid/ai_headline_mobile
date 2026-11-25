/**
 * 浏览历史工具类（「最近看过」数据源）
 * Key: 'recent_read_history_<userId>'
 * Max Count: 5 —— 与「最近看过」浮层的展示条数保持一致
 *
 * 记录里的 viewed_at 是「浏览时间」（进入详情页的时刻），
 * 与文章自身的 published_at（发布时间）无关，浮层只展示 viewed_at。
 */

const HISTORY_KEY = 'recent_read_history';
export const MAX_HISTORY_COUNT = 5;

/**
 * 获取当前用户的存储 Key
 * @param {String|Number} userId - 用户ID
 */
function getHistoryKey(userId) {
  if (!userId) {
    console.warn('获取阅读历史时缺少 userId，可能导致数据混淆');
    // 为了兼容旧数据或未登录情况，可以返回默认 Key，但建议强制要求 userId
    return HISTORY_KEY;
  }
  return `${HISTORY_KEY}_${userId}`;
}

/**
 * 读本地列表，异常 / 脏数据一律当空数组处理，避免浮层渲染崩掉
 * @param {String} key - storage key
 * @returns {Array}
 */
function readList(key) {
  try {
    const data = uni.getStorageSync(key);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('读取阅读历史失败', e);
    return [];
  }
}

/**
 * 写本地列表
 * @param {String} key - storage key
 * @param {Array} list - 待写入的记录
 */
function writeList(key, list) {
  try {
    uni.setStorageSync(key, list);
  } catch (e) {
    console.error('保存阅读历史失败', e);
  }
}

/**
 * 添加阅读记录
 * @param {Object} article - 文章对象 (至少包含 id, title)
 * @param {String|Number} userId - 用户ID
 * @returns {Array} 更新后的记录列表（供角标直接刷新）
 */
export function addReadHistory(article, userId) {
  if (!article || !article.id) return [];
  if (!userId) {
    console.error('添加阅读历史失败：缺少 userId');
    return [];
  }
  const key = getHistoryKey(userId);

  // 1. 获取现有历史
  let history = readList(key);

  // 2. 去重：如果该文章已存在，先移除旧记录（为了把它移到最前面）
  history = history.filter(item => String(item.id) !== String(article.id));

  // 3. 构造精简后的文章对象（避免存入过多无用字段，节省空间）
  const simpleArticle = {
    id: article.id,
    title: article.title || '',
    content: article.content || '',
    // 详情页跳转需要 rss_id；早期记录里没有这个字段，浮层里做了兜底
    rss_id: article.rss_id || '',
    rss_tag: article.rss_tag || '',
    published_at: article.published_at || '',
    // 浏览时间：浮层「次行」展示的就是它，与发布时间无关
    viewed_at: Date.now()
  };

  // 4. 添加到数组头部（最新阅读的在最前）
  history.unshift(simpleArticle);

  // 5. 截取前 N 个，超出后最早一条自动移除
  if (history.length > MAX_HISTORY_COUNT) {
    history = history.slice(0, MAX_HISTORY_COUNT);
  }

  // 6. 保存回本地存储
  writeList(key, history);
  return history;
}

/**
 * 获取阅读历史（最新的在最前）
 * @param {String|Number} userId - 用户ID
 * @returns {Array}
 */
export function getReadHistory(userId) {
  if (!userId) {
    return [];
  }
  const key = getHistoryKey(userId);
  let history = readList(key);

  // 兼容早期版本把历史存在公共 Key 下的数据：搬到当前用户名下
  if (history.length === 0) {
    const legacy = readList(HISTORY_KEY);
    if (legacy.length > 0) {
      writeList(key, legacy);
      uni.removeStorageSync(HISTORY_KEY);
      history = legacy;
    }
  }

  return history;
}

/**
 * 删除单条阅读记录
 * @param {String|Number} articleId - 文章ID
 * @param {String|Number} userId - 用户ID
 * @returns {Array} 删除后的记录列表（供角标直接刷新）
 */
export function removeReadHistory(articleId, userId) {
  if (!articleId || !userId) return [];
  const key = getHistoryKey(userId);
  const history = readList(key).filter(item => String(item.id) !== String(articleId));
  writeList(key, history);
  return history;
}

/**
 * 清空阅读历史
 * @param {String|Number} userId - 用户ID
 * @returns {Array} 空列表
 */
export function clearReadHistory(userId) {
  if (!userId) return [];
  uni.removeStorageSync(getHistoryKey(userId));
  return [];
}
