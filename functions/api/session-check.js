/**
 * GET /api/session-check
 * 供已打开的标签页主动检查会话是否仍然有效。
 * 不在白名单里，走和页面完全相同的中间件校验逻辑。
 * 通过返回 204，失败返回 401 {ok:false, why}（不要 302，fetch 会跟随跳转）。
 * Cache-Control: no-store。
 */
import { verifySgxCookie, getSgxCookies } from '../_sgx-cookie.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  // 与 _middleware.js 相同的校验逻辑（不 302，返回状态码）
  if (!env || env.SGX_SITE !== 'blog') {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  const publicKeyPem = env.SGX_LOCK_PUBLIC;
  if (!publicKeyPem) {
    return Response.json(
      { ok: false, why: 'no-config' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const cookies = getSgxCookies(request, 'sgx-verified');

  if (cookies.length === 0) {
    return Response.json(
      { ok: false, why: 'no-cookie' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let lastWhy = 'sig';
  for (const cookie of cookies) {
    const result = await verifySgxCookie(cookie, publicKeyPem);
    if (result.ok) {
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }
    lastWhy = result.why || 'sig';
  }

  return Response.json(
    { ok: false, why: lastWhy },
    { status: 401, headers: { 'Cache-Control': 'no-store' } }
  );
}
