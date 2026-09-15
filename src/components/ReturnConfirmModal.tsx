import { useState, useEffect } from 'react';
import { Modal, Checkbox, InputNumber, Input, message } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import type { BorrowRecord } from '../types';

interface ReturnConfirmModalProps {
  /** 要归还的记录；为 null 时弹窗内不渲染内容 */
  record: BorrowRecord | null;
  open: boolean;
  onClose: () => void;
  /** 执行归还，返回 true 表示成功（成功后弹窗自行关闭） */
  onConfirm: (recordId: string, damagedQty: number, damagedNote?: string) => Promise<boolean>;
}

/**
 * 归还确认弹窗 —— 「借记记录」页与「归还确认」页共用，避免两处逻辑分叉。
 *
 * 损坏数量语义：填 N 表示这 N 件从库存总数里扣掉（不再入库），
 * 其余（quantity - N）正常归还入库。
 */
export default function ReturnConfirmModal({
  record,
  open,
  onClose,
  onConfirm,
}: ReturnConfirmModalProps) {
  const [hasDamage, setHasDamage] = useState(false);
  const [damagedQty, setDamagedQty] = useState<number | null>(null);
  const [damagedNote, setDamagedNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 每次打开都重置，避免上一条记录的输入残留
  useEffect(() => {
    if (open) {
      setHasDamage(false);
      setDamagedQty(null);
      setDamagedNote('');
      setSubmitting(false);
    }
  }, [open]);

  const handleOk = async () => {
    if (!record) return;

    // 勾了「有损坏」却没填数量 —— 明确提示，不静默按 0 处理
    if (hasDamage && !damagedQty) {
      message.warning('请填写损坏/消耗数量');
      return;
    }

    setSubmitting(true);
    try {
      const ok = await onConfirm(
        record.id,
        hasDamage ? (damagedQty || 0) : 0,
        hasDamage ? (damagedNote || undefined) : undefined,
      );
      if (ok) {
        message.success('归还确认成功！');
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
          归还确认
        </span>
      }
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="确认归还"
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
            数量：<strong>{record.quantity} 件</strong>
          </div>

          <Checkbox
            checked={hasDamage}
            onChange={(e) => {
              setHasDamage(e.target.checked);
              // 取消勾选时把数量与说明一并清掉，避免残留后被误提交
              if (!e.target.checked) {
                setDamagedQty(null);
                setDamagedNote('');
              }
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
                max={record.quantity}
                value={damagedQty}
                onChange={(v) => setDamagedQty(v)}
                placeholder={`最多 ${record.quantity} 件`}
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
  );
}
