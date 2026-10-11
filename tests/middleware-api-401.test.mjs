/**
 * functions/_middleware.js 的 /api/* 401 测试（2.10.2）。
 *
 * 按白皮书 §6.1：未登录调用 /api/*（如 /api/lock-check）必须返回 401 JSON，
 * 不能 302 到锁屏（避免 fetch 跟随跳转报 TypeError）。与 book 的写法一致
 * （book functions/_middleware.js：/api/* 401 JSON，页面路径 302）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.js';

const ENV = { SGX_SITE: 'blog', SGX_LOCK_PUBLIC: 'test-public-key-pem' };

function mockContext(url, env) {
  return {
    request: new Request(url),
    next: async () => new Response('next'),
    env: env || ENV,
  };
}

test('BUG 回归：未登录调用 /api/lock-check 必须 401 JSON，不能 302', async () => {
  const res = await onRequest(
    mockContext('https://blog.styrigx.com/api/lock-check', ENV)
  );
  assert.equal(res.status, 401, '未登录的 /api/* 应回 401，实际: ' + res.status);
  assert.equal(res.headers.get('Content-Type'), 'application/json');
  const body = await res.json();
  assert.deepEqual(body, { ok: false, error: 'unauthorized' });
  assert.equal(
    res.headers.get('Location'),
    null,
    '/api/* 401 不能带 Location 跳转头'
  );
});

test('未登录调用任意 /api/* 路径都回 401 JSON', async () => {
  const res = await onRequest(
    mockContext('https://blog.styrigx.com/api/session-check', ENV)
  );
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { ok: false, error: 'unauthorized' });
});

test('页面路径未登录仍 302 到主站锁屏（不受 /api/* 规则影响）', async () => {
  const res = await onRequest(
    mockContext('https://blog.styrigx.com/post/abc/', ENV)
  );
  assert.equal(res.status, 302);
  const loc = res.headers.get('Location');
  assert.ok(
    loc.startsWith('https://styrigx.com/?lock=1'),
    '应 302 到主站锁屏，实际: ' + loc
  );
  assert.ok(loc.includes('why=no-cookie'), '应携带 why=no-cookie，实际: ' + loc);
});

test('缺 SGX_LOCK_PUBLIC 时 /api/* 同样 401（不是 302）', async () => {
  const res = await onRequest(
    mockContext('https://blog.styrigx.com/api/lock-check', { SGX_SITE: 'blog' })
  );
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { ok: false, error: 'unauthorized' });
});
