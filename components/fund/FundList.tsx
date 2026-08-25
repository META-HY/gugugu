'use client';

import Link from 'next/link';
import { AreaChartOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Empty,
  Grid,
  Popconfirm,
  Select,
  Skeleton,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { fundApi } from '@/lib/data/fundApi';
import { useFundStore } from '@/lib/store/useFundStore';
import type { FundIndustry, FundPurchase, FundQuote } from '@/lib/types';
import { changeColor } from '@/lib/utils/format';
import {
  calcCumulativeProfit,
  calcTodayProfit,
  sumPurchases,
  type Holdings,
} from '@/lib/utils/portfolio';
import { Amount, PctText } from '@/components/ui/Value';
import PortfolioTrend from './PortfolioTrend';

type SortKey = 'default' | 'code' | 'pct' | 'profit';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: '默认顺序', value: 'default' },
  { label: '估算涨跌幅', value: 'pct' },
  { label: '预估收益', value: 'profit' },
  { label: '基金代码', value: 'code' },
];

interface Row {
  code: string;
  name?: string;
  type?: string;
  quote?: FundQuote;
  industries?: FundIndustry[];
  amount?: number;
  /** 买入记录汇总（有记录时优先于 amount） */
  holdings?: Holdings | null;
  /** 原始买入记录（组合收益走势用） */
  purchases?: FundPurchase[];
}

/** 预估收益：优先按买入记录份额计算市值涨跌，其次按持仓金额，最后退回接口模拟值（1 万份） */
function calcProfit(row: Row): number | undefined {
  return calcTodayProfit(row.holdings ?? null, row.amount, row.quote);
}

/** 持仓单元格：统一引导到详情页「我的持仓」记录买入（按份额计算收益），替代列表内联单值编辑 */
function HoldingsLink({ row }: { row: Row }) {
  const { holdings, amount, code } = row;
  const text = holdings ? (
    <>
      <Amount value={holdings.invested} digits={2} /> 元
      <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 4 }}>
        {holdings.count}笔
      </span>
    </>
  ) : amount != null ? (
    <>
      <Amount value={amount} digits={2} /> 元
    </>
  ) : (
    '+ 记持仓'
  );

  return (
    <Tooltip
      title={
        holdings
          ? `共 ${holdings.count} 笔买入，点击进入详情页「我的持仓」管理`
          : '点击进入详情页「我的持仓」，记录买入后按份额计算收益'
      }
    >
      <Link
        href={`/fund/${code}`}
        style={
          holdings || amount != null
            ? { color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }
            : { color: 'var(--text-secondary)', fontSize: 12 }
        }
      >
        {text}
      </Link>
    </Tooltip>
  );
}

