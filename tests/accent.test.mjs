// 强调色（--sgx-accent）：accent.css 必须和色板同步生成（node scripts/gen-accent-css.mjs）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAccentCss, extractAccents } from '../scripts/gen-accent-css.mjs';

test('accent.css 与 palettes.css / one-ui.css 同步', () => {
  const css = readFileSync(new URL('../src/styles/accent.css', import.meta.url), 'utf8');
  assert.equal(css, renderAccentCss(), '色板变了：重跑 node scripts/gen-accent-css.mjs');
});

test('13 个色板 id（lake + 12）都有浅色 / 深色强调色', () => {
  const acc = extractAccents();
  assert.equal(Object.keys(acc).length, 13);
  for (const [id, v] of Object.entries(acc)) {
    assert.ok(v.light && v.dark, id);
    assert.match(v.light.a, /^#[0-9a-f]{6}$/i, id);
    assert.match(v.dark.on, /^#[0-9a-f]{6}$/i, id);
  }
});

test('默认强调色跟调色板 primary', () => {
  const css = readFileSync(new URL('../src/styles/accent.css', import.meta.url), 'utf8');
  assert.match(css, /--sgx-accent: var\(--m-primary\);/);
  assert.match(css, /--sgx-on-accent: var\(--m-on-primary\);/);
});
