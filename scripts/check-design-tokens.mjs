// 设计令牌一致性校验：博客的 --m-* / --glass-* 必须与主站
// styrigx-space main 分支 assets/css/input.css 的 @layer tokens 逐项一致。
// 主站是唯一来源，博客只做同步，不另维护一套。
// 用法：node scripts/check-design-tokens.mjs

const SPACE_CSS_URL =
  'https://raw.githubusercontent.com/styrigx/styrigx-space/main/assets/css/input.css';
const BLOG_CSS_PATH = new URL('../src/styles/one-ui.css', import.meta.url);

/** 提炼 @layer tokens { ... } 块（大括号配对）。 */
function extractLayerTokens(css) {
  const start = css.indexOf('@layer tokens');
  if (start === -1) throw new Error('主站 CSS 未找到 @layer tokens');
  const braceOpen = css.indexOf('{', start);
  let depth = 0;
  for (let i = braceOpen; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(braceOpen + 1, i);
    }
  }
  throw new Error('@layer tokens 大括号未配对');
}

/** 从 CSS 文本中提炼所有 --var: value; 声明（去掉注释），返回 Map。 */
function parseVars(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = new Map();
  const re = /(--[\w-]+)\s*:\s*([^;{}]+);/g;
  let m;
  while ((m = re.exec(noComments))) {
    vars.set(m[1].trim(), m[2].replace(/\s+/g, ' ').trim());
  }
  return vars;
}

/**
 * 在 @layer tokens 块内找 @supports not (...) { :root { ... } } 与
 * .dark { ... }，分别提炼浅色/深色变量。
 */
function parseSpaceTokens(layerCss) {
  // 找到 @supports not 块
  const supIdx = layerCss.indexOf('@supports not');
  if (supIdx === -1) throw new Error('主站 @layer tokens 内未找到 @supports not 回退块');
  const braceOpen = layerCss.indexOf('{', supIdx);
  let depth = 0;
  let end = -1;
  for (let i = braceOpen; i < layerCss.length; i++) {
    if (layerCss[i] === '{') depth++;
    else if (layerCss[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const supportsBlock = layerCss.slice(braceOpen + 1, end).replace(/\/\*[\s\S]*?\*\//g, '');

  // 浅色：@supports 块内的 :root { ... }（可能有多块，合并）；
  // 深色：.dark { ... }（可能有多块，合并）。
  // [data-palette=...] 覆盖不在比对范围（博客不支持调色板切换）。
  const light = new Map();
  const dark = new Map();
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = blockRe.exec(supportsBlock))) {
    const selector = m[1].trim();
    const body = m[2];
    // 跳过嵌套的 @supports/@media（它们不含直接声明，这里按最内层处理）
    if (selector.startsWith('@')) continue;
    const vars = parseVars(body);
    if (selector === ':root') {
      for (const [k, v] of vars) light.set(k, v);
    } else if (selector === '.dark') {
      for (const [k, v] of vars) dark.set(k, v);
    }
    // [data-palette=...] 覆盖不在比对范围（博客不支持调色板切换）
  }
  return { light, dark };
}

/** 提炼博客 one-ui.css 的 :root（浅色）与 :root[data-theme="dark"]（深色）。 */
function parseBlogTokens(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const light = new Map();
  const dark = new Map();
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = blockRe.exec(noComments))) {
    const selector = m[1].trim();
    const body = m[2];
    if (selector.startsWith('@')) continue;
    const vars = parseVars(body);
    // 只收 --m-* 与 --glass-*（设计令牌）；--oui-* 是博客布局常量，不在比对范围
    const tokenVars = new Map([...vars].filter(([k]) => k.startsWith('--m-') || k.startsWith('--glass-')));
    if (selector === ':root') {
      for (const [k, v] of tokenVars) light.set(k, v);
    } else if (selector.includes('[data-theme="dark"]') || selector.includes('[data-theme=\'dark\']')) {
      for (const [k, v] of tokenVars) dark.set(k, v);
    }
  }
  return { light, dark };
}

function normalize(v) {
  return v.replace(/\s+/g, ' ').replace(/,\s*/g, ',').trim();
}

const errors = [];

// 主站只比对博客实际使用的那批 token：取交集比对值，博客多出的 --m-* 报错，
// 主站有而博客没有的 --m-* 只警告（博客可能用不到全部）。
const res = await fetch(SPACE_CSS_URL);
if (!res.ok) throw new Error(`拉取主站 CSS 失败：HTTP ${res.status}`);
const spaceCss = await res.text();
const spaceLayer = extractLayerTokens(spaceCss);
const space = parseSpaceTokens(spaceLayer);

const { readFileSync } = await import('node:fs');
const blogCss = readFileSync(BLOG_CSS_PATH, 'utf8');
const blog = parseBlogTokens(blogCss);

for (const mode of ['light', 'dark']) {
  const sVars = space[mode];
  const bVars = blog[mode];
  for (const [name, bVal] of bVars) {
    const sVal = sVars.get(name);
    if (sVal === undefined) {
      errors.push(`[${mode}] 博客多出主站没有的 ${name}（主站改名或博客手写）`);
    } else if (normalize(sVal) !== normalize(bVal)) {
      errors.push(`[${mode}] ${name} 不一致\n  主站: ${normalize(sVal)}\n  博客: ${normalize(bVal)}`);
    }
  }
  // 主站有、博客没有的：只提示，不失败（博客可能用不到全部 token）
  const missing = [...sVars.keys()].filter(
    (k) => (k.startsWith('--m-') || k.startsWith('--glass-')) && !bVars.has(k),
  );
  if (missing.length > 0) {
    console.log(`[${mode}] 提示：主站有、博客未同步 ${missing.length} 个 token（${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}）`);
  }
  console.log(`[${mode}] 比对 ${bVars.size} 个 token`);
}

if (errors.length > 0) {
  console.error('\n设计令牌不一致（共 %d 处）：', errors.length);
  for (const e of errors) console.error(' - ' + e.replace(/\n/g, '\n   '));
  console.error('\n主站是唯一来源：请从主站同步值，不要在博客手写近似色。');
  process.exit(1);
}
console.log('\nOK：设计令牌与主站一致。');
