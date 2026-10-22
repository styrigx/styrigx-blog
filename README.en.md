<div align="center">

[中文](README.md) | English

# Styrigx Blog

Take it apart, then put it back together.

[Visit blog.styrigx.com](https://blog.styrigx.com/en/) · [Main site styrigx.com](https://styrigx.com/en/) · [GitHub @styrigx](https://github.com/styrigx) · [X @styrigx](https://x.com/styrigx)

![Hugo](https://img.shields.io/badge/Hugo-0.168.0-2563eb?style=flat-square&logo=hugo)
![Tailwind CSS](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/styrigx/styrigx-blog/main/package.json&query=%24.devDependencies.tailwindcss&label=Tailwind%20CSS&style=flat-square&color=2563eb&logo=tailwindcss)
![Deploy](https://img.shields.io/github/actions/workflow/status/styrigx/styrigx-blog/deploy.yml?style=flat-square&label=Deploy&color=2563eb)
![License](https://img.shields.io/badge/License-MIT-2563eb?style=flat-square)
![Posts](https://img.shields.io/badge/Posts-CC%20BY--NC--SA%204.0-2563eb?style=flat-square)

</div>

---

## What is this

The blog sub-site of Styrigx's Space: notes on AI tools, open-source project retrospectives and self-built infrastructure. The interface is Styrigx UI, designed in-house and shared with the main site: the same floating top bar, navigation drawer, colours and appearance (the shared shell is synced from the main site). The site is generated with Hugo (migrated from Astro / Navfolio in Oct 2026 with every URL unchanged), the same stack as the main site.

The blog only does posts, built as an immersive app: the nine-dot button on the left opens the navigation drawer (Main site / Curio / Daymark / Blog, same as the main site; on a post its lower section is the table of contents), the middle bar is a segmented slider Home · Posts · Topics on the list page (tap, swipe or arrow keys) and just the page name elsewhere, the guestbook button sits on the right. Language, light/dark and colors are set on the main site and the blog follows.

## What it does

- Three tabs on the list page: Home (title, latest 3 posts, newest series), Posts (all posts), Topics (series → categories → tags, filtered in place). The URL hash keeps the tab (`#posts`, `#topics`, `#topics/tag/<slug>`).
- On a post the bar shows the post title with a thin accent reading-progress line along its bottom edge; the table of contents lives in the nine-dot drawer, current section highlighted. Posts in a series show a compact "part n of N" block; see [docs/content-series.md](docs/content-series.md).
- Bilingual: Chinese at `/`, English at `/en/`; language follows the main site setting (without one, first visits follow the browser language).
- Post URLs are fixed at `/post/<slug>/`, so they survive a title change.
- Guestbook at `/guestbook/`: one Giscus thread shared by Blog, Daymark and Curio (styrigx/styrigx Discussions); posts no longer have comments (old ones stay in this repo's Discussions).
- RSS (`/rss.xml`, `/en/rss.xml`) and a sitemap.
- Follows the main site: light/dark, palette, accent color, font size, reduced motion and language come from the main site's `sgx-ui` cookie; contract in [docs/sgx-ui-cookie.md](docs/sgx-ui-cookie.md) (Chinese).
- Fonts: Inter + system CJK fonts for UI and body text; Maple Mono (self-hosted) for code only. Code blocks are a single container with language / filename / copy button, a line-number gutter and `hl_lines`; token colours are generated from the main site's colour roles (`scripts/gen-code-tokens.mjs`, contrast is unit-tested).

## Writing a post

```bash
hugo new -s web content/en/post/2026-10-08-slug.md   # needs Hugo 0.168.0 installed
```

Or create `YYYY-MM-DD-slug.md` in `web/content/zh/post/` (Chinese) or `web/content/en/post/` (English). The file name is the URL (`/post/<file name>/`); the same name in both languages makes them translations:

```yaml
---
title: Post title
description: 'One-line summary'
date: 2026-10-08
tags: ['tag1', 'tag2']
---
```

## Run locally

Requirements: Node 22 (see `.nvmrc`) and Hugo 0.168.0 (standard edition is enough).

```bash
git clone https://github.com/styrigx/styrigx-blog.git
cd styrigx-blog
npm ci
npm run dev        # local preview (Tailwind CSS + hugo server)
npm run build      # build into web/public/
npm test           # unit tests (URL map, feeds, built CSS, code colour contrast…; run build first)
npm run test:e2e   # Playwright behaviour + visual regression
```

Pushing to main makes GitHub Actions build, check the shared shell and code colours, run unit tests and Playwright, then deploy `web/public/` to Cloudflare Pages (project `styrigx-blog`).

## Directories

- `web/content/`: posts, split into `zh/` and `en/`.
- `web/hugo.yaml`: site config (URL rules, languages, guestbook, feeds); `web/i18n/`: UI strings.
- `web/layouts/`: templates and components (top bar, tabs, cards, article, TOC, series, share, related posts, guestbook, code blocks).
- `web/assets/css/`, `web/assets/js/`: styles and scripts. `sgx-shell.css`, `js/sgx/shell/` and `web/data/sgx-shell/` are copies of the main site's shared shell: sync with `npm run shell:sync`, never edit by hand (version pinned in `sgx-shell.lock.json`).
- Lock screen: session checks live in the main site's auth gateway (`workers/auth-gateway` in styrigx-space); this Pages project serves static files only and holds no keys. `web/static/_worker.js` just redirects pages.dev to the canonical domain.
- `web/static/`: files published as-is (`_headers`, `_redirects`, fonts, icons).
- `scripts/`: CSS build, shared-shell sync, code colour generation, local static server, unified site search index (`build-search-index.mjs`: post titles + body text written to the main site search KV `site:blog`, uploaded by CI after deploying main).
- `tests/`: unit tests and Playwright specs. Visual baselines are generated in CI only: run _Update visual snapshots_ (`.github/workflows/update-snapshots.yml`) on the branch.

## License

Code is MIT. Design, Styrigx UI and site code © Sloan Gray; the Navfolio template styles still in use © dodolalorc, whose copyright notice is kept as MIT requires. Posts and images are licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), not MIT.

Generated with [Hugo](https://gohugo.io); earlier versions were built on [Navfolio](https://github.com/navfolio).

© 2026 Sloan Gray · Powered by Styrigx UI
