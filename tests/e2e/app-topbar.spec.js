// 2026-10-20 沉浸式 app 顶栏验收（不截图，只断言行为和布局）：
// - 顶栏三块：九宫格 · 长条 · 头像；没有 ‹ 返回、没有 ⋮。
// - 列表页长条 = 分段滑块 首页 · 文章 · 专题（没有归档）：点、滑、键盘切换，hash 记住页签。
// - 指示器 / 阅读进度用主色（--sgx-accent = --sgx-primary，跟 sgx-ui cookie 的 pal / 自定义种子 accent）；抽屉当前项 / 目录当前节是 tonal。
// - 九宫格 → 左侧导航抽屉（主站共享外壳同一份：首页 / 书签 / 日刻 / 博客 + 设置，毛玻璃、tonal 当前项）；文章页抽屉最下面是目录。
// - 每个页面长条都只有 首页 · 文章 · 专题；文章页「文章」高亮，长条底边一条强调色细线是阅读进度。
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 412, height: 915 } });

const enc = (o) =>
  Buffer.from(JSON.stringify(o))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function setUi(context, baseURL, ui) {
  const u = new URL(baseURL);
  await context.addCookies([{ name: 'sgx-ui', value: enc(ui), domain: u.hostname, path: '/' }]);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://styrigx.com/**', (r) => r.fulfill({ status: 204 }));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('styrigx-blog-lang', 'zh');
    } catch {}
  });
});

const ARTICLE = '/post/2026-10-07-muse-playbook/';
const SERIES_V2 = '/post/2026-10-11-key-spec-whitepaper-v2/';

async function ready(page) {
  await expect(page.locator('[data-sgx-panes]')).toHaveAttribute('data-state', 'ready');
}

/** 计算 var(--sgx-accent) 的实际颜色 */
const accentColor = (page) =>
  page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--sgx-accent)';
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });

/** 指示器和当前页签对齐（等过渡结束） */
async function expectIndicatorOn(page, id) {
  await expect
    .poll(
      () =>
        page.evaluate((tab) => {
          const ind = document.querySelector('.sgx-seg-ind').getBoundingClientRect();
          const btn = document.querySelector(`[data-sgx-tab="${tab}"]`).getBoundingClientRect();
          return Math.max(Math.abs(ind.left - btn.left), Math.abs(ind.width - btn.width));
        }, id),
      { timeout: 3000 },
    )
    .toBeLessThanOrEqual(1);
}

async function expectTab(page, id) {
  await expect(page.locator(`[data-sgx-tab="${id}"]`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`[data-pane="${id}"]`)).toHaveClass(/\bis-active\b/);
  await expect(page.locator(`[data-pane="${id}"]`)).not.toHaveAttribute('inert', '');
  await expectIndicatorOn(page, id);
}

test.describe('顶栏', () => {
  for (const path of ['/', '/en/', ARTICLE, '/tags/ai/', '/404.html']) {
    test(`${path}：九宫格 + 长条 + 头像，没有 ‹ 和 ⋮`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.sgx-topbar > .sgx-tb-nav')).toHaveCount(1);
      await expect(page.locator('.sgx-topbar > .sgx-tb-pill')).toHaveCount(1);
      await expect(page.locator('.sgx-topbar > .sgx-tb-me')).toHaveCount(1);
      await expect(
        page.locator('[data-sgx-back], .sgx-tb-back, [data-sgx-more], .sgx-tb-more'),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-theme-toggle], [data-lang-switcher], [data-site-search-trigger]'),
      ).toHaveCount(0);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow, '没有横向溢出').toBe(false);
    });
  }
});

