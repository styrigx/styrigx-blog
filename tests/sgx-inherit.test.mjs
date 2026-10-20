// 博客跟随主站设置（sgx-ui cookie：外观 / 强调色 / 语言，契约 docs/sgx-ui-cookie.md）+ 数字健康区域键。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const astro = readFileSync(new URL('../src/components/SgxInherit.astro', import.meta.url), 'utf8');
const inline = astro.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
const css = readFileSync(new URL('../src/styles/palettes.css', import.meta.url), 'utf8');

const PALETTES = [
  'forest',
  'terra',
  'violet',
  'rose',
  'cherry',
  'tangerine',
  'amber',
  'matcha',
  'teal',
  'indigo',
  'orchid',
  'graphite',
];

function enc(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function run({
  cookie = '',
  local = {},
  dark = false,
  lang = 'zh-CN',
  path = '/',
  hash = '',
  alt = {},
  ua = 'Mozilla/5.0',
  navLang = 'zh-CN',
} = {}) {
  const attrs = { lang };
  const classes = new Set();
  const props = {};
  const root = {
    dataset: {},
    style: {
      setProperty: (k, v) => (props[k] = v),
      removeProperty: (k) => delete props[k],
    },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => (attrs[k] = v),
    removeAttribute: (k) => delete attrs[k],
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
  };
  const listeners = {};
  const replaced = [];
  const ctx = {
    document: {
      cookie,
      documentElement: root,
      addEventListener: (t, f) => (listeners[t] = f),
      querySelector: (sel) => {
        const m = sel.match(/sgx-alt-(zh|en)/);
        return m && alt[m[1]] ? { getAttribute: () => alt[m[1]] } : null;
      },
    },
    localStorage: {
      getItem: (k) => (k in local ? local[k] : null),
      setItem: (k, v) => (local[k] = v),
      removeItem: (k) => delete local[k],
    },
    location: { pathname: path, hash, replace: (u) => replaced.push(u) },
    navigator: { userAgent: ua, language: navLang },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    escape,
    window: { matchMedia: () => ({ matches: dark, addEventListener() {} }) },
  };
  ctx.window.document = ctx.document;
  vm.runInNewContext(inline, ctx);
  return { root, attrs, classes, listeners, local, props, replaced };
}

test('无 cookie：跟系统深浅色，默认调色板', () => {
  const r = run();
  assert.equal(r.root.dataset.theme, 'light');
  assert.equal(run({ dark: true }).root.dataset.theme, 'dark');
  assert.equal(r.attrs['data-palette'], undefined);
  assert.equal(r.attrs['data-accent'], undefined);
  assert.equal(r.root.style.fontSize, '');
});

test('应用主站 mode/pal/fs/rm', () => {
  const r = run({
    cookie: 'a=1; sgx-ui=' + enc({ v: 2, mode: 'dark', pal: 'matcha', fs: 'large', rm: 1, mat: 5 }),
  });
  assert.equal(r.root.dataset.theme, 'dark');
  assert.equal(r.attrs['data-palette'], 'matcha');
  assert.equal(r.root.style.fontSize, '112.5%');
  assert.ok(r.classes.has('reduced-motion'));
});

test('mode=system 跟随系统；theme 是 mode 的别名', () => {
  assert.equal(
    run({ cookie: 'sgx-ui=' + enc({ mode: 'system' }), dark: true }).root.dataset.theme,
    'dark',
  );
  assert.equal(
    run({ cookie: 'sgx-ui=' + enc({ mode: 'system' }), dark: false }).root.dataset.theme,
    'light',
  );
  assert.equal(run({ cookie: 'sgx-ui=' + enc({ theme: 'dark' }) }).root.dataset.theme, 'dark');
  assert.equal(
    run({ cookie: 'sgx-ui=' + enc({ mode: 'light' }), dark: true }).root.dataset.theme,
    'light',
  );
});

test('博客已没有深浅色开关：旧的 navfolio-theme / sgx-theme-at 清掉，不再盖过主站', () => {
  const r = run({
    cookie: 'sgx-ui=' + enc({ mode: 'dark', mat: 1 }),
    local: { 'navfolio-theme': 'light', 'sgx-theme-at': '999' },
  });
  assert.equal(r.root.dataset.theme, 'dark');
  assert.equal(r.local['navfolio-theme'], undefined);
  assert.equal(r.local['sgx-theme-at'], undefined);
});

test('accent：色板 id → data-accent；#rrggbb → 内联变量 + 可读文字色；非法值忽略', () => {
  assert.equal(run({ cookie: 'sgx-ui=' + enc({ accent: 'rose' }) }).attrs['data-accent'], 'rose');
  const hex = run({ cookie: 'sgx-ui=' + enc({ accent: '#ffd54f' }) });
  assert.equal(hex.attrs['data-accent'], undefined);
  assert.equal(hex.props['--sgx-accent'], '#ffd54f');
  assert.equal(hex.props['--sgx-on-accent'], '#161b20');
  assert.equal(
    run({ cookie: 'sgx-ui=' + enc({ accent: '#123456' }) }).props['--sgx-on-accent'],
    '#ffffff',
  );
  const bad = run({ cookie: 'sgx-ui=' + enc({ accent: 'red;x' }) });
  assert.equal(bad.attrs['data-accent'], undefined);
  assert.equal(bad.props['--sgx-accent'], undefined);
});

test('lang：和页面不同且有对应版本 → 跳过去（带 hash）', () => {
  const ck = 'sgx-ui=' + enc({ lang: 'en' });
  assert.deepEqual(
    run({ cookie: ck, path: '/', hash: '#topics', alt: { zh: '/', en: '/en/' } }).replaced,
    ['/en/#topics'],
  );
  /* 没有英文版本：留在中文页 */
  assert.deepEqual(run({ cookie: ck, path: '/post/x/' }).replaced, []);
  /* 已是英文页 */
  assert.deepEqual(
    run({ cookie: ck, lang: 'en', path: '/en/', alt: { zh: '/', en: '/en/' } }).replaced,
    [],
  );
  /* en → zh */
  assert.deepEqual(
    run({
      cookie: 'sgx-ui=' + enc({ lang: 'zh' }),
      lang: 'en',
      path: '/en/post/a/',
      alt: { zh: '/post/a/', en: '/en/post/a/' },
    }).replaced,
    ['/post/a/'],
  );
  /* 爬虫不跳 */
  assert.deepEqual(
    run({ cookie: ck, path: '/', alt: { en: '/en/' }, ua: 'Googlebot' }).replaced,
    [],
  );
});

test('lang：没 cookie 时只在中文首页按旧记忆 / 浏览器语言跳', () => {
  assert.deepEqual(run({ path: '/', alt: { en: '/en/' }, navLang: 'en-US' }).replaced, ['/en/']);
  assert.deepEqual(
    run({ path: '/', alt: { en: '/en/' }, navLang: 'en-US', local: { 'styrigx-blog-lang': 'zh' } })
      .replaced,
    [],
  );
  assert.deepEqual(
    run({ path: '/post/a/', alt: { en: '/en/post/a/' }, navLang: 'en-US' }).replaced,
    [],
  );
});

test('坏 cookie / 非法调色板不抛错', () => {
  assert.equal(run({ cookie: 'sgx-ui=%%%' }).attrs['data-palette'], undefined);
  assert.equal(run({ cookie: 'sgx-ui=' + enc({ pal: '"><x' }) }).attrs['data-palette'], undefined);
});

test('换页后重新应用（astro:after-swap）', () => {
  const r = run({ cookie: 'sgx-ui=' + enc({ pal: 'teal' }) });
  assert.equal(typeof r.listeners['astro:after-swap'], 'function');
});

test('palettes.css 含主站 12 个调色板的浅色/深色两套', () => {
  for (const p of PALETTES) {
    assert.ok(css.includes(`:root[data-palette='${p}'] {`), p + ' light');
    assert.ok(css.includes(`:root[data-theme='dark'][data-palette='${p}']`), p + ' dark');
  }
  assert.equal((css.match(/\[data-palette='/g) || []).length, PALETTES.length * 3);
});

test('数字健康：文章页 post:<slug>，其他页 blog，上报主站', () => {
  assert.match(astro, /key: 'post:' \+ m\[1\]/);
  assert.match(astro, /key: 'blog'/);
  assert.match(astro, /https:\/\/styrigx\.com\/api\/wellbeing/);
  assert.match(astro, /idleMs: 180000/);
});
