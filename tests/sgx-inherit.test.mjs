// 博客跟随主站设置（sgx-ui cookie：外观 / 调色板 / 自定义主题色种子 / 语言，契约 docs/sgx-ui-cookie.md）+ 数字健康区域键。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* 首帧前的内联脚本：web/layouts/partials/sgx-inherit.html（模板里那行 const SGX_SHELL = … 由下面的 ctx 提供） */
const partial = readFileSync(new URL('../web/layouts/partials/sgx-inherit.html', import.meta.url), 'utf8');
const inline = partial
  .match(/<script>\n\(function \(\) \{\n([\s\S]*?)\n\}\)\(\);\n<\/script>/)[1]
  .replace(/^const SGX_SHELL = .*$/m, '');
/* 模块那一半（数字健康、自定义色引擎按需加载）：web/assets/js/entries/inherit.ts */
const inheritModule = readFileSync(new URL('../web/assets/js/entries/inherit.ts', import.meta.url), 'utf8');
const palettes = JSON.parse(
  readFileSync(new URL('../web/data/sgx-shell/palettes.json', import.meta.url), 'utf8'),
);
/* 和 sgx-inherit.html 一样从共享外壳的 palettes.json 算 */
const SGX_SHELL = {
  v: palettes.schemeVersion,
  seeds: Object.fromEntries(palettes.presets.map((p) => [p.id, p.seed])),
};

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
  const els = {};
  const head = {
    appendChild: (el) => {
      el.remove = () => delete els[el.id];
      els[el.id] = el;
    },
  };
  const listeners = {};
  const replaced = [];
  const ctx = {
    document: {
      cookie,
      documentElement: root,
      addEventListener: (t, f) => (listeners[t] = f),
      head,
      getElementById: (id) => els[id] || null,
      createElement: () => ({ id: '', textContent: '' }),
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
    SGX_SHELL,
    window: { matchMedia: () => ({ matches: dark, addEventListener() {} }) },
  };
  ctx.window.document = ctx.document;
  vm.runInNewContext(inline, ctx);
  return { root, attrs, classes, listeners, local, props, replaced, els };
}

test('无 cookie：跟系统深浅色，默认调色板', () => {
  const r = run();
  assert.equal(r.root.dataset.theme, 'light');
  assert.ok(!r.classes.has('dark'));
  const d = run({ dark: true });
  assert.equal(d.root.dataset.theme, 'dark');
  assert.ok(d.classes.has('dark'), '共享外壳的角色认 <html class="dark">');
  assert.equal(r.attrs['data-palette'], undefined);
  assert.equal(r.root.dataset.sgxSeed, undefined);
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

test('accent = 该预设的种子 → 只用预设；不同 → 自定义种子（有缓存首帧插角色，没缓存留给模块脚本）', () => {
  const preset = run({ cookie: 'sgx-ui=' + enc({ pal: 'rose', accent: SGX_SHELL.seeds.rose }) });
  assert.equal(preset.attrs['data-palette'], 'rose');
  assert.equal(preset.root.dataset.sgxSeed, undefined);
  assert.equal(preset.els['sgx-accent-roles'], undefined);

  const noCache = run({ cookie: 'sgx-ui=' + enc({ pal: 'lake', accent: '#FFD54F' }) });
  assert.equal(noCache.root.dataset.sgxSeed, '#ffd54f');
  assert.equal(noCache.els['sgx-accent-roles'], undefined, '没缓存：首帧先用预设');

  const css = 'html:root{--sgx-primary:#123}';
  const cached = run({
    cookie: 'sgx-ui=' + enc({ pal: 'lake', accent: '#ffd54f' }),
    local: { 'sgx-shell-accent-css': SGX_SHELL.v + '|#ffd54f\n' + css },
  });
  assert.equal(cached.els['sgx-accent-roles'].textContent, css);

  const stale = run({
    cookie: 'sgx-ui=' + enc({ pal: 'lake', accent: '#ffd54f' }),
    local: { 'sgx-shell-accent-css': 'old|#ffd54f\n' + css },
  });
  assert.equal(stale.els['sgx-accent-roles'], undefined, '引擎版本变了：缓存作废');

  /* 旧 cookie：accent 是色板 id / 非法值 → 忽略，只看 pal */
  for (const accent of ['rose', 'red;x', '#12345']) {
    const r = run({ cookie: 'sgx-ui=' + enc({ pal: 'teal', accent }) });
    assert.equal(r.attrs['data-palette'], 'teal');
    assert.equal(r.root.dataset.sgxSeed, undefined, accent);
  }
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

test('坏 cookie / 非法或未知调色板不抛错，回到 lake', () => {
  assert.equal(run({ cookie: 'sgx-ui=%%%' }).attrs['data-palette'], undefined);
  assert.equal(run({ cookie: 'sgx-ui=' + enc({ pal: '"><x' }) }).attrs['data-palette'], undefined);
  assert.equal(run({ cookie: 'sgx-ui=' + enc({ pal: 'nosuch' }) }).attrs['data-palette'], undefined);
});

test('共享外壳副本含 13 套预设（亮 / 暗）和抽屉样式', () => {
  const shell = readFileSync(new URL('../web/assets/css/sgx-shell.css', import.meta.url), 'utf8');
  assert.equal(palettes.presets.length, 13);
  for (const { id } of palettes.presets) {
    if (id === 'lake') continue;
    assert.ok(shell.includes(`:root[data-palette="${id}"] {`), id + ' light');
    assert.ok(shell.includes(`:root.dark[data-palette="${id}"] {`), id + ' dark');
  }
  assert.match(shell, /\.sgx-drawer-item\[aria-current="page"\]/);
});

test('数字健康：文章页 post:<slug>，其他页 blog，上报主站', () => {
  assert.match(inheritModule, /key: 'post:' \+ m\[1\]/);
  assert.match(inheritModule, /key: 'blog'/);
  assert.match(inheritModule, /https:\/\/styrigx\.com\/api\/wellbeing/);
  assert.match(inheritModule, /idleMs: 180000/);
});
