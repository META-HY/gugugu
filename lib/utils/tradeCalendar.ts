/**
 * A股交易日历工具。
 * MVP 采用内置休市日表（2025-2026 法定节假日），实际生产可替换为交易日历 API。
 */

/** 节假日休市日期（YYYY-MM-DD）。含周末一致的日子为冗余项，可省略。 */
const HOLIDAYS = new Set<string>([
  // 2025
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
  '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-07',
  '2025-05-01', '2025-05-02', '2025-05-05',
  '2025-05-31', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-08',
  // 2026（预估）
  '2026-01-01', '2026-01-02',
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-04-06', '2026-04-07', '2026-04-08',
  '2026-05-01',
  '2026-06-19',
  '2026-09-25',
  '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
]);

/** 周末调休需要开盘的日子（调休上班日），与节假日互补。 */
const MAKEUP_WORKDAYS = new Set<string>([
  '2025-01-26', '2025-02-08',
  '2025-04-27', '2025-09-28', '2025-10-11',
  '2026-02-15',
]);

export interface TradeSession {
  isTradingDay: boolean;
  /** 交易时段内且为交易日 */
  isSession: boolean;
  /** 下一个交易日(若今日为交易日则返回今日) */
  nextTradingDay: string;
  /** 上个交易日 */
  lastTradingDay: string;
  message: string;
}

const CHINA_TZ_OFFSET_MS = 8 * 60 * 60 * 1000; // 北京时间 UTC+8

/**
 * 将 Date 转成北京时间（UTC+8）的墙钟字段。
 * A股交易日/交易时段一律以北京时间为准，避免服务器（如 UTC）与浏览器时区
 * 不一致导致 SSR 与客户端计算结果不同（hydration 失配）。
 */
function beijing(date: Date) {
  const shifted = new Date(date.getTime() + CHINA_TZ_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    iso: `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`,
    dow: shifted.getUTCDay(), // 0 周日 6 周六
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** 判断某天（按北京时间）是否为交易日 */
export function isTradingDay(date: Date = new Date()): boolean {
  const { iso, dow } = beijing(date);
  if (dow === 0 || dow === 6) return MAKEUP_WORKDAYS.has(iso); // 周末，除非调休上班
  return !HOLIDAYS.has(iso); // 工作日，排除法定节假日
}

/** 判断当前（北京时间）是否为交易时段（交易日 9:30-11:30 / 13:00-15:00） */
export function isTradingSession(date: Date = new Date()): boolean {
  if (!isTradingDay(date)) return false;
  const { minutes } = beijing(date);
  return (
    (minutes >= 9 * 60 + 30 && minutes <= 11 * 60 + 30) ||
    (minutes >= 13 * 60 && minutes <= 15 * 60)
  );
}

/** 获取指定日（北京时间）的下一个交易日 */
export function getNextTradingDay(date: Date = new Date()): string {
  let d = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  while (!isTradingDay(d)) d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  return beijing(d).iso;
}

/** 获取指定日（北京时间）的前一个交易日 */
export function getLastTradingDay(date: Date = new Date()): string {
  let d = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  while (!isTradingDay(d)) d = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  return beijing(d).iso;
}

/** 综合会话状态，供页面文案用 */
export function getTradeState(date: Date = new Date()): TradeSession {
  const isDay = isTradingDay(date);
  const isSession = isTradingSession(date);
  let message: string;
  if (isSession) {
    message = '交易时段 · 估值实时更新';
  } else if (isDay) {
    message = '交易日非交易时段 · 数据为上一交易日收盘';
  } else {
    message = '当前为非交易日 · 数据为上一交易日收盘';
  }
  return {
    isTradingDay: isDay,
    isSession,
    nextTradingDay: getNextTradingDay(date),
    lastTradingDay: getLastTradingDay(date),
    message,
  };
}