/**
 * 存放位置快捷选项与最近使用记忆。
 *
 * - QUICK_LOCATIONS 为固定常量，新增存放地点只需修改这一行
 * - 最近使用记录存于 localStorage，按用户实际保存的完整位置值记录
 * - 所有 localStorage 操作均包裹 try/catch：无痕模式等场景下静默降级，不影响录入主流程
 */

/** 固定快捷选项。新增存放地点只需在此数组追加。 */
export const QUICK_LOCATIONS = ['综合楼304', '综合楼302'] as const;

const STORAGE_KEY = 'scau_inventory_recent_locations';
const MAX_RECENT = 4;

/**
 * 读取最近使用过的存放位置，最新的排在最前。
 *
 * @returns 最近使用的存放位置数组；读取失败或数据损坏时返回空数组
 */
export function getRecentLocations(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/**
 * 记录一个存放位置。已存在则移到最前，最多保留 MAX_RECENT 个。
 *
 * @param location 用户实际保存成功的完整位置值
 */
export function rememberLocation(location: string): void {
  const value = location.trim();
  if (!value) return;
  try {
    const others = getRecentLocations().filter((v) => v !== value);
    const next = [value, ...others].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage 不可用 —— 静默降级
  }
}
