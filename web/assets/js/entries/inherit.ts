// 跟随主站设置的「模块」那一半（原 SgxInherit.astro 的 <script>）：
// 1. 自定义主题色没有缓存（第一次来 / 主站换了颜色 / 引擎升级）：按需加载共享外壳的引擎，算好插上并缓存；
//    首帧前的同步部分在 layouts/partials/sgx-inherit.html（内联脚本）。
// 2. 数字健康：文章页记 post:<slug>（标题取 h1，3 分钟没操作才停表），其他页记 blog，上报主站 /api/wellbeing。
// 引擎地址和版本号由模板经 js.Build params 传进来（引擎单独打包，只在需要时 import）。
import * as params from '@params';
import { initWbTrack } from '../blog/wb-track.js';

const { schemeVersion, schemeUrl } = params as unknown as { schemeVersion: string; schemeUrl: string };

async function ensureSeedRoles() {
  const root = document.documentElement;
  const seed = root.dataset.sgxSeed;
  if (!seed) return;
  const head = schemeVersion + '|' + seed + '\n';
  let c = '';
  try {
    c = localStorage.getItem('sgx-shell-accent-css') || '';
  } catch {}
  if (c.indexOf(head) === 0 && document.getElementById('sgx-accent-roles')) return;
  const { rolesCss } = await import(/* @vite-ignore */ schemeUrl);
  if (root.dataset.sgxSeed !== seed) return;
  const css = rolesCss(seed);
  try {
    localStorage.setItem('sgx-shell-accent-css', head + css);
  } catch {}
  let el = document.getElementById('sgx-accent-roles');
  if (!el) {
    el = document.createElement('style');
    el.id = 'sgx-accent-roles';
    document.head.appendChild(el);
  }
  el.textContent = css;
}

const ENDPOINT = 'https://styrigx.com/api/wellbeing';

function start() {
  const p = location.pathname.replace(/^\/en(?=\/)/, '');
  const m = p.match(/^\/post\/([A-Za-z0-9_\-.%]{1,80})\/?$/);
  if (m) {
    initWbTrack({
      key: 'post:' + m[1],
      title: () => (document.querySelector('main h1')?.textContent || document.title || '').trim(),
      endpoint: ENDPOINT,
      idleMs: 180000,
    });
  } else {
    initWbTrack({ key: 'blog', endpoint: ENDPOINT });
  }
}

start();
void ensureSeedRoles();
