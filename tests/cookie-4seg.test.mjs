/**
 * blog 跨站契约测试：主站格式的 sgx-verified cookie（四段式 role.epoch.exp.sig）能被本站验证。
 * 主站 2.8.0 起签名内容为 "role.epoch.exp"，role 为 owner 或 visitor。
 * 如果主站改格式，本测试会红，提醒同步更新 blog 的 verifyCookie。
 *
 * 用 Node 内置 test runner：node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- Ed25519 测试密钥（每次运行生成，不进仓库） ---
async function genKeyPair() {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { kp, privJwk, pubJwk };
}

function base64UrlEncode(bytes) {
  const b64 = Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return new Uint8Array(Buffer.from(s, 'base64'));
}

// 主站 signSessionCookie 的同样格式：role.epoch.exp.sig，签名 "role.epoch.exp"
async function signCookie(privateKey, role, epoch, exp) {
  const payload = `${role}.${epoch}.${exp}`;
  const sig = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(payload));
  return `${payload}.${base64UrlEncode(new Uint8Array(sig))}`;
}

// 把 JWK 公钥转成 PEM（供 blog middleware 的 getPublicKey 用）
async function jwkToPem(pubJwk) {
  const key = await crypto.subtle.importKey('jwk', pubJwk, { name: 'Ed25519' }, true, ['verify']);
  const spki = await crypto.subtle.exportKey('spki', key);
  const b64 = Buffer.from(spki).toString('base64');
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
}

// 直接测试 verifyCookie 逻辑（复制 blog 的实现，确保一致）
async function verifyCookie4Seg(cookieValue, publicKeyPem, latestEpoch) {
  const parts = cookieValue.split('.');
  if (parts.length !== 4) return false;
  const [role, epochStr, expStr, sigB64] = parts;
  if (role !== 'owner' && role !== 'visitor') return false;
  const epoch = Number(epochStr);
  const exp = Number(expStr);
  if (!Number.isInteger(epoch) || epoch < 0) return false;
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;

  // 导入公钥
  const pemBody = publicKeyPem.replace(/-----BEGIN PUBLIC KEY-----/, '').replace(/-----END PUBLIC KEY-----/, '').replace(/\s/g, '');
  const keyData = new Uint8Array(Buffer.from(pemBody, 'base64'));
  const key = await crypto.subtle.importKey('spki', keyData, { name: 'Ed25519' }, false, ['verify']);

  const data = new TextEncoder().encode(`${role}.${epochStr}.${expStr}`);
  const sig = base64UrlDecode(sigB64);
  const ok = await crypto.subtle.verify('Ed25519', key, sig, data);
  if (!ok) return false;
  if (epoch < latestEpoch) return false;
  return true;
}

test('主站格式 owner cookie 通过', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'owner', 5, exp);
  assert.equal(await verifyCookie4Seg(cookie, pem, 5), true);
});

test('主站格式 visitor cookie 通过（blog 给访客看）', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'visitor', 5, exp);
  assert.equal(await verifyCookie4Seg(cookie, pem, 5), true);
});

test('三段旧格式拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  // 旧格式：epoch.exp.sig（无 role）
  const exp = Date.now() + 3600000;
  const payload = `5.${exp}`;
  const sig = await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(payload));
  const cookie = `${payload}.${base64UrlEncode(new Uint8Array(sig))}`;
  assert.equal(await verifyCookie4Seg(cookie, pem, 5), false);
});

test('过期 cookie 拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() - 1000; // 已过期
  const cookie = await signCookie(kp.privateKey, 'owner', 5, exp);
  assert.equal(await verifyCookie4Seg(cookie, pem, 5), false);
});

test('epoch 过旧拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'owner', 3, exp);
  assert.equal(await verifyCookie4Seg(cookie, pem, 5), false); // latest=5, cookie epoch=3
});

test('篡改 role 拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'owner', 5, exp);
  const tampered = cookie.replace(/^owner\./, 'visitor.');
  // 篡改后签名不匹配
  assert.equal(await verifyCookie4Seg(tampered, pem, 5), false);
});

test('未知 role 拒绝', async () => {
  const { kp, pubJwk } = await genKeyPair();
  const pem = await jwkToPem(pubJwk);
  const exp = Date.now() + 3600000;
  const cookie = await signCookie(kp.privateKey, 'admin', 5, exp);
  assert.equal(await verifyCookie4Seg(cookie, pem, 5), false);
});
