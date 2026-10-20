// @ts-check

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { parse } from 'smol-toml';

import tailwindcss from '@tailwindcss/vite';

import navfolioConfig from './navfolio.config';
import { getAstroPluginConfig } from './src/plugins/config';

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const siteToml = parse(fs.readFileSync(new URL('./src/config/site.toml', import.meta.url), 'utf8'));
const configToml = isRecord(siteToml.config) ? siteToml.config : {};
const siteConfig = isRecord(configToml.site) ? configToml.site : {};
const mathConfig = isRecord(configToml.math) ? configToml.math : {};
const configuredSiteUrl = siteConfig.url;
const configuredMathRenderer = mathConfig.render;
const mathRenderer = configuredMathRenderer === 'mathjax' ? 'mathjax' : 'katex';
const astroPluginConfig = getAstroPluginConfig(navfolioConfig, { mathRenderer });
/**
 * @param {unknown} value
 */
const normalizeSiteUrl = (value) => {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const customSite = process.env.SITE_URL;
const customBase = process.env.SITE_BASE;

const resolvedSite =
  normalizeSiteUrl(customSite) || normalizeSiteUrl(configuredSiteUrl) || 'https://blog.styrigx.com';

const resolvedBase = customBase || '/';

// https://astro.build/config
export default defineConfig({
  site: resolvedSite,
  base: resolvedBase,
  // Keep Hugo-style trailing slashes (/post/<slug>/). Giscus binds comments
  // by pathname, so the slash must match the old Hugo URLs exactly.
  trailingSlash: 'always',
  // 2026-10 简化：原首页删除，/ 即文章列表；旧归档地址跳回列表
  // 2026-10-20 沉浸式 app：「关于」页删除（个人信息在主站），旧地址跳回列表
  redirects: {
    '/archives': '/',
    '/en/archives': '/en/',
    '/about': '/',
    '/en/about': '/en/',
  },
  markdown: {
    remarkPlugins: astroPluginConfig.remarkPlugins,
    rehypePlugins: astroPluginConfig.rehypePlugins,
  },
  integrations: [...astroPluginConfig.integrations, mdx(), sitemap()],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        'virtual:navfolio/page-runtime': fileURLToPath(
          new URL('./src/modules/page-runtime.ts', import.meta.url),
        ),
      },
    },
    build: {
      // ?url 引入的脚本不内联为 data URI，输出带内容哈希的独立文件（避免部署后跑旧脚本）
      assetsInlineLimit: 0,
    },
  },
});
