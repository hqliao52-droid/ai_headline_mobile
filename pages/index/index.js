import { request } from '@/utils/request.js'
import { getUserInfo } from '@/utils/user.js';

export default {
  data() {
    return {
      avatar: '',
      // 头像加载失败标记：为 true 时回落到缺省头像
      avatarError: false,
      // 用户昵称，显示在头像右侧
      nickName: '',
      // 是否已登录（用于头部头像显示真实头像还是灰色占位）
      hasUser: false,
      categories: [],
      newsList: [],

      // 分页状态
      page: 1,
      pageSize: 10,
      total: 0,
      isLoading: false,
      isFinished: false,

      showBackToTop: false,
      categoryId: null,

      // 头部折叠进度：0 = 完全展开，1 = 完全收起（随页面滚动变化）
      headerProgress: 0,

      // 搜索框
      searchKeyword: '',
      // 输入框是否聚焦
      searchFocused: false,
      // 收起（半透明）状态下是否已被点击“唤醒”为不透明
      searchActive: false,

      // 控制 UI 高亮的当前选中 ID，初始为 'all' 或 null
      currentCategoryId: 'all', 

      // 分类折叠：默认收起，只显示前 collapsedCount 个
      categoryExpanded: false,
      // 收起时展示的分类数量（不含“全部”）
      collapsedCount: 3,
      // 分类标签区实测高度(px)：展开 / 收起靠它做 0.7s 平滑过渡
      // 初始 0 是为了首帧不闪出“全部展开”的样子，量到后立刻写回真实高度
      categoryWrapHeight: 0,
      // 首次测量完成前不启用过渡，避免一进页面就演一遍展开动画
      categoryWrapReady: false,

      articleInfo: null,
      
    }
  },
  onLoad() {
    this.getNewsList() // 首次加载
    this.getCategories() // 获取分类
  },
  computed: {
    // 头部问候语：按当前时间段变化
    greeting() {
      const hour = new Date().getHours()
      if (hour < 6) return '夜深了'
      if (hour < 12) return '早上好'
      if (hour < 14) return '中午好'
      if (hour < 18) return '下午好'
      return '晚上好'
    },
    // 问候语：随滚动向上滑出并淡出，同时把高度收掉，让下面的搜索框往上挪
    greetingStyle() {
      const p = this.headerProgress
      const textHeight = uni.upx2px(36) // 24rpx 字号 × 1.5 行高
      // 前 60% 的进度内完成淡出，避免文字被切掉一半时还很显眼
      const fade = Math.min(p / 0.6, 1)
      return {
        height: (1 - p) * textHeight + 'px',
        marginTop: (1 - p) * uni.upx2px(6) + 'px',
        transform: `translateY(${-p * textHeight}px)`,
        opacity: 1 - fade
      }
    },
    // 搜索框：随滚动向上移动 + 整体等比缩小 + 逐渐变透明，最终落到【推荐】同一行
    // 几何推导（单位 rpx，p 为 0→1 的折叠进度）：
    //   标题行高 = 15(内边距) + 42×1.2(标题行高) + (1-p)×(6+36)(问候语)
    //   搜索框原位置 = 标题行高 + 31(上间距)，高 76
    //   收起后目标：垂直中心对齐标题中心(40.2)，缩放 0.62，左边与标题右侧留 16 间距
    searchBarStyle() {
      const p = this.headerProgress
      const rpx = uni.upx2px

      const scale = 1 - 0.38 * p          // 1 → 0.62
      const translateY = -63.2 * p        // 抵消自身位置上浮，落到标题行中心
      const translateX = 106 * p          // 从标题左侧移到标题右侧的空位（留约 10rpx 间隙）
      // 收起过程中逐渐变透明，最暗保留 0.5；被点击唤醒后回到完全不透明
      const opacity = this.searchActive ? 1 : 1 - 0.5 * p

      return {
        marginTop: rpx(31 * (1 - p)) + 'px',
        // 负外边距把自身在文档流里的占位一起收掉，头部高度才会真的变矮
        marginBottom: rpx(-76 * p) + 'px',
        // 收起时再收窄 121rpx，缩放后正好停在头像左侧，不会压到昵称
        width: `calc(100% - ${rpx(121 * p)}px)`,
        transform: `translate3d(${rpx(translateX)}px, ${rpx(translateY)}px, 0) scale(${scale})`,
        opacity: opacity
      }
    },
    // 收起且尚未唤醒时，输入框不接收点击，让“第一次点击”只用于唤醒
    isSearchLocked() {
      return this.headerProgress >= 0.999 && !this.searchActive
    },
    // 头像右侧的昵称文案
    displayName() {
      return this.nickName || '未登录'
    },
    // 分类数量超过收起阈值时才需要“展开/收起”按钮
    hasMoreCategories() {
      return this.categories.length > this.collapsedCount
    },
    // 当前选中分类的名字：标题旁边显示，收起状态下也能一眼看到筛选条件
    currentCategoryName() {
      const activeId = this.currentCategoryId
      if (activeId === 'all' || activeId === null || activeId === undefined) {
        return '全部'
      }
      // 分类接口还没回来时先用 id 兜底，避免标题旁边空一块
      const active = this.categories.find(item => item.id === activeId)
      return active ? active.tag_name : '全部'
    },
    // 收起时只展示前几个分类；若当前选中的分类被折在外面，
    // 就把最后一个位置让给它，保证收起状态下高亮项始终可见
    visibleCategories() {
      const list = this.categories
      if (this.categoryExpanded || list.length <= this.collapsedCount) {
        return list
      }
      const head = list.slice(0, this.collapsedCount)
      const activeId = this.currentCategoryId
      if (activeId === 'all' || head.some(item => item.id === activeId)) {
        return head
      }
      const active = list.find(item => item.id === activeId)
      if (!active) {
        return head
      }
      return [...head.slice(0, this.collapsedCount - 1), active]
    },
    // 分类标签区的高度：直接给实测 px 值
    categoryWrapStyle() {
      return { height: this.categoryWrapHeight + 'px' }
    }
  },
  watch: {
    // 展开状态 / 可见分类一变，渲染出来的高度就变了：
    // 重新量一次写回 height，CSS 那边只负责 0.7s 过渡，
    // 于是展开就是向下平滑撑开，收起就是向上平滑收拢
    visibleCategories() {
      this.$nextTick(() => {
        this.measureCategoryWrap()
      })
    },
    // 分类接口回来后标签才真正渲染，高度要重新量
    categories() {
      this.$nextTick(() => {
        this.measureCategoryWrap()
      })
    }
  },
  
  // 页面触底自动触发
  onReachBottom() {
    if (this.isLoading || this.isFinished) {
      return
    }
    
    console.log('触发上拉加载，准备加载第', this.page + 1, '页')
    this.page++ 
    this.getNewsList(true) // 传入 true，表示是“加载更多”
  },
  onPageScroll(e) {
    // e.scrollTop 是当前滚动条距离顶部的距离 (px)
    // 当滚动超过 300px (约半屏) 时显示回到顶部按钮
    const showBackToTop = e.scrollTop > 300;
    // 只在状态真正变化时才赋值，避免滚动过程中每帧都触发 setData
    if (showBackToTop !== this.showBackToTop) {
      this.showBackToTop = showBackToTop;
    }

    // 头部折叠：滚动 200px 内完成收起（距离越短越容易看出跳变）
    const progress = Math.min(e.scrollTop / 200, 1)
    // 阈值放小，避免整段过渡被切成几十个明显的台阶
    if (Math.abs(progress - this.headerProgress) > 0.008) {
      this.headerProgress = progress
    }
    // 回到顶部附近时，复位搜索框的“唤醒”状态
    if (progress < 0.05 && this.searchActive) {
      this.searchActive = false
    }
  },
  onShow(){
    // 每次页面显示时重新获取最新用户信息
    this.loadUserInfo();
  },
  onReady() {
    // 首帧渲染完先量一次分类区高度，收起状态立刻就有准确高度
    this.$nextTick(() => {
      this.measureCategoryWrap()
    })
  },
  // 窗口尺寸 / 横竖屏变化后 rpx 换算变了，标签区高度要重新量
  onResize() {
    this.$nextTick(() => {
      this.measureCategoryWrap()
    })
  },
  onPullDownRefresh() {
    console.log('用户触发了下拉刷新')
    // 1. 重置分页状态
    this.page = 1
    this.isFinished = false
    this.newsList = [] // 可选：先清空列表，避免闪烁，或者等请求回来再替换
    
    // 2. 重新获取分类（可选，如果分类不常变可省略）
    Promise.all([
      this.getCategories(),
      this.getNewsList(false),
      this.loadUserInfo() // 如果需要刷新用户状态
    ]).finally(() => {
      uni.stopPullDownRefresh()
    })
  },

  methods: {
    goToLogin() {
      uni.navigateTo({
        url: '/pages/login/login'
      });
    },
    async switchCategory(item){
      if( item === "all"){
        this.categoryId = null
        this.currentCategoryId = 'all'
      }else{
        this.categoryId = item.id
        this.currentCategoryId = item.id
      }
      this.page = 1
      this.pageSize = 10
      this.isFinished = false
      this.getNewsList(false)
    },
    backToTop() {
      uni.pageScrollTo({
        scrollTop: 0,
        duration: 300 // 动画时长，单位 ms
      })
    },
    // 展开 / 收起分类列表
    toggleCategoryExpand() {
      this.categoryExpanded = !this.categoryExpanded
    },
    /**
     * 量分类标签区的真实高度
     * 元素被外层 overflow 裁掉也不影响它自身的 layout 高度，
     * 所以收起时量到的是“一行”的高度，展开后量到的是“全部”的高度
     * @param {Number} retry - 量不到时的重试次数（首帧 DOM 可能还没渲染完）
     */
    measureCategoryWrap(retry = 1) {
      const query = uni.createSelectorQuery()
      query.select('.category-bar').boundingClientRect()
      query.exec((res) => {
        const rect = res && res[0]
        if (rect && rect.height) {
          // 向上取整：宁可多 1px，也不要把最后一行裁掉
          const height = Math.ceil(rect.height)
          // 首次测量：先写高度，下一帧再打开过渡，
          // 否则一进页面就会从 0 演一遍展开动画
          // 分类还没请求回来时不算“首次完成”，等标签真正渲染出来再定高，
          // 免得数据到位那一刻又从一行演一遍展开
          if (!this.categoryWrapReady && this.categories.length > 0) {
            this.categoryWrapHeight = height
            this.$nextTick(() => {
              this.categoryWrapReady = true
            })
            return
          }
          this.categoryWrapHeight = height
          return
        }
        if (retry > 0) {
          setTimeout(() => this.measureCategoryWrap(retry - 1), 80)
        }
      })
    },
    /**
     * 点吸顶的分类标题：回到分类列表开头
     * 和 VSCode 点吸顶的函数签名一样——只有标题真的被吸住了才跳，
     * 没吸住说明分类开头就在眼前，此时不响应，避免点一下页面乱跳
     */
    onCategoryHeadTap() {
      const query = uni.createSelectorQuery()
      query.select('.category-head').boundingClientRect()
      query.select('.category-wrap').boundingClientRect()
      query.selectViewport().scrollOffset()
      query.exec((res) => {
        const headRect = res && res[0]
        const wrapRect = res && res[1]
        const viewport = res && res[2]
        if (!headRect || !wrapRect) return

        const scrollTop = viewport ? viewport.scrollTop : 0
        const headHeight = headRect.height || 0
        // 标签区紧跟标题，所以 标题的文档位置 = 标签的文档位置 - 标题高度
        const headOffset = scrollTop + wrapRect.top - headHeight
        // 没被吸住时标题的自然位置就是 wrapRect.top - headHeight；
        // 只有被吸住时 headRect.top 才会更靠上
        const naturalTop = wrapRect.top - headHeight
        if (naturalTop <= headRect.top + 1) return

        uni.pageScrollTo({
          // headRect.top 就是吸住时的停靠位置（= 头部高度），
          // 让标题的文档位置正好滚到这个位置即可
          scrollTop: Math.max(headOffset - headRect.top, 0),
          duration: 300
        })
      })
    },
    async loadUserInfo(){
      const token = uni.getStorageSync('token');
      const userInfo = getUserInfo();
      if (token && userInfo) {
        const nextAvatar = userInfo.avatar || '';
        // 头像地址变化时重置加载失败标记，否则换过头像也不会重试
        if (nextAvatar !== this.avatar) {
          this.avatarError = false;
        }
        this.avatar = nextAvatar;
        this.nickName = userInfo.nickname || '';
        this.hasUser = true;
      } else {
        // 未登录：头像为空，头部回落到缺省头像
        this.avatar = '';
        this.avatarError = false;
        this.nickName = '';
        this.hasUser = false;
      }
    },
    // 头像地址失效时回落到缺省头像，而不是显示空白
    onAvatarError() {
      this.avatarError = true;
    },
    // 点击头部头像：已登录进个人中心，未登录去登录
    onAvatarTap() {
      if (!this.hasUser) {
        this.goToLogin();
        return;
      }
      uni.switchTab({ url: '/pages/mine/mine' });
    },
    // 搜索框点击：收起且半透明时，第一次点击只唤醒（0.2s 变不透明），第二次点击才聚焦输入
    onSearchTap() {
      if (this.isSearchLocked) {
        this.searchActive = true;
        return;
      }
      this.searchFocused = true;
    },
    onSearchBlur() {
      this.searchFocused = false;
    },
    // 搜索接口尚未开放，调试阶段允许自由输入，仅回车时提示
    onSearchConfirm() {
      uni.showToast({ title: '搜索功能开发中', icon: 'none' });
    },
    /**
     * 获取新闻列表
     * @param {Boolean} isLoadMore - 是否为加载更多模式（默认为 false，即首次加载）
     */
    async getNewsList(isLoadMore = false) {
      // 1. 如果正在加载中，直接返回，防止重复请求
      if (this.isLoading) return
      
      this.isLoading = true

      // 2. 如果是加载更多，显示 Loading 提示
      if (isLoadMore) {
        uni.showLoading({
          title: '加载中...',
          mask: true
        })
      }

      try {
        const data = {
          page: this.page,
          page_size: this.pageSize,
        }
        if (this.categoryId !== null && this.categoryId !== undefined) {
          data.category_id = this.categoryId
        }
        const res = await request({
          url: '/news_detail/get_news_detail',
          method: 'GET',
          data
        })
        console.log('请求参数', this.page,this.pageSize,this.categoryId)
        
        // console.log('newDetail接口返回：', res)
        
        if (res.code === 200 || res.code === '200') {
          const newList = res.data.result.map(item => ({
            ...item,
            published_at: item.published_at.replace('T', ' ')
          }))

          // 3. 根据模式处理数据
          if (isLoadMore) {
            // 这里是 this.newsList，不是 this.newList
            this.newsList = [...this.newsList, ...newList]

            // 4. 判断是否还有更多数据
            const total = res.data.total || 0
            
            // 策略A：如果后端返回了 total
            if (total > 0) {
              if (this.newsList.length >= total) {
                this.isFinished = true
                uni.showToast({ title: '没有更多数据了', icon: 'none' })
              }
            } 
            // 策略B：如果后端没返回 total，靠返回数量判断
            else {
              if (newList.length < this.pageSize) {
                this.isFinished = true
                uni.showToast({ title: '没有更多了', icon: 'none' })
              }
            }
          } else {
            // 5. 首次加载：直接赋值
            this.newsList = newList
            
            // 如果第一页数据就不够一页，说明也没更多了
            if (newList.length < this.pageSize) {
               this.isFinished = true
            } else {
               this.isFinished = false // 刷新后如果有数据，重置完成状态
            }
          }
        } else {
          throw new Error(res.msg || '请求失败')
        }
      } catch (err) {
        console.error('请求新闻失败：', err)
        uni.showToast({ title: '请求失败，请重试', icon: 'none' })
        
        // 6. 失败回退页码，方便用户再次触底重试
        if (isLoadMore) {
          this.page-- 
        }
      } finally {
        // 7. 无论成功失败，都结束 loading 状态
        this.isLoading = false
        if (isLoadMore) {
          uni.hideLoading()
        }
      }
    },

    async getCategories() { // 修正方法名拼写
      try {
        const res = await request({
          url: '/category/get_category',
        })
        if (res.code === 200 || res.code === '200') {
          this.categories = res.data
        }
      } catch (err) {
        console.error("请求分类失败", err)
      }
    },
    goToPersonalize() {
      uni.navigateTo({
        url: '/pages/personalize/personalize'
      });
    },
    toDetail(item) {
      uni.navigateTo({
        url: `/pages/news-detail/news-detail?id=${item.id}&rss_id=${item.rss_id}`,
        success: (res) => {
          console.log('跳转成功', res);
        },
        fail: (err) => {
          console.error('跳转失败', err);
        }
      });
    },

    // switchTab(index) {
    //   console.log('切换tab：', index)
    //   // 如果需要切换分类刷新列表，可在此重置分页
    //   // this.page = 1
    //   // this.isFinished = false
    //   // this.newsList = []
    //   // this.getNewsList()
    // }
  }
}