/**
 * GET /api/lock-check
 * 供已打开的标签页主动检查会话是否仍然有效。
 * 不在白名单里，走和页面完全相同的中间件校验逻辑。
 * 通过返回 204，失败返回 401 {ok:false, why}（不要 302，fetch 会跟随跳转）。
 * Cache-Control: no-store。
 */
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

  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = [];
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name === 'sgx-verified') {
      cookies.push(part.slice(idx + 1).trim());
    }
  }

  if (cookies.length === 0) {
    return Response.json(
      { ok: false, why: 'no-cookie' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // 动态导入 _middleware.js 的 verifyCookie（避免重复代码）
  // 注意：这里简化实现，直接调用验证逻辑
  let lastWhy = 'sig';
  for (const cookie of cookies) {
    const result = await verifyCookieInline(cookie, publicKeyPem, env);
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

// 内联的 verifyCookie 逻辑（与 _middleware.js 保持一致）
async function verifyCookieInline(cookieValue, publicKeyPem, env) {
  const parts = cookieValue.split('.');
  if (parts.length !== 4) return { ok: false, why: 'bad-format' };
  const [role, epochStr, expStr, sigB64] = parts;
  if (role !== 'owner' && role !== 'visitor') return { ok: false, why: 'bad-format' };
  const epoch = Number(epochStr);
  const exp = Number(expStr);
  if (!Number.isInteger(epoch) || epoch < 0) return { ok: false, why: 'bad-format' };
  if (!Number.isFinite(exp) || exp <= Date.now()) return { ok: false, why: 'expired' };

  let key;
  try {
    const pemBody = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, '');
    const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
    key = await crypto.subtle.importKey('spki', keyData, { name: 'Ed25519' }, false, ['verify']);
  } catch (e) {
    return { ok: false, why: 'key-import' };
  }

  const data = new TextEncoder().encode(`${role}.${epochStr}.${expStr}`);
  let sig;
  try {
    const b64 = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    sig = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
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

  // epoch 检查
  try {
    const res = await fetch('https://styrigx.com/api/session-epoch', {
      headers: { 'Cache-Control': 'no-store' },
    });
    if (!res.ok) return { ok: false, why: 'epoch-fetch' };
    const j = await res.json();
    const latest = j && typeof j.epoch === 'number' ? j.epoch : 0;
    if (epoch < latest) return { ok: false, why: 'epoch-stale' };
  } catch (e) {
    return { ok: false, why: 'epoch-fetch' };
  }

  return { ok: true, why: '' };
}
