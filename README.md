<div align="center">

中文 | [English](README.en.md)

# Styrigx Blog

拆开看看，再装回去。

[在线访问 blog.styrigx.com](https://blog.styrigx.com) · [主站 styrigx.com](https://styrigx.com) · [书库 book.styrigx.com](https://book.styrigx.com) · [GitHub @styrigx](https://github.com/styrigx) · [X @styrigx](https://x.com/styrigx)

![Astro](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/styrigx/styrigx-blog/main/package.json&query=%24.dependencies.astro&label=Astro&style=flat-square&color=2563eb&logo=astro)
![Tailwind CSS](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/styrigx/styrigx-blog/main/package.json&query=%24.dependencies.tailwindcss&label=Tailwind%20CSS&style=flat-square&color=2563eb&logo=tailwindcss)
![Deploy](https://img.shields.io/github/actions/workflow/status/styrigx/styrigx-blog/deploy.yml?style=flat-square&label=Deploy&color=2563eb)
![License](https://img.shields.io/badge/License-MIT-2563eb?style=flat-square)
![Posts](https://img.shields.io/badge/Posts-CC%20BY--NC--SA%204.0-2563eb?style=flat-square)

</div>

---

## 这是什么

Styrigx's Space 的博客子站，写 AI 工具的使用记录、开源项目复盘和自建的基础设施。界面是自研的 Styrigx UI，与主站同一套设计：悬浮顶栏、九宫格切站、壁纸和外观都跟随主站。内容引擎用的是 Navfolio。

博客只管文章，做成一个沉浸式 app：顶栏左边九宫格打开导航抽屉（主页 / 书签 / 书库 / 博客 / 设置，和主站同一套），中间是分段滑块 首页 · 文章 · 专题（点、左右滑、方向键都能切），右边是头像。语言、深浅色、配色都在主站设置，博客跟着走。

## 能做什么

- 列表页三个页签：首页（标题区 + 最新 3 篇 + 最新系列）、文章（全部文章）、专题（系列 → 分类 → 标签，点了就地筛选）。地址 hash 记住页签（`#posts`、`#topics`、`#topics/tag/<slug>`）。
- 文章页顶栏是阅读进度条 + 标题，点开是目录；属于系列的文章有「第 n / N 篇」小块。系列写法见 [docs/content-series.md](docs/content-series.md)。
- 中英双语：中文在 `/`，英文在 `/en/`；语言跟主站设置（没设置时第一次访问按浏览器语言跳转）。
- 文章地址固定为 `/post/<slug>/`，改标题也不会丢评论。
- Giscus 评论，存在本仓库的 Discussions。
- RSS（`/rss.xml`、`/en/rss.xml`）和站点地图。
- 外观和语言跟主站走：深浅色、调色板、强调色、字号、减弱动效、语言都从主站的 `sgx-ui` cookie 读，契约见 [docs/sgx-ui-cookie.md](docs/sgx-ui-cookie.md)。
- 中文用霞鹜文楷，自托管并按文章生成字体子集。

## 写文章

```bash
bun run post:new
```

或者直接在 `src/content/blog/zh/`（中文）、`src/content/blog/en/`（英文）新建 `YYYY-MM-DD-slug.md`：

```yaml
---
title: 文章标题
description: '一句话简介'
date: 2026-10-08
lang: zh
tags: ['标签1', '标签2']
---
```

## 本地运行

环境要求：Bun 1.4。

```bash
git clone https://github.com/styrigx/styrigx-blog.git
cd styrigx-blog
bun install
bun run dev        # 本地预览
bun run build      # 构建
bun run preview    # 预览构建结果
```

推送 main 后，GitHub Actions 跑测试和视觉回归，通过后部署到 Cloudflare Pages（项目名 `styrigx-blog`）。

## 目录说明

- `src/content/blog/`：文章，`zh/` 和 `en/` 分开。
- `src/config/site.toml`：站点配置，标题、字体、评论、主题色。
- `src/components/`、`src/layouts/`、`src/pages/`：覆盖主题默认的组件和页面。
- `src/styles/`：全局样式和 Styrigx UI 样式。
- 锁屏：会话检查全在主站鉴权网关（styrigx-space 仓库 `workers/auth-gateway`），本站 Pages 只放静态文件、不持任何钥匙；`public/_worker.js` 只把 pages.dev 跳回正式域名。
- `scripts/fonts/`、`public/fonts/`：字体子集脚本和自托管字体。
- `tests/`：单元测试和视觉回归。视觉基线只在 CI 生成：在分支上手动跑 _Update visual snapshots_（`.github/workflows/update-snapshots.yml`）。
- `docs/`：cookie 契约、系列写法。

## 许可

代码 MIT。设计、Styrigx UI 与站点代码 © Sloan Gray；内容引擎 @navfolio/* 及沿用的模板代码 © dodolalorc，按 MIT 要求保留其版权声明。文章和图片采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)，不属于 MIT。

内容引擎：[Navfolio](https://github.com/navfolio)。

© 2026 Sloan Gray · Powered by Styrigx UI
