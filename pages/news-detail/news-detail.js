import { request } from '@/utils/request.js'
import { addReadHistory } from '@/utils/history.js';
import { getUserInfo } from '@/utils/user.js';

export default {
  data() {
    return {
      news_id: '',
      rss_id: '',
      newsData: {},
      news_title: '',
      // 详情接口是否还在路上：为 true 时正文 / 摘要 / 关键词都用骨架屏占位
      detailLoading: true,
      // 详情接口是否失败：失败时给一条可点的重试，而不是让骨架屏一直转
      detailError: false,
      // AI核心摘要列表
      aiSummaryList: [],
      // 文章标签
      articleTags: [],
      // 关键词列表
      keywordList: [],
      rss_source_name: '',

      rss_name: '',

      // 关联政策与案例列表
      content: '',
      isContentExpanded: false,
      displayContent: '',
      market_risk: '',
      policy_compliance: '',
      risk: false,
      relationList: [
        {
          type: "政策",
          rate: 98,
          title: "印尼 PMK 96/2023 关税法案",
          desc: "针对书籍、化妆品等 8 类商品降低关税起征点至 3 美元。"
        },
        {
          type: "案例",
          rate: 85,
          title: "某知名 3C 品牌新加坡海外仓案例",
          desc: "通过在前置仓完成预分拣，将清关时间从 3 天缩短至 6 小时。"
        }
      ],
      articleInfo: null,
      // 动态提示语
      dynamicHintKeyword: '',
      // 定时器，用户页面卸载时清除
      hintTimer: null,
      inputValue: ''
    };
  },
  onReady() {
    this.startHintRotation();
  },
  onUnload() {
    this.stopHintRotation();
  },
  onLoad(options) {
    this.news_id = options.id;
    this.rss_id = options.rss_id;
    console.log('news_id:', this.news_id)

    // 首页跳转时把列表里已经渲染过的标题 / 来源顺手递了过来：
    // 先填上，用户点进来第一眼看到的就是真标题，而不是一块灰的骨架
    // （真正的正文、摘要仍然以详情接口为准，回来后直接覆盖）
    const channel = typeof this.getOpenerEventChannel === 'function'
      ? this.getOpenerEventChannel()
      : null;
    if (channel && typeof channel.on === 'function') {
      channel.on('newsPreview', (payload) => {
        if (!payload) return;
        if (payload.title) this.news_title = payload.title;
        if (payload.rss_tag) this.rss_name = payload.rss_tag;
      });
    }

    this.getNewsDetail(this.news_id, this.rss_id);
  },
  computed: {
    // 摘要骨架：只有"还在加载且没失败"时才显示，
    // 失败时换成重试条，避免骨架一直转、看着像卡死
    summarySkeleton() {
      return this.detailLoading && !this.detailError;
    },
    processedContent() {
      if (!this.content) return '';

      // 如果已经展开，或者长度小于等于50，显示全部
      if (this.isContentExpanded || this.content.length <= 256) {
        return this.content;
      }

      // 否则显示前50个字 + ...
      return this.content.substring(0, 256) + '...';
    }
  },
  methods: {
    fillInputFromHint() {
      if (!this.dynamicHintKeyword) return;

      // 组合完整的问题文案
      const question = `这篇文章对 ${this.dynamicHintKeyword} 有什么具体影响？`;
      this.inputValue = question;

      // 可选：给予轻微震动反馈或 Toast 提示，增强交互感
      // uni.vibrateShort(); 
    },
    startHintRotation() {
      // 先执行一次，避免等待3秒才显示
      this.updateRandomKeyword();

      // 设置定时器，每3秒执行一次
      this.hintTimer = setInterval(() => {
        this.updateRandomKeyword();
      }, 3000);
    },
    stopHintRotation() {
      if (this.hintTimer) {
        clearInterval(this.hintTimer);
        this.hintTimer = null;
      }
    },
    updateRandomKeyword() {
      if (!this.keywordList || this.keywordList.length === 0) {
        this.dynamicHintKeyword = '相关行业'; // 默认兜底文案
        return;
        let newIndex;
        let attempts = 0;
        // 避免连续两次随机到同一个词
        do {
          newIndex = Math.floor(Math.random() * this.keywordList.length);
          attempts++;
        } while (
          this.keywordList[newIndex] === this.dynamicHintKeyword &&
          this.keywordList.length > 1 &&
          attempts < 5
        );

        this.dynamicHintKeyword = this.keywordList[newIndex];
      }

      const randomIndex = Math.floor(Math.random() * this.keywordList.length);
      this.dynamicHintKeyword = this.keywordList[randomIndex];
    },
    goBack() {
      uni.navigateBack();
    },
    viewAll() {
      uni.showToast({ title: "查看全部", icon: "none" });
    },
    openSetting() {
      uni.showToast({ title: "配置推送规则", icon: "none" });
    },
    // 显示全文
    toggleContent() {
      this.openInBrowser();
    },
    /**
     * 判断是否应该使用系统浏览器打开
     * @param {String} url 
     * @returns {Boolean}
     */
    shouldOpenInSystemBrowser(url) {
      if (!url) return true;

      // 定义不允许 iframe/webview 嵌入的常见域名关键词
      const blockedDomains = [
        'oschina.net',      // 开源中国
        'zhihu.com',        // 知乎
        'github.com',       // GitHub
        'juejin.cn',        // 掘金
        'csdn.net',         // CSDN (部分页面限制)
        'medium.com',       // Medium
        'twitter.com',      // Twitter
        'facebook.com'      // Facebook
      ];

      try {
        // 简单解析域名，兼容 http/https
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        // 检查 hostname 是否包含黑名单中的任何一项
        return blockedDomains.some(domain => hostname.includes(domain));
      } catch (e) {
        // 如果 URL 格式错误，保守起见使用系统浏览器
        console.warn('URL解析失败，默认使用系统浏览器', e);
        return true;
      }
    },
    // 新增：打开系统浏览器
    openInBrowser() {
      if (!this.newsData || !this.newsData.url) {
        uni.showToast({ title: '暂无原文链接', icon: 'none' });
        return;
      }

      const targetUrl = this.newsData.url;
      const useSystemBrowser = this.shouldOpenInSystemBrowser(targetUrl);

      if (useSystemBrowser) {
        // --- 策略 A: 使用系统浏览器 ---
        uni.showModal({
          title: '提示',
          content: '该链接需在外部浏览器中查看，是否立即跳转？',
          success: (res) => {
            if (res.confirm) {
              // #ifdef H5
              window.open(targetUrl, '_blank');
              // #endif

              // #ifdef APP-PLUS
              plus.runtime.openURL(targetUrl);
              // #endif

              // #ifdef MP-WEIXIN
              uni.setClipboardData({
                data: targetUrl,
                success: () => uni.showToast({ title: '链接已复制', icon: 'none' })
              });
              // #endif
            }
          }
        });
      } else {
        // --- 策略 B: 尝试 App 内部打开 ---
        uni.showModal({
          title: '提示',
          content: '将在应用内打开原文链接',
          success: (res) => {
            if (res.confirm) {
              const encodedUrl = encodeURIComponent(targetUrl);
              // 注意：这里路径必须与 pages.json 和实际文件路径完全一致（全小写）
              uni.navigateTo({
                url: `/pages/webView/webView?url=${encodedUrl}`,
                fail: (err) => {
                  console.error('跳转 WebView 失败', err);
                  uni.showToast({ title: '打开失败，请重试', icon: 'none' });
                }
              });
            }
          }
        });
      }
    },

    viewAll() {
      uni.showToast({ title: "查看全部", icon: "none" });
    },
    openSetting() {
      uni.showToast({ title: "配置推送规则", icon: "none" });
    },
    async getNewsDetail() {
      // 每次进入都先回到「加载中」：重试时骨架屏要能重新出现，
      // 而不是先显示上一次的空白/错误状态再跳一下
      this.detailLoading = true
      this.detailError = false
      try {
        const res = await request({
          url: '/news_detail/get_detail_by_id?id=' + this.news_id,

        })
        console.log('接口返回：', res)
        if (res.code === 200 || res.code === '200') {
          this.newsData = res.data
          if (res.data) {
            this.news_title = res.data.title;
            this.content = res.data.content || '';
            this.keywordList = res.data.ai_origin_output?.keywords || [];
            // 如果关键词列表更新了，立即更新一次显示，防止前3秒显示空或默认值
            this.updateRandomKeyword();
            // 风险字段可能整块缺失：用可选链兜底，
            // 否则这里一抛错，外层 catch 会把「已经拿到的正文」也判成失败
            const policyRisk = res.data.ai_origin_output?.policy_risk || {};
            if (policyRisk.market_risk && policyRisk.market_risk !== "未提及") {
              this.market_risk = policyRisk.market_risk;
              this.policy_compliance = policyRisk.policy_compliance || '';
              this.risk = true;
            }
            const detail = res.data;
            this.articleInfo = detail;
            const userInfo = getUserInfo();
            if (userInfo && userInfo.id) {
              // 带上 rss_id：首页「最近看过」浮层点回来时要用它还原详情页
              addReadHistory(
                { ...this.newsData, rss_id: this.rss_id || this.newsData.rss_id },
                userInfo.id
              );
            }

            console.log(res.data);

            const abstract = res.data.ai_origin_output?.abstract || '';
            if (abstract) {
              this.aiSummaryList = abstract.match(/[\s\S]*?。/g) || [abstract];
            } else {
              this.aiSummaryList = [];
            }

            try {
              const res_rss = await request({
                url: '/rss/get_by_id?id=' + this.rss_id,
              })
              if (res_rss.code === 200 || res_rss.code === '200') {
                this.rssData = res_rss.data
                this.rss_name = res_rss.data.name
              }
            }
            catch (err) {
              console.error('请求RSS失败：', err)
            }

          }
        } else {
          // 业务码不对时按失败处理，否则页面会一直停在骨架屏上，用户不知道发生了什么
          throw new Error(res.msg || '详情加载失败')
        }
      } catch (err) {
        console.error('请求新闻失败：', err)
        this.detailError = true
      } finally {
        // 不管成功还是失败都要收起骨架屏：
        // 成功 → 换成真内容；失败 → 由 detailError 换成「点击重试」
        this.detailLoading = false
      }
    },
    /**
     * 加载失败后重试
     * 用 getNewsDetail 而不是重新 navigateTo：页面栈不变，返回键行为也不会乱
     */
    reloadDetail() {
      if (this.detailLoading) return
      this.getNewsDetail()
    }
  }
};