# 题卡集 · 算法题复习卡片

玻璃拟态（Apple 风格）的卡片式题库模板：**题目 + 正文 + 代码块**，数据以 `data/cards.json` 存放在 GitHub 仓库，网页内一键「拉取 / 推送」同步，支持 PWA 安装到手机 / 桌面离线使用。纯静态、零依赖、免服务器。

## ✨ 特性

- 🃏 卡片式布局：题目、难度、标签、正文笔记、代码块（macOS 窗口风格）
- 🪟 玻璃拟态界面：毛玻璃 + 流动渐变光斑，自动适配亮 / 暗色模式
- 🎨 代码语法高亮（C++ / C / Python / Java / JavaScript / Go，零依赖自实现）+ 一键复制 + 展开 / 收起
- 🔍 全文搜索 + 标签筛选
- ☁️ GitHub 同步：网页里添加卡片 → 自动推送到仓库；换设备点「同步」拉取合并
- 📱 PWA：部署到 GitHub Pages 后可"添加到主屏幕"，离线可用
- 🔒 数据自主：全部存在你自己的仓库里，天然带版本历史

## 📁 目录结构

```
project/
├── index.html          # 页面骨架
├── css/style.css       # 玻璃拟态样式
├── js/app.js           # 主逻辑：渲染 / 搜索 / 增删改 / 同步
├── js/github.js        # GitHub Contents API（拉取 / 推送）
├── js/highlight.js     # 零依赖语法高亮
├── js/seed.js          # 离线兜底数据（由 data/cards.json 自动生成，勿手改）
├── data/cards.json     # ★ 卡片数据（同步的核心文件）
├── manifest.json       # PWA 清单
├── sw.js               # Service Worker（离线缓存）
├── icon.svg            # 应用图标
└── .nojekyll           # 关闭 GitHub Pages 的 Jekyll 处理
```

## 🚀 发布到 GitHub Pages（三步）

```bash
# 1. 在 GitHub 网页上新建一个空仓库（不要勾选 README / .gitignore）
# 2. 关联并推送（本目录已执行过 git init 和首次提交）
cd project
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main

# 3. 打开仓库页面 → Settings → Pages →
#    Source 选 "Deploy from a branch"，Branch 选 main / (root)，Save
```

一两分钟后访问 `https://<你的用户名>.github.io/<仓库名>/` 即可使用。

> 注意：GitHub 免费账户只能给**公开仓库**开 Pages；若仓库设为私有需要 GitHub Pro。

## 📝 日常添加卡片

**方式 A（推荐）：网页里直接添加**

1. 打开网站 → 点「＋ 添加卡片」
2. 填写 题目 / 正文 / 代码（可选难度、标签、语言）
3. 点保存 → 已配置 Token 的情况下自动上传到 GitHub；未配置则保存在本机，点「同步」上传

**方式 B：手动编辑 `data/cards.json` 后 `git push`**

网页端点「同步」即可拉取。注意：请把改动卡片的 `updatedAt` 更新为当前时间，否则同步合并时会被本地较新的版本覆盖。

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一标识，建议 `demo-0004` 这样递增，或留空由网页生成 |
| `title` | string | 题目（必填） |
| `difficulty` | string | `简单` / `中等` / `困难` / 空串 |
| `tags` | string[] | 标签数组，用于筛选 |
| `lang` | string | `cpp` / `python` / `java` / `javascript` / `go` / `c` / `plain` |
| `body` | string | 正文笔记，`\n` 换行 |
| `code` | string | 代码块 |
| `updatedAt` | string | ISO 时间，同步合并按它判断新旧 |

## 🔑 配置上传 Token（只需一次）

只拉取不需要 Token；**上传**需要一个 Fine-grained Token：

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
2. Repository access 选 **Only select repositories** → 只勾选你的题卡仓库
3. Permissions → Repository permissions → **Contents: Read and write**
4. 生成后复制（只显示一次），粘贴到网页「⚙ 设置」的 Token 输入框 → 保存

Token 只保存在本机浏览器 localStorage，不会进入仓库；若泄露请立即在 GitHub 上撤销。

## 🔄 同步与合并规则

- 打开页面自动拉取；点「同步」= 先拉取合并、再推送
- 合并按卡片 `id` 取 `updatedAt` 较新的一方，不会互相覆盖丢数据
- 删除采用"墓碑"机制：本地删除 → 同步后远端也删除
- 推送前总是先拉取合并，基本不会遇到冲突；万一报 409/422 再点一次同步即可

## ❓ 常见问题

- **直接双击 index.html 打开？** 可以看到示例卡片（内置兜底数据），但建议用本地服务器（`python -m http.server`）或部署到 Pages，同步与 PWA 需要 http(s) 环境。
- **改了代码 / 数据页面没变？** 线上有 Service Worker 缓存：强刷（Ctrl+F5），或把 `sw.js` 里的 `carddeck-v1` 版本号 +1。
- **看不到「同步」成功？** 未配 Token 时只拉取不上传，属正常；配 Token 后添加卡片会自动上传。
- **本地开发不缓存**：localhost / 127.0.0.1 下自动跳过 Service Worker，改完刷新即生效。

## 🧭 为什么选网页而不是小程序 / 安卓 App

| 方案 | 结论 |
|---|---|
| 微信小程序 | 发布要审核，正式版请求域名必须 ICP 备案，GitHub API 无法直连，需自建代理，链路重 |
| 安卓 App | 开发打包分发成本高，更新要重装 APK |
| **GitHub Pages 网页（本方案）** | 免费托管免审核，浏览器即开即用，可 PWA 安装离线，GitHub 同步零成本 |

## 🛣 可扩展方向

- 从 `leetcode-hot100` 笔记批量导入卡片
- 随机抽卡复习模式 / 记忆曲线标记
- 导出 Anki 牌组
