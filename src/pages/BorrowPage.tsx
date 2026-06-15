import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, DatePicker, Button, Typography, Descriptions, message, Tag, Divider,
} from 'antd';
import { ArrowLeftOutlined, SwapOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { useItems } from '../hooks/useItems';
import { useBorrowing } from '../hooks/useBorrowing';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../types';
import Celebration from '../components/Celebration';

const { Title, Text } = Typography;

export default function BorrowPage() {
  const { id } = useParams<{ id: string }>();
  const { items } = useItems();
  const { borrowItem } = useBorrowing();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const item = items.find((i) => i.id === id);

  if (!item) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Text type="secondary">物品不存在</Text>
        <br />
        <Button type="link" onClick={() => navigate('/items')}>返回物品列表</Button>
      </div>
    );
  }

  const handleSubmit = (values: Record<string, unknown>) => {
    if (item.availableQty < (values.quantity as number)) {
      message.error(`库存不足，当前可借 ${item.availableQty} 件`);
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const success = borrowItem({
        itemId: item.id,
        itemName: item.name,
        borrowerName: values.borrowerName as string,
        borrowerId: values.borrowerId as string,
        phone: values.phone as string,
        department: values.department as string,
        purpose: values.purpose as string,
        quantity: values.quantity as number,
        borrowDate: (values.borrowDate as dayjs.Dayjs).toISOString(),
        expectedReturnDate: (values.expectedReturnDate as dayjs.Dayjs).toISOString(),
      });

      if (success) {
        message.success('借出成功！');
        setShowCelebration(true);
      } else {
        message.error('借出失败，请检查库存');
      }
      setLoading(false);
    }, 300);
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 32 }}>
      <Celebration show={showCelebration} onComplete={() => navigate('/records')} />
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/items')} style={{ marginBottom: 16, padding: 0 }}>
        返回物品列表
      </Button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {/* Item info card */}
        <Card style={{ borderRadius: 12, marginBottom: 16 }}>
          <Descriptions title="物品信息" size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="名称">{item.name}</Descriptions.Item>
            <Descriptions.Item label="编号">{item.code}</Descriptions.Item>
            <Descriptions.Item label="分类">
              <Tag color={CATEGORY_COLORS[item.category]}>{CATEGORY_LABELS[item.category]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="位置">{item.location}</Descriptions.Item>
            <Descriptions.Item label="可借数量">
              <Text type={item.availableQty > 0 ? 'success' : 'danger'} strong>
                {item.availableQty} / {item.quantity} 件
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Borrow form */}
        <Card style={{ borderRadius: 12 }}>
          <Title level={4} style={{ color: '#0C4A6E', marginBottom: 24 }}>
            <SwapOutlined /> 借用登记
          </Title>

          <Form form={form} layout="vertical" onFinish={handleSubmit}
            initialValues={{
              quantity: 1,
              borrowDate: dayjs(),
              expectedReturnDate: dayjs().add(7, 'day'),
            }}
          >
            <Divider plain style={{ fontSize: 13, color: '#94A3B8' }}>借用人信息</Divider>

            <Form.Item name="borrowerName" label="借用人姓名" rules={[{ required: true, message: '请输入姓名' }]}>
              <Input placeholder="请输入借用人姓名" />
            </Form.Item>

            <Form.Item name="borrowerId" label="学号/工号" rules={[{ required: true, message: '请输入学号或工号' }]}>
              <Input placeholder="如：202301001" />
            </Form.Item>

            <Form.Item name="phone" label="手机号"
              rules={[
                { required: true, message: '请输入手机号' },
                { pattern: /^1[3-9]\d{9}$/, message: '请输入有效手机号' },
              ]}
            >
              <Input placeholder="如：13800138000" maxLength={11} />
            </Form.Item>

            <Form.Item name="department" label="班级/部门" rules={[{ required: true, message: '请输入班级或部门' }]}>
              <Input placeholder="如：水利2023级1班 / 院办公室" />
            </Form.Item>

            <Form.Item name="purpose" label="借用用途" rules={[{ required: true, message: '请输入借用用途' }]}>
              <Input.TextArea rows={2} placeholder="如：课程展示、会议使用..." />
            </Form.Item>

            <Divider plain style={{ fontSize: 13, color: '#94A3B8' }}>借用信息</Divider>

            <Form.Item name="quantity" label="借用数量" rules={[{ required: true }]}>
              <InputNumber min={1} max={item.availableQty} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="borrowDate" label="借出日期" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="expectedReturnDate" label="预计归还日期" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                disabled={item.availableQty === 0}
                icon={<SwapOutlined />}
                style={{ height: 44, background: item.availableQty === 0 ? undefined : 'linear-gradient(135deg, #0EA5E9, #0284C7)', border: 'none', fontSize: 16, fontWeight: 600 }}
              >
                {item.availableQty === 0 ? '暂无库存' : '确认借出'}
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </motion.div>
    </div>
  );
}