/** 汇总栏：总投入 + 今日预估总盈亏 + 累计总盈亏/收益率 + 可展开的组合收益走势（仅统计已设持仓/买入记录的基金） */
function SummaryBar({ rows }: { rows: Row[] }) {
  const privacyMode = useFundStore((s) => s.settings.privacyMode);
  const [trendOpen, setTrendOpen] = useState(false);
  const setRows = rows.filter((r) => r.holdings || r.amount != null);
  const totalInvested = useMemo(
    () => setRows.reduce((sum, r) => sum + (r.holdings?.invested ?? r.amount ?? 0), 0),
    [setRows]
  );
  const totalProfit = useMemo(
    () => setRows.reduce((sum, r) => sum + (calcProfit(r) ?? 0), 0),
    [setRows]
  );
  // 累计总盈亏仅对有买入记录的基金求和（单值持仓无成本明细，无法计算累计）
  const hasHoldings = rows.some((r) => r.holdings);
  const totalCumulative = useMemo(
    () =>
      rows.reduce((sum, r) => (r.holdings ? sum + (calcCumulativeProfit(r.holdings, r.quote) ?? 0) : sum), 0),
    [rows]
  );
  // 累计收益率 = 累计总盈亏 ÷ 买入记录总投入（与累计总盈亏同口径）
  const investedPurchases = useMemo(
    () => rows.reduce((sum, r) => sum + (r.holdings?.invested ?? 0), 0),
    [rows]
  );
  const cumulativePct =
    investedPurchases > 0 ? (totalCumulative / investedPurchases) * 100 : undefined;
  const unsettledCount = rows.length - setRows.length;

  if (!setRows.length) {
    return (
      <div className="glass-panel summary-bar" style={{ color: 'var(--text-secondary)' }}>
        尚未设置持仓，暂无法统计汇总。点击列表「持仓金额」列的“+ 记持仓”，进入详情页「我的持仓」记录买入即可纳入汇总。
      </div>
    );
  }

  return (
    <div className="glass-panel summary-bar">
      <div className="summary-item">
        <div className="summary-label">已设持仓基金</div>
        <div className="summary-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {setRows.length}
          {unsettledCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {` / ${rows.length}`}
            </span>
          )}
        </div>
      </div>
      <div className="summary-item">
        <div className="summary-label">总投入金额</div>
        <div className="summary-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <Amount value={totalInvested} digits={2} /> 元
        </div>
      </div>
      <div className="summary-item">
        <div className="summary-label">今日预估总盈亏</div>
        <div className="summary-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: changeColor(totalProfit) }}>
            {totalProfit > 0 ? '+' : totalProfit < 0 ? '-' : ''}
            <Amount value={Math.abs(totalProfit)} digits={2} />
          </span>
          <span className="summary-hint">（按持仓 × 估算涨跌幅）</span>
        </div>
      </div>
      {hasHoldings && (
        <div className="summary-item">
          <div className="summary-label">累计总盈亏</div>
          <div className="summary-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: changeColor(totalCumulative) }}>
              {totalCumulative > 0 ? '+' : totalCumulative < 0 ? '-' : ''}
              <Amount value={Math.abs(totalCumulative)} digits={2} />
            </span>
            <span className="summary-hint">（按买入记录份额估算）</span>
          </div>
        </div>
      )}
      {hasHoldings && cumulativePct != null && (
        <div className="summary-item">
          <div className="summary-label">累计收益率</div>
          <div className="summary-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <PctText value={cumulativePct} />
            <span className="summary-hint">（累计盈亏 ÷ 总投入）</span>
          </div>
        </div>
      )}
      {hasHoldings && (
        <Button
          size="small"
          type="text"
          className="summary-trend-toggle"
          icon={<AreaChartOutlined />}
          onClick={() => setTrendOpen((v) => !v)}
        >
          {trendOpen ? '收起走势' : '收益走势'}
        </Button>
      )}
      {trendOpen && hasHoldings && (
        <div className="summary-trend">
          {privacyMode ? (
            <div
              style={{
                padding: '28px 0',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: 12,
              }}
            >
              隐私模式下已隐藏收益走势
            </div>
          ) : (
            <PortfolioTrend
              funds={rows
                .filter((r) => r.holdings)
                .map((r) => ({ code: r.code, purchases: r.purchases ?? [], quote: r.quote }))}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** 重仓行业标签：名称即标签，悬停显示合计占净值比 */
function IndustryTags({ list }: { list?: FundIndustry[] }) {
  if (!list?.length) return null;
  return (
    <>
      {list.map((it) => (
        <Tooltip key={it.name} title={`重仓行业 · 占净值比约 ${it.pct}%`}>
          <Tag
            className="industry-tag"
            style={{ marginLeft: 6, fontSize: 11, lineHeight: '18px', paddingInline: 6 }}
          >
            {it.name}
          </Tag>
        </Tooltip>
      ))}
    </>
  );
}

export default function FundList({ codes }: { codes: string[] }) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [industriesMap, setIndustriesMap] = useState<Record<string, FundIndustry[]>>({});
  const quotes = useFundStore((s) => s.quotes);
  const quoteLoading = useFundStore((s) => s.quoteLoading);
  const hydrated = useFundStore((s) => s.hydrated);
  const removeWatch = useFundStore((s) => s.removeWatch);
  const watchlist = useFundStore((s) => s.watchlist);

  // 重仓行业标签：自选列表变化时批量拉取，失败静默（仅少展示标签）
  const codesKey = codes.join(',');
  useEffect(() => {
    const list = codesKey.split(',').filter(Boolean);
    if (!list.length) return;
    let cancelled = false;
    fundApi
      .industries(list)
      .then((data) => {
        if (!cancelled) setIndustriesMap(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [codesKey]);

  // code → 持仓金额 / 买入记录映射
  const amountMap = useMemo(() => {
    const m: Record<string, number | undefined> = {};
    watchlist.forEach((w) => (m[w.code] = w.amount));
    return m;
  }, [watchlist]);
  const holdingsMap = useMemo(() => {
    const m: Record<string, ReturnType<typeof sumPurchases>> = {};
    watchlist.forEach((w) => (m[w.code] = sumPurchases(w.purchases)));
    return m;
  }, [watchlist]);
  const purchasesMap = useMemo(() => {
    const m: Record<string, FundPurchase[] | undefined> = {};
    watchlist.forEach((w) => (m[w.code] = w.purchases));
    return m;
  }, [watchlist]);

  const rows = useMemo<Row[]>(
    () =>
      codes.map((code) => {
        const meta = fundApi.meta(code);
        const quote = quotes[code];
        // 真实模式下 meta 为异步，回退到行情里的名称/类型
        return {
          code,
          name: meta?.name ?? quote?.name,
          type: meta?.type ?? quote?.type,
          quote,
          industries: industriesMap[code],
          amount: amountMap[code],
          holdings: holdingsMap[code] ?? null,
          purchases: purchasesMap[code],
        };
      }),
    [codes, quotes, industriesMap, amountMap, holdingsMap, purchasesMap]
  );

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sortKey === 'code') list.sort((a, b) => a.code.localeCompare(b.code));
    if (sortKey === 'pct')
      list.sort((a, b) => (b.quote?.estimateChangePct ?? 0) - (a.quote?.estimateChangePct ?? 0));
    if (sortKey === 'profit') list.sort((a, b) => (calcProfit(b) ?? 0) - (calcProfit(a) ?? 0));
    return list;
  }, [rows, sortKey]);

  // 首屏骨架
  if (!hydrated || (quoteLoading && !Object.keys(quotes).length)) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  if (!sorted.length) {
    return (
      <Card>
        <Empty
          description={
            <span>
              还没有自选基金。使用上方搜索框输入基金代码，点击即可添加到自选。
            </span>
          }
        />
      </Card>
    );
  }

  const columns: ColumnsType<Row> = [
    {
      title: '基金',
      key: 'fund',
      render: (_, r) => (
        <Link href={`/fund/${r.code}`} style={{ display: 'inline-block' }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name ?? '加载中…'}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {r.code}
            {r.type && <Tag style={{ marginLeft: 8 }}>{r.type}</Tag>}
            <IndustryTags list={r.industries} />
          </div>
        </Link>
      ),
    },
    {
      title: '估算净值',
      key: 'estimateNav',
      align: 'right',
      render: (_, r) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {r.quote ? r.quote.estimateNav.toFixed(4) : '--'}
        </span>
      ),
    },
    {
      title: '估算涨跌幅',
      key: 'pct',
      align: 'right',
      render: (_, r) =>
        r.quote ? <PctText value={r.quote.estimateChangePct} /> : <span>--</span>,
    },
    {
      title: '持仓金额',
      key: 'amount',
      align: 'right',
      render: (_, r) => <HoldingsLink row={r} />,
    },
    {
      title: '预估收益',
      key: 'profit',
      align: 'right',
      render: (_, r) => {
        const profit = calcProfit(r);
        return profit != null ? (
          <span style={{ color: changeColor(profit), fontVariantNumeric: 'tabular-nums' }}>
            <Amount value={profit} />
          </span>
        ) : (
          <span>--</span>
        );
      },
    },
    {
      title: '累计收益',
      key: 'cumulative',
      align: 'right',
      render: (_, r) => {
        if (!r.holdings) return <span>--</span>;
        const profit = calcCumulativeProfit(r.holdings, r.quote);
        if (profit == null) return <span>--</span>;
        const pct = r.holdings.invested > 0 ? (profit / r.holdings.invested) * 100 : 0;
        return (
          <span style={{ color: changeColor(profit), fontVariantNumeric: 'tabular-nums' }}>
            {profit > 0 ? '+' : profit < 0 ? '-' : ''}
            <Amount value={Math.abs(profit)} />
            <span style={{ fontSize: 12, marginLeft: 2 }}>
              <PctText value={pct} />
            </span>
          </span>
        );
      },
    },
    {
      title: '更新时间',
      key: 'time',
      align: 'right',
      render: (_, r) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
          {r.quote?.estimateTime ?? '--'}
          {r.quote?.source === 'mock' && (
            <Tag
              color="warning"
              style={{ marginLeft: 6, fontSize: 11, lineHeight: '16px', paddingInline: 4 }}
            >
              模拟
            </Tag>
          )}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      align: 'right',
      render: (_, r) => (
        <Popconfirm
          title="从自选移除该基金？"
          okText="移除"
          okButtonProps={{ danger: true }}
          onConfirm={() => removeWatch(r.code)}
        >
          <a href="#" onClick={(e) => e.preventDefault()}>
            移除
          </a>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Typography.Text type="secondary">共 {sorted.length} 只自选基金</Typography.Text>
        <Select
          size="small"
          style={{ minWidth: 140 }}
          value={sortKey}
          options={SORT_OPTIONS}
          onChange={setSortKey}
        />
      </div>

      <SummaryBar rows={sorted} />

      {isMobile ? <MobileList rows={sorted} onRemove={removeWatch} /> : <DesktopTable rows={sorted} columns={columns} />}
    </div>
  );
}

function DesktopTable({ rows, columns }: { rows: Row[]; columns: ColumnsType<Row> }) {
  return (
    <div className="glass-panel">
      <Table<Row>
        size="middle"
        rowKey="code"
        columns={columns}
        dataSource={rows}
        pagination={rows.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
      />
    </div>
  );
}

function MobileList({
  rows,
  onRemove,
}: {
  rows: Row[];
  onRemove: (code: string) => void;
}) {
  return (
    <div className="stagger-in" style={{ display: 'grid', gap: 10 }}>
      {rows.map((r, i) => (
        <Card
          key={r.code}
          size="small"
          className="hover-lift"
          style={{ '--i': i } as CSSProperties}
          styles={{ body: { padding: 12 } }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link href={`/fund/${r.code}`} style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{r.name ?? '加载中…'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{r.code}</span>
                {r.type && <Tag style={{ marginLeft: 6 }}>{r.type}</Tag>}
                <IndustryTags list={r.industries} />
              </div>
            </Link>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {r.quote ? r.quote.estimateNav.toFixed(4) : '--'}
              </div>
              <div>
                {r.quote && <PctText value={r.quote.estimateChangePct} />}
              </div>
              {r.quote && (
                <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>
                  {r.quote.estimateTime}
                  {r.quote.source === 'mock' && (
                    <span style={{ marginLeft: 4, color: '#d48806' }}>模拟</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px dashed var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              持仓
              <span style={{ marginLeft: 6 }}>
                <HoldingsLink row={r} />
              </span>
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              预估收益
              {(() => {
                const profit = calcProfit(r);
                return (
                  <span
                    style={{
                      marginLeft: 6,
                      color: profit != null ? changeColor(profit) : undefined,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {profit != null ? <Amount value={profit} /> : '--'}
                  </span>
                );
              })()}
            </span>
            {r.holdings && (
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                累计收益
                {(() => {
                  const profit = calcCumulativeProfit(r.holdings, r.quote);
                  return (
                    <span
                      style={{
                        marginLeft: 6,
                        color: profit != null ? changeColor(profit) : undefined,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {profit != null ? (
                        <>
                          {profit > 0 ? '+' : profit < 0 ? '-' : ''}
                          <Amount value={Math.abs(profit)} />
                          <span style={{ fontSize: 11, marginLeft: 2 }}>
                            <PctText
                              value={r.holdings.invested > 0 ? (profit / r.holdings.invested) * 100 : 0}
                            />
                          </span>
                        </>
                      ) : (
                        '--'
                      )}
                    </span>
                  );
                })()}
              </span>
            )}
            <Popconfirm
              title="从自选移除？"
              okText="移除"
              okButtonProps={{ danger: true }}
              onConfirm={() => onRemove(r.code)}
            >
              <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 12 }}>
                移除
              </a>
            </Popconfirm>
          </div>
        </Card>
      ))}
    </div>
  );
}