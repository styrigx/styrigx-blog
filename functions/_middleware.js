/**
 * 博客锁屏跳转（2.4.1 三站真实锁屏 · 博客部分）。
 *
 * 与主站（styrigx.com）共用同一套会话 Cookie `sgx-verified`，格式：
 *   epoch.exp.sig
 * 其中 epoch 为 session epoch（整数），exp 为过期时间戳（毫秒），
 * sig 为主站 Ed25519 私钥对 "epoch.exp" 的签名（base64url）。
 *
 * 本站只持有公钥（环境变量 SGX_LOCK_PUBLIC，PEM 格式），绝不持有私钥，
 * 只做验签，不签发会话。
 *
 * 逻辑：
 *   - SGX_SITE 不是 'blog'（未配置或配错）：fail closed，302 到主站锁屏
 *     （why=no-config），绝不静默放行。缺配置拒绝请求。
 *   - 白名单路径（静态资源、robots.txt 等）：直接放行。
 *   - Cookie 有效（验签通过、未过期、epoch >= 主站最新 epoch）：放行。
 *   - 其他：一律 302 到主站锁屏 https://styrigx.com/?lock=1&return=<原地址>。
 *     return 的白名单校验由主站做，本站只负责跳转出去。
 *
 * Fail closed：主站 /api/session-epoch 拿不到且本地无缓存时，一律拒绝
 * （302 到锁屏），不放行。
 */

const MAIN_ORIGIN = 'https://styrigx.com';
const EPOCH_URL = MAIN_ORIGIN + '/api/session-epoch';
const EPOCH_CACHE_TTL_MS = 60 * 1000;
const EPOCH_FETCH_TIMEOUT_MS = 5000;

/* pages.dev 生产别名 → 正式域名 301（只精确匹配生产别名，分支/哈希预览别名放行） */
const PAGES_DEV_HOST = 'styrigx-blog.pages.dev';
const CANONICAL_ORIGIN = 'https://blog.styrigx.com';

/* 白名单：精确路径 */
const ALLOWLIST_EXACT = new Set([
  '/robots.txt',
  '/favicon.ico',
  '/manifest.json',
  '/browserconfig.xml',
  '/api/key-fingerprint',
]);

/* 白名单：静态资源后缀（不含正文内容） */
const ALLOWLIST_EXT = new Set([
  'css', 'js', 'mjs', 'map',
  'woff', 'woff2', 'ttf', 'otf',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico',
]);

/* epoch 缓存（内存，TTL 60 秒） */
let epochCache = { value: null, at: 0 };

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

let publicKeyPromise = null;
function getPublicKey(pem) {
  if (!publicKeyPromise) {
    publicKeyPromise = crypto.subtle.importKey(
      'spki',
      pemToSpkiDer(pem),
      { name: 'Ed25519' },
      false,
      ['verify'],
    ).catch((e) => {
      /* 失败时置回 null，下次重试，不永久缓存失败的 promise */
      publicKeyPromise = null;
      throw e;
    });
  }
  return publicKeyPromise;
}

/**
 * 取 Cookie 头里**所有**同名 cookie 的值（旧版本可能留下一个只绑主机的
 * 同名 sgx-verified，浏览器会把新旧两个都发过来；任一验签通过即有效）。
 * @returns {string[]}
 */
function getCookies(request, name) {
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

function isWhitelisted(pathname) {
  if (ALLOWLIST_EXACT.has(pathname)) return true;
  const dot = pathname.lastIndexOf('.');
  const slash = pathname.lastIndexOf('/');
  if (dot > slash && dot >= 0) {
    const ext = pathname.slice(dot + 1).toLowerCase();
    if (ALLOWLIST_EXT.has(ext)) return true;
  }
  return false;
}

/**
 * 取主站最新 epoch。缓存 60 秒；失败且无缓存时抛错（调用方 fail closed）。
 * @returns {Promise<number>}
 */
async function getLatestEpoch() {
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
 * 校验 sgx-verified cookie。
 * @param {string} cookieValue
 * @param {string} publicKeyPem
 * @returns {Promise<boolean>}
 */
async function verifyCookie(cookieValue, publicKeyPem) {
  const parts = cookieValue.split('.');
  /* 主站 2.8.0 起为四段式 role.epoch.exp.sig；三段旧格式一律无效，不留兼容层 */
  if (parts.length !== 4) return { ok: false, why: 'bad-format' };
  const [role, epochStr, expStr, sigB64] = parts;
  if (role !== 'owner' && role !== 'visitor') return { ok: false, why: 'bad-format' };
  const epoch = Number(epochStr);
  const exp = Number(expStr);
  if (!Number.isInteger(epoch) || epoch < 0) return { ok: false, why: 'bad-format' };
  if (!Number.isFinite(exp) || exp <= Date.now()) return { ok: false, why: 'expired' };

  let key;
  try {
    key = await getPublicKey(publicKeyPem);
  } catch (e) {
    console.error('[blog-lock] public key import failed', e);
    return { ok: false, why: 'key-import' };
  }
  const data = new TextEncoder().encode(role + '.' + epochStr + '.' + expStr);
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
    /* Fail closed：拿不到 epoch 一律拒绝；记录 HTTP 状态码 */
    const status = e && e.status ? e.status : 'unknown';
    console.error('[blog-lock] epoch fetch failed, fail closed, status=' + status, e);
    return { ok: false, why: 'epoch-fetch' };
  }
  if (epoch < latest) return { ok: false, why: 'epoch-stale' };
  return { ok: true, why: '' };
}

/** @param {any} context */
export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  /* pages.dev 生产别名 301 到正式域名（链首，不受锁屏逻辑影响） */
  if (url.hostname === PAGES_DEV_HOST) {
    const target = CANONICAL_ORIGIN + url.pathname + url.search;
    return new Response(null, {
      status: 301,
      headers: {
        Location: target,
        'Cache-Control': 'no-store',
      },
    });
  }

  /* SGX_SITE 未配置或不是 'blog'：fail closed（缺配置锁站），记日志，绝不静默放行 */
  if (!env || env.SGX_SITE !== 'blog') {
    console.error('[blog-lock] SGX_SITE not configured or mismatch, fail closed');
    return lockRedirect(url, 'no-config');
  }

  /* 白名单路径直接放行 */
  if (isWhitelisted(url.pathname)) {
    return next();
  }

  const publicKeyPem = env.SGX_LOCK_PUBLIC;
  if (!publicKeyPem) {
    /* 配置缺失：fail closed，记日志 */
    console.error('[blog-lock] SGX_LOCK_PUBLIC not configured');
    return lockRedirect(url, 'no-config');
  }

  const cookieValues = getCookies(request, 'sgx-verified');
  if (cookieValues.length === 0) {
    return lockRedirect(url, 'no-cookie');
  }
  let lastWhy = 'sig';
  for (const cookie of cookieValues) {
    let result = { ok: false, why: 'sig' };
    try {
      result = await verifyCookie(cookie, publicKeyPem);
    } catch (e) {
      result = { ok: false, why: 'sig' };
    }
    if (result.ok) return next();
    lastWhy = result.why || 'sig';
  }

  return lockRedirect(url, lastWhy);
}

/** @param {URL} url */
function lockRedirect(url, why) {
  let target =
    MAIN_ORIGIN + '/?lock=1&return=' + encodeURIComponent(url.toString());
  if (why) {
    target += '&why=' + encodeURIComponent(why);
  }
  return Response.redirect(target, 302);
}
