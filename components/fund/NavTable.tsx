'use client';

import { Table } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useMemo } from 'react';
import type { NavPoint } from '@/lib/types';
import { ColoredText, PctText } from '@/components/ui/Value';

interface Props {
  data: NavPoint[];
}

export default function NavTable({ data }: Props) {
  const columns: ColumnsType<NavPoint> = useMemo(
    () => [
      {
        title: '日期',
        dataIndex: 'date',
        key: 'date',
        width: 140,
        sorter: (a, b) => a.date.localeCompare(b.date),
        defaultSortOrder: 'descend',
      },
      {
        title: '单位净值',
        dataIndex: 'unitNav',
        key: 'unitNav',
        align: 'right',
        render: (v: number) => v.toFixed(4),
      },
      {
        title: '累计净值',
        dataIndex: 'accNav',
        key: 'accNav',
        align: 'right',
        render: (v: number) => v.toFixed(4),
      },
      {
        title: '日涨跌幅',
        dataIndex: 'dailyChange',
        key: 'dailyChange',
        align: 'right',
        render: (v: number | null) => (v == null ? <ColoredText value={0}>--</ColoredText> : <PctText value={v} />),
      },
    ],
    []
  );

  const pagination: TablePaginationConfig = {
    pageSize: 20,
    showSizeChanger: false,
    showTotal: (total) => `共 ${total} 条`,
  };

  return (
    <Table<NavPoint>
      rowKey="date"
      columns={columns}
      dataSource={data}
      pagination={pagination}
      size="small"
      scroll={{ x: 520 }}
    />
  );
}