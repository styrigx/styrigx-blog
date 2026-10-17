/**
 * 博客锁屏跳转（2.4.1 三站真实锁屏 · 博客部分）。
 *
 * 与主站（styrigx.com）共用同一套会话 Cookie `sgx-verified`，格式：
 *   by.role.epoch.exp.sig
 * 其中 by ∈ {root, owner}，role ∈ {owner, visitor}，
 * epoch 为 session epoch（整数），exp 为过期时间戳（毫秒），
 * sig 为主站 Ed25519 私钥对 "by.role.epoch.exp" 的签名（base64url）。
 *
 * 本站只持有公钥（环境变量 SGX_LOCK_PUBLIC，PEM 格式），绝不持有私钥，
 * 只做验签，不签发会话。
 *
 * 逻辑：
 *   - SGX_SITE 不是 'blog'（未配置或配错）：fail closed，302 到主站锁屏
 *     （why=no-config），绝不静默放行。缺配置拒绝请求。
 *   - 白名单路径（静态资源、robots.txt 等）：直接放行。
 *   - Cookie 有效（验签通过、未过期、epoch >= 主站最新 epoch）：放行。
 *   - 其他：页面路径一律 302 到主站锁屏
 *     https://styrigx.com/?lock=1&return=<原地址>；`/api/*` 回 401 JSON
 *    （与 book 一致，避免 fetch 跟随跳转）。
 *     return 的白名单校验由主站做，本站只负责跳转出去。
 *
 * Fail closed：主站 /api/session-epoch 拿不到且本地无缓存时，一律拒绝
 * （302 到锁屏），不放行。
 */

const MAIN_ORIGIN = 'https://styrigx.com';

import { verifySgxCookie, getSgxCookies } from './_sgx-cookie.js';

/* pages.dev 生产别名 → 正式域名 301（只精确匹配生产别名，分支/哈希预览别名放行） */
const PAGES_DEV_HOST = 'styrigx-blog.pages.dev';
const CANONICAL_ORIGIN = 'https://blog.styrigx.com';

/* 白名单：精确路径 */
const ALLOWLIST_EXACT = new Set([
  '/robots.txt',
  '/favicon.ico',
  '/manifest.json',
  '/browserconfig.xml',
]);

/* 白名单：静态资源后缀（不含正文内容） */
const ALLOWLIST_EXT = new Set([
  'css', 'js', 'mjs', 'map',
  'woff', 'woff2', 'ttf', 'otf',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico',
]);

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

  /* 白名单路径直接放行；带内容哈希的静态资源加长期缓存（_headers 对经过
     Functions 的响应不生效，见 Book #22） */
  if (isWhitelisted(url.pathname)) {
    const resp = await next();
    // Astro/Vite ?url 指纹化产物形如 /_astro/xxx.<hash>.js：immutable 长期缓存。
    // 只在 200 且 content-type 是 JS/CSS 时加；缺失文件（404）或回落的
    // text/html 不加，避免把 404/HTML 当静态资源缓存一年（Book 线上事故）。
    if (
      resp.status === 200 &&
      /\/_[a-z]+\/[^/]*\.[A-Za-z0-9_-]{8,}\.(js|mjs|css)$/.test(url.pathname) &&
      /(?:javascript|ecmascript|^text\/css)/i.test(
        resp.headers.get('content-type') || ''
      )
    ) {
      const headers = new Headers(resp.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      });
    }
    return resp;
  }

  const publicKeyPem = env.SGX_LOCK_PUBLIC;
  if (!publicKeyPem) {
    /* 配置缺失：fail closed，记日志 */
    console.error('[blog-lock] SGX_LOCK_PUBLIC not configured');
    return rejectUnauthenticated(url, 'no-config');
  }

  const cookieValues = getSgxCookies(request, 'sgx-verified');
  if (cookieValues.length === 0) {
    return rejectUnauthenticated(url, 'no-cookie');
  }
  let lastWhy = 'sig';
  for (const cookie of cookieValues) {
    let result = { ok: false, why: 'sig' };
    try {
      result = await verifySgxCookie(cookie, publicKeyPem);
    } catch (e) {
      result = { ok: false, why: 'sig' };
    }
    if (result.ok) return next();
    lastWhy = result.why || 'sig';
  }

  return rejectUnauthenticated(url, lastWhy);
}

/**
 * 未通过鉴权的请求：/api/* 回 401 JSON（与 book 一致，避免 fetch
 * 跟随跳转），页面路径保持 302 到主站锁屏。
 */
function rejectUnauthenticated(url, why) {
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  }
  return lockRedirect(url, why);
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
