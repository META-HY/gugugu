'use client';

import { useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useResolvedDarkTheme } from '@/lib/hooks/useResolvedDarkTheme';
import type { NavPoint } from '@/lib/types';

interface Props {
  data: NavPoint[];
  /** 详情页可传入最大回撤值作为标注线 */
  maxDrawdown?: number;
}

export default function NavChart({ data, maxDrawdown }: Props) {
  const dark = useResolvedDarkTheme();
  const ref = useRef<ReactECharts>(null);

  const axisColor = dark ? '#8a94a3' : '#60666d';
  const splitLine = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const lineColor = dark ? '#ff5c4d' : '#d01c1c';
  const areaColor = dark ? ['rgba(255,92,77,0.32)', 'rgba(255,92,77,0.02)'] : ['rgba(208,28,28,0.2)', 'rgba(208,28,28,0.02)'];

  const dates = data.map((d) => d.date);
  const values = data.map((d) => d.unitNav);

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animationDuration: 300,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: dark ? '#232a36' : '#fff',
      borderColor: splitLine,
      textStyle: { color: axisColor },
      valueFormatter: (v) => Number(v ?? 0).toFixed(4),
    },
    grid: { left: 8, right: 16, top: 24, bottom: data.length > 120 ? 54 : 30, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLine: { lineStyle: { color: splitLine } },
      axisLabel: { color: axisColor, formatter: (val: string) => val.slice(5) },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: axisColor, formatter: (v: number) => v.toFixed(2) },
      splitLine: { lineStyle: { color: splitLine } },
    },
    dataZoom: data.length > 120 ? [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 8 }] : [],
    series: [
      {
        name: '单位净值',
        type: 'line',
        data: values,
        symbol: 'none',
        smooth: true,
        sampling: 'lttb',
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
        markLine: maxDrawdown
          ? {
              symbol: 'none',
              data: [{ name: '最大回撤', yAxis: Math.max(...values) * (1 + maxDrawdown / 100) }],
              lineStyle: { color: '#ffc53d', type: 'dashed' },
              label: {
                formatter: `最大回撤 ${maxDrawdown.toFixed(2)}%`,
                color: '#d48806',
                position: 'end',
              },
            }
          : undefined,
      },
    ],
  };

  return (
    <ReactECharts
      ref={ref}
      option={option}
      // 高度随视口自适应：手机 ~280px、平板 ~340px、桌面 420px 封顶，避免窄屏图表过高
      style={{ height: 'clamp(280px, 45vh, 420px)', width: '100%' }}
      notMerge
      lazyUpdate
    />
  );
}