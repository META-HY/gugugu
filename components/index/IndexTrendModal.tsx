'use client';

import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Alert, Modal, Segmented, Spin } from 'antd';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fundApi } from '@/lib/data/fundApi';
import { useResolvedDarkTheme } from '@/lib/hooks/useResolvedDarkTheme';
import { formatSigned } from '@/lib/utils/format';
import type { IndexQuote, IndexTrend, IndexTrendRange } from '@/lib/types';

const RANGE_OPTIONS: { label: string; value: IndexTrendRange }[] = [
  { label: '实时', value: 'rt' },
  { label: '日', value: 'day' },
  { label: '五日', value: '5d' },
  { label: '月', value: 'mon' },
  { label: '年', value: 'yr' },
];

const RANGE_DESC: Record<IndexTrendRange, string> = {
  rt: '当日分时',
  '5d': '近5个交易日分时',
  day: '日K · 近1年',
  mon: '月K · 近10年',
  yr: '年K · 成立以来',
};

/**
 * 指数走势弹窗：点击指数卡片后展示五个周期（实时/五日/日K/月K/年K）。
 * 线色按「最新 vs 基准」定向：实时基准昨收、五日基准窗口前收盘、K线基准首点。
 */
export default function IndexTrendModal({
  index,
  open,
  onClose,
}: {
  index: IndexQuote | null;
  open: boolean;
  onClose: () => void;
}) {
  const dark = useResolvedDarkTheme();
  const [range, setRange] = useState<IndexTrendRange>('rt');

  const { data, isLoading, error } = useSWR<IndexTrend>(
    open && index ? ['index-trend', index.code, range] : null,
    () => fundApi.indexTrend(index!.code, range),
    // keepPreviousData：切换周期时保留上一周期的 data/图表，避免图表卸载重挂导致的闪烁
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const axisColor = dark ? '#8a94a3' : '#60666d';
  const splitLine = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const up = dark ? '#ff5c4d' : '#d01c1c';
  const down = dark ? '#1fc989' : '#06784f';

  const r = data?.range ?? range;
  const points = data?.points ?? [];
  const base = data?.base || points[0]?.close || 0;
  const last = points[points.length - 1]?.close ?? 0;
  const rising = base ? last >= base : true;
  const lineColor = rising ? up : down;
  const areaColor = rising
    ? dark
      ? ['rgba(255,92,77,0.30)', 'rgba(255,92,77,0.01)']
      : ['rgba(208,28,28,0.20)', 'rgba(208,28,28,0.01)']
    : dark
      ? ['rgba(31,201,137,0.30)', 'rgba(31,201,137,0.01)']
      : ['rgba(6,120,79,0.20)', 'rgba(6,120,79,0.01)'];

  // 五日图：换日首点才带日期前缀，tooltip 需要完整时间，这里逐步补回日期
  let curDay = '';
  const tooltipLabels = points.map((p) => {
    if (r !== '5d') return p.label;
    if (p.label.includes(' ')) {
      curDay = p.label.slice(0, 5);
      return p.label;
    }
    return curDay ? `${curDay} ${p.label}` : p.label;
  });

  const fmtNum = (v: number) => (v >= 10000 ? v.toFixed(0) : v.toFixed(v >= 100 ? 1 : 2));
  const isMinute = r === 'rt' || r === '5d';

  const xAxisLabel =
    r === '5d'
      ? {
          color: axisColor,
          // 只在换日首点（带日期前缀的标签）处显示轴标签
          interval: (_i: number, v: string) => v.includes(' '),
          formatter: (v: string) => v.split(' ')[0],
        }
      : r === 'day'
        ? { color: axisColor, formatter: (v: string) => v.slice(5).replace('-', '/') }
        : r === 'mon'
          ? {
              color: axisColor,
              // 每年 1 月的刻度显示年份
              interval: (_i: number, v: string) => v.endsWith('-01'),
              formatter: (v: string) => v.slice(0, 4),
            }
          : { color: axisColor };

  // 分时/五日：围绕基准对称的纵轴（分时图惯例）；K线：自由缩放
  const yAxis = isMinute
    ? (() => {
        const pcts = points.map((p) => (base ? (p.close / base - 1) * 100 : 0));
        const half =
          Math.max(Math.abs(Math.max(...pcts, 0)), Math.abs(Math.min(...pcts, 0)), 0.2) * 1.15;
        return {
          type: 'value' as const,
          min: base * (1 - half / 100),
          max: base * (1 + half / 100),
          axisLabel: { color: axisColor, formatter: (v: number) => fmtNum(v) },
          splitLine: { lineStyle: { color: splitLine } },
        };
      })()
    : {
        type: 'value' as const,
        scale: true,
        axisLabel: { color: axisColor, formatter: (v: number) => fmtNum(v) },
        splitLine: { lineStyle: { color: splitLine } },
      };

  // option 必须 memo：echarts-for-react 用 fast-deep-equal 对比 props（函数按引用比较），
  // 看板行情刷新导致弹窗重渲染时，若 option 每次都是新对象（含新 formatter），
  // 会触发 setOption(notMerge) 整体重建序列并重放入场动画，表现为走势线反复抽动。
  const option = useMemo<EChartsOption>(
    () => ({
    backgroundColor: 'transparent',
    animationDuration: 700,
    animationEasing: 'cubicOut',
    // 数据原地更新（如未来轮询实时分时）时不做过渡，避免整线重画
    animationDurationUpdate: 0,
    tooltip: {
      trigger: 'axis',
      backgroundColor: dark ? '#232a36' : '#fff',
      borderColor: splitLine,
      textStyle: { color: axisColor },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        const idx = p.dataIndex as number;
        const pt = points[idx];
        if (!pt || !base) return '';
        const pct = (pt.close / base - 1) * 100;
        const color = pct >= 0 ? up : down;
        const sign = pct >= 0 ? '+' : '';
        const when = r === 'rt' ? `${data?.date ?? ''} ${pt.label}` : tooltipLabels[idx] ?? pt.label;
        return (
          `<div style="font-size:12px;color:${axisColor}">${when}</div>` +
          `<div style="margin-top:2px">点位 <b style="color:${dark ? '#ecf1f8' : '#1c2532'}">${pt.close.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b></div>` +
          `<div style="margin-top:2px">${r === 'rt' ? '较昨收' : '区间涨跌'} <b style="color:${color}">${sign}${pct.toFixed(2)}%</b></div>`
        );
      },
    },
    grid: { left: 8, right: 20, top: 20, bottom: 28, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((p) => p.label),
      axisLine: { lineStyle: { color: splitLine } },
      axisLabel: xAxisLabel,
      axisTick: { show: false },
    },
    yAxis,
    series: [
      {
        name: '收盘',
        type: 'line',
        data: points.map((p) => p.close),
        symbol: 'none',
        smooth: true,
        lineStyle: { width: 2, color: lineColor },
        itemStyle: { color: lineColor },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: areaColor[0] },
              { offset: 1, color: areaColor[1] },
            ],
          },
        },
        markLine: {
          symbol: 'none',
          silent: true,
          data: base ? [{ yAxis: base }] : [],
          lineStyle: { color: axisColor, opacity: 0.45, type: 'dashed' },
          label: {
            formatter: `${r === 'rt' ? '昨收' : '基准'} ${fmtNum(base)}`,
            color: axisColor,
            fontSize: 10,
            position: 'insideEndTop',
          },
        },
      },
    ],
    }),
    // 仅依赖 data/dark，range 不进依赖：r 以 data.range 为准（range 仅在无数据时兜底，
    // 此时图表未渲染）。切换周期瞬间 data 还是旧引用（keepPreviousData），
    // option 引用不变 → echarts-for-react 深比较短路 → 图表完全静止，新数据到达才更新
    [data, dark]
  );

  const title = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
      <span>{index?.name}</span>
      {index && (
        <span style={{ fontSize: 15, color: index.changePct >= 0 ? up : down }}>
          {index.point.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          <span style={{ fontSize: 12, marginLeft: 8 }}>
            {formatSigned(index.change, 2)} {index.changePct >= 0 ? '+' : ''}
            {index.changePct.toFixed(2)}%
          </span>
        </span>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={title}
      width="min(760px, 94vw)"
      styles={{ body: { paddingTop: 8 } }}
    >
      <Segmented
        block
        options={RANGE_OPTIONS}
        value={range}
        onChange={(v) => setRange(v as IndexTrendRange)}
      />
      <div style={{ marginTop: 12 }}>
        {isLoading && !data && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <Spin />
          </div>
        )}
        {error && !data && <Alert type="warning" showIcon title="走势数据加载失败，请稍后重试" />}
        {data && points.length > 0 && (
          <>
            <div style={{ position: 'relative' }}>
              {isLoading && (
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    zIndex: 2,
                    padding: '2px 8px',
                    borderRadius: 8,
                    background: dark ? 'rgba(35,42,54,0.72)' : 'rgba(255,255,255,0.82)',
                  }}
                >
                  <Spin size="small" />
                </div>
              )}
              <ReactECharts
                option={option}
                style={{ height: 'clamp(280px, 45vh, 420px)', width: '100%' }}
                notMerge
                lazyUpdate
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>
              {RANGE_DESC[r]}
              {isLoading ? ' · 加载中…' : data.date ? ` · ${data.date}` : ''}
            </div>
            {error && (
              <Alert
                style={{ marginTop: 8 }}
                type="warning"
                showIcon
                title="新周期数据加载失败，当前显示上一周期"
              />)}
          </>
        )}
        {data && points.length === 0 && <Alert type="info" showIcon title="暂无走势数据" />}
      </div>
    </Modal>
  );
}
