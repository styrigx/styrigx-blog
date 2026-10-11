/**
 * functions/_middleware.js 的 fail-closed 测试（2.10.1）。
 *
 * 缺配置必须拒绝请求，绝不能静默放行：
 * - SGX_SITE 未配置 / 不为 'blog' → 302 到主站锁屏（why=no-config）
 * - pages.dev 生产别名的 301 跳转不受影响（链首，仍先于锁屏逻辑）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.js';

function mockContext(url, env) {
  return {
    request: new Request(url),
    next: async () => new Response('next'),
    env: env || {},
  };
}

function lockTarget(res) {
  return res.headers.get('Location');
}

test('BUG 回归：未配置 SGX_SITE 时必须 302 锁站，不能静默放行到 next()', async () => {
  const res = await onRequest(
    mockContext('https://blog.styrigx.com/post/abc/', {})
  );
  assert.notEqual(await res.text(), 'next', '缺配置时绝不能走到 next()');
  assert.equal(res.status, 302);
  assert.ok(
    lockTarget(res).startsWith('https://styrigx.com/?lock=1'),
    '应 302 到主站锁屏，实际: ' + lockTarget(res)
  );
  assert.ok(
    lockTarget(res).includes('why=no-config'),
    '应携带 why=no-config，实际: ' + lockTarget(res)
  );
});

test('SGX_SITE 为其他值时同样 fail closed', async () => {
  const res = await onRequest(
    mockContext('https://blog.styrigx.com/post/abc/', { SGX_SITE: 'space' })
  );
  assert.equal(res.status, 302);
  assert.ok(lockTarget(res).includes('why=no-config'));
});

test('env 缺失时同样 fail closed', async () => {
  const ctx = {
    request: new Request('https://blog.styrigx.com/post/abc/'),
    next: async () => new Response('next'),
    env: undefined,
  };
  const res = await onRequest(ctx);
  assert.equal(res.status, 302);
  assert.ok(lockTarget(res).includes('why=no-config'));
});

test('pages.dev 生产别名的 301 跳转不受 fail-closed 影响（链首）', async () => {
  const res = await onRequest(
    mockContext('https://styrigx-blog.pages.dev/post/abc/', {})
  );
  assert.equal(res.status, 301);
  assert.equal(
    res.headers.get('Location'),
    'https://blog.styrigx.com/post/abc/'
  );
});

test('白名单路径在 SGX_SITE 缺失时也不放行', async () => {
  // 白名单检查在 SGX_SITE 检查之后：缺配置时连 /robots.txt 也 302
  const res = await onRequest(
    mockContext('https://blog.styrigx.com/robots.txt', {})
  );
  assert.equal(res.status, 302);
  assert.ok(lockTarget(res).includes('why=no-config'));
});
