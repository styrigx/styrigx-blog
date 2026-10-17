// B2-7：博客继承主站外观（sgx-ui cookie）+ 数字健康区域键。
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

function run({ cookie = '', local = {}, dark = false } = {}) {
  const attrs = {};
  const classes = new Set();
  const root = {
    dataset: {},
    style: {},
    setAttribute: (k, v) => (attrs[k] = v),
    removeAttribute: (k) => delete attrs[k],
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
  };
  const listeners = {};
  const ctx = {
    document: { cookie, documentElement: root, addEventListener: (t, f) => (listeners[t] = f) },
    localStorage: {
      getItem: (k) => (k in local ? local[k] : null),
      setItem: (k, v) => (local[k] = v),
    },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    escape,
    window: { matchMedia: () => ({ matches: dark }) },
  };
  ctx.window.document = ctx.document;
  vm.runInNewContext(inline, ctx);
  return { root, attrs, classes, listeners, local };
}

test('无 cookie：保持博客原行为', () => {
  const r = run();
  assert.equal(r.root.dataset.theme, undefined);
  assert.equal(r.attrs['data-palette'], undefined);
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

test('mode=system 跟随系统', () => {
  assert.equal(
    run({ cookie: 'sgx-ui=' + enc({ mode: 'system' }), dark: true }).root.dataset.theme,
    'dark',
  );
  assert.equal(
    run({ cookie: 'sgx-ui=' + enc({ mode: 'system' }), dark: false }).root.dataset.theme,
    'light',
  );
});

test('深浅色：谁后改听谁的', () => {
  const ck = 'sgx-ui=' + enc({ mode: 'dark', mat: 100 });
  // 博客更晚改过 → 不覆盖
  assert.equal(
    run({ cookie: ck, local: { 'navfolio-theme': 'light', 'sgx-theme-at': '200' } }).root.dataset
      .theme,
    undefined,
  );
  // 主站更晚改 → 跟主站
  assert.equal(
    run({ cookie: ck, local: { 'navfolio-theme': 'light', 'sgx-theme-at': '50' } }).root.dataset
      .theme,
    'dark',
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
