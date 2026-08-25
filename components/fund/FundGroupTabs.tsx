'use client';

import { Modal, Tabs, Input } from 'antd';
import { useState } from 'react';
import { useFundStore } from '@/lib/store/useFundStore';

interface Props {
  value: string;
  onChange: (key: string) => void;
}

export default function FundGroupTabs({ value, onChange }: Props) {
  const groups = useFundStore((s) => s.groups);
  const addGroup = useFundStore((s) => s.addGroup);
  const removeGroup = useFundStore((s) => s.removeGroup);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const items = [
    { key: 'all', label: '全部', closable: false },
    ...groups.map((g) => ({ key: g.id, label: g.name, closable: !g.builtin })),
  ];

  const submit = () => {
    if (!name.trim()) return;
    addGroup(name);
    setName('');
    setEditing(false);
  };

  return (
    <div style={{ margin: '12px 0 4px' }}>
      <Tabs
        type="editable-card"
        activeKey={value}
        onChange={onChange}
        items={items}
        onEdit={(targetKey, action) => {
          if (action === 'add') setEditing(true);
          if (action === 'remove' && typeof targetKey === 'string' && targetKey !== 'all') {
            Modal.confirm({
              title: '删除分组',
              content: '该分组下的基金将移入“默认分组”，确定删除吗？',
              okText: '删除',
              okButtonProps: { danger: true },
              onOk: () => removeGroup(targetKey),
            });
          }
        }}
        hideAdd={false}
      />
      <Modal
        open={editing}
        title="新建分组"
        onOk={submit}
        okText="创建"
        onCancel={() => setEditing(false)}
      >
        <Input
          autoFocus
          placeholder="分组名称，如：长期持有"
          maxLength={12}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={submit}
        />
      </Modal>
    </div>
  );
}