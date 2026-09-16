import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Input, Select, Row, Col, Table, Tag, Button, Space,
  Typography, Empty, Badge, Spin, Tooltip,
} from 'antd';
import {
  SearchOutlined, UndoOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { useBorrowing } from '../hooks/useBorrowing';
import { useAuth } from '../contexts/AuthContext';
import { fetchPendingCount } from '../services/dingtalkService';
import ReturnConfirmModal from '../components/ReturnConfirmModal';
import ParticleCelebration from '../components/ParticleCelebration';
import type { BorrowRecord } from '../types';

const { Title, Text } = Typography;

/** 平滑的 ease-out，与其他页面一致 */
const EASE_SMOOTH: [number, number, number, number] = [0.22, 1, 0.36, 1];

const SECTION = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_SMOOTH } },
};

/** 借出中或已逾期 = 还没还 */
const isOutstanding = (r: BorrowRecord) => r.status === 'borrowed' || r.status === 'overdue';

export default function ReturnPage() {
  const { records, returnItem, loading } = useBorrowing();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnRecord, setReturnRecord] = useState<BorrowRecord | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  /** 钉钉待关联条数 —— 这些还没关联物品，按规则不能核销 */
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchPendingCount()
      .then((n) => { if (!cancelled) setPendingCount(n); })
      .catch(() => { /* 表结构未就绪等情况静默忽略，不打扰用户 */ });
    return () => { cancelled = true; };
  }, [isAdmin]);

  /** 只有关联了库存物品的记录才能核销 —— 不知道库存该还到哪件物品上 */
  const outstanding = useMemo(
    () => records.filter((r) => isOutstanding(r) && r.itemId),
    [records],
  );

  const overdueCount = useMemo(
    () => outstanding.filter((r) => r.status === 'overdue').length,
    [outstanding],
  );

  const departments = useMemo(
    () => Array.from(new Set(outstanding.map((r) => r.department).filter(Boolean))).sort(),
    [outstanding],
  );

  const filtered = useMemo(() => {
    let list = outstanding;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.itemName.toLowerCase().includes(q) ||
          r.borrowerName.toLowerCase().includes(q) ||
          r.borrowerId.toLowerCase().includes(q),
      );
    }
    if (deptFilter !== 'all') {
      list = list.filter((r) => r.department === deptFilter);
    }
    if (overdueOnly) {
      list = list.filter((r) => r.status === 'overdue');
    }
    return list;
  }, [outstanding, search, deptFilter, overdueOnly]);

  const openReturnModal = (record: BorrowRecord) => {
    setReturnRecord(record);
    setReturnModalOpen(true);
  };

  /** 核销：consumedQty 为没回到库存的件数（0 = 全部归还） */
  const handleConfirm = async (recordId: string, consumedQty: number, consumedNote?: string) => {
    const ok = await returnItem(recordId, consumedQty, consumedNote);
    if (ok) setShowCelebration(true);
    return ok;
  };

  const columns = [
    {
      title: '物品名称', dataIndex: 'itemName', key: 'itemName',
      render: (name: string) => <strong style={{ color: '#0C4A6E' }}>{name}</strong>,
    },
    { title: '借用人', dataIndex: 'borrowerName', key: 'borrowerName' },
    { title: '部门', dataIndex: 'department', key: 'department', responsive: ['md' as const] },
    { title: '手机号', dataIndex: 'phone', key: 'phone', responsive: ['lg' as const] },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 60 },
    {
      title: '借出日期', dataIndex: 'borrowDate', key: 'borrowDate', responsive: ['sm' as const],
      render: (date: string) => (date ? dayjs(date).format('MM-DD') : '—'),
    },
    {
      title: '预计归还', dataIndex: 'expectedReturnDate', key: 'expectedReturnDate',
      render: (date: string, record: BorrowRecord) => {
        if (!date) return <Text type="secondary">—</Text>;
        const days = dayjs().startOf('day').diff(dayjs(date).startOf('day'), 'day');
        return record.status === 'overdue' && days > 0 ? (
          <Tooltip title={`已逾期 ${days} 天`}>
            <Tag color="error" style={{ fontSize: 12 }}>
              {dayjs(date).format('MM-DD')} · 逾期 {days} 天
            </Tag>
          </Tooltip>
        ) : (
          <span>{dayjs(date).format('MM-DD')}</span>
        );
      },
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (status: string) => (
        <Badge
          status={status === 'overdue' ? 'error' : 'processing'}
          text={<span style={{ fontSize: 12 }}>{status === 'overdue' ? '已逾期' : '借出中'}</span>}
        />
      ),
    },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: unknown, record: BorrowRecord) => (
        <Button
          type="link"
          size="small"
          icon={<UndoOutlined />}
          onClick={() => openReturnModal(record)}
        >
          核销
        </Button>
      ),
    },
  ];

  // 仅管理员可见 —— 列表里有姓名和电话
  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Title level={4} type="secondary">仅管理员可查看</Title>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240, flexDirection: 'column', gap: 16 }}>
        <Spin size="large" />
        <span style={{ color: '#94A3B8', fontSize: 14 }}>正在加载待核销数据...</span>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      <Title level={4} style={{ marginTop: 0, marginBottom: 16, color: '#0C4A6E' }}>物品核销</Title>

      <motion.div
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
        initial="hidden"
        animate="visible"
      >
        {/* 未关联提示 —— 这些记录还没挂到库存物品上，按规则不能归还 */}
        {pendingCount > 0 && (
          <motion.div variants={SECTION}>
            <Card
              size="small"
              onClick={() => navigate('/dingtalk')}
              style={{
                marginBottom: 16, borderRadius: 12,
                borderColor: '#FDE68A', background: '#FFFBEB', cursor: 'pointer',
              }}
              styles={{ body: { padding: '10px 14px' } }}
            >
              <Space wrap>
                <ExclamationCircleOutlined style={{ color: '#F59E0B' }} />
                <span style={{ color: '#92400E' }}>
                  还有 {pendingCount} 条钉钉记录没关联到库存物品，关联后才能核销
                </span>
                <span style={{ color: '#D97706', fontSize: 12 }}>去钉钉审批页处理 →</span>
              </Space>
            </Card>
          </motion.div>
        )}

        {/* 概览 */}
        <motion.div variants={SECTION}>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 16 } }}>
                <div style={{ fontSize: 13, color: '#64748B' }}>待核销</div>
                <div style={{ marginTop: 4, lineHeight: 1 }}>
                  <span style={{ fontSize: 32, fontWeight: 700, color: '#0EA5E9' }}>{outstanding.length}</span>
                  <span style={{ fontSize: 14, color: '#94A3B8', fontWeight: 400, marginLeft: 4 }}>件</span>
                </div>
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 16 } }}>
                <div style={{ fontSize: 13, color: '#64748B' }}>其中逾期</div>
                <div style={{ marginTop: 4, lineHeight: 1 }}>
                  <span style={{ fontSize: 32, fontWeight: 700, color: overdueCount > 0 ? '#EF4444' : '#10B981' }}>
                    {overdueCount}
                  </span>
                  <span style={{ fontSize: 14, color: '#94A3B8', fontWeight: 400, marginLeft: 4 }}>件</span>
                </div>
              </Card>
            </Col>
          </Row>
        </motion.div>

        {/* 筛选 */}
        {outstanding.length > 0 && (
          <motion.div variants={SECTION}>
            <Card style={{ marginBottom: 16, borderRadius: 12 }} size="small">
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={10}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索物品、借用人、学号..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                  />
                </Col>
                <Col xs={12} sm={7}>
                  <Select
                    value={deptFilter}
                    onChange={setDeptFilter}
                    style={{ width: '100%' }}
                    options={[
                      { value: 'all', label: '全部部门' },
                      ...departments.map((d) => ({ value: d, label: d })),
                    ]}
                  />
                </Col>
                <Col xs={12} sm={7}>
                  <Select
                    value={overdueOnly ? 'overdue' : 'all'}
                    onChange={(v) => setOverdueOnly(v === 'overdue')}
                    style={{ width: '100%' }}
                    options={[
                      { value: 'all', label: '全部待核销' },
                      { value: 'overdue', label: `仅看逾期（${overdueCount}）` },
                    ]}
                  />
                </Col>
              </Row>
            </Card>
          </motion.div>
        )}

        {/* 列表 */}
        <motion.div variants={SECTION}>
          {outstanding.length === 0 ? (
            <div className="empty-water" style={{ borderRadius: 12, padding: 40, background: '#fff' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary">没有待核销的记录，都结清了</Text>}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-water" style={{ borderRadius: 12, padding: 40, background: '#fff' }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">没有符合条件的记录</Text>} />
            </div>
          ) : (
            <Card style={{ borderRadius: 12 }}>
              <Table
                dataSource={filtered}
                columns={columns}
                rowKey="id"
                size="middle"
                pagination={{ pageSize: 10, showSizeChanger: false }}
                scroll={{ x: 700 }}
                locale={{
                  emptyText: (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">没有待核销的记录</Text>} />
                  ),
                }}
              />
            </Card>
          )}
        </motion.div>
      </motion.div>

      <ReturnConfirmModal
        record={returnRecord}
        open={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        onConfirm={handleConfirm}
      />

      <ParticleCelebration show={showCelebration} onComplete={() => setShowCelebration(false)} />
    </div>
  );
}
