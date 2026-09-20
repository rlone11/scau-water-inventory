export type ItemCategory = 'fixed_assets' | 'consumables' | 'activity';
export type BorrowStatus = 'borrowed' | 'returned' | 'overdue' | 'ignored' | 'consumed';
/**
 * 网站身份。三态，来源见 src/contexts/AuthContext.tsx：
 *   admin    管理员 —— 钉钉登录且 staff_roles.role = 'admin'，全权限
 *   internal 学院内部人员 —— 钉钉登录但不在管理员名单，与访客同权
 *   guest    访客 —— 外部借用人，无 Supabase 会话，只能看库存 + 借东西
 *
 * ⚠️ 渲染菜单/按钮时必须穷尽三态（switch + never 兜底），
 * 不要写成 `isAdmin ? A : B` —— 二元判断套多态状态必然漏 case，
 * 本项目已经因此把「已忽略」渲染成「已还」过一次。
 */
export type ScauRole = 'admin' | 'internal' | 'guest';

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
  consumed: '已消耗',
};

export const STATUS_COLORS: Record<BorrowStatus, string> = {
  borrowed: '#0EA5E9',
  returned: '#10B981',
  overdue: '#EF4444',
  ignored: '#94A3B8',
  consumed: '#8B5CF6',
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
  /**
   * 未回到库存的件数 —— 消耗掉或损坏报废的部分。
   * 等于 quantity 时整条记录为「已消耗」，否则仍是「已归还」+ 这个标签。
   *
   * ⚠️ 数据库列仍叫 `damaged_qty`（历史命名，未做迁移），
   * 与 `damaged_note` 的对应关系集中在 recordService 的 rowToRecord/recordToRow 里。
   */
  consumedQty?: number;
  /** 消耗/损坏说明 */
  consumedNote?: string;
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
