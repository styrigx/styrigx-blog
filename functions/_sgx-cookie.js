/**
 * SGX 会话 Cookie 验签（blog 侧共享模块）。
 *
 * 与主站（styrigx.com）functions/_middleware.js 的 verifyOneCookie 完全一致：
 *   五段式 by.role.epoch.exp.sig，签名载荷为 "by.role.epoch.exp"。
 *   - by ∈ {root, owner}，否则无效
 *   - role ∈ {owner, visitor}，否则无效
 *   - exp 未过期，否则无效
 *   - Ed25519 验签通过，否则无效
 *   - epoch >= 主站 /api/session-epoch（fail closed：拿不到 epoch 一律拒绝）
 *
 * 2.11：旧四段式（无 by）一律视为无效，不留兼容层。
 * 本站只持有公钥（环境变量 SGX_LOCK_PUBLIC，PEM 格式），只验签，不签发会话。
 */

const MAIN_ORIGIN = 'https://styrigx.com';
const EPOCH_URL = MAIN_ORIGIN + '/api/session-epoch';
const EPOCH_CACHE_TTL_MS = 60 * 1000;
const EPOCH_FETCH_TIMEOUT_MS = 5000;

/* epoch 缓存（内存，TTL 60 秒） */
let epochCache = { value: null, at: 0 };

/** 测试用：清空 epoch 缓存 */
export function _resetEpochCache() {
  epochCache = { value: null, at: 0 };
}

function base64UrlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 2 ? '==' : b64.length % 4 === 3 ? '=' : '';
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pemToSpkiDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const publicKeyCache = new Map();
function getPublicKey(pem) {
  let p = publicKeyCache.get(pem);
  if (!p) {
    p = crypto.subtle.importKey(
      'spki',
      pemToSpkiDer(pem),
      { name: 'Ed25519' },
      false,
      ['verify'],
    ).catch((e) => {
      /* 失败时删掉缓存，下次重试，不永久缓存失败的 promise */
      publicKeyCache.delete(pem);
      throw e;
    });
    publicKeyCache.set(pem, p);
  }
  return p;
}

/**
 * 取主站最新 epoch。缓存 60 秒；失败且无缓存时抛错（调用方 fail closed）。
 * @returns {Promise<number>}
 */
export async function getLatestEpoch() {
  const now = Date.now();
  if (epochCache.value !== null && now - epochCache.at < EPOCH_CACHE_TTL_MS) {
    return epochCache.value;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), EPOCH_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(EPOCH_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error('epoch http ' + res.status);
    const data = await res.json();
    const epoch = Number(data && data.epoch);
    if (!Number.isInteger(epoch) || epoch < 0) throw new Error('epoch bad payload');
    epochCache = { value: epoch, at: now };
    return epoch;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 校验 sgx-verified cookie（五段式）。
 * @param {string} cookieValue
 * @param {string} publicKeyPem
 * @returns {Promise<{ok: boolean, why: string}>}
 */
export async function verifySgxCookie(cookieValue, publicKeyPem) {
  const parts = cookieValue.split('.');
  /* 主站 2.11 起为五段式 by.role.epoch.exp.sig；四段及更旧格式一律无效，不留兼容层 */
  if (parts.length !== 5) return { ok: false, why: 'bad-format' };
  const [by, role, epochStr, expStr, sigB64] = parts;
  if (by !== 'root' && by !== 'owner') return { ok: false, why: 'bad-format' };
  if (role !== 'owner' && role !== 'visitor') return { ok: false, why: 'bad-format' };
  const epoch = Number(epochStr);
  const exp = Number(expStr);
  if (!Number.isInteger(epoch) || epoch < 0) return { ok: false, why: 'bad-format' };
  if (!Number.isFinite(exp) || exp <= Date.now()) return { ok: false, why: 'expired' };

  let key;
  try {
    key = await getPublicKey(publicKeyPem);
  } catch (e) {
    console.error('[sgx-cookie] public key import failed', e);
    return { ok: false, why: 'key-import' };
  }
  const data = new TextEncoder().encode(by + '.' + role + '.' + epochStr + '.' + expStr);
  let sig;
  try {
    sig = base64UrlToBytes(sigB64);
  } catch (e) {
    return { ok: false, why: 'bad-format' };
  }
  let ok = false;
  try {
    ok = await crypto.subtle.verify('Ed25519', key, sig, data);
  } catch (e) {
    return { ok: false, why: 'sig' };
  }
  if (!ok) return { ok: false, why: 'sig' };

  /* epoch 检查：cookie 的 epoch 必须 >= 主站最新 epoch（退出所有设备后旧 cookie 失效） */
  let latest;
  try {
    latest = await getLatestEpoch();
  } catch (e) {
    /* Fail closed：拿不到 epoch 一律拒绝 */
    console.error('[sgx-cookie] epoch fetch failed, fail closed', e);
    return { ok: false, why: 'epoch-fetch' };
  }
  if (epoch < latest) return { ok: false, why: 'epoch-stale' };
  return { ok: true, why: '' };
}

/**
 * 取 Cookie 头里**所有**同名 cookie 的值（旧版本可能留下一个只绑主机的
 * 同名 sgx-verified，浏览器会把新旧两个都发过来；任一验签通过即有效）。
 * @returns {string[]}
 */
export function getSgxCookies(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return [];
  const out = [];
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      out.push(decodeURIComponent(part.slice(idx + 1).trim()));
    }
  }
  return out;
}
