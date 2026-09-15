import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Select, Empty, Spin, Typography, Tag, Space, message, Tooltip } from 'antd';
import {
  SyncOutlined, LinkOutlined, ExclamationCircleOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import {
  fetchPendingMatches,
  fetchSyncStatus,
  linkRecordToItem,
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

/** 自动同步间隔（分钟）—— 与 sync-dingtalk.yml 的 cron 保持一致 */
const SYNC_INTERVAL_MIN = 10;
/** 超过这个时长没同步，就认为可能出问题了 */
const STALE_THRESHOLD_MIN = SYNC_INTERVAL_MIN * 3;
/** 页面开着时的静默重拉间隔 —— 比同步间隔短一点，跟得上后台 */
const PAGE_REFRESH_MS = 5 * 60 * 1000;

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
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  /** 每条待关联记录当前在下拉框里选了哪个物品 */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  /** silent = 后台静默刷新，不显示整页 loading */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [list, st] = await Promise.all([fetchPendingMatches(), fetchSyncStatus()]);
      setPending(list);
      setStatus(st);
    } catch {
      if (!silent) message.error('加载失败，请稍后重试');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 页面开着时定期静默重拉：同步在后台每 10 分钟自动跑，页面自己跟上，无需手动刷新
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
    for (const rec of pending) {
      map[rec.id] = suggestByName(rec.itemName, items);
    }
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
    setLinkingId(record.id);
    try {
      await linkRecordToItem(record.id, itemId, record.quantity);
      message.success(`已关联到「${item?.name ?? '物品'}」，可借数量已扣减 ${record.quantity}`);
      setPending((prev) => prev.filter((r) => r.id !== record.id));
      setShowCelebration(true);
    } catch {
      message.error('关联失败，请重试');
    } finally {
      setLinkingId(null);
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

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 32 }}>
      <Title level={4} style={{ marginTop: 0, color: '#0C4A6E' }}>钉钉审批</Title>

      <motion.div
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
        initial="hidden"
        animate="visible"
      >
        {/* 同步状态 —— 只读，同步由后台自动执行，页面上没有可操作的地方 */}
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
              每 {SYNC_INTERVAL_MIN} 分钟自动同步，无需手动操作
              {isStale && !failed && (
                <span style={{ color: '#F59E0B', marginLeft: 8 }}>
                  · 已超过 {STALE_THRESHOLD_MIN} 分钟未同步，可能有异常
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
                同步任务报错了，数据可能不是最新的。去 GitHub 仓库的 Actions 页看运行日志。
              </div>
            )}
          </Card>
        </motion.div>

        {/* 待关联 */}
        <motion.div variants={SECTION}>
          <Card
            style={{ borderRadius: 12 }}
            styles={{ body: { padding: 16 } }}
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
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: -4 }}>
                  这些是钉钉里借了、但库存里对不上号的物品。关联到库存物品后才能归还。
                </div>

                {pending.map((rec) => {
                  const candidates = suggestions[rec.id] ?? [];
                  const pickedId = picked[rec.id];

                  return (
                    <div
                      key={rec.id}
                      style={{
                        border: `1px solid ${AMBER.border}`,
                        borderLeft: '3px solid #F59E0B',
                        background: AMBER.bg,
                        borderRadius: 10,
                        padding: 14,
                      }}
                    >
                      {/* 物品名 + 数量（数量刻意放大，避免看错） */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <Text strong style={{ fontSize: 16, color: '#0C4A6E' }}>
                          {rec.itemName || '（未填写物品名称）'}
                        </Text>
                        <span style={{ flexShrink: 0, color: AMBER.text, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>
                          {rec.quantity}
                          <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 2 }}>件</span>
                        </span>
                      </div>

                      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>
                        {rec.borrowerName}
                        {rec.department ? ` · ${rec.department}` : ''}
                        {rec.borrowDate ? ` · 借用 ${rec.borrowDate}` : ''}
                        {rec.expectedReturnDate ? ` → 归还 ${rec.expectedReturnDate}` : ''}
                      </div>

                      {rec.purpose && (
                        <div style={{ fontSize: 12, color: AMBER.text, marginTop: 4 }}>
                          用途：{rec.purpose}
                        </div>
                      )}

                      {/* 推荐候选 —— 按钉钉里的名称自动算出来的，点一下即选中 */}
                      {candidates.length > 0 ? (
                        <div style={{ marginTop: 12 }}>
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
                        <div style={{ marginTop: 12, fontSize: 12, color: '#94A3B8' }}>
                          库存里没有明显对应的物品，请在下面自己找
                        </div>
                      )}

                      {/* 兜底：自己搜。输入支持错字、少字、字序不同 */}
                      <Space style={{ marginTop: 12, width: '100%' }} wrap>
                        <Select
                          showSearch
                          placeholder="搜索库存物品（错字、少字也能搜到）"
                          style={{ width: 280 }}
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
                          loading={linkingId === rec.id}
                          disabled={!pickedId}
                          onClick={() => handleLink(rec)}
                          style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', border: 'none' }}
                        >
                          关联
                        </Button>
                      </Space>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        </motion.div>
      </motion.div>

      <ParticleCelebration show={showCelebration} onComplete={() => setShowCelebration(false)} />
    </div>
  );
}
