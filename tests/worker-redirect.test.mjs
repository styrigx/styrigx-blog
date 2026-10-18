/**
 * public/_worker.js：pages.dev 等非正式域名一律 301 回 blog.styrigx.com，正式域名原样交给静态文件。
 * 运行：node --test tests/worker-redirect.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../public/_worker.js';

const env = {
  ASSETS: { fetch: async (req) => new Response('static:' + new URL(req.url).pathname) },
};

test('生产别名、哈希预览别名都 301 回正式域名，保留路径和查询串', async () => {
  for (const host of ['styrigx-blog.pages.dev', 'abc123.styrigx-blog.pages.dev']) {
    const res = await worker.fetch(new Request('https://' + host + '/post/x/?q=1'), env);
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('Location'), 'https://blog.styrigx.com/post/x/?q=1');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  }
});

test('正式域名交给静态文件', async () => {
  const res = await worker.fetch(new Request('https://blog.styrigx.com/post/x/'), env);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'static:/post/x/');
});

test('本站不再持有任何钥匙或验票代码', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  assert.equal(existsSync(new URL('../functions', import.meta.url)), false, 'functions/ 不应存在');
  const src = readFileSync(new URL('../public/_worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /SGX_|sgx-verified|crypto\.subtle/);
});
