import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Button, Select, Empty, Spin, Typography, Tag, Space, message,
  Tooltip, Collapse,
} from 'antd';
import {
  SyncOutlined, LinkOutlined, ExclamationCircleOutlined, CheckCircleOutlined,
  StopOutlined, UndoOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import {
  fetchPendingMatches,
  fetchIgnoredMatches,
  fetchSyncStatus,
  linkRecordToItem,
  ignoreRecord,
  restoreRecord,
  triggerSync,
  type SyncStatus,
} from '../services/dingtalkService';
import { suggestByName, confidenceLabel, fuzzyMatches } from '../lib/fuzzyMatch';
import { useAuth } from '../contexts/AuthContext';
import { useItems } from '../hooks/useItems';
import ParticleCelebration from '../components/ParticleCelebration';
import type { BorrowRecord, Item } from '../types';

const { Title, Text } = Typography;

/** 平滑的 ease-out，与其他页面一致 */
const EASE_SMOOTH: [number, number, number, number] = [0.22, 1, 0.36, 1];

const SECTION = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_SMOOTH } },
};

/** 超过这个时长没同步过，就认为可能出问题了 */
const STALE_THRESHOLD_MIN = 30;
/** 页面开着时的静默重拉间隔。服务端有 60 秒节流，不会真的这么频繁地打钉钉接口。 */
const PAGE_REFRESH_MS = 10 * 60 * 1000;

const AMBER = {
  border: '#FEF3C7',
  bg: '#FFFBEB',
  strong: '#92400E',
  text: '#D97706',
};

