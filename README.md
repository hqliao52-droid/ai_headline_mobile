# AI 资讯 · sea_platform_web

基于 **uni-app (Vue 2)** 的跨端资讯 App，提供新闻信息流、AI 智能问答、个性化推送与阅读历史。

支持编译到 H5 与 App（Android / iOS），UI 基于 uView UI 2.0。

---

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [页面说明](#页面说明)
- [后端地址配置](#后端地址配置)
- [Git 与忽略规则](#git-与忽略规则)
- [已知问题与待办](#已知问题与待办)
- [安全须知](#安全须知)

---

## 功能概览

| 模块 | 说明 |
| --- | --- |
| 资讯流 | 首页分类标签 + 分页加载 + 下拉刷新 + 返回顶部 |
| 新闻详情 | 富文本正文、阅读历史自动记录 |
| AI 问答 | 基于 WebSocket 的流式对话，Markdown 渲染、代码高亮、会话管理、文件与图片上传 |
| 个性化 | 按类别订阅推送内容 |
| 推送历史 | 查看历史推送记录 |
| 用户体系 | 注册（邮箱验证码 + 头像上传）、登录、修改密码、个人资料 |

---

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | uni-app（Vue 2，`manifest.json` 中 `vueVersion: "2"`） |
| 开发工具 | HBuilderX 3.1+ |
| UI 组件库 | uView UI 2.0.38（npm 依赖） |
| 代码高亮 | highlight.js 11 |
| 实时通信 | WebSocket（`utils/chat-socket.js`） |
| 样式 | SCSS，全局变量见 `uni.scss` |

---

## 目录结构

```
.
├── config/
│   ├── server.config.js     # 后端地址唯一配置源（改地址只改这里）
│   └── README.md            # 配置机制详细说明
├── pages/                   # 页面目录，多数页面拆分为 .vue / .js / .scss
│   ├── login/               # 登录
│   ├── register/            # 注册
│   ├── index/               # 首页资讯流（tabBar）
│   ├── ai-chat/             # AI 问答（tabBar）
│   ├── mine/                # 个人中心（tabBar）
│   ├── news-detail/          # 新闻详情
│   ├── webView/             # 内嵌网页
│   ├── personalize/         # 个性化推送设置
│   ├── pushHistory/         # 推送历史
│   └── accountSetting/      # 账号设置
├── static/                  # 静态资源与 tabBar 图标
├── utils/
│   ├── config.js            # 统一导出后端地址
│   ├── request.js           # HTTP 请求封装
│   ├── stream-request.js    # 流式请求
│   ├── chat-socket.js       # WebSocket 长连接与流式消息
│   ├── uploadFile.js        # 文件 / 头像上传
│   ├── email.js             # 邮箱验证码
│   ├── history.js           # 阅读历史
│   └── user.js              # 用户信息
├── scripts/
│   ├── sync-server-config.js  # 把 server.config.js 同步进 manifest.json
│   ├── check-backend.js       # 后端连通性体检
│   └── probe-chat-ws.js       # 聊天 WebSocket 探测
├── App.vue                  # 应用入口，启动时校验本地 token
├── main.js                  # 注册 uView 与全局配置
├── pages.json               # 路由、tabBar、easycom 规则
├── manifest.json            # 应用配置（HBuilderX 读取的静态 JSON）
├── uni.scss                 # 全局 SCSS 变量与 uView 主题
├── vue.config.js            # H5 开发代理
├── index.html               # H5 模板
└── package.json             # npm 依赖与脚本
```

---

## 环境要求

- **HBuilderX 3.1 及以上**（推荐，本项目为 uni-app Vue 2 工程）
- **Node.js 16+ 与 npm**

---

## 快速开始

```bash
# 1. 克隆仓库
git clone <repo-url> sea_platform_web
cd sea_platform_web

# 2. 安装依赖（必须，否则无法编译）
npm install
```

**为什么必须 `npm install`**：`highlight.js` 与 `uView UI` 都从 `node_modules` 解析，`uni.scss` 也引用了 `uview-ui/theme.scss`。缺少 `node_modules` 时编译会直接失败。

```bash
# 3. 用 HBuilderX 打开项目根目录
#    运行 → 运行到浏览器（H5 默认端口 8081）
#    运行 → 运行到手机或模拟器（App）
```

---

## 页面说明

| 路由 | 说明 | tabBar |
| --- | --- | --- |
| `pages/login/login` | 登录（自定义导航栏） | — |
| `pages/register/register` | 注册 | — |
| `pages/index/index` | 首页资讯流 | ✅ |
| `pages/ai-chat/ai-chat` | AI 问答 | ✅ |
| `pages/mine/mine` | 个人中心 | ✅ |
| `pages/news-detail/news-detail` | 新闻详情 | — |
| `pages/webView/webView` | 内嵌网页 | — |
| `pages/personalize/personalize` | 个性化推送设置 | — |
| `pages/pushHistory/pushHistory` | 推送历史 | — |
| `pages/accountSetting/accountSetting` | 账号设置 | — |

启动逻辑：`App.vue` 在 `onLaunch` 时读取本地 `token`，已登录则 `switchTab` 跳转首页。

---

## 后端地址配置

**后端地址只在 `config/server.config.js` 一处维护**，其余文件从它读取或由脚本同步：

```js
const PROTOCOL = 'http';
const HOST = '<服务器地址>';
const PORT = 8000;
```

换服务器时只改这三个值，然后同步 `manifest.json`：

```bash
npm run config:sync    # 同步
npm run config:check   # 提交前检查是否已同步
```

接口连不上时先做连通性体检：

```bash
npm run backend:check
```

完整机制、各文件关系与排查步骤见 **[config/README.md](config/README.md)**。

---

## Git 与忽略规则

本仓库于重建后重新开始提交历史，首次提交为单次 `init`。

`.gitignore` 的核心约定：

| 规则 | 原因 |
| --- | --- |
| `node_modules/` | npm 依赖，由 `npm install` 还原 |
| `uni_modules/` | **uView 由 npm 提供，不再复制一份源码入库**（easycom 规则见 `pages.json`） |
| `.env`、`.env.local` | 本地环境变量，可能含密钥 |
| `*.keystore`、`*.jks`、`*.p12`、`*.pem`、`*.key` | 签名文件与私钥，严禁入库 |
| `unpackage/`、`dist/`、`build/` | 编译产物 |
| `.hbuilderx/`、`.vscode/`、`.idea/` | 编辑器配置 |
| `*.log`、`.DS_Store`、`Thumbs.db` | 日志与系统文件 |

**关于 uView 的两种安装方式**（本仓库采用第一种）：

1. **npm（当前）**：`package.json` 声明 `uview-ui`，`pages.json` 配置 easycom 规则 `"^u-(.*)": "uview-ui/components/u-$1/u-$1.vue"`，`uni.scss` 引用 `uview-ui/theme.scss`。
2. **HBuilderX 插件市场**：把 uView 放进 `uni_modules/uview-ui/`，`uni.scss` 改回 `@import 'uni_modules/uview-ui/theme.scss'`，并删除 `pages.json` 中的 easycom 自定义规则。

两种方式只能保留一种，不要混用，否则会出现组件版本不一致。

---

## 已知问题与待办

- **`pages/pushHistory/` 为未完成的占位页**：该目录下三个文件（`pushHistory.vue`、`pushHistory.scss`、`pushHistroy.js`）均为 0 字节，且 `pages.json` 中已注册该路由。目前没有任何页面跳转到它，直接访问会显示空白页。若确认不做，可连同 `pages.json` 中的路由一并删除；若要做，注意文件名 `pushHistroy.js` 存在拼写错误（应为 `pushHistory.js`）。
- **`mermaid` 依赖未实际使用**：`pages/ai-chat/ai-chat.js` 中只生成占位符与正则匹配，没有 `import mermaid`，也没有 CDN 引入。确认不需要后可从 `package.json` 移除，可显著减小 `package-lock.json`。
- **`manifest.json` 中 `h5.sdkConfigs.maps.amap.key` 已清空**：项目当前未调用任何地图 API。若后续启用地图，需重新申请高德 Key 填入，**不要提交真实 Key**。
- **`.env` 已过期**：其中的高德 Key 已失效，仓库不再跟踪该文件，本地如无需要可删除。
- **`manifest.json` 的 H5 代理由脚本生成**：不要手写其中的代理地址，运行 `npm run config:sync` 保持同步。

---

## 安全须知

- 本仓库历史已重建，旧历史中的 `.env` 与签名文件均已废弃，相关密钥需视为已泄露并作废处理。
- 请勿在代码、`manifest.json`、`.env` 或提交信息中写入任何真实密钥。
- 签名文件（`*.keystore` 等）只保存在本地或 CI 的加密变量中。
