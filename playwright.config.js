import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  timeout: 60000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
    },
  },
  use: {
    baseURL: process.env.BLOG_BASE_URL || 'http://localhost:4321',
    trace: 'retain-on-failure',
  },
  webServer: process.env.BLOG_BASE_URL
    ? undefined
    : {
        command: 'npx astro preview --port 4321',
        url: 'http://localhost:4321',
        reuseExistingServer: true,
        timeout: 120000,
      },
  projects: [
    { name: 'mobile-light', use: { viewport: { width: 390, height: 844 }, colorScheme: 'light' } },
    { name: 'mobile-dark', use: { viewport: { width: 390, height: 844 }, colorScheme: 'dark' } },
    { name: 'desktop-light', use: { viewport: { width: 1200, height: 800 }, colorScheme: 'light' } },
    { name: 'desktop-dark', use: { viewport: { width: 1200, height: 800 }, colorScheme: 'dark' } },
  ],
});
