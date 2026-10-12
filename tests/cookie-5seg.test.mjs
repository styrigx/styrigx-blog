/**
 * blog 跨站契约测试：主站格式的 sgx-verified cookie（五段式 by.role.epoch.exp.sig）
 * 能被本站验证。与主站 functions/_middleware.js 的 verifyOneCookie 完全一致：
 *   by ∈ {root, owner}；role ∈ {owner, visitor}；
 *   签名载荷 "by.role.epoch.exp"；epoch >= 主站 session-epoch（fail closed）。
 *
 * 2.11：旧四段式一律拒绝，不留兼容层。如果主站改格式，本测试会红，
 * 提醒同步更新 blog 的 functions/_sgx-cookie.js。
 *
 * 用 Node 内置 test runner：node --test tests/
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { verifySgxCookie, _resetEpochCache } from '../functions/_sgx-cookie.js';

// --- fetch mock：epoch 接口返回固定值 ---
let mockEpoch = 5;
let fetchShouldFail = false;
globalThis.fetch = async (url) => {
  if (fetchShouldFail) throw new Error('network down');
  return {
    ok: true,
    async json() { return { epoch: mockEpoch }; },
  };
};
beforeEach(() => {
  mockEpoch = 5;
  fetchShouldFail = false;
  _resetEpochCache();
});

// --- Ed25519 测试密钥（每次运行生成，不进仓库） ---
async function genKeyPair() {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { kp, pubJwk };
}

function base64UrlEncode(bytes) {
  const b64 = Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 主站 signSessionCookie 的同样格式：by.role.epoch.exp.sig，签名 "by.role.epoch.exp"
async function signCookie(privateKey, by, role, epoch, exp) {
  const payload = `${by}.${role}.${epoch}.${exp}`;
  const sig = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(payload));
  return `${payload}.${base64UrlEncode(new Uint8Array(sig))}`;
}

// 把 JWK 公钥转成 PEM（供 blog 的 getPublicKey 用）
async function jwkToPem(pubJwk) {
  const key = await crypto.subtle.importKey('jwk', pubJwk, { name: 'Ed25519' }, true, ['verify']);
  const spki = await crypto.subtle.exportKey('spki', key);
  const b64 = Buffer.from(spki).toString('base64');
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
}

test('主站格式 by=owner/role=owner 通过', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'owner', 'owner', 5, exp);
  const r = await verifySgxCookie(cookie, pem);
  assert.equal(r.ok, true);
});

test('主站格式 by=root/role=owner 通过', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'root', 'owner', 5, exp);
  const r = await verifySgxCookie(cookie, pem);
  assert.equal(r.ok, true);
});

test('主站格式 by=owner/role=visitor 通过（blog 给访客看）', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'owner', 'visitor', 5, exp);
  const r = await verifySgxCookie(cookie, pem);
  assert.equal(r.ok, true);
});

test('旧四段式拒绝（无 by，不留兼容）', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  // 四段式 role.epoch.exp.sig
  const payload = `owner.5.${exp}`;
  const sig = await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(payload));
  const cookie = `${payload}.${base64UrlEncode(new Uint8Array(sig))}`;
  const r = await verifySgxCookie(cookie, pem);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'bad-format');
});

test('篡改 by 拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'owner', 'owner', 5, exp);
  const tampered = cookie.replace(/^owner\./, 'root.');
  const r = await verifySgxCookie(tampered, pem);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'sig');
});

test('篡改 role 拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'owner', 'owner', 5, exp);
  const tampered = cookie.replace(/\.owner\./, '.visitor.');
  const r = await verifySgxCookie(tampered, pem);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'sig');
});

test('未知 by 拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'admin', 'owner', 5, exp);
  const r = await verifySgxCookie(cookie, pem);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'bad-format');
});

test('未知 role 拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'owner', 'admin', 5, exp);
  const r = await verifySgxCookie(cookie, pem);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'bad-format');
});

test('过期 cookie 拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() - 1000;
  const cookie = await signCookie(kp.privateKey, 'owner', 'owner', 5, exp);
  const r = await verifySgxCookie(cookie, pem);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'expired');
});

test('epoch 过旧拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'owner', 'owner', 3, exp);
  const r = await verifySgxCookie(cookie, pem); // mockEpoch=5, cookie epoch=3
  assert.equal(r.ok, false);
  assert.equal(r.why, 'epoch-stale');
});

test('epoch 拿不到时 fail closed', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'owner', 'owner', 5, exp);
  fetchShouldFail = true;
  const r = await verifySgxCookie(cookie, pem);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'epoch-fetch');
});
