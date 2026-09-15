export type ItemCategory = 'fixed_assets' | 'consumables' | 'activity';
export type BorrowStatus = 'borrowed' | 'returned' | 'overdue' | 'ignored';
export type UserRole = 'admin' | 'user' | null;

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  fixed_assets: '固定资产类',
  consumables: '低值易耗办公类',
  activity: '活动专项物资类',
};

export const CATEGORY_COLORS: Record<ItemCategory, string> = {
  fixed_assets: '#0EA5E9',
  consumables: '#6366F1',
  activity: '#F59E0B',
};

export const STATUS_LABELS: Record<BorrowStatus, string> = {
  borrowed: '借出中',
  returned: '已归还',
  overdue: '已逾期',
  ignored: '已忽略',
};

export const STATUS_COLORS: Record<BorrowStatus, string> = {
  borrowed: '#0EA5E9',
  returned: '#10B981',
  overdue: '#EF4444',
  ignored: '#94A3B8',
};

export interface Item {
  id: string;
  name: string;
  code: string;
  category: ItemCategory;
  quantity: number;
  availableQty: number;
  location: string;
  photo?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BorrowRecord {
  id: string;
  /** 关联的库存物品 ID。钉钉同步过来但尚未匹配的记录为 null */
  itemId: string | null;
  itemName: string;
  borrowerName: string;
  borrowerId: string;
  phone: string;
  department: string;
  purpose: string;
  quantity: number;
  borrowDate: string;
  expectedReturnDate: string;
  actualReturnDate?: string;
  status: BorrowStatus;
  damagedQty?: number;
  damagedNote?: string;
  /** 来源钉钉的审批实例 ID；手工录入的记录为空 */
  dingtalkInstanceId?: string;
  /** 被管理员忽略的时间。有值即表示这条已从「待关联」移走，可撤销 */
  ignoredAt?: string;
}

export interface StatData {
  total: number;
  available: number;
  borrowed: number;
  overdue: number;
}

export interface CategoryStat {
  category: ItemCategory;
  label: string;
  count: number;
}

export interface MonthlyStat {
  month: string;
  count: number;
}
