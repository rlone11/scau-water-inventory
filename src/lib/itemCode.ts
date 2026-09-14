/**
 * 物品编号计算 —— 纯逻辑模块，无副作用、无外部依赖。
 *
 * 编号规则：全局流水号，三位零填充（001、002 … 013、014）。
 * 仅识别纯数字编号；用户手打的非数字编号（如 "ABC"）不参与计算。
 * 删除物品后编号不补位 —— 编号只增不减，历史记录中提到的编号永远指向同一件物品。
 */

/**
 * 从现有编号列表中计算下一个可用编号。
 *
 * 边界行为：
 * - 传入空数组或无任何纯数字编号 → 返回 '001'
 * - 传入 ['001' … '013'] → 返回 '014'
 * - 最大值超过 999（如 '1000'）→ 返回 '1001'（padStart 只补不截）
 *
 * @param existingCodes 数据库中现有的全部编号
 * @returns 下一个可用的三位零填充编号
 */
export function nextCode(existingCodes: string[]): string {
  let max = 0;
  for (const raw of existingCodes) {
    const code = raw.trim();
    if (!/^\d+$/.test(code)) continue;
    const n = Number(code);
    if (n > max) max = n;
  }
  return String(max + 1).padStart(3, '0');
}
