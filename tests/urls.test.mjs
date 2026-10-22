/**
 * 旧地址保留（Astro → Hugo 迁移）：tests/url-map.json 里旧站的每个地址，在 Hugo 构建（web/public/）里
 * 都还在同一路径（或同一个跳转），RSS / 站点地图地址和条目不变，文章里的标题锚点（目录、外链用的 #id）一个不少，
 * 另外核对：新构建没有多出网关没登记的页面目录。（文章页评论 2026-10-22 撤了，改成三个子站共用的留言板 /guestbook/）
 * 跑法：npm run build 之后 node --test tests/urls.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'web/public');
const map = JSON.parse(readFileSync(path.join(ROOT, 'tests/url-map.json'), 'utf8'));
/* 旧站之后新加的页面（不在 url-map.json 里）：留言板（2026-10-22） */
const NEW_PAGES = ['/guestbook/', '/en/guestbook/'];
const SITE = 'https://blog.styrigx.com';

const fileFor = (url) => path.join(PUB, url.endsWith('/') ? url + 'index.html' : url);
const read = (url) => readFileSync(fileFor(url), 'utf8');
const isAlias = (html) => /http-equiv="refresh"/.test(html);

test('构建产物存在', () => {
  assert.ok(existsSync(PUB), 'web/public/ 不存在：先跑 npm run build');
});

test('旧站每个页面都在同一路径（不是跳转页）', () => {
  const missing = [];
  for (const url of map.pages) {
    if (!existsSync(fileFor(url))) missing.push(url);
    else if (isAlias(read(url))) missing.push(url + '（变成了跳转页）');
  }
  assert.deepEqual(missing, [], '缺少：' + missing.join(', '));
});

test('旧站的跳转页（/about/、/archives/ 等）仍跳到同一个地址', () => {
  for (const [from, to] of Object.entries(map.redirects)) {
    assert.ok(existsSync(fileFor(from)), from + ' 不存在');
    const html = read(from);
    assert.ok(isAlias(html), from + ' 应是跳转页');
    assert.match(html, new RegExp(`content="0;\\s*url=${to.replace(/[/.]/g, '\\$&')}"`), `${from} 应跳到 ${to}`);
  }
});

test('RSS 和站点地图在同一路径', () => {
  for (const f of map.feeds) assert.ok(existsSync(fileFor(f)), f + ' 不存在');
  assert.match(read('/sitemap-index.xml'), /<loc>https:\/\/blog\.styrigx\.com\/sitemap-0\.xml<\/loc>/);
});

test('站点地图条目和旧站一致', () => {
  const now = [...read('/sitemap-0.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeURI(m[1])).sort();
  const old = [...map.sitemap, ...NEW_PAGES.map((p) => SITE + p)].map((u) => decodeURI(u)).sort();
  assert.deepEqual(now, old);
});

test('RSS 条目（顺序、链接）和旧站一致', () => {
  for (const [feed, links] of Object.entries(map.rss)) {
    const xml = read(feed);
    const now = [...xml.matchAll(/<item><title>[\s\S]*?<\/title><link>([^<]+)<\/link>/g)].map((m) => m[1]);
    assert.deepEqual(now, links, feed);
    assert.match(xml, /<content:encoded>/, feed + ' 应是全文');
    assert.match(xml, /<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} 00:00:00 GMT<\/pubDate>/, feed);
  }
});

test('文章标题锚点一个不少（目录、外部链接里的 #id）', () => {
  const lost = [];
  for (const [url, ids] of Object.entries(map.anchors)) {
    const html = read(url);
    const now = new Set([...html.matchAll(/<h[2-6][^>]* id="([^"]+)"/g)].map((m) => m[1]));
    for (const id of ids) if (!now.has(id)) lost.push(url + '#' + id);
  }
  assert.deepEqual(lost, []);
});

test('canonical 用旧地址', () => {
  for (const url of map.pages.filter((u) => u.endsWith('/'))) {
    assert.match(read(url), new RegExp(`<link rel="canonical" href="${(SITE + encodeURI(url)).replace(/[/.]/g, '\\$&')}"`), url);
  }
});

/* 主站网关（styrigx-space workers/auth-gateway/wrangler.toml）给博客登记的页面路由；新页面目录必须落在这里面，否则不验会话。
   （网关现在登记的是整站 blog.styrigx.com/*，这里仍按目录列，新目录要在这里加一行，提醒核对网关） */
const GATEWAY = ['/', '/about*', '/archives*', '/post/*', '/tags/*', '/guestbook/*', '/en', '/en/*', '/rss.xml', '/sitemap*', '/pagefind/*'];
const covered = (p) =>
  GATEWAY.some((r) => (r.endsWith('*') ? p.startsWith(r.slice(0, -1)) : p === r));

test('新构建的每个页面 / 订阅都在网关登记的路由里（404.html 除外：Pages 直接回）', () => {
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const full = path.join(d, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(html|xml)$/.test(f)) out.push('/' + path.relative(PUB, full).split(path.sep).join('/'));
    }
  };
  walk(PUB);
  const bad = out
    .filter((p) => !/(^|\/)404\.html$/.test(p))
    .map((p) => p.replace(/index\.html$/, ''))
    .filter((p) => !covered(p));
  assert.deepEqual(bad, []);
});

test('没有多出旧站没有的页面（除了英文 404）', () => {
  const now = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const full = path.join(d, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (f.endsWith('.html')) now.push('/' + path.relative(PUB, full).split(path.sep).join('/').replace(/index\.html$/, ''));
    }
  };
  walk(PUB);
  const known = new Set([...map.pages, ...Object.keys(map.redirects), '/en/404.html', ...NEW_PAGES]);
  assert.deepEqual(now.filter((p) => !known.has(p)).sort(), []);
});
