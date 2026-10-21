// 文章页：分享按钮、giscus 评论、代码块复制。
// 分享 / 评论逻辑来自原 ShareButtons.astro、GiscusComment.astro 的脚本，配置改从页面上的 data-* 读。

/* ---------- 分享（原 ShareButtons.astro） ---------- */
(() => {
  if (window.__styrigxShareButtons) return;
  window.__styrigxShareButtons = true;
  const root = document.querySelector('[data-share-root]');
  const title = root?.getAttribute('data-share-title') || document.title;
  const url = root?.getAttribute('data-share-url') || location.href;
  if (typeof navigator.share === 'function') {
    document.querySelectorAll('[data-share-native]').forEach((btn) => btn.removeAttribute('hidden'));
  }
  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const copyBtn = target.closest('[data-share-copy]');
    if (copyBtn) {
      const link = copyBtn.getAttribute('data-share-copy') || '';
      const label = copyBtn.querySelector('span');
      const original = label ? label.textContent : '';
      await copyText(link);
      if (label) {
        label.textContent = copyBtn.getAttribute('data-copied-label') || 'Copied';
        setTimeout(() => {
          label.textContent = original;
        }, 1600);
      }
      return;
    }
    const nativeBtn = target.closest('[data-share-native]');
    if (nativeBtn && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
      } catch {}
    }
  });
})();

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/* ---------- 代码块复制（render-codeblock.html 的 .code-copy）：只复制代码，不带行号 ---------- */
document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const btn = target.closest('[data-code-copy]');
  if (!btn) return;
  const block = btn.closest('.code-block');
  const lines = block ? [...block.querySelectorAll('.cl')] : [];
  const text = lines.length
    ? lines.map((l) => l.textContent || '').join('').replace(/\n$/, '')
    : block?.querySelector('code')?.textContent || '';
  await copyText(text);
  const label = btn.querySelector('[data-code-copy-label]');
  btn.setAttribute('data-copied', 'true');
  const original = label ? label.textContent : '';
  if (label) label.textContent = btn.getAttribute('data-copied-label') || 'Copied';
  clearTimeout(btn.__t);
  btn.__t = setTimeout(() => {
    btn.removeAttribute('data-copied');
    if (label) label.textContent = original;
  }, 1600);
});

/* ---------- giscus（原 GiscusComment.astro）：主题跟页面深浅色 ---------- */
(() => {
  const container = document.querySelector('[data-comment-provider="giscus"]');
  if (!container) return;
  const d = container.dataset;
  const dark = () => document.documentElement.classList.contains('dark');
  const script = document.createElement('script');
  script.src = 'https://giscus.app/client.js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.setAttribute('data-repo', d.repo || '');
  script.setAttribute('data-repo-id', d.repoId || '');
  script.setAttribute('data-category', d.category || '');
  script.setAttribute('data-category-id', d.categoryId || '');
  script.setAttribute('data-mapping', d.mapping || 'pathname');
  script.setAttribute('data-strict', d.strict || '0');
  script.setAttribute('data-reactions-enabled', d.reactionsEnabled || '1');
  script.setAttribute('data-emit-metadata', d.emitMetadata || '0');
  script.setAttribute('data-input-position', d.inputPosition || 'bottom');
  script.setAttribute('data-theme', dark() ? d.darkTheme || 'dark' : d.lightTheme || 'light');
  script.setAttribute('data-lang', d.lang || 'zh-CN');
  script.setAttribute('data-loading', d.loading || 'lazy');
  container.replaceChildren(script);
  /* 系统深浅色变了（cookie 是 system 时 sgx-inherit 会改 <html class>）：同步 giscus */
  new MutationObserver(() => {
    const iframe = document.querySelector('iframe.giscus-frame');
    iframe?.contentWindow?.postMessage(
      { giscus: { setConfig: { theme: dark() ? d.darkTheme || 'dark' : d.lightTheme || 'light' } } },
      'https://giscus.app',
    );
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
})();
