import { useState, useMemo, useEffect, useRef, type HTMLAttributes } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Input, Select, Row, Col, Tag, Button, Empty, Table, Space,
  Popconfirm, message, Typography, Badge, Spin, Result, Image, Alert, Pagination,
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  SwapOutlined, AppstoreOutlined, UnorderedListOutlined,
  EnvironmentOutlined, DownloadOutlined, EyeOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useItems } from '../hooks/useItems';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORY_LABELS, CATEGORY_COLORS, type ItemCategory, type Item } from '../types';
import { exportItemsToExcel } from '../utils/export';
import { entrySpring } from '../lib/motion';

const { Title } = Typography;
const { Meta } = Card;

/** 卡片视图每页数量：桌面 4 列 × 6 行，手机 2 列 × 12 行 */
const CARD_PAGE_SIZE = 24;

export default function ItemListPage() {
  const { deleteItem, searchItems, loading, error, items, total, truncated, loadPhoto } = useItems();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'borrowed'>('all');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [page, setPage] = useState(1);

  const filteredItems = useMemo(
    () => searchItems(search, category, statusFilter),
    [searchItems, search, category, statusFilter],
  );

  // 筛选条件变化时回到第一页，避免停在一个已经不存在的结果页上
  useEffect(() => { setPage(1); }, [search, category, statusFilter]);

  // 删除或筛选后当前页可能越界，渲染时先夹住；上面的 effect 随后会把 page 归位
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / CARD_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(
    () => filteredItems.slice((safePage - 1) * CARD_PAGE_SIZE, safePage * CARD_PAGE_SIZE),
    [filteredItems, safePage],
  );

  // ===== 视口优先加载图片 =====
  // 滚到哪张卡片，哪张的图片先拉。不再一次性拉全部 ——
  // 那要等 809KB / 4.5 秒才出第一张，期间一张都显示不出来。
  const ioRef = useRef<IntersectionObserver | null>(null);
  const loadPhotoRef = useRef(loadPhoto);
  loadPhotoRef.current = loadPhoto;

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const id = el.dataset.itemId;
          if (id) loadPhotoRef.current(id);
          el.dataset.photoRequested = '1';
          io.unobserve(el); // 已触发的不用再观察
        }
      },
      { rootMargin: '250px 0px' }, // 提前 250px 开始加载，滚到就能看到
    );
    ioRef.current = io;
    return () => {
      io.disconnect();
      ioRef.current = null;
    };
  }, []);

  // 每次渲染后重新登记当前页的卡片。
  // 先 disconnect：翻页后旧卡片已从 DOM 移除，不清理会让观察器一直攥着死节点。
  useEffect(() => {
    const io = ioRef.current;
    if (!io) return;
    io.disconnect();
    document
      .querySelectorAll<HTMLElement>('[data-item-id]:not([data-photo-requested])')
      .forEach((el) => io.observe(el));
  });

  const handleDelete = (id: string) => {
    deleteItem(id);
    message.success('物品已删除');
  };

  const handleExport = async () => {
    if (filteredItems.length === 0) {
      message.warning('没有可导出的物品数据');
      return;
    }
    await exportItemsToExcel(filteredItems);
    message.success(`已导出 ${filteredItems.length} 条物品记录`);
  };

  const columns = [
    {
      title: '照片',
      dataIndex: 'photo',
      key: 'photo',
      width: 70,
      render: (photo: string) =>
        photo ? (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={entrySpring(250)}
            style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Water drop overlay that fades away */}
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              style={{
                position: 'absolute', inset: 0, zIndex: 1,
                background: 'radial-gradient(circle at center, #0EA5E9 0%, transparent 70%)',
                borderRadius: 8, pointerEvents: 'none',
              }}
            />
            <Image
              src={photo}
              alt=""
              width={44}
              height={44}
              style={{ borderRadius: 8, objectFit: 'cover', display: 'block' }}
              preview={{ mask: <EyeOutlined /> }}
            />
          </motion.div>
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
          <Space>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              导出 Excel
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/items/add')} style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', border: 'none' }}>
              添加物品
            </Button>
          </Space>
        )}
      </div>

      {/* 超过单次加载上限时的显式提示 —— 绝不静默截断 */}
      {!loading && truncated && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
          message={`共 ${total} 条物品，当前只加载了前 ${items.length} 条`}
          description="超出部分不会出现在列表、仪表盘统计和导出中。"
        />
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240, flexDirection: 'column', gap: 16 }}>
          <Spin size="large" />
          <span style={{ color: '#94A3B8', fontSize: 14 }}>正在加载物品数据...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <Result
          status="error"
          title="加载失败"
          subTitle={error}
          extra={<Button type="primary" onClick={() => window.location.reload()}>重新加载</Button>}
        />
      )}

      {/* Filters - 只在数据就绪后显示 */}
      {!loading && !error && (
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
      )}

      {/* Results - 只在数据就绪后显示 */}
      {!loading && !error && (
        <>
          {filteredItems.length === 0 ? (
            <Empty className="empty-water" description="没有找到物品" style={{ marginTop: 60, borderRadius: 12 }} />
          ) : viewMode === 'card' ? (
            <>
            <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
              <Row gutter={[12, 12]}>
                {pagedItems.map((item) => (
                  <Col xs={12} sm={8} md={6} lg={6} key={item.id}>
                    <motion.div
                      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
                      data-item-id={item.id}
                    >
                      <Card
                        hoverable
                        className="item-mobile-card"
                        cover={
                          item.photo ? (
                            <motion.div
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={entrySpring(200)}
                              style={{ height: 130, overflow: 'hidden', position: 'relative' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <motion.div
                                initial={{ opacity: 1 }}
                                animate={{ opacity: 0 }}
                                transition={{ delay: 0.35, duration: 0.25 }}
                                style={{
                                  position: 'absolute', inset: 0, zIndex: 1,
                                  background: 'radial-gradient(circle at center, #0EA5E9 0%, transparent 65%)',
                                  pointerEvents: 'none',
                                }}
                              />
                              <Image
                                src={item.photo}
                                alt={item.name}
                                width="100%"
                                height={130}
                                style={{ objectFit: 'cover', display: 'block' }}
                                preview={{ mask: <EyeOutlined /> }}
                              />
                            </motion.div>
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
            {filteredItems.length > CARD_PAGE_SIZE && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                <Pagination
                  current={safePage}
                  pageSize={CARD_PAGE_SIZE}
                  total={filteredItems.length}
                  showSizeChanger={false}
                  onChange={(p) => {
                    setPage(p);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            )}
            </>
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
                  // 供 IntersectionObserver 识别行 —— 进入视口才加载该行图片
                  'data-item-id': record.id,
                } as HTMLAttributes<HTMLElement>)}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
