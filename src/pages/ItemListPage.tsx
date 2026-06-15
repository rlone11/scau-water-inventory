import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Input, Select, Row, Col, Tag, Button, Empty, Table, Space,
  Popconfirm, message, Typography, Badge,
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  SwapOutlined, AppstoreOutlined, UnorderedListOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useItems } from '../hooks/useItems';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORY_LABELS, CATEGORY_COLORS, type ItemCategory, type Item } from '../types';

const { Title } = Typography;
const { Meta } = Card;

export default function ItemListPage() {
  const { deleteItem, searchItems } = useItems();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'borrowed'>('all');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

  const filteredItems = useMemo(
    () => searchItems(search, category, statusFilter),
    [searchItems, search, category, statusFilter],
  );

  const handleDelete = (id: string) => {
    deleteItem(id);
    message.success('物品已删除');
  };

  const columns = [
    {
      title: '照片',
      dataIndex: 'photo',
      key: 'photo',
      width: 70,
      render: (photo: string) =>
        photo ? (
          <img src={photo} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 8, background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0EA5E9', fontSize: 20 }}>📦</div>
        ),
    },
    { title: '编号', dataIndex: 'code', key: 'code', sorter: (a: Item, b: Item) => a.code.localeCompare(b.code) },
    { title: '名称', dataIndex: 'name', key: 'name', render: (name: string) => <strong>{name}</strong> },
    {
      title: '分类', dataIndex: 'category', key: 'category',
      render: (cat: ItemCategory) => <Tag color={CATEGORY_COLORS[cat]}>{CATEGORY_LABELS[cat]}</Tag>,
    },
    { title: '总数', dataIndex: 'quantity', key: 'quantity', sorter: (a: Item, b: Item) => a.quantity - b.quantity },
    {
      title: '可借', dataIndex: 'availableQty', key: 'availableQty',
      render: (qty: number, record: Item) => (
        <Badge status={qty > 0 ? 'success' : 'error'} text={`${qty} 件`} />
      ),
    },
    { title: '位置', dataIndex: 'location', key: 'location' },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, record: Item) => (
        <Space size="small">
          <Button
            type="link" size="small" icon={<SwapOutlined />}
            disabled={record.availableQty === 0}
            onClick={(e) => { e.stopPropagation(); navigate(`/items/${record.id}/borrow`); }}
          >
            借
          </Button>
          {isAdmin && (
            <>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); navigate(`/items/${record.id}/edit`); }} />
              <Popconfirm title="确定删除此物品？" onConfirm={() => handleDelete(record.id)}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, color: '#0C4A6E' }}>物品管理</Title>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/items/add')} style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', border: 'none' }}>
            添加物品
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 16, borderRadius: 12 }} size="small">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={8}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索名称或编号..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6}>
            <Select
              value={category}
              onChange={setCategory}
              style={{ width: '100%' }}
              options={[
                { value: 'all', label: '全部分类' },
                ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v })),
              ]}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: '100%' }}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'available', label: '可借用' },
                { value: 'borrowed', label: '已借出' },
              ]}
            />
          </Col>
          <Col xs={24} sm={4}>
            <Button.Group>
              <Button type={viewMode === 'card' ? 'primary' : 'default'} icon={<AppstoreOutlined />} onClick={() => setViewMode('card')} />
              <Button type={viewMode === 'table' ? 'primary' : 'default'} icon={<UnorderedListOutlined />} onClick={() => setViewMode('table')} />
            </Button.Group>
          </Col>
        </Row>
      </Card>

      {/* Results */}
      {filteredItems.length === 0 ? (
        <Empty description="没有找到物品" style={{ marginTop: 60 }} />
      ) : viewMode === 'card' ? (
        <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
          <Row gutter={[12, 12]}>
            {filteredItems.map((item) => (
              <Col xs={12} sm={8} md={6} lg={6} key={item.id}>
                <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}>
                  <Card
                    hoverable
                    className="item-mobile-card"
                    cover={
                      item.photo ? (
                        <div style={{ height: 130, overflow: 'hidden' }}>
                          <img src={item.photo} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ) : (
                        <div style={{ height: 130, background: 'linear-gradient(135deg, #E0F2FE, #BAE6FD)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
                          📦
                        </div>
                      )
                    }
                    onClick={() => navigate(`/items/${item.id}/borrow`)}
                    styles={{ body: { padding: 10 } }}
                  >
                    <Meta
                      title={<span style={{ fontSize: 13 }}>{item.name}</span>}
                      description={
                        <div style={{ fontSize: 11 }}>
                          <div style={{ marginBottom: 2 }}>
                            <Tag color={CATEGORY_COLORS[item.category]} style={{ fontSize: 10 }}>
                              {CATEGORY_LABELS[item.category]}
                            </Tag>
                          </div>
                          <div style={{ color: '#94A3B8' }}>
                            <EnvironmentOutlined /> {item.location}
                          </div>
                          <div style={{ marginTop: 2 }}>
                            <Badge status={item.availableQty > 0 ? 'success' : 'error'} text={`${item.availableQty}/${item.quantity} 件可用`} />
                          </div>
                        </div>
                      }
                    />
                  </Card>
                </motion.div>
              </Col>
            ))}
          </Row>
        </motion.div>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Table
            dataSource={filteredItems}
            columns={columns}
            rowKey="id"
            size="middle"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 750 }}
            onRow={(record) => ({
              onClick: () => navigate(`/items/${record.id}/borrow`),
              style: { cursor: 'pointer' },
            })}
          />
        </Card>
      )}
    </div>
  );
}
