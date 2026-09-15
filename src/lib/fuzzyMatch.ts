/**
 * 中文物品名称的模糊匹配。
 *
 * 用途：钉钉审批里填的物品名称常常跟库存里叫法不一样
 * （实测借的是「院旗」，而库存里根本没有这件东西），
 * 需要根据名称给出最可能的库存候选，让人点一下就能关联，
 * 而不是在一长串下拉框里翻。
 *
 * 纯前端小工具，不引第三方库 —— 中文场景下二元组 Dice 系数
 * 配合单字重合度已经够用，而且没有额外体积。
 */

/** 去掉所有空白字符并转小写，用于比较 */
export function normalizeName(s: string): string {
  return (s || '').replace(/\s+/g, '').toLowerCase();
}

/** 字符二元组集合 —— 中文按字切、英文按字母切都能用 */
function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  if (s.length <= 1) {
    if (s) set.add(s);
    return set;
  }
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/**
 * 两个名称的相似度，范围 0~1。
 *
 * - 1.0：完全相同
 * - 0.7 以上：一方包含另一方（越接近越像）
 * - 其余：取「二元组 Dice 系数」与「单字重合度」中的较高者
 *
 * 单字重合度对中文短名很关键 —— 「院旗」和「水院徽章」共享一个「院」字，
 * 二元组完全对不上，但单字层面能看出一点关联。
 */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  if (longer.includes(shorter)) {
    return 0.7 + 0.3 * (shorter.length / longer.length);
  }

  const A = bigrams(x);
  const B = bigrams(y);
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  const dice = (2 * shared) / (A.size + B.size);

  const charsA = new Set(x);
  const charsB = new Set(y);
  let charShared = 0;
  for (const c of charsA) if (charsB.has(c)) charShared++;
  const charScore = (2 * charShared) / (charsA.size + charsB.size);

  return Math.max(dice, charScore * 0.9);
}

export interface Candidate<T> {
  item: T;
  score: number;
}

/**
 * 从库存里挑出跟给定名称最像的几件，按相似度降序。
 *
 * 只返回达到 minScore 的。都不像时返回空数组 ——
 * 宁可不推荐，也不要硬凑一个错的让人顺手点下去。
 *
 * 阈值定在 0.35 是有实测依据的：0.30 附近正好是「单字碰巧相同」的噪声区，
 * 实测「院旗」会推荐出「水院徽章」、「桌子」会推荐出「木头凳子」——
 * 都是只共用一个字，毫无关系。关联错了库存就乱了，这种提示不如不给。
 */
export function suggestByName<T extends { name: string }>(
  rawName: string,
  items: T[],
  limit = 3,
  minScore = 0.35,
): Candidate<T>[] {
  return items
    .map((item) => ({ item, score: nameSimilarity(rawName, item.name) }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 相似度对应的措辞，用于界面提示 */
export function confidenceLabel(score: number): { text: string; color: string } {
  if (score >= 0.85) return { text: '很像', color: 'success' };
  if (score >= 0.6) return { text: '可能', color: 'processing' };
  return { text: '勉强', color: 'warning' };
}

/** 搜索框的容错判断：直接包含，或者相似度够高 */
export function fuzzyMatches(query: string, target: string, threshold = 0.5): boolean {
  const q = normalizeName(query);
  if (!q) return true;
  if (normalizeName(target).includes(q)) return true;
  return nameSimilarity(target, query) >= threshold;
}
