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
    await page.goto(path, { waitUntil: 'networkidle' });
    // 等字体与图片稳定
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.oui-home, .oui-article-wrap, .oui-archive-wrap, .oui-notfound').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: false });
  });
}

test('search dialog baseline screenshot', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('navfolio-theme');
    } catch {}
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // 打开搜索弹窗
  const trigger = page.locator('[data-site-search-trigger]').first();
  await trigger.click();
  await page.waitForSelector('[data-site-search-dialog]', { state: 'visible' });
  await page.locator('[data-site-search-input]').waitFor({ state: 'visible' });
  await expect(page).toHaveScreenshot('search-dialog.png', { fullPage: false });
});
