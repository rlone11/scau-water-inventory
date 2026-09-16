import { useState, useEffect } from 'react';
import { Modal, Radio, InputNumber, Input, message, Space, Divider } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import type { BorrowRecord } from '../types';

interface ReturnConfirmModalProps {
  /** 要核销的记录；为 null 时弹窗内不渲染内容 */
  record: BorrowRecord | null;
  open: boolean;
  onClose: () => void;
  /**
   * 执行核销。consumedQty = 没回到库存的件数：
   * 0 = 全部归还，等于 quantity = 全部消耗，中间值 = 部分消耗。
   * 返回 true 表示成功（成功后弹窗自行关闭）。
   */
  onConfirm: (recordId: string, consumedQty: number, consumedNote?: string) => Promise<boolean>;
}

/** 核销方式 */
type SettleMode = 'return-all' | 'consume-all' | 'partial';

/**
 * 物品核销弹窗 —— 「借记记录」页与「物品核销」页共用，避免两处逻辑分叉。
 *
 * 一件物品借出去后有两种结局，这里都要能登记：
 * - 归还：物品回到库存，可借数量加回去
 * - 消耗：物品不再回来（一次性用品用掉、损耗品报废），从库存总数里扣掉
 *
 * 库存数学见 useBorrowing.returnItem —— 只有 (quantity - consumedQty) 那部分会入库。
 */
export default function ReturnConfirmModal({
  record,
  open,
  onClose,
  onConfirm,
}: ReturnConfirmModalProps) {
  const [mode, setMode] = useState<SettleMode>('return-all');
  /** 部分核销时的归还件数；消耗件数 = quantity - 归还件数，两者联动 */
  const [returnQty, setReturnQty] = useState<number>(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 每次打开都重置，避免上一条记录的输入残留
  useEffect(() => {
    if (open) {
      setMode('return-all');
      setReturnQty(0);
      setNote('');
      setSubmitting(false);
    }
  }, [open]);

  const total = record?.quantity ?? 0;

  /** 没回到库存的件数 —— 三种方式各自算出来 */
  const consumedQty =
    mode === 'consume-all' ? total : mode === 'partial' ? total - returnQty : 0;

  const clamp = (v: number | null) => Math.min(Math.max(v ?? 0, 0), total);

  const handleOk = async () => {
    if (!record) return;

    setSubmitting(true);
    try {
      const ok = await onConfirm(
        record.id,
        consumedQty,
        consumedQty > 0 ? note || undefined : undefined,
      );
      if (ok) {
        message.success(consumedQty === total ? '已登记为全部消耗' : '核销成功！');
        onClose();
      } else {
        message.error('操作失败');
      }
    } finally {
      // 无论成败都复位，否则失败后按钮会一直转圈、还可能被重复点击
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <span>
          <ExclamationCircleOutlined style={{ color: '#0EA5E9', marginRight: 8 }} />
          物品核销
        </span>
      }
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="确认核销"
      cancelText="取消"
      confirmLoading={submitting}
      okButtonProps={{
        style: { background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', border: 'none' },
      }}
    >
      {record && (
        <div>
          <div style={{ fontSize: 14, marginBottom: 16, lineHeight: 1.9 }}>
            物品：<strong>{record.itemName}</strong>
            <span style={{ margin: '0 8px', color: '#BAE6FD' }}>·</span>
            借用人：<strong>{record.borrowerName}</strong>
            <span style={{ margin: '0 8px', color: '#BAE6FD' }}>·</span>
            借出数量：<strong>{record.quantity} 件</strong>
          </div>

          <Radio.Group
            value={mode}
            onChange={(e) => {
              const next = e.target.value as SettleMode;
              // 切到「部分」时给一个中间值。默认 0 的话等于又一次「全部消耗」，
              // 和上面的选项重复，等于白点一下
              if (next === 'partial' && (returnQty === 0 || returnQty === total)) {
                setReturnQty(Math.max(1, total - 1));
              }
              setMode(next);
            }}
          >
            <Space direction="vertical" size={10}>
              <Radio value="return-all">全部归还（{total} 件）</Radio>
              <Radio value="consume-all">全部消耗（{total} 件）</Radio>
              {/* 只有 1 件时不存在"部分"，不显示这个选项免得误导 */}
              {total > 1 && <Radio value="partial">部分归还 / 消耗</Radio>}
            </Space>
          </Radio.Group>

          {mode === 'partial' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{ marginLeft: 24, marginTop: 12 }}
            >
              <Space size={12} wrap>
                <span style={{ fontSize: 13, color: '#64748B' }}>归还</span>
                <InputNumber
                  min={0}
                  max={total}
                  value={returnQty}
                  onChange={(v) => setReturnQty(clamp(v))}
                  addonAfter="件"
                  style={{ width: 120 }}
                />
                <span style={{ fontSize: 13, color: '#64748B' }}>消耗</span>
                <InputNumber
                  min={0}
                  max={total}
                  value={total - returnQty}
                  // 改消耗件数时反过来推归还件数，两个框始终互补
                  onChange={(v) => setReturnQty(total - clamp(v))}
                  addonAfter="件"
                  style={{ width: 120 }}
                />
              </Space>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>
                两者之和固定为借出的 {total} 件；消耗的部分不回补可借、并从库存总数里扣掉
              </div>
            </motion.div>
          )}

          {consumedQty > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{ marginTop: 16 }}
            >
              <Divider style={{ margin: '0 0 12px' }} />
              <div style={{ fontSize: 13, color: '#64748B', marginBottom: 6 }}>
                消耗说明（选填）：
              </div>
              <Input.TextArea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="如：一次性纸杯用尽、雨伞骨架断裂..."
                maxLength={200}
              />
            </motion.div>
          )}
        </div>
      )}
    </Modal>
  );
}
