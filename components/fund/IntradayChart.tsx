'use client';

import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { useResolvedDarkTheme } from '@/lib/hooks/useResolvedDarkTheme';
import type { IntradayTrend } from '@/lib/types';

/**
 * 当天估值分时图（重仓股行情加权合成）。
 * 分时图惯例：围绕基准（昨日净值）上下对称的坐标系，
 * 线色随最新涨跌定向，面积渐变增强「水位」感。
 */
export default function IntradayChart({ data }: { data: IntradayTrend }) {
  const dark = useResolvedDarkTheme();

  const axisColor = dark ? '#8a94a3' : '#60666d';
  const splitLine = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const up = dark ? '#ff5c4d' : '#d01c1c';
  const down = dark ? '#1fc989' : '#06784f';

  const { points, lastNav, date } = data;
  const last = points[points.length - 1];
  const rising = (last?.pct ?? 0) >= 0;
  const lineColor = rising ? up : down;
  const areaColor = rising
    ? dark
      ? ['rgba(255,92,77,0.30)', 'rgba(255,92,77,0.01)']
      : ['rgba(208,28,28,0.20)', 'rgba(208,28,28,0.01)']
    : dark
      ? ['rgba(31,201,137,0.30)', 'rgba(31,201,137,0.01)']
      : ['rgba(6,120,79,0.20)', 'rgba(6,120,79,0.01)'];

  // 纵轴围绕基准对称（分时图惯例），涨跌幅与净值共用同一坐标系
  const pcts = points.map((p) => p.pct);
  const half = Math.max(Math.abs(Math.max(...pcts)), Math.abs(Math.min(...pcts)), 0.2) * 1.15;
  const navMin = lastNav * (1 - half / 100);
  const navMax = lastNav * (1 + half / 100);

  // option 必须 memo：估值行情定时刷新导致父组件重渲染时，
  // 新 option（含新 formatter 引用）会触发 setOption(notMerge) 重建序列并重放入场动画
  const option = useMemo<EChartsOption>(
    () => ({
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
        const p = Array.isArray(params) ? params[0] : params;
        const idx = p.dataIndex as number;
        const pt = points[idx];
        if (!pt) return '';
        const color = pt.pct >= 0 ? up : down;
        const sign = pt.pct >= 0 ? '+' : '';
        return (
          `<div style="font-size:12px;color:${axisColor}">${date} ${pt.time}</div>` +
          `<div style="margin-top:2px">估算净值 <b style="color:${dark ? '#ecf1f8' : '#1c2532'}">${pt.nav.toFixed(4)}</b></div>` +
          `<div style="margin-top:2px">估算涨跌幅 <b style="color:${color}">${sign}${pt.pct.toFixed(2)}%</b></div>`
        );
      },
    },
    grid: { left: 8, right: 56, top: 20, bottom: 28, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((p) => p.time),
      axisLine: { lineStyle: { color: splitLine } },
      axisLabel: { color: axisColor },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: navMin,
      max: navMax,
      axisLabel: {
        color: axisColor,
        formatter: (v: number) => {
          // 左侧标注净值，右侧标注对应涨跌幅
          const pct = (v / lastNav - 1) * 100;
          return `${v.toFixed(3)}\n${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
        },
        lineHeight: 14,
      },
      splitLine: { lineStyle: { color: splitLine } },
    },
    series: [
      {
        name: '估算净值',
        type: 'line',
        data: points.map((p) => p.nav),
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
          data: [{ yAxis: lastNav }],
          lineStyle: { color: axisColor, opacity: 0.45, type: 'dashed' },
          label: {
            formatter: `昨净值 ${lastNav.toFixed(4)}`,
            color: axisColor,
            fontSize: 10,
            position: 'insideEndTop',
          },
        },
      },
    ],
    }),
    [data, dark]
  );

  return (
    <ReactECharts
      option={option}
      style={{ height: 'clamp(280px, 45vh, 420px)', width: '100%' }}
      notMerge
      lazyUpdate
    />
  );
}
