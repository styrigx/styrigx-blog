/**
 * GET /api/lock-check 测试
 * 用 Node 内置 test runner：node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/lock-check.js';

function mockContext(cookieHeader, env) {
  return {
    request: new Request('https://blog.styrigx.com/api/lock-check', {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
    }),
    env: env || {},
  };
}

test('未配置 SGX_SITE 时返回 204（配置前行为不变）', async () => {
  const res = await onRequestGet(mockContext('sgx-verified=abc', {}));
  assert.equal(res.status, 204);
});

test('无 cookie 返回 401 no-cookie', async () => {
  const res = await onRequestGet(
    mockContext('', { SGX_SITE: 'blog', SGX_LOCK_PUBLIC: 'dummy' })
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.why, 'no-cookie');
});

test('未配置公钥返回 401 no-config', async () => {
  const res = await onRequestGet(
    mockContext('sgx-verified=abc', { SGX_SITE: 'blog' })
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.why, 'no-config');
});

test('格式错误的 cookie 返回 401 bad-format', async () => {
  // 生成一个测试密钥对
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pubKey = await crypto.subtle.exportKey('spki', kp.publicKey);
  const b64 = Buffer.from(pubKey).toString('base64');
  const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;

  const res = await onRequestGet(
    mockContext('sgx-verified=badformat', { SGX_SITE: 'blog', SGX_LOCK_PUBLIC: pem })
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.why, 'bad-format');
});
