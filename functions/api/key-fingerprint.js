/**
 * GET /api/key-fingerprint
 * 返回锁屏公钥的指纹（SHA-256 前 16 位），用于三站核对公钥是否一致。
 * 只暴露公钥哈希，绝不输出私钥或其哈希。公开接口，无需认证。
 */
export async function onRequestGet(context) {
  const { env } = context;
  const pubPem = (env && env.SGX_LOCK_PUBLIC) || '';
  if (!pubPem) {
    return Response.json(
      { ok: false, error: 'no-config' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const normalized = pubPem.replace(/\s/g, '');
  const data = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return Response.json(
    { site: 'blog', lock: hex.slice(0, 16) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
