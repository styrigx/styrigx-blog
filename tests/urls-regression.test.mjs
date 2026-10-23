/**
 * URL 与 RSS 回归测试（One UI 换皮）。
 * 证明：只换皮不改路由——所有旧网址仍返回 200，RSS 输出结构不变。
 *
 * 跑法：先 `npm run build`（Tailwind + hugo --minify -s web）生成 web/public/，
 * 再 `node --test tests/urls-regression.test.mjs`。
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { existsSync } from 'node:fs';

const DIST = new URL('../web/public/', import.meta.url).pathname.replace(/\/$/, '');
const MIME = {
  '.html': 'text/html',
  '.xml': 'application/rss+xml',
};

function serve() {
  return createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    // /post/xxx -> /post/xxx/index.html
    let file = join(DIST, path);
    const stat = existsSync(file) ? await import('node:fs').then((m) => m.statSync(file)) : null;
    if (stat?.isDirectory()) file = join(file, 'index.html');
    else if (!existsSync(file) && existsSync(file + '.html')) file = file + '.html';
    else if (!existsSync(file) && existsSync(join(DIST, path, 'index.html'))) {
      file = join(DIST, path, 'index.html');
    }
    try {
      const body = await readFile(file);
      const ext = extname(file);
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'text/plain' });
      res.end(body);
    } catch {
      // 404.html 回退（Cloudflare Pages 行为近似）
      try {
        const body = await readFile(join(DIST, '404.html'));
        res.writeHead(404, { 'content-type': 'text/html' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    }
  });
}

const URLS_200 = [
  '/',
  '/en/',
  '/archives',
  '/en/archives',
  '/about',
  '/en/about',
  '/tags/ai/',
  '/post/2026-10-07-muse-playbook/',
  '/en/post/2026-10-07-muse-playbook/',
  '/rss.xml',
  '/en/rss.xml',
  '/sitemap-index.xml',
];

describe('旧网址回归（换皮不改路由）', () => {
  let server;
  let base;

  before(async () => {
    assert.ok(existsSync(DIST), 'web/public/ 不存在：请先跑构建');
    server = serve();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  for (const url of URLS_200) {
    it(`${url} 返回 200`, async () => {
      const res = await fetch(base + url);
      assert.equal(res.status, 200, `${url} 期望 200，实际 ${res.status}`);
    });
  }

  it('/rss.xml 是 RSS 且包含文章条目', async () => {
    const res = await fetch(base + '/rss.xml');
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /<rss[^>]*>/, '应为 RSS 文档');
    assert.match(text, /<item>/, '应包含 <item> 条目');
    assert.match(text, /muse-playbook/i, '应包含已知文章');
  });

  it('/en/rss.xml 是 RSS 且包含条目', async () => {
    const res = await fetch(base + '/en/rss.xml');
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /<rss[^>]*>/);
    assert.match(text, /<item>/);
  });

  it('文章页包含 One UI 标记且正文完整', async () => {
    const res = await fetch(base + '/post/2026-10-07-muse-playbook/');
    const html = await res.text();
    assert.match(html, /oui-article-paper/, '应有 One UI 文章纸面');
    assert.doesNotMatch(html, /pagefind/, '站内搜索已删除');
    assert.doesNotMatch(html, /giscus|comment-section|data-comment/i, '文章页没有评论了（改成共用留言板 /guestbook/）');
    assert.doesNotMatch(html, /<footer|oui-footer|©|Powered by/, '没有版权页脚');
  });

  it('留言板 /guestbook/ + /en/guestbook/：共用 Giscus 讨论串（styrigx/styrigx · Announcements · specific term=guestbook · 输入框在上）', async () => {
    for (const [url, lang, title] of [['/guestbook/', 'zh-CN', '留言板'], ['/en/guestbook/', 'en', 'Guestbook']]) {
      const html = await (await fetch(base + url)).text();
      assert.match(html, new RegExp('<span class="sgx-tb-title">' + title + '</span>'), url + ' 长条只有页名');
      assert.match(html, new RegExp('<a class="sgx-tb-end sgx-tb-guestbook" href="' + url.replace(/\//g, '\\/') + '"[^>]*aria-current="page"'), url);
      for (const [k, v] of [['repo', 'styrigx/styrigx'], ['repo-id', 'R_kgDOVDhNiA'], ['category', 'Announcements'], ['category-id', 'DIC_kwDOVDhNiM4DJVrs'],
        ['mapping', 'specific'], ['term', 'guestbook'], ['strict', '0'], ['reactions-enabled', '1'], ['input-position', 'top'], ['lang', lang]]) {
        assert.match(html, new RegExp('data-' + k + '="?' + v.replace('/', '\\/') + '"?[ >]'), url + ' data-' + k);
      }
      assert.match(html, /\/js\/entries\/guestbook\.[0-9a-f]{8,}\.js/, url + ' 加载 guestbook.js');
      assert.doesNotMatch(html, /<footer|©/, url + ' 没有页脚');
    }
  });

  it('列表页：首页 · 文章 · 专题 三个面板，没有归档', async () => {
    const res = await fetch(base + '/');
    const html = await res.text();
    assert.match(html, /<h1 class="sgx-visually-hidden"[^>]*>博客</, '首页 h1「博客」只给读屏 / 搜索引擎');
    assert.doesNotMatch(html, /sgx-subpage-head|sgx-subpage-title/, '没有居中大标题区');
    assert.match(html, /note-entry/, '应有文章列表');
    for (const id of ['home', 'posts', 'topics']) {
      assert.match(html, new RegExp(`id="sgx-pane-${id}"`), `面板 ${id}`);
      assert.match(html, new RegExp(`data-sgx-tab="${id}"`), `页签 ${id}`);
    }
    assert.doesNotMatch(html, /sgx-pane-archive|data-sgx-tab="archive"/, '没有归档页签');
    assert.doesNotMatch(html, /oui-hero/, '旧首页 hero 已删除');
    assert.doesNotMatch(
      html,
      /\s(data-sgx-more|data-sgx-back|data-lang-switcher|data-theme-toggle)[\s>=]/,
      '⋮ / ‹ / 语言 / 主题开关已删除',
    );
  });

  it('专题：鉴权规范系列（中文 2 篇，按 seriesOrder）', async () => {
    const html = await (await fetch(base + '/')).text();
    const card = html.match(/data-series-card="[^"]+"[\s\S]*?<\/article>/);
    assert.ok(card, '应有系列卡');
    assert.match(card[0], /Styrigx UI 鉴权规范/);
    const titles = [...card[0].matchAll(/<a href="\/post\/([^"]+)\/"/g)].map((m) => m[1]);
    assert.deepEqual(titles, [
      '2026-10-11-key-spec-whitepaper',
      '2026-10-11-key-spec-whitepaper-v2',
    ]);
  });

  it('系列文章页有系列小块（第 n / N 篇）', async () => {
    const html = await (await fetch(base + '/post/2026-10-11-key-spec-whitepaper-v2/')).text();
    assert.match(html, /sgx-series-block/);
    assert.match(html, /第 2 \/ 2 篇/);
    assert.match(
      html,
      /rel="prev"[^>]*href="\/post\/2026-10-11-key-spec-whitepaper\/"|href="\/post\/2026-10-11-key-spec-whitepaper\/"[^>]*>\s*<small/,
    );
  });

  it('旧归档 / 关于地址跳回列表', async () => {
    for (const [from, to] of [
      ['/archives/', '/'],
      ['/en/archives/', '/en/'],
      ['/about/', '/'],
      ['/en/about/', '/en/'],
    ]) {
      const html = await (await fetch(base + from)).text();
      assert.match(html, new RegExp(`url=${to.replace(/\//g, '\\/')}"`), `${from} 应跳到 ${to}`);
    }
  });

  it('导航抽屉：主站 / 奇趣 / 日刻 / 博客（主站共享外壳 nav.json，同主站）；头像去主站账号页，底栏搜索去主站搜索', async () => {
    const html = await (await fetch(base + '/')).text();
    const hrefs = [...html.matchAll(/class="sgx-drawer-item"[^>]*href="([^"]+)"/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(hrefs, [
      'https://styrigx.com/',
      'https://curio.styrigx.com/',
      'https://daymark.styrigx.com/',
      '/',
    ]);
    assert.match(html, /<a class="sgx-drawer-me" href="https:\/\/styrigx\.com\/account\/"/);
    assert.match(html, /<a class="sgx-drawer-search" href="https:\/\/styrigx\.com\/search\/"/);
    assert.doesNotMatch(html, /book\.styrigx\.com/, '书库已下线');
    const en = await (await fetch(base + '/en/')).text();
    const enHrefs = [...en.matchAll(/class="sgx-drawer-item"[^>]*href="([^"]+)"/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(enHrefs, [
      'https://styrigx.com/en/',
      'https://curio.styrigx.com/en/',
      'https://daymark.styrigx.com/en/',
      '/en/',
    ]);
    assert.match(en, /<a class="sgx-drawer-me" href="https:\/\/styrigx\.com\/en\/account\/"/);
    assert.match(en, /<a class="sgx-drawer-search" href="https:\/\/styrigx\.com\/en\/search\/"/);
  });

  it('文章页：长条只有页名（文章标题）+ 阅读进度细线，没有页签；右圆留言板；正文里没有内联目录；目录在抽屉底部', async () => {
    const html = await (await fetch(base + '/post/2026-10-07-muse-playbook/')).text();
    const pill = html.match(/<div class="sgx-tb-pill[\s\S]*?<\/div>/)[0];
    assert.doesNotMatch(pill, /sgx-seg/);
    const title = html.match(/<h1[^>]*>([^<]+)<\/h1>/)[1].trim();
    assert.match(pill, new RegExp('<span class="sgx-tb-title">' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</span>'));
    assert.match(pill, /data-sgx-progress/);
    assert.match(html, /<a class="sgx-tb-end sgx-tb-guestbook" href="\/guestbook\/" aria-label="留言板">/);
    assert.doesNotMatch(html, /sgx-tb-me|sgx-tb-avatar/);
    assert.doesNotMatch(html, /sgx-prog-title|sgx-toc-sheet|mobile-article-toc/);
    const drawer = html.match(/<dialog id="sgx-drawer"[\s\S]*?<\/dialog>/)[0];
    assert.match(drawer, /class="sgx-drawer-toc"/);
    assert.match(drawer, /目录/);
    assert.match(drawer, /data-toc-link/);
    const home = await (await fetch(base + '/')).text();
    assert.doesNotMatch(home, /sgx-drawer-toc/, '列表页抽屉没有目录');
  });

  it('404.html 存在且为 One UI 样式', async () => {
    const res = await fetch(base + '/does-not-exist-xyz');
    assert.equal(res.status, 404);
    const html = await res.text();
    assert.match(html, /oui-notfound/, '应为 One UI 404');
  });
});
