/**
 * 底部 tab 切换动画（配合 App.vue 里的 .tab-enter-* 全局样式）
 *
 * 原生 tabBar 是框架自己绘制的，切 tab 不走页面栈、也没有转场动画，
 * 内容会"啪"地一下换掉，看起来像页面闪了一下。
 * 这里给每个 tab 页的内容区加一段进入动画，让切换读起来像一次推入：
 * 往右边的 tab 切，内容从右侧进来；往左边切，从左侧进来。
 *
 * 用法：在 tab 页的 onShow 里
 *   this.tabEnterClass = resolveTabEnterClass('/pages/index/index')
 * 然后把 tabEnterClass 绑到内容区的包裹层上。
 */

// tab 的先后顺序，和 pages.json 里 tabBar.list 的顺序保持一致
const TAB_PATHS = ['pages/index/index', 'pages/ai-chat/ai-chat', 'pages/mine/mine'];

// 上一次显示的是第几个 tab（-1 = 还没记录，比如冷启动）
let lastIndex = -1;

// 交替使用的动画序号，作用见下面 resolveTabEnterClass 里的说明
let step = 0;

/**
 * 解析本次进入应该用的动画 class
 * @param {String} pagePath - 当前 tab 页路径，如 '/pages/index/index'
 * @returns {String} 形如 'tab-enter tab-enter-right tab-enter-step-1'
 */
export function resolveTabEnterClass(pagePath) {
  const clean = String(pagePath || '').replace(/^\/+/, '');
  const index = TAB_PATHS.findIndex(path => clean === path || clean.indexOf(path + '/') === 0);

  // 首次显示、或从后台回到前台：没有"从哪个 tab 过来"的方向感，用轻微上浮
  let direction = 'first';
  if (index !== -1 && lastIndex !== -1 && index !== lastIndex) {
    direction = index > lastIndex ? 'right' : 'left';
  }
  if (index !== -1) {
    lastIndex = index;
  }

  // 关键一步：同一个 tab 第二次进入时，如果 class 和上次完全一样，
  // 浏览器会认为 animation 没变化，不重播（页面就还是硬切）。
  // 让序号在 1 / 2 之间交替，对应两份效果相同、名字不同的 keyframes，
  // 于是每次 onShow 都能重新播一遍。
  step = step === 1 ? 2 : 1;

  return `tab-enter tab-enter-${direction} tab-enter-step-${step}`;
}
