import { test, expect } from '@playwright/test';

// One UI 视觉基线：每个页面 × 浅色/深色 × 手机 390×844 / 桌面 1200px。
// 基线图提交在 tests/visual/baseline/，CI 用同版本 Chromium 对比。

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'home-en', path: '/en/' },
  { name: 'article', path: '/post/2026-10-07-muse-playbook/' },
  { name: 'article-en', path: '/en/post/2026-10-07-muse-playbook/' },
  { name: 'tag', path: '/tags/ai' },
  { name: 'about', path: '/about' },
  { name: 'not-found', path: '/404.html' },
];

for (const { name, path } of PAGES) {
  test(`${name} baseline screenshot`, async ({ page }) => {
    // 固定主题：清掉已存偏好，让 colorScheme 生效
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('navfolio-theme');
      } catch {}
    });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    // 等字体与图片稳定
    await page.evaluate(() => document.fonts.ready);
    await page
      .locator('.oui-article-wrap, .oui-archive-wrap, .oui-notfound')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
    // 无横向溢出断言
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    expect(overflow, `${name} 有横向溢出`).toBe(false);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: false });
  });
}

test('search dialog baseline screenshot', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('navfolio-theme');
    } catch {}
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  // 等图片加载完成（替代 networkidle）
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((r) => {
              img.onload = img.onerror = r;
            }),
      ),
    ),
  );
  // 打开搜索弹窗：搜索在顶栏 ⋮ 菜单里
  await page.locator('[data-sgx-more]').click();
  const trigger = page.locator('[data-site-search-trigger]').first();
  await trigger.click();
  await page.waitForSelector('[data-site-search-dialog]', { state: 'visible' });
  await page.locator('[data-site-search-input]').waitFor({ state: 'visible' });
  // 等搜索就绪（状态文本从加载中变为 idle）
  await page
    .waitForFunction(
      () => {
        const status = document.querySelector('[data-site-search-status]');
        return status && !/加载|loading/i.test(status.textContent || '');
      },
      { timeout: 10000 },
    )
    .catch(() => {});
  await expect(page).toHaveScreenshot('search-dialog.png', { fullPage: false });
});

test('悬浮顶栏不遮挡首个标题（布局断言）', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('navfolio-theme');
    } catch {}
  });
  // 首页 + 文章页：页面顶部时，首个 h1 的 top 必须 ≥ 顶栏 bottom
  for (const path of ['/', '/post/2026-10-07-muse-playbook/']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    const result = await page.evaluate(() => {
      const header = document.querySelector('.sgx-topbar');
      const h1 = document.querySelector(
        '.sgx-subpage-title, .oui-article-wrap h1, .oui-page-title h1',
      );
      if (!header || !h1) return { ok: false, reason: 'header 或 h1 未找到' };
      const hb = header.getBoundingClientRect();
      const ht = h1.getBoundingClientRect();
      return { ok: ht.top >= hb.bottom - 1, h1Top: ht.top, headerBottom: hb.bottom };
    });
    expect(
      result.ok,
      `${path} 首个标题被顶栏遮挡 (h1.top=${result.h1Top}, header.bottom=${result.headerBottom})`,
    ).toBe(true);
  }
});

