/**
 * 首页大卡选择逻辑测试。
 * 规则：显式 featured 优先；否则取最新一篇非 superseded；被取代的旧版本不上大卡。
 * 同日文章按 id 降序保证确定性。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 直接内联实现做白盒测试（避免 astro 运行时依赖）
function compareIdDesc(a, b) {
  const verRe = /-v(\d+)(\.[^.]+)?$/;
  const ma = a.match(verRe);
  const mb = b.match(verRe);
  const va = ma ? parseInt(ma[1], 10) : 0;
  const vb = mb ? parseInt(mb[1], 10) : 0;
  if (va !== vb) return vb - va;
  return b < a ? -1 : b > a ? 1 : 0;
}

function sortByDateDesc(entries) {
  return [...entries].sort((a, b) => {
    const dateDelta = b.data.date.valueOf() - a.data.date.valueOf();
    if (dateDelta !== 0) return dateDelta;
    return compareIdDesc(a.id, b.id);
  });
}

function selectHeroPost(latest) {
  const candidates = latest.filter((p) => !p.data.superseded);
  return candidates.find((p) => p.data.featured) ?? candidates[0];
}

const mk = (id, date, extra = {}) => ({ id, data: { date: new Date(date), ...extra } });

describe('selectHeroPost', () => {
  it('跳过 superseded，选最新一篇非取代版本', () => {
    const posts = [
      mk('2026-10-11-whitepaper.md', '2026-10-11', { superseded: true }),
      mk('2026-10-11-whitepaper-v2.md', '2026-10-11'),
      mk('2026-10-10-older.md', '2026-10-10'),
    ];
    const sorted = sortByDateDesc(posts);
    const hero = selectHeroPost(sorted.slice(0, 3));
    assert.equal(hero.id, '2026-10-11-whitepaper-v2.md');
  });

  it('显式 featured 优先于日期', () => {
    const posts = [
      mk('2026-10-12-new.md', '2026-10-12'),
      mk('2026-10-11-old.md', '2026-10-11', { featured: true }),
    ];
    const sorted = sortByDateDesc(posts);
    const hero = selectHeroPost(sorted.slice(0, 3));
    assert.equal(hero.id, '2026-10-11-old.md');
  });

  it('同日按 id 降序（v2 文件名大于 v1）', () => {
    const posts = [
      mk('2026-10-11-a-whitepaper.md', '2026-10-11'),
      mk('2026-10-11-a-whitepaper-v2.md', '2026-10-11'),
    ];
    const sorted = sortByDateDesc(posts);
    assert.equal(sorted[0].id, '2026-10-11-a-whitepaper-v2.md');
  });

  it('全部 superseded 时返回 undefined（不崩）', () => {
    const posts = [mk('2026-10-11-x.md', '2026-10-11', { superseded: true })];
    assert.equal(selectHeroPost(posts), undefined);
  });
});

describe('导航去重（site.toml）', () => {
  it('中英文导航均无重复 label', () => {
    const toml = readFileSync(new URL('../src/config/site.toml', import.meta.url), 'utf8');
    for (const section of ['topNav.links', 'topNav.en.links']) {
      // 简单提炼该 section 下的 label
      const labels = [];
      const lines = toml.split('\n');
      let inSection = false;
      // [[config.topNav.links]] / [[config.topNav.en.links]]
      const marker = section === 'topNav.links' ? '[[config.topNav.links]]' : '[[config.topNav.en.links]]';
      for (const line of lines) {
        if (line.trim() === marker) {
          inSection = true;
          continue;
        }
        if (line.trim().startsWith('[[') || line.trim().startsWith('[')) {
          inSection = false;
          continue;
        }
        if (inSection) {
          const m = line.match(/^label\s*=\s*"(.+)"$/);
          if (m) labels.push(m[1]);
        }
      }
      const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
      assert.deepEqual(dupes, [], `${section} 有重复 label: ${dupes.join(',')}`);
    }
  });
});
