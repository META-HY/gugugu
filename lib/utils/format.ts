/** 国内习惯：红涨绿跌（引用全局 CSS 变量，随明暗主题切换并保证对比度） */
export const UP_COLOR = 'var(--up)';
export const DOWN_COLOR = 'var(--down)';
export const FLAT_COLOR = 'var(--flat)';

export const TREND_CHARTS_COLORS = ['#1677ff', '#fa8c16', '#722ed1'];

/** 依据数值的正负返回颜色（红涨绿跌） */
export function changeColor(value: number): string {
  if (value > 0) return UP_COLOR;
  if (value < 0) return DOWN_COLOR;
  return FLAT_COLOR;
}

/** 带正负号 & 保留位数 格式化涨跌幅，例如 +1.23% */
export function formatPct(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

/** 带正负号格式化数值，例如 +0.0123 */
export function formatSigned(value: number, digits = 4): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${value.toFixed(digits)}`;
}

/** 金额格式化，千分位 */
export function formatAmount(value: number, digits = 2): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * 生成模拟数据的确定性伪随机数生成器（Mulberry32）。
 * 以 code 为种子，保证同一基金每次渲染的数据稳定。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由字符串生成稳定数字种子 */
export function hashCode(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 读取当前时间，格式化 HH:mm:ss */
export function nowTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}