// ===== 顶栏 v3（与主站 Space 同款）=====
test.describe('顶栏 v3', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('navfolio-theme');
        localStorage.setItem('styrigx-blog-lang', 'zh');
      } catch {}
    });
  });

  test('三块布局：左圆九宫格 · 长条（返回 / Styrigx 正中 / ⋮）· 右圆头像', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const r = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const pillEl = document.querySelector('.sgx-tb-pill');
      const pill = box(pillEl);
      const text = box(document.querySelector('.sgx-tb-text'));
      const nav = box(document.querySelector('.sgx-tb-nav'));
      const bar = box(document.querySelector('.sgx-topbar'));
      const backEl = document.querySelector('[data-sgx-back]');
      const back = box(backEl);
      const more = box(document.querySelector('[data-sgx-more]'));
      const meEl = document.querySelector('.sgx-tb-me');
      const me = box(meEl);
      const avatar = meEl.querySelector('img.sgx-tb-avatar');
      return {
        dx: text.left + text.width / 2 - (pill.left + pill.width / 2),
        dy: text.top + text.height / 2 - (pill.top + pill.height / 2),
        pillH: pill.height,
        nav: [nav.width, nav.height],
        me: [me.width, me.height],
        order: nav.right <= pill.left && pill.right <= me.left,
        gaps: [Math.round(pill.left - nav.right), Math.round(me.left - pill.right)],
        // 两圆贴顶栏两端（右侧距视口 16px 由 .sgx-topbar 的 right 保证；html 有 scrollbar-gutter，不直接量视口）
        sides: [Math.round(nav.left - bar.left), Math.round(bar.right - me.right)],
        backInPill: pillEl.contains(backEl) && back.left - pill.left < 12,
        moreRight: pill.right - more.right < 12,
        avatarOpacity: avatar ? getComputedStyle(avatar).opacity : null,
        avatarCount: document.querySelectorAll('.sgx-topbar .sgx-tb-avatar').length,
        meInteractive: !!meEl.closest('a, button') || !!meEl.querySelector('a, button'),
        backCircles: document.querySelectorAll('.sgx-topbar > [data-sgx-back]').length,
      };
    });
    expect(Math.abs(r.dx)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.dy)).toBeLessThanOrEqual(1);
    expect(r.pillH).toBe(52);
    expect(r.nav).toEqual([52, 52]);
    expect(r.me).toEqual([52, 52]);
    expect(r.order).toBe(true);
    expect(r.gaps).toEqual([8, 8]);
    expect(r.sides).toEqual([0, 0]);
    expect(r.backInPill).toBe(true);
    expect(r.moreRight).toBe(true);
    expect(r.avatarOpacity).toBe('1');
    expect(r.avatarCount, '只有右圆一个头像，长条里不再有小头像').toBe(1);
    expect(r.meInteractive, '右圆头像只展示，不可点击').toBe(false);
    expect(r.backCircles, '旧返回圆已删除').toBe(0);
  });

  test('右圆头像点了不跳转', async ({ page }) => {
    await page.goto('/post/2026-10-07-muse-playbook/', { waitUntil: 'domcontentloaded' });
    const before = page.url();
    await page.locator('.sgx-tb-me').click();
    await page.waitForTimeout(300);
    expect(page.url()).toBe(before);
  });

  test('大标题与顶栏小标题交接：不同时出现', async ({ page }) => {
    await page.goto('/post/2026-10-07-muse-playbook/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    const state = () =>
      page.evaluate(() => {
        const hero = document.querySelector('main h1');
        return {
          stuck: document.body.classList.contains('sgx-stuck'),
          heroOpacity: Number(getComputedStyle(hero).opacity),
          heroTop: hero.getBoundingClientRect().top,
          mini: document.querySelector('[data-sgx-mini]').textContent.trim(),
        };
      });
    const top = await state();
    expect(top.stuck).toBe(false);
    expect(top.heroOpacity).toBe(1);
    expect(top.mini.length).toBeGreaterThan(0);

    // 一路往下滚：任何时刻 stuck 时大标题都必须已完全消失；中间要有淡出过程
    let sawPartial = false;
    for (let y = 0; y <= 400; y += 8) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(40);
      const s = await state();
      if (s.stuck) expect(s.heroOpacity).toBeLessThanOrEqual(0.001);
      if (s.heroOpacity > 0.05 && s.heroOpacity < 0.95) sawPartial = true;
    }
    expect(sawPartial).toBe(true);
    const end = await state();
    expect(end.stuck).toBe(true);
    await expect
      .poll(async () =>
        Number(
          await page.evaluate(
            () => getComputedStyle(document.querySelector('.sgx-tb-text')).opacity,
          ),
        ),
      )
      .toBe(0);
    await expect
      .poll(async () =>
        Number(
          await page.evaluate(
            () => getComputedStyle(document.querySelector('[data-sgx-mini]')).opacity,
          ),
        ),
      )
      .toBe(1);
  });

  test('首页即文章列表：大标题「博客」滚动后交接给顶栏小标题', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main h1').first()).toHaveText('博客');
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.body.classList.contains('sgx-stuck'))).toBe(true);
  });

  test('英文浏览器：/ 跳 /en/ 一次后停住，不循环', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    let navs = 0;
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) navs++;
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const settled = navs;
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe('/en/');
    expect(navs, '停在 /en/ 后不再导航').toBe(settled);
    await ctx.close();
  });

  test('导航菜单：主站 / 书库 / 博客（三站统一顺序）', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-sgx-apps]').click();
    const menu = page.locator('#sgx-nav-menu');
    await expect(menu).toBeVisible();
    const items = await menu.locator('.sgx-menu-item').allTextContents();
    expect(items.map((t) => t.trim())).toEqual(['主站', '书库', '博客']);
    await expect(menu.locator('[aria-current="page"]')).toHaveText('博客');
    await expect(menu.locator('a[href="https://book.styrigx.com"]')).toHaveCount(1);
    // 导航圆在左边：菜单左沿与导航圆左沿对齐
    const [menuLeft, navLeft] = await page.evaluate(() => [
      document.querySelector('#sgx-nav-menu').getBoundingClientRect().left,
      document.querySelector('[data-sgx-apps]').getBoundingClientRect().left,
    ]);
    expect(Math.abs(menuLeft - navLeft)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('⋮ 菜单：搜索、语言、主题、GitHub', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-sgx-more]').click();
    const menu = page.locator('#sgx-more-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-site-search-trigger]')).toBeVisible();
    await expect(menu.locator('[data-lang-switcher]')).toHaveAttribute('href', '/en/');
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await menu.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      before === 'dark' ? 'light' : 'dark',
    );
    await expect(menu).toBeHidden();
  });
});
