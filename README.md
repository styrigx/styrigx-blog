<div align="center">

中文 | [English](README.en.md)

# Styrigx Blog

拆开看看，再装回去。

[在线访问 blog.styrigx.com](https://blog.styrigx.com) · [主站 styrigx.com](https://styrigx.com) · [GitHub @styrigx](https://github.com/styrigx) · [X @styrigx](https://x.com/styrigx)

![Hugo](https://img.shields.io/badge/dynamic/yaml?url=https://raw.githubusercontent.com/styrigx/styrigx-space/main/.github/actions/setup-hugo/action.yml&query=%24..HUGO_VERSION&label=Hugo&style=flat-square&color=2563eb&logo=hugo)
![Tailwind CSS](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/styrigx/styrigx-blog/main/package.json&query=%24.devDependencies.tailwindcss&label=Tailwind%20CSS&style=flat-square&color=2563eb&logo=tailwindcss)
![Deploy](https://img.shields.io/github/actions/workflow/status/styrigx/styrigx-blog/deploy.yml?style=flat-square&label=Deploy&color=2563eb)
![License](https://img.shields.io/badge/License-MIT-2563eb?style=flat-square)
![Posts](https://img.shields.io/badge/Posts-CC%20BY--NC--SA%204.0-2563eb?style=flat-square)

</div>

---

## 这是什么

Styrigx's Space 的博客子站，写 AI 工具的使用记录、开源项目复盘和自建的基础设施。界面是自研的 Styrigx UI，与主站同一套设计：悬浮顶栏、导航抽屉、配色和外观都跟随主站（共享外壳从主站同步）。站点用 Hugo 生成（2026-10 从 Astro / Navfolio 迁来，网址不变），和主站同一套技术栈。

博客只管文章，做成一个沉浸式 app：顶栏左边九宫格打开导航抽屉（主站 / 奇趣 / 日刻 / 博客，和主站同一套；文章页底部是目录），中间长条在列表页是分段滑块 首页 · 文章 · 专题（点、左右滑、方向键都能切），其他页只有页名，右边是分享按钮（管理员生成带临时会话的短链，访客分享当前页）。语言、深浅色、配色都在主站设置，博客跟着走。

## 能做什么

- 列表页三个页签：首页（标题区 + 最新 3 篇 + 最新系列）、文章（全部文章）、专题（系列 → 分类 → 标签，点了就地筛选）。地址 hash 记住页签（`#posts`、`#topics`、`#topics/tag/<slug>`）。
- 文章页长条是文章标题，底边一条强调色细线是阅读进度；目录在九宫格抽屉底部，当前节高亮；属于系列的文章有「第 n / N 篇」小块。系列写法见 [docs/content-series.md](docs/content-series.md)。
- 中英双语：中文在 `/`，英文在 `/en/`；语言跟主站设置（没设置时第一次访问按浏览器语言跳转）。
- 文章地址固定为 `/post/<slug>/`，改标题也不会变。
- 文章页没有评论（旧评论留在本仓库 Discussions）。
- RSS（`/rss.xml`、`/en/rss.xml`）和站点地图。
- 外观和语言跟主站走：深浅色、调色板、强调色、字号、减弱动效、语言都从主站的 `sgx-ui` cookie 读，契约见 [docs/sgx-ui-cookie.md](docs/sgx-ui-cookie.md)。
- 字体：界面和正文用 Inter + 系统中文字体；代码块用 Maple Mono（自托管）。代码块是一个容器，带语言 / 文件名 / 复制按钮、行号槽、`hl_lines` 高亮行，配色从主站色彩角色生成（`scripts/gen-code-tokens.mjs`，对比度有单测）。

## 写文章

```bash
hugo new -s web content/zh/post/2026-10-08-slug.md   # 需要本机装 Hugo 0.168.0
```

或者直接在 `web/content/zh/post/`（中文）、`web/content/en/post/`（英文）新建 `YYYY-MM-DD-slug.md`（文件名就是网址 `/post/<文件名>/`，中英同名即互为译文）：

```yaml
---
title: 文章标题
description: '一句话简介'
date: 2026-10-08
tags: ['标签1', '标签2']
---
```

## 本地运行

环境要求：Node 22（见 `.nvmrc`）、Hugo 0.168.0（标准版即可）。

```bash
git clone https://github.com/styrigx/styrigx-blog.git
cd styrigx-blog
npm ci
npm run dev        # 本地预览（Tailwind CSS + hugo server）
npm run build      # 构建到 web/public/
npm test           # 单元测试（网址映射、订阅、构建 CSS、代码配色对比度等，需先 build）
npm run test:e2e   # Playwright 行为 + 视觉回归
```

推送 main 后，GitHub Actions 构建、核对共享外壳和代码配色、跑单元测试和 Playwright，通过后把 `web/public/` 部署到 Cloudflare Pages（项目名 `styrigx-blog`）。

## 目录说明

- `web/content/`：文章，`zh/` 和 `en/` 分开。
- `web/hugo.yaml`：站点配置（网址规则、语言、订阅）；`web/i18n/`：界面文案。
- `web/layouts/`：页面模板和组件（顶栏、页签、卡片、文章、目录、系列、分享、相关文章、代码块）。
- `web/assets/css/`、`web/assets/js/`：样式和脚本；`sgx-shell.css`、`js/sgx/shell/`、`web/data/sgx-shell/` 是主站共享外壳的副本，用 `npm run shell:sync` 同步、勿手改（版本记在 `sgx-shell.lock.json`）。
- 锁屏：会话检查全在主站鉴权网关（styrigx-space 仓库 `workers/auth-gateway`），本站 Pages 只放静态文件、不持任何钥匙；`web/static/_worker.js` 只把 pages.dev 跳回正式域名。
- `web/static/`：原样发布的文件（`_headers`、`_redirects`、字体、图标）。
- `scripts/`：CSS 构建、共享外壳同步、代码配色生成、本地静态服务器、全站搜索索引（`build-search-index.mjs`：文章标题 + 正文写进主站搜索的 KV `site:blog`，main 上部署后由 CI 上传）。
- `tests/`：单元测试和视觉回归。视觉基线只在 CI 生成：在分支上手动跑 _Update visual snapshots_（`.github/workflows/update-snapshots.yml`）。
- `docs/`：cookie 契约、系列写法。

## 许可

代码 MIT。设计、Styrigx UI 与站点代码 © Sloan Gray；沿用的 Navfolio 模板样式代码 © dodolalorc，按 MIT 要求保留其版权声明。文章和图片采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)，不属于 MIT。

站点生成：[Hugo](https://gohugo.io)；早期版本基于 [Navfolio](https://github.com/navfolio)。

© 2026 Sloan Gray · Powered by Styrigx UI
