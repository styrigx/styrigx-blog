// 生成 src/styles/accent.css：sgx-ui cookie 的 accent=<色板 id> 时，只把强调色（--sgx-accent / --sgx-on-accent）
// 换成那个色板的 primary / on-primary（浅色、深色各一组），其余 token 仍跟 pal。
// 色值来源：src/styles/palettes.css（主站同步）+ one-ui.css 的 lake 默认块。改了色板后重跑：
//   node scripts/gen-accent-css.mjs
// tests/accent.test.mjs 会校验生成结果与色板一致，防止漂移。
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

export function extractAccents() {
  const pal = read('src/styles/palettes.css');
  const oui = read('src/styles/one-ui.css');
  const out = {};
  const grab = (block) => ({
    a: block.match(/--m-primary:\s*([^;]+);/)[1].trim(),
    on: block.match(/--m-on-primary:\s*([^;]+);/)[1].trim(),
  });
  const rootBlock = oui.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
  const darkBlock = oui.match(/:root\[data-theme="dark"\],\s*:root\.dark\s*\{([\s\S]*?)\n\}/)[1];
  out.lake = { light: grab(rootBlock), dark: grab(darkBlock) };
  for (const m of pal.matchAll(/:root\[data-palette='([a-z]+)'\]\s*\{([\s\S]*?)\n\}/g)) {
    out[m[1]] = { ...(out[m[1]] || {}), light: grab(m[2]) };
  }
  for (const m of pal.matchAll(
    /:root\[data-theme='dark'\]\[data-palette='([a-z]+)'\],\s*:root\.dark\[data-palette='[a-z]+'\]\s*\{([\s\S]*?)\n\}/g,
  )) {
    out[m[1]] = { ...(out[m[1]] || {}), dark: grab(m[2]) };
  }
  return out;
}

export function renderAccentCss(acc = extractAccents()) {
  let css =
    '/* 由 scripts/gen-accent-css.mjs 生成，勿手改。强调色：滑块指示器 / 阅读进度 / 抽屉当前项 / 选中筛选。\n' +
    '   默认跟调色板（--m-primary）；sgx-ui cookie 的 accent 可单独覆盖（色板 id → data-accent，#rrggbb → 内联变量）。 */\n' +
    ':root {\n  --sgx-accent: var(--m-primary);\n  --sgx-on-accent: var(--m-on-primary);\n}\n';
  for (const [id, v] of Object.entries(acc)) {
    if (!v.light || !v.dark) continue;
    css += `:root[data-accent='${id}'] {\n  --sgx-accent: ${v.light.a};\n  --sgx-on-accent: ${v.light.on};\n}\n`;
    css += `:root[data-theme='dark'][data-accent='${id}'],\n:root.dark[data-accent='${id}'] {\n  --sgx-accent: ${v.dark.a};\n  --sgx-on-accent: ${v.dark.on};\n}\n`;
  }
  return css;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL('../src/styles/accent.css', import.meta.url), renderAccentCss());
  console.log('wrote src/styles/accent.css');
}
