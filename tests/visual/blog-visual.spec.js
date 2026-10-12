import { test, expect } from '@playwright/test';

// One UI 视觉基线：每个页面 × 浅色/深色 × 手机 390×844 / 桌面 1200px。
// 基线图提交在 tests/visual/baseline/，CI 用同版本 Chromium 对比。

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'home-en', path: '/en/' },
  { name: 'article', path: '/post/2026-10-07-muse-playbook/' },
  { name: 'article-en', path: '/en/post/2026-10-07-muse-playbook/' },
  { name: 'archive', path: '/archives' },
  { name: 'archive-en', path: '/en/archives' },
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
    await page.locator('.oui-home, .oui-article-wrap, .oui-archive-wrap, .oui-notfound').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
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
  await page.evaluate(() => Promise.all(
    Array.from(document.images).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })
    )
  ));
  // 打开搜索弹窗
  const trigger = page.locator('[data-site-search-trigger]').first();
  await trigger.click();
  await page.waitForSelector('[data-site-search-dialog]', { state: 'visible' });
  await page.locator('[data-site-search-input]').waitFor({ state: 'visible' });
  // 等搜索就绪（状态文本从加载中变为 idle）
  await page.waitForFunction(() => {
    const status = document.querySelector('[data-site-search-status]');
    return status && !/加载|loading/i.test(status.textContent || '');
  }, { timeout: 10000 }).catch(() => {});
  await expect(page).toHaveScreenshot('search-dialog.png', { fullPage: false });
});
