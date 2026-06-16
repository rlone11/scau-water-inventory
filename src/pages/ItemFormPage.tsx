import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, message, Typography, Space,
} from 'antd';
import { UploadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useItems } from '../hooks/useItems';
import { useAuth } from '../contexts/AuthContext';
import { fetchItemById } from '../services/itemService';
import { CATEGORY_LABELS, type ItemCategory } from '../types';

const { Title } = Typography;
const { TextArea } = Input;

export default function ItemFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { items, addItem, updateItem } = useItems();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [photoBase64, setPhotoBase64] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // 编辑模式：用 fetchItemById 获取完整数据（含 photo 和 notes）
  useEffect(() => {
    if (!isEdit || !id) return;

    let cancelled = false;
    fetchItemById(id)
      .then((item) => {
        if (cancelled) return;
        if (item) {
          form.setFieldsValue(item);
          setPhotoBase64(item.photo || '');
        } else {
          message.error('物品不存在');
          navigate('/items');
        }
      })
      .catch(() => {
        if (!cancelled) {
          // 回退：尝试从缓存列表找
          const cached = items.find((i) => i.id === id);
          if (cached) {
            form.setFieldsValue(cached);
            setPhotoBase64(cached.photo || '');
          }
        }
      });
    return () => { cancelled = true; };
  }, [id, isEdit, form, navigate, items]);

  const handleImageUpload = (file: File): boolean => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return false;
    }
    // Accept up to 10MB
    if (file.size > 10 * 1024 * 1024) {
      message.error('图片大小不能超过 10MB');
      return false;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 800;
        const TARGET_KB = 250;

        let { width, height } = img;
        // Scale down if too large
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        // Progressive compression: start at 0.7, drop until under target
        let quality = 0.7;
        let compressed = canvas.toDataURL('image/jpeg', quality);

        while (compressed.length > TARGET_KB * 1024 && quality > 0.2) {
          quality -= 0.1;
          compressed = canvas.toDataURL('image/jpeg', quality);
        }

        setPhotoBase64(compressed);
        const finalKB = Math.round(compressed.length / 1024);
        message.success(`图片已压缩至 ${finalKB}KB`);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
    return false;
  };

  const handleSubmit = (values: Record<string, unknown>) => {
    setLoading(true);
    setTimeout(() => {
      const existingItem = isEdit ? items.find((i) => i.id === id) : null;

      const data = {
        name: values.name as string,
        code: values.code as string,
        category: values.category as ItemCategory,
        quantity: values.quantity as number,
        availableQty: isEdit
          ? (values.quantity as number) - ((existingItem?.quantity || 0) - (existingItem?.availableQty || 0))
          : (values.quantity as number),
        location: values.location as string,
        // 保护原图：有新图用新图，否则保留数据库中的原图
        photo: photoBase64 || existingItem?.photo || undefined,
        notes: values.notes as string | undefined,
      };

      if (isEdit && id) {
        // Don't modify availableQty on edit for simplicity
        const existing = items.find((i) => i.id === id);
        const diff = (values.quantity as number) - (existing?.quantity || 0);
        updateItem(id, {
          ...data,
          availableQty: (existing?.availableQty || 0) + diff,
        });
        message.success('物品信息已更新');
      } else {
        addItem(data);
        message.success('物品已添加');
      }
      setLoading(false);
      navigate('/items');
    }, 300);
  };

  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Title level={4} type="secondary">仅管理员可操作</Title>
        <Button type="primary" onClick={() => navigate('/login')}>去登录</Button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 32 }}>
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/items')} style={{ marginBottom: 16, padding: 0 }}>
        返回物品列表
      </Button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Card style={{ borderRadius: 12 }}>
          <Title level={4} style={{ color: '#0C4A6E', marginBottom: 24 }}>
            {isEdit ? '编辑物品' : '添加物品'}
          </Title>

          <Form form={form} layout="vertical" onFinish={handleSubmit}
            initialValues={{
              quantity: 1,
              category: 'fixed_assets' as ItemCategory,
              code: `WP${Date.now().toString(36).toUpperCase().slice(-6)}`,
            }}
          >
            <Form.Item name="name" label="物品名称" rules={[{ required: true, message: '请输入物品名称' }]}>
              <Input placeholder="如：爱普生投影仪 CB-X51" />
            </Form.Item>

            <Form.Item name="code" label="物品编号" rules={[{ required: true, message: '请输入物品编号' }]}>
              <Input placeholder="如：WP20240101" />
            </Form.Item>

            <Form.Item name="category" label="物品分类" rules={[{ required: true }]}>
              <Select options={Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
            </Form.Item>

            <Form.Item name="quantity" label="总数量" rules={[{ required: true, message: '请输入数量' }]}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="location" label="存放位置" rules={[{ required: true, message: '请输入存放位置' }]}>
              <Input placeholder="如：综合楼302办公室 柜子A" />
            </Form.Item>

            <Form.Item label="物品照片">
              <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
                {photoBase64 && (
                  <img
                    src={photoBase64}
                    alt="预览"
                    style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file);
                    }}
                    style={{ display: 'none' }}
                    id="photo-input"
                  />
                  <Button
                    icon={<UploadOutlined />}
                    onClick={() => document.getElementById('photo-input')?.click()}
                  >
                    选择照片
                  </Button>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>支持 JPG/PNG，自动压缩至 200KB 以下</div>
                </div>
              </div>
            </Form.Item>

            <Form.Item name="notes" label="备注">
              <TextArea rows={3} placeholder="可选备注信息..." />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={loading}
                  style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', border: 'none', height: 40 }}>
                  {isEdit ? '保存修改' : '添加物品'}
                </Button>
                <Button onClick={() => navigate('/items')}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </motion.div>
    </div>
  );
}
