<div align="center">

[中文](README.md) | English

# Styrigx Blog

Take it apart, then put it back together.

[Visit blog.styrigx.com](https://blog.styrigx.com/en/) · [Main site styrigx.com](https://styrigx.com/en/) · [Library book.styrigx.com](https://book.styrigx.com/en/) · [GitHub @styrigx](https://github.com/styrigx) · [X @styrigx](https://x.com/styrigx)

![Astro](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/styrigx/styrigx-blog/main/package.json&query=%24.dependencies.astro&label=Astro&style=flat-square&color=2563eb&logo=astro)
![Tailwind CSS](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/styrigx/styrigx-blog/main/package.json&query=%24.dependencies.tailwindcss&label=Tailwind%20CSS&style=flat-square&color=2563eb&logo=tailwindcss)
![Deploy](https://img.shields.io/github/actions/workflow/status/styrigx/styrigx-blog/deploy.yml?style=flat-square&label=Deploy&color=2563eb)
![License](https://img.shields.io/badge/License-MIT-2563eb?style=flat-square)
![Posts](https://img.shields.io/badge/Posts-CC%20BY--NC--SA%204.0-2563eb?style=flat-square)

</div>

---

## What is this

The blog sub-site of Styrigx's Space: notes on AI tools, open-source project retrospectives and self-built infrastructure. The interface is Styrigx UI, designed in-house and shared with the main site: the same floating top bar, nine-dot site switcher, wallpaper and appearance. The content engine is Navfolio.

The blog only does posts, built as an immersive app: the nine-dot button on the left opens the navigation drawer (Home / Bookmarks / Library / Blog, same as the main site; on a post its lower section is the table of contents), the middle is a segmented slider Home · Posts · Topics on every page (tap, swipe or arrow keys), the avatar sits on the right. Language, light/dark and colors are set on the main site and the blog follows.

## What it does

- Three tabs on the list page: Home (title, latest 3 posts, newest series), Posts (all posts), Topics (series → categories → tags, filtered in place). The URL hash keeps the tab (`#posts`, `#topics`, `#topics/tag/<slug>`).
- On a post the bar keeps Home · Posts · Topics (Posts highlighted) with a thin accent reading-progress line along its bottom edge; the table of contents lives in the nine-dot drawer, current section highlighted. Posts in a series show a compact "part n of N" block; see [docs/content-series.md](docs/content-series.md).
- Bilingual: Chinese at `/`, English at `/en/`; language follows the main site setting (without one, first visits follow the browser language).
- Post URLs are fixed at `/post/<slug>/`, so comments survive a title change.
- Giscus comments, stored in this repo's Discussions.
- RSS (`/rss.xml`, `/en/rss.xml`) and a sitemap.
- Follows the main site: light/dark, palette, accent color, font size, reduced motion and language come from the main site's `sgx-ui` cookie; contract in [docs/sgx-ui-cookie.md](docs/sgx-ui-cookie.md) (Chinese).
- Chinese text uses LXGW WenKai, self-hosted and subset per build.

## Writing a post

```bash
bun run post:new
```

Or create `YYYY-MM-DD-slug.md` in `src/content/blog/zh/` (Chinese) or `src/content/blog/en/` (English):

```yaml
---
title: Post title
description: 'One-line summary'
date: 2026-10-08
lang: en
tags: ['tag1', 'tag2']
---
```

## Run locally

Requirements: Bun 1.4.

```bash
git clone https://github.com/styrigx/styrigx-blog.git
cd styrigx-blog
bun install
bun run dev        # local preview
bun run build      # build
bun run preview    # preview the build
```

Pushing to main runs tests and visual regression in GitHub Actions, then deploys to Cloudflare Pages (project `styrigx-blog`).

## Directories

- `src/content/blog/`: posts, split into `zh/` and `en/`.
- `src/config/site.toml`: site config: title, fonts, comments, theme colors.
- `src/components/`, `src/layouts/`, `src/pages/`: components and pages overriding the theme defaults.
- `src/styles/`: global styles and Styrigx UI styles.
- Lock screen: session checks live in the main site's auth gateway (`workers/auth-gateway` in styrigx-space); this Pages project serves static files only and holds no keys. `public/_worker.js` just redirects pages.dev to the canonical domain.
- `scripts/fonts/`, `public/fonts/`: font subset scripts and self-hosted fonts.
- `tests/`: unit and visual regression tests.

## License

Code is MIT. Design, Styrigx UI and site code © Sloan Gray; the @navfolio/* content engine and the template code still in use © dodolalorc, whose copyright notice is kept as MIT requires. Posts and images are licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), not MIT.

Content engine: [Navfolio](https://github.com/navfolio).

© 2026 Sloan Gray · Powered by Styrigx UI
