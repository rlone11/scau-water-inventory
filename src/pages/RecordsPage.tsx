import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Input, Select, Row, Col, Table, Tag, Button, Space,
  message, Typography, Empty, Badge, Spin,
} from 'antd';
import {
  SearchOutlined, DownloadOutlined, UndoOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { useBorrowing } from '../hooks/useBorrowing';
import { useAuth } from '../contexts/AuthContext';
import { fetchPendingCount } from '../services/dingtalkService';
import { exportRecordsToExcel } from '../utils/export';
import ReturnConfirmModal from '../components/ReturnConfirmModal';
import { STATUS_LABELS, type BorrowRecord } from '../types';

const { Title } = Typography;

export default function RecordsPage() {
  const { records, returnItem, searchRecords, loading } = useBorrowing();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnRecord, setReturnRecord] = useState<BorrowRecord | null>(null);
  /** 钉钉待关联条数 —— 仅用于顶部提示条 */
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchPendingCount()
      .then((n) => { if (!cancelled) setPendingCount(n); })
      .catch(() => { /* 表结构未就绪等情况静默忽略，不打扰用户 */ });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const filtered = useMemo(
    () => searchRecords(search, statusFilter),
    [searchRecords, search, statusFilter],
  );

  const openReturnModal = (record: BorrowRecord) => {
    setReturnRecord(record);
    setReturnModalOpen(true);
  };

  const handleExport = async () => {
    await exportRecordsToExcel(records);
    message.success('导出成功！');
  };

  const canReturn = (record: BorrowRecord) => record.status === 'borrowed' || record.status === 'overdue';

  const columns = [
    {
      title: '物品名称', dataIndex: 'itemName', key: 'itemName',
      render: (name: string) => <strong>{name}</strong>,
    },
    { title: '借用人', dataIndex: 'borrowerName', key: 'borrowerName' },
    { title: '学号/工号', dataIndex: 'borrowerId', key: 'borrowerId', responsive: ['md' as const] },
    { title: '手机号', dataIndex: 'phone', key: 'phone', responsive: ['lg' as const] },
    {
      title: '数量', dataIndex: 'quantity', key: 'quantity', width: 60,
    },
    {
      title: '借出日期', dataIndex: 'borrowDate', key: 'borrowDate',
      render: (date: string) => dayjs(date).format('MM-DD'),
    },
    {
      title: '预计归还', dataIndex: 'expectedReturnDate', key: 'expectedReturnDate', responsive: ['sm' as const],
      render: (date: string) => dayjs(date).format('MM-DD'),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (status: string, record: BorrowRecord) => (
        <Space size={4}>
          <Badge status={status === 'returned' ? 'success' : status === 'overdue' ? 'error' : 'processing'}
            text={<span style={{ fontSize: 12 }}>{STATUS_LABELS[status as keyof typeof STATUS_LABELS]}</span>}
          />
          {record.damagedQty && record.damagedQty > 0 && (
            <Tag color="orange" style={{ fontSize: 10 }}>损{record.damagedQty}件</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_: unknown, record: BorrowRecord) => (
        canReturn(record) ? (
          <Button type="link" size="small" icon={<UndoOutlined />} onClick={() => openReturnModal(record)}>
            归还
          </Button>
        ) : (
          <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 11 }}>已还</Tag>
        )
      ),
    },
  ];

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, color: '#0C4A6E' }}>借记记录</Title>
        <Space>
          <Button icon={<SearchOutlined />} onClick={() => navigate('/items')}>去借物品</Button>
          {isAdmin && (
            <Button icon={<DownloadOutlined />} onClick={handleExport} type="primary"
              style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', border: 'none' }}>
              导出 Excel
            </Button>
          )}
        </Space>
      </div>

      {/* 钉钉待关联提示 —— 点一下跳到钉钉审批页 */}
      {isAdmin && pendingCount > 0 && (
        <Card
          size="small"
          onClick={() => navigate('/dingtalk')}
          style={{
            marginBottom: 16,
            borderRadius: 12,
            borderColor: '#FDE68A',
            background: '#FFFBEB',
            cursor: 'pointer',
          }}
          styles={{ body: { padding: '10px 14px' } }}
        >
          <Space>
            <ExclamationCircleOutlined style={{ color: '#F59E0B' }} />
            <span style={{ color: '#92400E' }}>有 {pendingCount} 条钉钉审批记录待关联</span>
            <span style={{ color: '#D97706', fontSize: 12 }}>去处理 →</span>
          </Space>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240, flexDirection: 'column', gap: 16 }}>
          <Spin size="large" />
          <span style={{ color: '#94A3B8', fontSize: 14 }}>正在加载记录数据...</span>
        </div>
      )}

      {/* Filters */}
      {!loading && (
        <>
          <Card style={{ marginBottom: 16, borderRadius: 12 }} size="small">
            <Row gutter={[12, 12]}>
              <Col xs={24} sm={12}>
                <Input prefix={<SearchOutlined />} placeholder="搜索物品、借用人、学号..."
                  value={search} onChange={(e) => setSearch(e.target.value)} allowClear />
              </Col>
              <Col xs={24} sm={12}>
                <Select value={statusFilter} onChange={setStatusFilter} style={{ width: '100%' }}
                  options={[
                    { value: 'all', label: '全部状态' },
                    ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })),
                  ]}
                />
              </Col>
            </Row>
          </Card>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="empty-water" style={{ borderRadius: 12, padding: 40, marginTop: 60, background: '#fff' }}>
              <Empty description="暂无借记记录">
                <Button type="primary" onClick={() => navigate('/items')}>去借物品</Button>
              </Empty>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <Card style={{ borderRadius: 12 }}>
                <Table
                  dataSource={filtered}
                  columns={columns}
                  rowKey="id"
                  size="middle"
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ x: 600 }}
                  locale={{ emptyText: '暂无记录' }}
                />
              </Card>
            </motion.div>
          )}
        </>
      )}

      {/* Return modal —— 与「归还确认」页共用同一个组件 */}
      <ReturnConfirmModal
        record={returnRecord}
        open={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        onConfirm={returnItem}
      />
    </div>
  );
}
