import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Input, Select, Row, Col, Table, Tag, Button, Space,
  Modal, InputNumber, Checkbox, message, Typography, Empty, Badge,
} from 'antd';
import {
  SearchOutlined, DownloadOutlined, UndoOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { useBorrowing } from '../hooks/useBorrowing';
import { useAuth } from '../contexts/AuthContext';
import { exportRecordsToExcel } from '../utils/export';
import { STATUS_LABELS, type BorrowRecord } from '../types';

const { Title } = Typography;

export default function RecordsPage() {
  const { records, returnItem, searchRecords } = useBorrowing();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnRecord, setReturnRecord] = useState<BorrowRecord | null>(null);
  const [hasDamage, setHasDamage] = useState(false);
  const [damagedQty, setDamagedQty] = useState<number | null>(null);
  const [damagedNote, setDamagedNote] = useState('');

  const filtered = useMemo(
    () => searchRecords(search, statusFilter),
    [searchRecords, search, statusFilter],
  );

  const openReturnModal = (record: BorrowRecord) => {
    setReturnRecord(record);
    setHasDamage(false);
    setDamagedQty(null);
    setDamagedNote('');
    setReturnModalOpen(true);
  };

  const handleReturn = async () => {
    if (!returnRecord) return;
    const success = await returnItem(
      returnRecord.id,
      hasDamage ? (damagedQty || 0) : 0,
      hasDamage ? damagedNote : undefined,
    );
    if (success) {
      message.success('归还确认成功！');
      setReturnModalOpen(false);
    } else {
      message.error('操作失败');
    }
  };

  const handleExport = () => {
    exportRecordsToExcel(records);
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

      {/* Filters */}
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

      {/* Return modal */}
      <Modal
        title={
          <span>
            <ExclamationCircleOutlined style={{ color: '#0EA5E9', marginRight: 8 }} />
            归还确认
          </span>
        }
        open={returnModalOpen}
        onOk={handleReturn}
        onCancel={() => setReturnModalOpen(false)}
        okText="确认归还"
        cancelText="取消"
        okButtonProps={{
          style: { background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', border: 'none' },
        }}
      >
        {returnRecord && (
          <div>
            <p style={{ fontSize: 14, marginBottom: 16 }}>
              物品：<strong>{returnRecord.itemName}</strong>
              借用人：<strong>{returnRecord.borrowerName}</strong>
              数量：<strong>{returnRecord.quantity} 件</strong>
            </p>

            <Checkbox
              checked={hasDamage}
              onChange={(e) => {
                setHasDamage(e.target.checked);
                if (!e.target.checked) setDamagedQty(null);
              }}
              style={{ marginBottom: 12, fontSize: 14 }}
            >
              物品有损坏/消耗
            </Checkbox>

            {hasDamage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{ marginLeft: 24 }}
              >
                <div style={{ fontSize: 13, color: '#64748B', marginBottom: 6 }}>
                  损坏/消耗数量：
                </div>
                <InputNumber
                  min={1}
                  max={returnRecord.quantity}
                  value={damagedQty}
                  onChange={(v) => setDamagedQty(v)}
                  placeholder={`最多 ${returnRecord.quantity} 件`}
                  style={{ width: '100%' }}
                  addonAfter="件"
                />
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                  损坏的物品将从库存总数中扣除；完好部分正常归还入库
                </div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 12, marginBottom: 6 }}>
                  损坏说明（选填）：
                </div>
                <Input.TextArea
                  rows={2}
                  value={damagedNote}
                  onChange={(e) => setDamagedNote(e.target.value)}
                  placeholder="如：屏幕碎裂、外壳磨损..."
                  maxLength={200}
                />
              </motion.div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
