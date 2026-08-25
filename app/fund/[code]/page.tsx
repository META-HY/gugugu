'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Segmented,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useState } from 'react';
import useSWR from 'swr';
import { fundApi } from '@/lib/data/fundApi';
import { useFundStore } from '@/lib/store/useFundStore';
import { NAV_RANGES } from '@/lib/config';
import type { HoldingStock, NavRange } from '@/lib/types';
import { isTradingSession } from '@/lib/utils/tradeCalendar';
import { PctText } from '@/components/ui/Value';
import IntradayChart from '@/components/fund/IntradayChart';
import NavChart from '@/components/fund/NavChart';
import NavTable from '@/components/fund/NavTable';
import PurchaseManager from '@/components/fund/PurchaseManager';

export default function FundDetailPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;
  const refreshInterval = useFundStore((s) => s.settings.refreshInterval);
  const toggleWatch = useFundStore((s) => s.toggleWatch);
  const isWatched = useFundStore((s) => s.isWatched);
  const trading = isTradingSession();
  const [range, setRange] = useState<NavRange>('1Y');

  const { data: detail, error, isLoading } = useSWR(['detail', code], () => fundApi.detail(code));
  // 「当天」走盘中分时接口（交易时段按刷新频率轮询）；其余维度走历史净值
  const isIntraday = range === '1D';
  const { data: history, isValidating: historyUpdating } = useSWR(
    isIntraday ? null : ['history', code, range],
    () => fundApi.history(code, range)
  );
  const {
    data: intraday,
    error: intradayError,
    isValidating: intradayUpdating,
  } = useSWR(isIntraday ? ['intraday', code] : null, () => fundApi.intraday(code), {
    refreshInterval: trading ? refreshInterval : 0,
  });
  const { data: holdings } = useSWR(['holdings', code], () => fundApi.holdings(code));
  const { data: quote } = useSWR(['quote', code], () => fundApi.quotes([code]).then((l) => l[0]), {
    refreshInterval: trading ? refreshInterval : 0,
  });

  if (error) {
    return (
      <Card>
        <Empty description="未找到该基金 / 数据获取失败">
          <Button type="primary" onClick={() => router.back()}>
            返回
          </Button>
        </Empty>
      </Card>
    );
  }

  const currentRangeLabel = NAV_RANGES.find((r) => r.key === range)?.label ?? '';

  return (
    <div className="section-stagger" style={{ display: 'grid', gap: 16 }}>
      <div>
        <Space size="small" style={{ marginBottom: 12 }}>
          <Link href="/funds">
            <Button type="text" icon={<ArrowLeftOutlined />}>
              返回自选
            </Button>
          </Link>
          <Button
            type={isWatched(code) ? 'default' : 'primary'}
            icon={isWatched(code) ? <StarFilled /> : <StarOutlined />}
            onClick={() => toggleWatch(code)}
          >
            {isWatched(code) ? '已自选' : '加自选'}
          </Button>
        </Space>

        {isLoading || !detail ? (
          <Card>
            <Skeleton active title paragraph={{ rows: 2 }} />
          </Card>
        ) : (
          <Card styles={{ body: { padding: 20 } }}>
            <div className="fund-head">
              <div style={{ minWidth: 0 }}>
                <Space size={8} align="center" wrap>
                  <Typography.Title level={3} style={{ margin: 0 }}>
                    {detail.name}
                  </Typography.Title>
                  <Tag color="blue">{detail.type}</Tag>
                </Space>
                <Typography.Text type="secondary" style={{ marginLeft: 2 }}>
                  {detail.code} · {detail.company} · 成立 {detail.inceptionDate}
                </Typography.Text>
              </div>
              {quote && (
                <div className="fund-head-quote">
                  <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {quote.estimateNav.toFixed(4)}
                  </div>
                  <Space size={8}>
                    <PctText value={quote.estimateChangePct} />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      估值 {quote.estimateTime}
                    </Typography.Text>
                  </Space>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* 走势图 */}
      <Card
        title="净值走势"
        extra={
          <Segmented<NavRange>
            options={NAV_RANGES.map((r) => ({ label: r.label, value: r.key }))}
            value={range}
            onChange={setRange}
          />
        }
      >
        {isIntraday ? (
          intraday ? (
            <IntradayChart data={intraday} />
          ) : intradayError ? (
            <Empty description={`暂无盘中估值走势：${intradayError.message ?? '数据源不可用'}`} />
          ) : (
            <Skeleton active paragraph={{ rows: 8 }} />
          )
        ) : history ? (
          <NavChart data={history} maxDrawdown={detail?.maxDrawdown} />
        ) : (
          <Skeleton active paragraph={{ rows: 8 }} />
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          {isIntraday
            ? `按前十大重仓股行情加权估算 · ${intraday?.date ?? ''} · 悬停查看各时点估算净值与涨跌幅`
            : `当前维度：${currentRangeLabel} · 图表支持缩放 / 拖拽 / 悬停查看数值`}
          {(historyUpdating || intradayUpdating) && ' 加载中…'}
        </Typography.Text>
      </Card>

      {/* 持仓管理：多笔买入记录 + 累计收益 */}
      <Card
        title="我的持仓"
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            定投 / 分批买入 · 按份额计算收益
          </Typography.Text>
        }
      >
        <PurchaseManager code={code} quote={quote} />
      </Card>

      {/* 历史净值表格 */}
      <Card
        title="历史净值"
      >
        {isIntraday ? (
          <Typography.Text type="secondary">
            「当天」为盘中估值分时，历史净值请切换到「近1月」等维度查看。
          </Typography.Text>
        ) : isLoading || !detail ? (
          <Skeleton active />
        ) : (
          <NavTable data={history ?? []} />
        )}
      </Card>

      {/* 基本信息 */}
      {detail && (
        <Card
          title="基金详情"
        >
          <Descriptions
            column={{ xs: 1, sm: 2, md: 3 }}
            items={[
              { key: 'type', label: '基金类型', children: detail.type },
              { key: 'company', label: '基金公司', children: detail.company },
              { key: 'manager', label: '基金经理', children: `${detail.manager}（${detail.managerYears}）` },
              { key: 'inception', label: '成立时间', children: detail.inceptionDate },
              { key: 'scale', label: '基金规模', children: detail.scale },
              { key: 'drawdown', label: '最大回撤', children: `${detail.maxDrawdown.toFixed(2)}%` },
              { key: 'stock', label: '股票仓位', children: detail.stockRatio },
              { key: 'bond', label: '债券仓位', children: detail.bondRatio },
              { key: 'cash', label: '现金仓位', children: detail.cashRatio },
            ]}
          />
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
            {detail.description}
          </Typography.Paragraph>
        </Card>
      )}

      {/* 重仓股 */}
      <Card
        title="前十大重仓股"
        extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>数据来源：最新季报</Typography.Text>}
      >
        {holdings ? (
          <Table<HoldingStock>
            rowKey="name"
            dataSource={holdings}
            locale={{ emptyText: '暂无数据' }}
            pagination={false}
            size="small"
            scroll={{ x: 520 }}
            columns={[
              { title: '序号', width: 60, render: (_, __, i) => i + 1 },
              {
                title: '股票名称',
                dataIndex: 'name',
                render: (_, r) => (
                  <span>
                    {r.name}
                    {r.code && (
                      <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                        {r.code}
                      </Typography.Text>
                    )}
                  </span>
                ),
              },
              {
                title: '持仓占比',
                dataIndex: 'pct',
                align: 'right',
                render: (v: number) => `${v.toFixed(2)}%`,
              },
              {
                title: '当日涨跌幅',
                dataIndex: 'changePct',
                align: 'right',
                render: (v: number) => <PctText value={v} />,
              },
            ]}
          />
        ) : (
          <Skeleton active paragraph={{ rows: 6 }} />
        )}
      </Card>
    </div>
  );
}