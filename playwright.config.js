import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.BLOG_PORT || 4321);

/* 端到端测试：先 npm run build（web/public/），这里起一个模拟 Cloudflare Pages 的静态服务器。
   blog-visual.spec.js 是视觉回归（基线只在 CI 生成：update-snapshots.yml）；其余是行为测试。 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
    },
  },
  use: {
    baseURL: process.env.BLOG_BASE_URL || `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: process.env.BLOG_BASE_URL
    ? undefined
    : {
        command: `node scripts/serve-static.mjs web/public ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 30000,
      },
  projects: [
    { name: 'mobile-light', use: { viewport: { width: 390, height: 844 }, colorScheme: 'light' } },
    { name: 'mobile-dark', use: { viewport: { width: 390, height: 844 }, colorScheme: 'dark' } },
    { name: 'desktop-light', use: { viewport: { width: 1200, height: 800 }, colorScheme: 'light' } },
    { name: 'desktop-dark', use: { viewport: { width: 1200, height: 800 }, colorScheme: 'dark' } },
  ],
});