test.describe('列表页页签', () => {
  test('三个页签：首页 · 文章 · 专题，默认首页；指示器是强调色', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await expect(page.locator('[role="tablist"] [role="tab"]')).toHaveText([
      '首页',
      '文章',
      '专题',
    ]);
    await expectTab(page, 'home');
    const accent = await accentColor(page);
    const [ind, txt] = await page.evaluate(() => [
      getComputedStyle(document.querySelector('.sgx-seg-ind')).backgroundColor,
      getComputedStyle(document.querySelector('[data-sgx-tab="home"]')).color,
    ]);
    expect(ind).toBe(accent);
    expect(ind).not.toBe('rgb(0, 0, 0)');
    expect(txt).not.toBe(ind);
    /* 首页面板：标题区 + 最新 3 篇 + 系列卡 */
    await expect(page.locator('[data-pane="home"] h1')).toHaveText('博客');
    await expect(page.locator('[data-pane="home"] .latest-card')).toHaveCount(3);
    await expect(page.locator('[data-pane="home"] .series-card')).toHaveCount(1);
  });

  test('点页签切换，hash 记住，刷新停在原页签', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.locator('[data-sgx-tab="posts"]').click();
    await expectTab(page, 'posts');
    await expect(page).toHaveURL(/\/#posts$/);
    expect(await page.locator('[data-pane="posts"] .note-entry').count()).toBeGreaterThan(3);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    await expectTab(page, 'posts');
    await page.locator('[data-sgx-tab="topics"]').click();
    await expectTab(page, 'topics');
    await expect(page).toHaveURL(/\/#topics$/);
    await page.locator('[data-sgx-tab="home"]').click();
    await expectTab(page, 'home');
    expect(new URL(page.url()).hash).toBe('');
  });

  test('从文章返回列表：停在原页签', async ({ page }) => {
    await page.goto('/#posts', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await expectTab(page, 'posts');
    await page.locator('[data-pane="posts"] .note-title a').first().click();
    await page.waitForURL(/\/post\//);
    await page.goBack();
    await expect(page).toHaveURL(/\/#posts$/);
    await ready(page);
    await expectTab(page, 'posts');
  });

  test('键盘：← → Home End，焦点跟着走', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.locator('[data-sgx-tab="home"]').focus();
    await page.keyboard.press('ArrowRight');
    await expectTab(page, 'posts');
    await expect(page.locator('[data-sgx-tab="posts"]')).toBeFocused();
    await page.keyboard.press('End');
    await expectTab(page, 'topics');
    await page.keyboard.press('Home');
    await expectTab(page, 'home');
    await page.keyboard.press('ArrowLeft');
    await expectTab(page, 'topics');
    /* 漫游 tabindex：只有当前页签可 Tab 进入 */
    await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  });

  test('左右滑动切换面板，指示器跟手', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ready(page);
    const y = 600;
    await page.mouse.move(340, y);
    await page.mouse.down();
    for (let x = 340; x >= 200; x -= 20) await page.mouse.move(x, y);
    const mid = await page.evaluate(() =>
      Number(
        getComputedStyle(document.querySelector('[data-sgx-seg]')).getPropertyValue('--seg-pos'),
      ),
    );
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.9);
    for (let x = 200; x >= 60; x -= 20) await page.mouse.move(x, y);
    await page.mouse.up();
    await expectTab(page, 'posts');
    await expect(page).toHaveURL(/#posts$/);
    /* 往右滑回首页 */
    await page.mouse.move(60, y);
    await page.mouse.down();
    for (let x = 60; x <= 360; x += 25) await page.mouse.move(x, y);
    await page.mouse.up();
    await expectTab(page, 'home');
    /* 首页再往右滑：到头了，留在首页 */
    await page.mouse.move(60, y);
    await page.mouse.down();
    for (let x = 60; x <= 360; x += 25) await page.mouse.move(x, y);
    await page.mouse.up();
    await expectTab(page, 'home');
  });

  test('竖向拖动不触发切换', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.mouse.move(200, 700);
    await page.mouse.down();
    await page.mouse.move(215, 500, { steps: 8 });
    await page.mouse.up();
    await expectTab(page, 'home');
  });

  test('专题：系列在最前、按篇序；点标签就地筛选，hash 可直达', async ({ page }) => {
    await page.goto('/#topics', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await expectTab(page, 'topics');
    const pane = page.locator('[data-pane="topics"]');
    await expect(pane.locator('.sgx-sec-title:visible').first()).toHaveText('系列');
    const card = pane.locator('[data-series-card]').first();
    await expect(card.locator('.series-card-name')).toHaveText('Styrigx UI 鉴权规范');
    await expect(card.locator('li a')).toHaveCount(2);
    await expect(card.locator('li a').first()).toHaveAttribute(
      'href',
      '/post/2026-10-11-key-spec-whitepaper/',
    );
    /* 标签筛选 */
    const chip = pane.locator('[data-topic-filter="tag:ai"]');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/#topics\/tag\/ai$/);
    const results = pane.locator('[data-topic-results]');
    await expect(results).toBeVisible();
    const n = await results.locator('[data-topic-post]:visible').count();
    expect(n).toBeGreaterThan(0);
    await expect(results.locator('[data-topic-results-title]')).toContainText(`${n} 篇`);
    await results.locator('[data-topic-clear]').click();
    await expect(results).toBeHidden();
    await expect(page).toHaveURL(/#topics$/);
    /* 直达 */
    await page.goto('/#topics/tag/ai', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await expectTab(page, 'topics');
    await expect(pane.locator('[data-topic-filter="tag:ai"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(results).toBeVisible();
  });

  test('文章列表里的 #标签 跳到专题筛选', async ({ page }) => {
    await page.goto('/#posts', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.locator('[data-pane="posts"] .note-meta a[href^="#topics/tag/"]').first().click();
    await expectTab(page, 'topics');
    await expect(page.locator('[data-topic-results]')).toBeVisible();
  });

  test('英文：Home · Posts · Topics', async ({ page }) => {
    await page.goto('/en/', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await expect(page.locator('[role="tab"]')).toHaveText(['Home', 'Posts', 'Topics']);
  });

  test('减弱动效：指示器 / 面板没有过渡', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ready(page);
    const d = await page.evaluate(() => [
      getComputedStyle(document.querySelector('.sgx-seg-ind')).transitionDuration,
      getComputedStyle(document.querySelector('[data-sgx-track]')).transitionDuration,
    ]);
    /* one-ui.css 的全局减弱动效规则把过渡压到 ≤ 1ms */
    for (const v of d) expect(parseFloat(v)).toBeLessThanOrEqual(0.001);
    await page.locator('[data-sgx-tab="topics"]').click();
    await expectTab(page, 'topics');
  });

  test('标签页：同样的滑块，专题高亮，点了回列表页对应页签', async ({ page }) => {
    await page.goto('/tags/ai/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.sgx-seg [aria-current="page"]')).toHaveText('专题');
    await page.locator('.sgx-seg a', { hasText: '文章' }).click();
    await expect(page).toHaveURL(/\/#posts$/);
    await ready(page);
    await expectTab(page, 'posts');
  });
});

test.describe('导航抽屉', () => {
  const drawer = (page) => page.locator('#sgx-drawer');
  async function openDrawer(page) {
    await page.locator('.sgx-tb-nav').click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page)).toHaveAttribute('data-state', 'open');
  }

  test('首页 / 书签 / 日刻 / 博客 + 设置（同主站）；博客是 tonal 当前项；毛玻璃面板，宽度同主站', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.sgx-tb-nav')).toHaveAttribute('aria-expanded', 'false');
    await openDrawer(page);
    await expect(page.locator('.sgx-tb-nav')).toHaveAttribute('aria-expanded', 'true');
    const lists = drawer(page).locator('.sgx-drawer-list');
    await expect(lists).toHaveCount(2);
    await expect(lists.nth(0).locator('.sgx-drawer-label')).toHaveText([
      '首页',
      '书签',
      '日刻',
      '博客',
    ]);
    await expect(lists.nth(1).locator('.sgx-drawer-label')).toHaveText(['设置']);
    await expect(drawer(page).locator('hr.sgx-drawer-div')).toHaveCount(1);
    await expect(drawer(page).locator('[data-nav="settings"]')).toHaveAttribute(
      'href',
      'https://styrigx.com/settings/',
    );
    await expect(drawer(page).locator('[data-nav="daymark"]')).toHaveAttribute(
      'href',
      'https://daymark.styrigx.com/',
    );
    await expect(drawer(page).locator('[data-nav="book"]')).toHaveCount(0);
    const items = drawer(page).locator('.sgx-drawer-item');
    await expect(items).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await expect(items.nth(i).locator('.sgx-drawer-ic svg')).toHaveCount(1);
    }
    await expect(drawer(page).locator('[aria-current="page"] .sgx-drawer-label')).toHaveText(
      '博客',
    );
    const st = await page.evaluate(() => {
      const probe = (v) => {
        const i = document.createElement('i');
        i.style.color = `var(${v})`;
        document.body.appendChild(i);
        const c = getComputedStyle(i).color;
        i.remove();
        return c;
      };
      const cur = getComputedStyle(document.querySelector('.sgx-drawer-item[aria-current]'));
      const sheet = getComputedStyle(document.querySelector('.sgx-drawer-sheet'));
      const head = getComputedStyle(document.querySelector('.sgx-drawer-head'));
      return {
        bg: cur.backgroundColor,
        fg: cur.color,
        tonal: probe('--sgx-nav-selected'),
        onTonal: probe('--sgx-on-nav-selected'),
        filter: sheet.backdropFilter || sheet.webkitBackdropFilter,
        font: head.fontFamily,
      };
    });
    expect(st.bg).toBe(st.tonal);
    expect(st.fg).toBe(st.onTonal);
    expect(st.filter).toContain('blur(24px)');
    expect(st.font).toMatch(/^Inter/);
    const sheet = await drawer(page).locator('.sgx-drawer-sheet').boundingBox();
    expect(Math.abs(sheet.x)).toBeLessThanOrEqual(1);
    /* 主站同一个算式：412 − 16 − 1.5 × 52 − 8 − 40 / 2 = 290（手机是悬浮滚动条；无头 Chromium 有 15px 经典滚动条槽，
       博客和主站一样只在 ≥1024px 预留 scrollbar-gutter，手机宽度不预留，所以按实际可用宽度算，412 时必须正好 290） */
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.round(sheet.width)).toBe(cw - 16 - 78 - 8 - 20);
    if (cw === 412) expect(Math.round(sheet.width)).toBe(290);
  });

  test('Esc / 点遮罩 / 点当前项 关闭', async ({ page }) => {
    await page.goto(ARTICLE, { waitUntil: 'domcontentloaded' });
    await openDrawer(page);
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();
    await expect(drawer(page)).toHaveAttribute('data-state', 'closed');
    await openDrawer(page);
    await page.mouse.click(395, 500);
    await expect(drawer(page)).toBeHidden();
    await openDrawer(page);
    await drawer(page).locator('.sgx-drawer-item', { hasText: '博客' }).click();
    await expect(drawer(page)).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${ARTICLE}$`));
    await expect(page.locator('.sgx-tb-nav')).toHaveAttribute('aria-expanded', 'false');
  });

  test('刚点开就 Esc：照样关上，之后还能再开', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.querySelector('.sgx-tb-nav').click();
      document
        .getElementById('sgx-drawer')
        .dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    await expect(drawer(page)).toBeHidden();
    await expect(drawer(page)).toHaveAttribute('data-state', 'closed');
    await openDrawer(page);
  });

  test('英文：Home / Bookmarks / Daymark / Blog / Settings', async ({ page }) => {
    await page.goto('/en/', { waitUntil: 'domcontentloaded' });
    await openDrawer(page);
    await expect(drawer(page).locator('.sgx-drawer-label')).toHaveText([
      'Home',
      'Bookmarks',
      'Daymark',
      'Blog',
      'Settings',
    ]);
    await expect(drawer(page).locator('[data-nav="settings"]')).toHaveAttribute(
      'href',
      'https://styrigx.com/en/settings/',
    );
    await expect(drawer(page).locator('[data-nav="blog"]')).toHaveAttribute('href', '/en/');
  });
});

test.describe('文章页：三页签 + 进度细线 + 抽屉目录', () => {
  test('长条只有 首页 · 文章 · 专题，文章高亮，没有标题；点页签回列表页对应页签', async ({
    page,
  }) => {
    await page.goto(ARTICLE, { waitUntil: 'domcontentloaded' });
    const seg = page.locator('.sgx-tb-pill .sgx-seg a');
    await expect(seg).toHaveText(['首页', '文章', '专题']);
    await expect(page.locator('.sgx-seg [aria-current="page"]')).toHaveText('文章');
    await expect(page.locator('.sgx-prog-title, #sgx-toc-sheet, .mobile-article-toc')).toHaveCount(
      0,
    );
    const pillText = (await page.locator('.sgx-tb-pill').innerText()).replace(/\s+/g, '');
    expect(pillText).toBe('首页文章专题');
    await seg.filter({ hasText: '专题' }).click();
    await expect(page).toHaveURL(/\/#topics$/);
    await ready(page);
    await expectTab(page, 'topics');
  });

  test('英文文章：Home · Posts · Topics，Posts 高亮，链接到 /en/', async ({ page }) => {
    await page.goto('/en' + ARTICLE, { waitUntil: 'domcontentloaded' });
    const seg = page.locator('.sgx-tb-pill .sgx-seg a');
    await expect(seg).toHaveText(['Home', 'Posts', 'Topics']);
    await expect(page.locator('.sgx-seg [aria-current="page"]')).toHaveText('Posts');
    await expect(seg.nth(1)).toHaveAttribute('href', '/en/#posts');
  });

  test('进度细线在长条底边，随滚动填满（强调色）', async ({ page }) => {
    await page.goto(ARTICLE, { waitUntil: 'domcontentloaded' });
    const bar = page.locator('[data-sgx-progress]');
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    const box = await bar.boundingBox();
    const pill = await page.locator('.sgx-tb-pill').boundingBox();
    expect(box.height).toBeLessThanOrEqual(4);
    expect(pill.y + pill.height - (box.y + box.height)).toBeLessThanOrEqual(6);
    await page.evaluate(() => {
      const el = document.querySelector('#article-start');
      const top = window.scrollY + el.getBoundingClientRect().top;
      window.scrollTo(0, top + el.offsetHeight / 2 - innerHeight / 2);
    });
    await expect
      .poll(async () => Number(await bar.getAttribute('aria-valuenow')))
      .toBeGreaterThan(20);
    expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(80);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBe(100);
    const accent = await accentColor(page);
    const fill = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('[data-sgx-progress]'), '::after').backgroundColor,
    );
    expect(fill).toBe(accent);
  });

  test('抽屉最下面是目录（h2 + 缩进 h3，在 设置 下面）；点目录项收起抽屉并滚到标题，当前节 tonal', async ({
    page,
  }) => {
    await page.goto(ARTICLE, { waitUntil: 'domcontentloaded' });
    const drawer = page.locator('#sgx-drawer');
    await page.locator('.sgx-tb-nav').click();
    await expect(drawer).toHaveAttribute('data-state', 'open');
    const toc = drawer.locator('.sgx-drawer-toc');
    await expect(toc.locator('.sgx-drawer-sub')).toHaveText('目录');
    await expect(drawer.locator('[data-nav="settings"]')).toHaveCount(1);
    const links = toc.locator('a[data-toc-link]');
    expect(await links.count()).toBeGreaterThan(2);
    const nested = toc.locator('.toc-tree-nested a[data-toc-link]');
    if ((await nested.count()) > 0) {
      const top = await links.first().boundingBox();
      const sub = await nested.first().boundingBox();
      expect(sub.x).toBeGreaterThan(top.x + 8);
    }
    const target = links.nth(2);
    const id = decodeURIComponent((await target.getAttribute('href')).slice(1));
    await target.click();
    await expect(drawer).toBeHidden();
    await expect
      .poll(() => page.evaluate((i) => document.getElementById(i).getBoundingClientRect().top, id))
      .toBeLessThan(200);
    await page.locator('.sgx-tb-nav').click();
    await expect(drawer).toHaveAttribute('data-state', 'open');
    await expect(toc.locator('a[aria-current="true"]')).toHaveCount(1);
    const cur = await page.evaluate(() => {
      const i = document.createElement('i');
      i.style.color = 'var(--sgx-nav-selected)';
      document.body.appendChild(i);
      const want = getComputedStyle(i).color;
      i.remove();
      const got = getComputedStyle(
        document.querySelector('.sgx-drawer-toc a[aria-current="true"]'),
      ).backgroundColor;
      return { want, got };
    });
    expect(cur.got).toBe(cur.want);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('非文章页：抽屉里没有目录、长条没有进度线，仍是三页签', async ({ page }) => {
    for (const path of ['/', '/tags/ai/', '/404.html']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.sgx-drawer-toc, [data-sgx-progress]')).toHaveCount(0);
      await expect(page.locator('.sgx-tb-pill .sgx-seg-btn')).toHaveText(['首页', '文章', '专题']);
    }
  });

  test('系列文章：系列小块（第 n / N 篇 + 上一篇），点系列名到专题', async ({ page }) => {
    await page.goto(SERIES_V2, { waitUntil: 'domcontentloaded' });
    const block = page.locator('.sgx-series-block');
    await expect(block).toBeVisible();
    await expect(block.locator('.sgx-series-name')).toHaveText('Styrigx UI 鉴权规范');
    await expect(block.locator('.sgx-series-pos')).toHaveText('第 2 / 2 篇');
    await expect(block.locator('a[rel="prev"]')).toHaveAttribute(
      'href',
      '/post/2026-10-11-key-spec-whitepaper/',
    );
    await expect(block.locator('a[rel="next"]')).toHaveCount(0);
    await block.locator('.sgx-series-name').click();
    await expect(page).toHaveURL(/\/#topics\/series\//);
    await ready(page);
    await expectTab(page, 'topics');
    await expect(page.locator('[data-series-card].is-target')).toHaveCount(1);
  });
});

test.describe('跟随主站设置（sgx-ui cookie）', () => {
  test('pal 换预设、accent 是自定义种子 → 指示器跟着变；accent = 预设种子时不算自定义', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const bg = () =>
      page.evaluate(() => getComputedStyle(document.querySelector('.sgx-seg-ind')).backgroundColor);
    const base = await bg();
    await setUi(context, baseURL, { v: 2, mode: 'light', pal: 'cherry', accent: '#ba1a20' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'cherry');
    const cherry = await bg();
    expect(cherry).not.toBe(base);
    await expect(page.locator('#sgx-accent-roles')).toHaveCount(0);
    await setUi(context, baseURL, { v: 2, mode: 'light', pal: 'lake', accent: '#ff8800' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#sgx-accent-roles')).toHaveCount(1);
    await expect.poll(bg).not.toBe(base);
    expect(await bg()).not.toBe(cherry);
  });

  test('lang=en：中文列表页跳英文并保留 hash；没有英文版的文章不跳', async ({
    page,
    context,
    baseURL,
  }) => {
    await setUi(context, baseURL, { v: 2, lang: 'en' });
    await page.goto('/#topics', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/en\/#topics$/);
    await page.goto('/post/2026-10-11-key-spec-whitepaper/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    expect(new URL(page.url()).pathname).toBe('/post/2026-10-11-key-spec-whitepaper/');
  });

  test('mode=dark 首帧就是深色', async ({ page, context, baseURL }) => {
    await setUi(context, baseURL, { v: 2, mode: 'dark' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
