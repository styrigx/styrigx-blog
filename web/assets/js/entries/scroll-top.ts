// 返回顶部按钮（原 ScrollToTopButton.astro 的 <script>，原样搬过来）。
type ScrollToTopState = {
  lifecycleReady: boolean;
  observers: Set<IntersectionObserver>;
};

const scrollTopWindow = window as Window & {
  __navfolioScrollTopState?: ScrollToTopState;
};
const scrollTopState = (scrollTopWindow.__navfolioScrollTopState ??= {
  lifecycleReady: false,
  observers: new Set<IntersectionObserver>(),
});

const disconnectScrollToTopObservers = () => {
  for (const observer of scrollTopState.observers) {
    observer.disconnect();
  }

  scrollTopState.observers.clear();
};

const initScrollToTopButton = () => {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-scroll-top-button]')) {
    if (button.dataset.scrollTopReady === 'true') {
      continue;
    }

    button.dataset.scrollTopReady = 'true';
    const marker = button.previousElementSibling;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const setVisible = (visible: boolean) => {
      button.dataset.visible = visible ? 'true' : 'false';
      button.setAttribute('aria-hidden', String(!visible));
      button.tabIndex = visible ? 0 : -1;
    };

    setVisible(false);

    if (marker) {
      const observer = new IntersectionObserver(([entry]) => {
        setVisible(entry.boundingClientRect.top < 0 && !entry.isIntersecting);
      });

      observer.observe(marker);
      scrollTopState.observers.add(observer);
    }

    button.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
      });
    });
  }
};

initScrollToTopButton();

if (!scrollTopState.lifecycleReady) {
  scrollTopState.lifecycleReady = true;
  document.addEventListener('astro:before-swap', disconnectScrollToTopObservers);
  document.addEventListener('astro:page-load', initScrollToTopButton);
}
