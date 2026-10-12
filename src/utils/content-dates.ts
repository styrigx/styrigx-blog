export interface DatedContentEntry {
  id: string;
  data: {
    date: Date;
  };
}

export interface StickyContentEntry {
  data: {
    sticky?: boolean | number;
  };
}

/** 同日 tiebreak：按 id 降序，但 -vN 后缀按数字比（v2 > v1），保证确定性。 */
function compareIdDesc(a: string, b: string): number {
  const verRe = /-v(\d+)(\.[^.]+)?$/;
  const ma = a.match(verRe);
  const mb = b.match(verRe);
  const va = ma ? parseInt(ma[1], 10) : 0;
  const vb = mb ? parseInt(mb[1], 10) : 0;
  if (va !== vb) return vb - va;
  return b < a ? -1 : b > a ? 1 : 0;
}

export function sortByDateDesc<T extends DatedContentEntry>(entries: T[]) {
  return [...entries].sort((a, b) => {
    const dateDelta = b.data.date.valueOf() - a.data.date.valueOf();
    if (dateDelta !== 0) return dateDelta;
    return compareIdDesc(a.id, b.id);
  });
}

export interface HeroCandidate {
  id: string;
  data: {
    featured?: boolean;
    superseded?: boolean;
  };
}

/**
 * 首页大卡选择：显式 featured 优先（取最新一篇），否则取最新一篇
 * 非 superseded 文章；被取代的旧版本不上大卡。
 */
export function selectHeroPost<T extends HeroCandidate>(latest: T[]): T | undefined {
  const candidates = latest.filter((p) => !p.data.superseded);
  return candidates.find((p) => p.data.featured) ?? candidates[0];
}

export function getStickyPriority(entry: StickyContentEntry) {
  const sticky = entry?.data?.sticky;
  if (sticky === true) {
    return 1;
  }

  if (typeof sticky === 'number' && sticky > 0) {
    return sticky;
  }

  return 0;
}

export function isStickyEntry(entry: StickyContentEntry) {
  return getStickyPriority(entry) > 0;
}

export function sortBlogPostsForArchive<T extends DatedContentEntry & StickyContentEntry>(
  entries: T[],
) {
  return [...entries].sort((a, b) => {
    const priorityDelta = getStickyPriority(b) - getStickyPriority(a);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const dateDelta = b.data.date.valueOf() - a.data.date.valueOf();

    if (dateDelta !== 0) {
      return dateDelta;
    }

    return a.id.localeCompare(b.id);
  });
}
