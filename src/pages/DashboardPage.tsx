import { useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Typography } from 'antd';
import {
  DropboxOutlined,
  CheckCircleOutlined,
  SwapOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
} from '@ant-design/icons';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import TiltCard from '../components/TiltCard';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useItems } from '../hooks/useItems';
import { useBorrowing } from '../hooks/useBorrowing';
import { CATEGORY_LABELS, CATEGORY_COLORS, type ItemCategory } from '../types';
import dayjs from 'dayjs';

const { Title } = Typography;
const BASE = import.meta.env.BASE_URL;

const statCards = [
  { key: 'total', label: '物品总数', icon: <DropboxOutlined />, color: '#0EA5E9' },
  { key: 'available', label: '在库可用', icon: <CheckCircleOutlined />, color: '#10B981' },
  { key: 'borrowed', label: '已借出', icon: <SwapOutlined />, color: '#F59E0B' },
  { key: 'overdue', label: '逾期未还', icon: <ExclamationCircleOutlined />, color: '#EF4444' },
];

function CountUpNumber({ target, duration = 1.5 }: { target: number; duration?: number }) {
  const spring = useSpring(0, { stiffness: 80, damping: 20, duration: duration * 1000 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [splash, setSplash] = useState(false);

  useEffect(() => {
    spring.set(target);
    setSplash(false);
    const timer = setTimeout(() => setSplash(true), duration * 1000 + 100);
    return () => clearTimeout(timer);
  }, [target, spring, duration]);

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <motion.span>{display}</motion.span>
      {/* Splash droplet */}
      <AnimatePresence>
        {splash && (
          <motion.span
            initial={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            animate={{ opacity: 0, y: -18, x: 6, scale: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: -4,
              right: -8,
              width: 8,
              height: 10,
              borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
              background: '#0EA5E9',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>
    </span>
  );
}

export default function DashboardPage() {
  const { items } = useItems();
  const { records } = useBorrowing();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const available = items.reduce((s, i) => s + i.availableQty, 0);
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    const borrowed = totalQty - available;
    const overdue = records.filter((r) => r.status === 'overdue').length;
    return [
      { key: 'total', value: total, suffix: '件' },
      { key: 'available', value: available, suffix: '件' },
      { key: 'borrowed', value: borrowed, suffix: '件' },
      { key: 'overdue', value: overdue, suffix: '笔' },
    ];
  }, [items, records]);

  const categoryData = useMemo(() => {
    const map = new Map<ItemCategory, number>();
    items.forEach((i) => map.set(i.category, (map.get(i.category) || 0) + 1));
    return Array.from(map.entries()).map(([cat, count]) => ({
      name: CATEGORY_LABELS[cat],
      value: count,
      color: CATEGORY_COLORS[cat],
    }));
  }, [items]);

  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      months[dayjs().subtract(i, 'month').format('YYYY-MM')] = 0;
    }
    records.forEach((r) => {
      const m = dayjs(r.borrowDate).format('YYYY-MM');
      if (m in months) months[m]++;
    });
    return Object.entries(months).map(([month, count]) => ({
      month: dayjs(month).format('M月'),
      count,
    }));
  }, [records]);

  const hotItems = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((r) => map.set(r.itemName, (map.get(r.itemName) || 0) + 1));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], i) => ({ rank: i + 1, name, count }));
  }, [records]);

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Hero banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card
          style={{
            borderRadius: 16,
            marginBottom: 20,
            overflow: 'hidden',
            padding: 0,
            background: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 50%, #7DD3FC 100%)',
            border: 'none',
          }}
          styles={{ body: { padding: '16px 20px' } }}
        >
          <Row align="middle" gutter={[16, 12]}>
            <Col xs={24} sm={16}>
              <Title level={4} style={{ margin: '0 0 4px', color: '#0C4A6E', fontWeight: 700 }}>
                办公室物品统计管理系统
              </Title>
              <p style={{ margin: 0, color: '#0369A1', fontSize: 13, lineHeight: 1.6 }}>
                四川农业大学 · 水利水电学院 · 上善若水 知行合一
              </p>
            </Col>
            <Col xs={24} sm={8} style={{ textAlign: 'right' }}>
              <img
                src={BASE + 'images/川农.png'}
                alt="四川农业大学"
                style={{ maxWidth: '100%', height: 40, opacity: 0.8 }}
              />
            </Col>
          </Row>
        </Card>
      </motion.div>

      {/* Stat cards with count-up + spring stagger */}
      <motion.div
        initial="hidden"
        animate={mounted ? 'visible' : 'hidden'}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.08 } },
        }}
      >
        <Row gutter={[16, 16]}>
          {statCards.map((card, idx) => (
            <Col xs={12} sm={12} md={6} key={card.key}>
              <TiltCard
                maxTilt={8}
                variants={{
                  hidden: { opacity: 0, y: 24, scale: 0.95 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: 'spring', stiffness: 200, damping: 20 },
                  },
                }}
              >
                <Card
                  className="stat-card"
                  hoverable
                  onClick={() => {
                    navigate(card.key === 'overdue' ? '/records' : '/items');
                  }}
                >
                  <div style={{ fontSize: 13, color: '#64748B', marginBottom: 8 }}>
                    {card.icon} {card.label}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: card.color, lineHeight: 1 }}>
                    {mounted ? <CountUpNumber target={stats[idx].value} /> : 0}
                    <span style={{ fontSize: 14, color: '#94A3B8', marginLeft: 4, fontWeight: 400 }}>
                      {stats[idx].suffix}
                    </span>
                  </div>
                </Card>
              </TiltCard>
            </Col>
          ))}
        </Row>
      </motion.div>

      {/* Charts */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.4, type: 'spring', stiffness: 150, damping: 18 }}
          >
            <Card title="物品分类占比" style={{ borderRadius: 12 }}>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={400}
                    animationDuration={1000}
                  >
                    {categoryData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 4 }}>
                {categoryData.map((d) => (
                  <span key={d.name} style={{ fontSize: 12, color: '#64748B' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: d.color, marginRight: 4 }} />
                    {d.name} {d.value}
                  </span>
                ))}
              </div>
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} md={12}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.5, type: 'spring', stiffness: 150, damping: 18 }}
          >
            <Card title="近6月借用趋势" style={{ borderRadius: 12 }}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0EA5E9" radius={[6, 6, 0, 0]} name="借用次数" animationBegin={500} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* Hot items */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={mounted ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.6, type: 'spring', stiffness: 150, damping: 18 }}
      >
        <Card
          title={<span><FireOutlined style={{ color: '#F59E0B', marginRight: 8 }} />热门借用物品 Top 5</span>}
          style={{ marginTop: 16, borderRadius: 12 }}
        >
          {hotItems.length === 0 ? (
            <div className="empty-water" style={{ textAlign: 'center', color: '#64748B', padding: 32, borderRadius: 8, fontSize: 14 }}>暂无借用记录</div>
          ) : (
            hotItems.map((item, idx) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -12 }}
                animate={mounted ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.7 + idx * 0.08, type: 'spring', stiffness: 200, damping: 18 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '11px 0',
                  borderBottom: idx < hotItems.length - 1 ? '1px solid #f0f0f0' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: idx < 3 ? '#0EA5E9' : '#94A3B8',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {item.rank}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</span>
                </div>
                <span style={{ color: '#64748B', fontSize: 13 }}>借用 {item.count} 次</span>
              </motion.div>
            ))
          )}
        </Card>
      </motion.div>
    </div>
  );
}
