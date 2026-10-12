/**
 * functions/_middleware.js 的静态资源缓存头测试。
 *
 * 背景：_headers 对经过 Functions 中间件的响应不生效（见 Book #22）。
 * 带内容哈希的指纹化资源（Astro ?url 产物）由中间件显式设
 * public, max-age=31536000, immutable；未指纹化的走默认。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.js';

function mockContext(url) {
  return {
    request: new Request(url),
    next: async () =>
      new Response('js-body', {
        headers: { 'Content-Type': 'application/javascript' },
      }),
    env: { SGX_SITE: 'blog' },
  };
}

test('指纹化 JS（/_astro/xxx.<hash>.js）返回 immutable 长期缓存', async () => {
  const res = await onRequest(
    mockContext('https://blog.styrigx.com/_astro/sgx-lock-check.M1f5FtKP.js')
  );
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get('Cache-Control'),
    'public, max-age=31536000, immutable'
  );
  assert.equal(await res.text(), 'js-body');
});

test('未指纹化的 /js/ 路径不加 immutable', async () => {
  const res = await onRequest(
    mockContext('https://blog.styrigx.com/js/some-lib.js')
  );
  assert.equal(res.status, 200);
  assert.notEqual(
    res.headers.get('Cache-Control'),
    'public, max-age=31536000, immutable'
  );
});

test('HTML 页面不受静态资源缓存逻辑影响', async () => {
  const ctx = {
    request: new Request('https://blog.styrigx.com/post/abc/'),
    next: async () => new Response('<html></html>'),
    env: {},
  };
  const res = await onRequest(ctx);
  // 缺 SGX_SITE 配置时应 fail closed 302，而不是放行
  assert.equal(res.status, 302);
});
