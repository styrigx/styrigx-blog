/**
 * URL 与 RSS 回归测试（One UI 换皮）。
 * 证明：只换皮不改路由——所有旧网址仍返回 200，RSS 输出结构不变。
 *
 * 跑法：先 `bun run build`（或 npx astro build）生成 dist/，
 * 再 `node --test tests/urls-regression.test.mjs`。
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { existsSync } from 'node:fs';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/\/$/, '');
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
    assert.ok(existsSync(DIST), 'dist/ 不存在：请先跑构建');
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
    assert.match(html, /data-pagefind-body/, 'pagefind 索引标记保留');
    assert.match(html, /giscus/i, 'Giscus 评论保留');
  });

  it('首页是 One UI 首页（hero + 文章卡）', async () => {
    const res = await fetch(base + '/');
    const html = await res.text();
    assert.match(html, /oui-hero/, '应有 hero 区');
    assert.match(html, /oui-post-card/, '应有文章卡');
    assert.match(html, /拆开世界是为了看懂它/, '座右铭保留');
  });

  it('404.html 存在且为 One UI 样式', async () => {
    const res = await fetch(base + '/does-not-exist-xyz');
    assert.equal(res.status, 404);
    const html = await res.text();
    assert.match(html, /oui-notfound/, '应为 One UI 404');
  });
});
