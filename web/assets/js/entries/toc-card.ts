// 宽屏右侧目录卡：当前节高亮 + 手机折叠目录（原 TableOfContents.astro 的 <script>，原样搬过来）。
import { mountNavfolioTocSpy } from '../blog/toc-spy';

mountNavfolioTocSpy();

const initMobileTocToggle = () => {
  for (const toc of document.querySelectorAll<HTMLElement>('[data-mobile-toc]')) {
    const button = toc.querySelector<HTMLButtonElement>(':scope > [data-toc-expand]');
    const label = toc.querySelector<HTMLElement>('[data-expand-label]');

    if (!button || button.dataset.tocExpandReady) {
      continue;
    }

    button.dataset.tocExpandReady = 'true';
    button.addEventListener('click', () => {
      const expanded = toc.dataset.expanded === 'true';
      const nextExpanded = !expanded;

      toc.dataset.expanded = String(nextExpanded);
      button.setAttribute('aria-expanded', String(nextExpanded));
      button.setAttribute(
        'aria-label',
        nextExpanded
          ? (toc.dataset.collapseAriaLabel ?? 'Collapse table of contents')
          : (toc.dataset.expandAriaLabel ?? 'Expand table of contents'),
      );
      if (label) {
        label.textContent = nextExpanded
          ? (toc.dataset.collapseLabel ?? 'Collapse')
          : (toc.dataset.expandLabel ?? 'Show all');
      }
    });
  }
};

initMobileTocToggle();
document.addEventListener('astro:page-load', initMobileTocToggle);
