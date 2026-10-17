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

博客只管文章。打开首页就是文章列表，其他东西都放在主站。

## 能做什么

- 首页即文章列表，顶部可按标签筛选，另有完整标签页。
- 中英双语：中文在 `/`，英文在 `/en/`，第一次访问按浏览器语言跳转。
- 文章地址固定为 `/post/<slug>/`，改标题也不会丢评论。
- ⋮ 菜单里有全文搜索（Pagefind）、语言切换和深浅色。
- Giscus 评论，存在本仓库的 Discussions。
- RSS（`/rss.xml`、`/en/rss.xml`）和站点地图。
- 外观跟主站走：主题色、深浅色、字号和减弱动效从主站同步过来。
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
bun run build      # 构建，顺带生成搜索索引和字体子集
bun run preview    # 预览构建结果
```

推送 main 后，GitHub Actions 跑测试和视觉回归，通过后部署到 Cloudflare Pages（项目名 `styrigx-blog`）。

## 目录说明

- `src/content/blog/`：文章，`zh/` 和 `en/` 分开。
- `src/config/site.toml`：站点配置，标题、字体、评论、主题色。
- `src/components/`、`src/layouts/`、`src/pages/`：覆盖主题默认的组件和页面。
- `src/styles/`：全局样式和 Styrigx UI 样式。
- `functions/`：Pages Functions，和主站共用锁屏会话。
- `scripts/fonts/`、`public/fonts/`：字体子集脚本和自托管字体。
- `tests/`：单元测试和视觉回归。

## 许可

代码 MIT。设计、Styrigx UI 与站点代码 © Sloan Gray；内容引擎 @navfolio/* 及沿用的模板代码 © dodolalorc，按 MIT 要求保留其版权声明。文章和图片采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)，不属于 MIT。

内容引擎：[Navfolio](https://github.com/navfolio)。

© 2026 Sloan Gray · Powered by Styrigx UI
