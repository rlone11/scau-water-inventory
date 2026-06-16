import * as XLSX from 'xlsx';
import type { BorrowRecord, Item, ItemCategory } from '../types';
import { STATUS_LABELS, CATEGORY_LABELS } from '../types';

export function exportRecordsToExcel(records: BorrowRecord[]): void {
  const data = records.map((r) => ({
    '物品名称': r.itemName,
    '借用人': r.borrowerName,
    '学号/工号': r.borrowerId,
    '手机号': r.phone,
    '班级/部门': r.department,
    '借用用途': r.purpose,
    '借用数量': r.quantity,
    '借出日期': r.borrowDate.slice(0, 10),
    '预计归还': r.expectedReturnDate.slice(0, 10),
    '实际归还': r.actualReturnDate ? r.actualReturnDate.slice(0, 10) : '-',
    '状态': STATUS_LABELS[r.status],
    '损坏/消耗数量': r.damagedQty && r.damagedQty > 0 ? r.damagedQty : '-',
  }));

  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 13 },
    { wch: 14 }, { wch: 20 }, { wch: 8 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '借记记录');
  XLSX.writeFile(wb, `借用记录_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportItemsToExcel(items: Item[]): void {
  const data = items.map((item) => ({
    '编号': item.code,
    '名称': item.name,
    '分类': CATEGORY_LABELS[item.category],
    '总数': item.quantity,
    '可借数量': item.availableQty,
    '已借出': item.quantity - item.availableQty,
    '存放位置': item.location,
    '备注': item.notes || '',
    '创建时间': item.createdAt.slice(0, 10),
    '更新时间': item.updatedAt.slice(0, 10),
  }));

  const ws = XLSX.utils.json_to_sheet(data);

  // 设置列宽
  ws['!cols'] = [
    { wch: 14 },  // 编号
    { wch: 20 },  // 名称
    { wch: 16 },  // 分类
    { wch: 8 },   // 总数
    { wch: 10 },  // 可借数量
    { wch: 8 },   // 已借出
    { wch: 16 },  // 存放位置
    { wch: 24 },  // 备注
    { wch: 12 },  // 创建时间
    { wch: 12 },  // 更新时间
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '物品清单');
  XLSX.writeFile(wb, `物品清单_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
