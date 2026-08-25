'use client';

import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Alert, Segmented, Spin } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fundApi } from '@/lib/data/fundApi';
import { useResolvedDarkTheme } from '@/lib/hooks/useResolvedDarkTheme';
import { buildPortfolioSeries, pickNavRange } from '@/lib/utils/portfolio';
import type { FundPurchase, FundQuote, NavPoint, NavRange } from '@/lib/types';

export interface PortfolioFund {
  code: string;
  purchases: FundPurchase[];
  quote?: FundQuote;
}

/** 分基金曲线调色板（低饱和柔和色；组合线始终红涨绿跌） */
const FUND_PALETTE = [
  '#7ea6d9',
  '#85c4a9',
  '#d9bd7e',
  '#a997d6',
  '#89c3dd',
  '#d3a3b8',
  '#dfae8d',
  '#8fbdba',
];

const hexToRgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * 收益走势曲线：「组合 / 各持仓基金」单选切换，同一时间只显示一条曲线。
 * 组合线红涨绿跌 + 面积渐变；基金线用其柔和专属色。
 * 区间自动覆盖最早买入日；末点用估算净值，与汇总栏「累计总盈亏」同口径。
 */
export default function PortfolioTrend({ funds }: { funds: PortfolioFund[] }) {
  const dark = useResolvedDarkTheme();

  const [view, setView] = useState<string>('portfolio');

  const codesKey = useMemo(() => funds.map((f) => f.code).join(','), [funds]);

  // 覆盖最早买入日所需的净值区间
  const range = useMemo<NavRange>(() => {
    const dates = funds.flatMap((f) => f.purchases.map((p) => p.date)).filter(Boolean);
    if (!dates.length) return '1M';
    const days = dayjs().diff(dayjs(dates.reduce((a, b) => (a < b ? a : b))), 'day') + 1;
    return pickNavRange(days);
  }, [funds]);

  // 各基金历史净值批量拉取，单只失败静默跳过（走势按买入净值平台兜底）
  const { data: histories, isLoading, error } = useSWR<Record<string, NavPoint[]>>(
    codesKey ? ['portfolio-histories', codesKey, range] : null,
    async () => {
      const entries = await Promise.all(
        funds.map(async (f) => [f.code, await fundApi.history(f.code, range).catch(() => [])] as const)
      );
      return Object.fromEntries(entries) as Record<string, NavPoint[]>;
    },
    { revalidateOnFocus: false }
  );

  const series = useMemo(() => {
    if (!histories) return null;
    return buildPortfolioSeries(
      funds.map((f) => ({ code: f.code, purchases: f.purchases, history: histories[f.code] ?? [] })),
      {
        date: dayjs().format('YYYY-MM-DD'),
        navs: Object.fromEntries(funds.map((f) => [f.code, f.quote?.estimateNav ?? 0])),
      }
    );
  }, [funds, histories]);

  // 视图项：组合 + 各持仓基金（单选，切换查看，不同时显示）
  const viewItems = useMemo(
    () => [
      { label: '组合', value: 'portfolio' },
      ...funds.map((f) => ({ label: f.quote?.name ?? f.code, value: f.code })),
    ],
    [funds]
  );
  // 所选基金被移除（如清除买入记录）时回退组合视图
  const effView = useMemo(
    () => (view !== 'portfolio' && series?.funds.some((f) => f.code === view) ? view : 'portfolio'),
    [view, series]
  );
  const isPortfolioView = effView === 'portfolio';
  const fundName = funds.find((f) => f.code === effView)?.quote?.name ?? effView;

  const axisColor = dark ? '#8a94a3' : '#60666d';
  const splitLine = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const up = dark ? '#ff5c4d' : '#d01c1c';
  const down = dark ? '#1fc989' : '#06784f';
  const todayStr = dayjs().format('YYYY-MM-DD');

  const fmtMoney = (v: number) =>
    `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // option memo + update 动画为 0：行情轮询刷新今日估算点时不重放动画
  const option = useMemo<EChartsOption>(() => {
    if (!series || !series.portfolio.length) return {};
    const isPortfolio = effView === 'portfolio';
    const fundIdx = isPortfolio ? -1 : series.funds.findIndex((f) => f.code === effView);
    // 基金视图下首笔买入前为 null（线从首笔买入日起画）
    const points = isPortfolio ? series.portfolio : series.funds[fundIdx]?.points ?? [];
    const data = points.map((p) => (p ? Number(p.profit.toFixed(2)) : null));
    const finalProfit = [...points].reverse().find((p) => p)?.profit ?? 0;

    const lineColor = isPortfolio
      ? finalProfit >= 0
        ? up
        : down
      : FUND_PALETTE[(fundIdx >= 0 ? fundIdx : 0) % FUND_PALETTE.length];
    const areaFrom = hexToRgba(lineColor, isPortfolio ? (dark ? 0.22 : 0.16) : 0.18);
    const areaTo = hexToRgba(lineColor, 0.01);

    return {
      backgroundColor: 'transparent',
      animationDuration: 700,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 0,
      tooltip: {
        trigger: 'axis',
        backgroundColor: dark ? '#232a36' : '#fff',
        borderColor: splitLine,
        textStyle: { color: axisColor },
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = arr[0]?.dataIndex as number;
          const pt = points[idx];
          if (!pt) return '';
          const pct = pt.invested > 0 ? (pt.profit / pt.invested) * 100 : 0;
          const sign = pct >= 0 ? '+' : '';
          const profitColor = pt.profit >= 0 ? up : down;
          return (
            `<div style="font-size:12px;color:${axisColor}">${pt.date}${pt.date === todayStr ? '（今日估算）' : ''}</div>` +
            `<div style="margin-top:3px">${arr[0].marker}<b style="color:${profitColor}">${fmtMoney(pt.profit)}</b> <span style="font-size:11px">（${sign}${pct.toFixed(2)}%）</span></div>` +
            `<div style="margin-top:1px;font-size:11px">市值 ${pt.marketValue.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} · 投入 ${pt.invested.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</div>`
          );
        },
      },
      grid: { left: 8, right: 16, top: 16, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: series.portfolio.map((p) => p.date),
        axisLine: { lineStyle: { color: splitLine } },
        axisLabel: { color: axisColor, formatter: (v: string) => v.slice(5).replace('-', '/') },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: axisColor, formatter: (v: number) => fmtMoney(v) },
        splitLine: { lineStyle: { color: splitLine } },
      },
      series: [
        {
          name: isPortfolio ? '组合' : fundName,
          type: 'line',
          data,
          symbol: 'none',
          smooth: true,
          connectNulls: false,
          lineStyle: { width: 2.5, color: lineColor },
          itemStyle: { color: lineColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: areaFrom },
                { offset: 1, color: areaTo },
              ],
            },
          },
          markLine: {
            symbol: 'none',
            silent: true,
            data: [{ yAxis: 0 }],
            lineStyle: { color: axisColor, opacity: 0.45, type: 'dashed' },
            label: { show: false },
          },
        },
      ],
    };
  }, [series, dark, effView, funds, todayStr, axisColor, splitLine, up, down]);

  if (!codesKey) return null;

  if (isLoading && !histories) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '56px 0' }}>
        <Spin />
      </div>
    );
  }
  if (error && !histories) {
    return <Alert type="warning" showIcon title="收益走势加载失败，请稍后重试" />;
  }
  if (!series || !series.portfolio.length) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
        暂无收益走势数据（需各基金历史净值可用）
      </div>
    );
  }

  return (
    <div>
      <Segmented
        size="small"
        value={effView}
        options={viewItems}
        onChange={(v) => setView(v as string)}
        style={{ marginBottom: 8 }}
      />
      <ReactECharts
        option={option}
        style={{ height: 'clamp(240px, 34vh, 340px)', width: '100%' }}
        notMerge
        lazyUpdate
      />
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>
        {isPortfolioView ? `${series.funds.length} 只基金组合` : fundName} · {series.portfolio[0].date}{' '}
        起 · 末点为今日估算
      </div>
    </div>
  );
}