/** "3 分钟前" 这种相对时间 —— 不引 dayjs 插件，手算更省 */
function relativeTime(iso: string): string {
  const mins = dayjs().diff(dayjs(iso), 'minute');
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default function DingTalkPage() {
  const { isAdmin } = useAuth();
  const { items } = useItems();

  const [pending, setPending] = useState<BorrowRecord[]>([]);
  const [ignored, setIgnored] = useState<BorrowRecord[]>([]);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  /** 每条待关联记录当前在下拉框里选了哪个物品 */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  /** silent = 后台静默刷新，不显示整页 loading */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // 打开页面先同步一次 —— 页面上没有同步按钮，同步在这里悄悄完成。
      // 失败不阻塞渲染（函数可能还没部署，或临时网络问题）；
      // 失败原因会由 Edge Function 写进 dingtalk_sync_status，下面状态卡会显示出来。
      await triggerSync().catch(() => { /* 见上 */ });

      const [list, ign, st] = await Promise.all([
        fetchPendingMatches(),
        fetchIgnoredMatches(),
        fetchSyncStatus(),
      ]);
      setPending(list);
      setIgnored(ign);
      setStatus(st);
    } catch {
      if (!silent) message.error('加载失败，请稍后重试');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 页面开着时定期静默重拉，跟上后台数据变化
  useEffect(() => {
    const timer = setInterval(() => load(true), PAGE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const itemOptions = useMemo(
    () => items.map((i) => ({
      value: i.id,
      label: `${i.code} ${i.name}`,
      name: i.name,
      code: i.code,
    })),
    [items],
  );

  /** 每条待关联记录的推荐候选，按钉钉里的名称算出来的 */
  const suggestions = useMemo(() => {
    const map: Record<string, ReturnType<typeof suggestByName<Item>>> = {};
    for (const rec of pending) map[rec.id] = suggestByName(rec.itemName, items);
    return map;
  }, [pending, items]);

  const pickItem = (recordId: string, itemId: string) => {
    setPicked((prev) => ({ ...prev, [recordId]: itemId }));
  };

  const handleLink = async (record: BorrowRecord) => {
    const itemId = picked[record.id];
    if (!itemId) {
      message.warning('请先选择要关联的物品');
      return;
    }

    const item = items.find((i) => i.id === itemId);
    setBusyId(record.id);
    try {
      await linkRecordToItem(record.id, itemId, record.quantity);
      message.success(`已关联到「${item?.name ?? '物品'}」，可借数量已扣减 ${record.quantity}`);
      setPending((prev) => prev.filter((r) => r.id !== record.id));
      setShowCelebration(true);
    } catch {
      message.error('关联失败，请重试');
    } finally {
      setBusyId(null);
    }
  };

  const handleIgnore = async (record: BorrowRecord) => {
    setBusyId(record.id);
    try {
      await ignoreRecord(record.id);
      message.success(`已忽略「${record.itemName}」，可在下方「已忽略」里恢复`);
      setPending((prev) => prev.filter((r) => r.id !== record.id));
      setIgnored((prev) => [{ ...record, ignoredAt: new Date().toISOString() }, ...prev]);
    } catch {
      message.error('忽略失败，请重试');
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (record: BorrowRecord) => {
    setBusyId(record.id);
    try {
      await restoreRecord(record.id);
      message.success(`「${record.itemName}」已恢复为待关联`);
      setIgnored((prev) => prev.filter((r) => r.id !== record.id));
      setPending((prev) => [{ ...record, ignoredAt: undefined }, ...prev]);
    } catch {
      message.error('恢复失败，请重试');
    } finally {
      setBusyId(null);
    }
  };

  // 仅管理员可见 —— 待关联记录里含姓名和电话
  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Title level={4} type="secondary">仅管理员可查看</Title>
      </div>
    );
  }

  const failed = !!status?.lastResult?.startsWith('失败');
  const staleMins = status?.lastSyncAt ? dayjs().diff(dayjs(status.lastSyncAt), 'minute') : null;
  const isStale = staleMins !== null && staleMins > STALE_THRESHOLD_MIN;

  /** 一条待关联记录展开后的内容：候选推荐 + 自己搜 + 操作按钮 */
  const renderDetail = (rec: BorrowRecord) => {
    const candidates = suggestions[rec.id] ?? [];
    const pickedId = picked[rec.id];

    return (
      <div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>
          {rec.borrowDate ? `借用 ${rec.borrowDate}` : ''}
          {rec.expectedReturnDate ? ` → 应还 ${rec.expectedReturnDate}` : ''}
          {rec.phone ? ` · 电话 ${rec.phone}` : ''}
        </div>

        {rec.purpose && (
          <div style={{ fontSize: 12, color: AMBER.text, marginBottom: 12 }}>
            用途：{rec.purpose}
          </div>
        )}

        {candidates.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>
              可能的对应物品，点一下选中：
            </div>
            <Space wrap size={6}>
              {candidates.map(({ item, score }) => {
                const active = pickedId === item.id;
                const conf = confidenceLabel(score);
                return (
                  <Button
                    key={item.id}
                    size="small"
                    type={active ? 'primary' : 'default'}
                    onClick={() => pickItem(rec.id, item.id)}
                    style={active
                      ? { background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', border: 'none' }
                      : { borderColor: '#FDE68A' }}
                  >
                    {item.code} {item.name}
                    <span style={{ marginLeft: 6, fontSize: 11, opacity: active ? 0.85 : 0.6 }}>
                      {conf.text}
                    </span>
                  </Button>
                );
              })}
            </Space>
          </div>
        ) : (
          <div style={{ marginBottom: 12, fontSize: 12, color: '#94A3B8' }}>
            库存里没有明显对应的物品，请在下面自己找
          </div>
        )}

        <Space wrap>
          <Select
            showSearch
            placeholder="搜索库存物品（错字、少字也能搜到）"
            className="dingtalk-item-select"
            value={pickedId}
            onChange={(v) => pickItem(rec.id, v)}
            options={itemOptions}
            filterOption={(input, option) => {
              const opt = option as { name?: string; code?: string } | undefined;
              const q = (input || '').trim();
              if (!q) return true;
              if ((opt?.code ?? '').toLowerCase().includes(q.toLowerCase())) return true;
              return fuzzyMatches(q, opt?.name ?? '');
            }}
          />
          <Button
            type="primary"
            icon={<LinkOutlined />}
            loading={busyId === rec.id}
            disabled={!pickedId}
            onClick={() => handleLink(rec)}
            style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', border: 'none' }}
          >
            关联
          </Button>
          <Tooltip title="不处理这条，从待关联里移走（可随时恢复）">
            <Button
              icon={<StopOutlined />}
              loading={busyId === rec.id}
              onClick={() => handleIgnore(rec)}
            >
              忽略
            </Button>
          </Tooltip>
        </Space>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 32 }}>
      <Title level={4} style={{ marginTop: 0, color: '#0C4A6E' }}>钉钉审批</Title>

      <motion.div
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
        initial="hidden"
        animate="visible"
      >
        {/* 同步状态 —— 只读，同步由 Edge Function 在打开页面时自动执行 */}
        <motion.div variants={SECTION}>
          <Card style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
            <Space size={8} wrap>
              <SyncOutlined
                spin={loading}
                style={{ color: failed ? '#EF4444' : isStale ? '#F59E0B' : '#0EA5E9' }}
              />
              <Text type="secondary" style={{ fontSize: 13 }}>上次同步</Text>
              <Text strong style={{ color: '#0C4A6E' }}>
                {status?.lastSyncAt ? relativeTime(status.lastSyncAt) : '暂无记录'}
              </Text>
              {status?.lastSyncAt && (
                <Tooltip title={dayjs(status.lastSyncAt).format('YYYY-MM-DD HH:mm:ss')}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(status.lastSyncAt).format('MM-DD HH:mm')}
                  </Text>
                </Tooltip>
              )}
              {status?.lastResult && (
                <Tag color={failed ? 'error' : 'success'} style={{ marginInlineEnd: 0 }}>
                  {status.lastResult}
                </Tag>
              )}
            </Space>

            <div style={{ marginTop: 10, fontSize: 12, color: '#94A3B8' }}>
              打开本页会自动同步，拿到的一定是最新数据
              {isStale && !failed && (
                <span style={{ color: '#F59E0B', marginLeft: 8 }}>
                  · 已超过 {STALE_THRESHOLD_MIN} 分钟未成功同步，可能有异常
                </span>
              )}
            </div>

            {failed && (
              <div
                style={{
                  marginTop: 12, padding: '8px 12px', borderRadius: 8,
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  fontSize: 12, color: '#B91C1C',
                }}
              >
                同步失败了，数据可能不是最新的。多半是 Edge Function 的密钥没配好 ——
                去 Supabase 后台的 Edge Functions 看日志。
              </div>
            )}
          </Card>
        </motion.div>

        {/* 待关联 */}
        <motion.div variants={SECTION}>
          <Card
            style={{ borderRadius: 12, marginBottom: ignored.length ? 16 : 0 }}
            styles={{ body: { padding: pending.length ? '8px 12px' : 16 } }}
            title={
              <Space size={8}>
                {pending.length > 0 ? (
                  <ExclamationCircleOutlined style={{ color: '#F59E0B' }} />
                ) : (
                  <CheckCircleOutlined style={{ color: '#10B981' }} />
                )}
                <span style={{ color: '#0C4A6E' }}>待关联</span>
                {pending.length > 0 && <Tag color="warning">{pending.length}</Tag>}
              </Space>
            }
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
            ) : pending.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary">没有待关联的记录，全部对上了</Text>}
              />
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#94A3B8', padding: '0 4px 4px' }}>
                  钉钉里借了、但库存里对不上号的物品。点条目展开处理，关联后才能归还。
                </div>
                <Collapse
                  ghost
                  expandIconPosition="end"
                  items={pending.map((rec) => ({
                    key: rec.id,
                    label: (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <span style={{ minWidth: 0 }}>
                          <Text strong style={{ fontSize: 15, color: '#0C4A6E' }}>
                            {rec.itemName || '（未填写物品名称）'}
                          </Text>
                          <span style={{ marginLeft: 8, fontSize: 12, color: '#94A3B8' }}>
                            {rec.borrowerName}
                            {rec.department ? ` · ${rec.department}` : ''}
                          </span>
                        </span>
                        <span style={{ flexShrink: 0, color: AMBER.text, fontWeight: 700, fontSize: 18, lineHeight: 1 }}>
                          {rec.quantity}
                          <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>件</span>
                        </span>
                      </div>
                    ),
                    children: renderDetail(rec),
                    style: {
                      border: `1px solid ${AMBER.border}`,
                      borderLeft: '3px solid #F59E0B',
                      background: AMBER.bg,
                      borderRadius: 10,
                      marginBottom: 8,
                    },
                  }))}
                />
              </>
            )}
          </Card>
        </motion.div>

        {/* 已忽略 —— 折叠区，平时不占地方 */}
        {ignored.length > 0 && (
          <motion.div variants={SECTION}>
            <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '8px 12px' } }}>
              <Collapse
                ghost
                expandIconPosition="end"
                items={[{
                  key: 'ignored',
                  label: (
                    <Space size={8}>
                      <StopOutlined style={{ color: '#94A3B8' }} />
                      <span style={{ color: '#64748B' }}>已忽略</span>
                      <Tag style={{ marginInlineEnd: 0 }}>{ignored.length}</Tag>
                    </Space>
                  ),
                  children: (
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      {ignored.map((rec) => (
                        <div
                          key={rec.id}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            gap: 12, padding: '8px 12px',
                            background: '#F8FAFC', borderRadius: 8,
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <Text style={{ color: '#64748B' }}>{rec.itemName}</Text>
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#94A3B8' }}>
                              {rec.borrowerName}
                              {rec.ignoredAt ? ` · 忽略于 ${dayjs(rec.ignoredAt).format('MM-DD HH:mm')}` : ''}
                            </span>
                          </span>
                          <Button
                            size="small"
                            type="link"
                            icon={<UndoOutlined />}
                            loading={busyId === rec.id}
                            onClick={() => handleRestore(rec)}
                          >
                            恢复
                          </Button>
                        </div>
                      ))}
                    </Space>
                  ),
                }]}
              />
            </Card>
          </motion.div>
        )}
      </motion.div>

      <ParticleCelebration show={showCelebration} onComplete={() => setShowCelebration(false)} />
    </div>
  );
}
