/**
 * functions/_middleware.js 的 pages.dev 301 跳转测试。
 * 用 Node 内置 test runner：node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.js';

function mockContext(url) {
  return {
    request: new Request(url),
    next: async () => new Response('next'),
    env: {},
  };
}

test('styrigx-blog.pages.dev 精确匹配 → 301 到正式域名，保留 path+query', async () => {
  const res = await onRequest(
    mockContext('https://styrigx-blog.pages.dev/post/2026-10-07-muse-playbook/?x=1&y=2'),
  );
  assert.equal(res.status, 301);
  assert.equal(
    res.headers.get('Location'),
    'https://blog.styrigx.com/post/2026-10-07-muse-playbook/?x=1&y=2',
  );
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('根路径也跳转', async () => {
  const res = await onRequest(mockContext('https://styrigx-blog.pages.dev/'));
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('Location'), 'https://blog.styrigx.com/');
});

test('分支预览别名不跳转（走正常逻辑）', async () => {
  const res = await onRequest(
    mockContext('https://feat-pages-dev-301.styrigx-blog.pages.dev/post/abc/'),
  );
  assert.notEqual(res.status, 301);
  // env 未配置 SGX_SITE：fail closed，302 到主站锁屏（why=no-config）
  assert.equal(res.status, 302);
  assert.ok(res.headers.get('Location').includes('why=no-config'));
});

test('哈希预览别名不跳转', async () => {
  const res = await onRequest(
    mockContext('https://abc1234.styrigx-blog.pages.dev/'),
  );
  assert.notEqual(res.status, 301);
  assert.equal(res.status, 302);
  assert.ok(res.headers.get('Location').includes('why=no-config'));
});

test('正式域名不跳转', async () => {
  const res = await onRequest(mockContext('https://blog.styrigx.com/post/abc/'));
  assert.notEqual(res.status, 301);
  assert.equal(res.status, 302);
  assert.ok(res.headers.get('Location').includes('why=no-config'));
});

test('后缀欺骗域名不跳转', async () => {
  const res = await onRequest(
    mockContext('https://styrigx-blog.pages.dev.evil.com/'),
  );
  assert.notEqual(res.status, 301);
  assert.equal(res.status, 302);
  assert.ok(res.headers.get('Location').includes('why=no-config'));
});
