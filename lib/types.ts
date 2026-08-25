export type FundType =
  | '股票型'
  | '混合型'
  | '债券型'
  | '指数型'
  | 'QDII'
  | '货币型'
  | 'FOF';

/** 历史净值走势点 */
export interface NavPoint {
  /** YYYY-MM-DD */
  date: string;
  /** 单位净值 */
  unitNav: number;
  /** 累计净值 */
  accNav: number;
  /** 日涨跌幅(%)，首日可能为 null */
  dailyChange: number | null;
}

/** 实时估值 */
export interface FundQuote {
  code: string;
  name: string;
  type: FundType;
  /** 估算净值 */
  estimateNav: number;
  /** 估算变动额 */
  estimateChange: number;
  /** 估算涨跌幅(%) */
  estimateChangePct: number;
  /** 上一交易日单位净值 (昨收基准) */
  lastNav: number;
  /** 预估收益(元)，模拟持有 10000 份 */
  estimatedProfit: number;
  /** 估值更新时间 HH:mm:ss */
  estimateTime: string;
  /** 数据来源 */
  source: 'mock' | 'tiantian' | 'gugu';
}

/** 大盘指数实时行情 */
export interface IndexQuote {
  code: string;
  name: string;
  point: number;
  change: number;
  changePct: number;
  /** 更新时间 HH:mm:ss */
  time: string;
}

/** 指数走势周期：实时分时 / 五日分时 / 日K / 月K / 年K */
export type IndexTrendRange = 'rt' | '5d' | 'day' | 'mon' | 'yr';

/** 指数走势点。label：日/月/年K 为 YYYY-MM-DD/YYYY-MM/YYYY；五日为 YYYY-MM-DD HH:mm（换日首点）或 HH:mm；实时为 HH:mm */
export interface IndexTrendPoint {
  label: string;
  /** 收盘点位 */
  close: number;
}

/** 指数历史走势 */
export interface IndexTrend {
  code: string;
  name: string;
  range: IndexTrendRange;
  points: IndexTrendPoint[];
  /** 涨跌基准：实时=昨收、五日=窗口前收盘、K线=首点收盘 */
  base: number;
  /** 数据对应交易日 YYYY-MM-DD */
  date: string;
}

/** 基金基本信息 */
export interface FundDetail {
  code: string;
  name: string;
  py: string;
  type: FundType;
  inceptionDate: string;
  company: string;
  manager: string;
  managerYears: string;
  /** 基金规模 */
  scale: string;
  stockRatio: string;
  bondRatio: string;
  cashRatio: string;
  /** 最大回撤(%)，用于详情页标注线 */
  maxDrawdown: number;
  description: string;
}

/** 前十大重仓股 */
export interface HoldingStock {
  /** 股票代码（6 位数字，A 股） */
  code?: string;
  name: string;
  /** 持仓占比(%) */
  pct: number;
  /** 当日涨跌幅(%) */
  changePct: number;
}

/** 盘中估值分时点 */
export interface IntradayPoint {
  /** HH:mm */
  time: string;
  /** 估算涨跌幅(%)，基准为上一交易日净值 */
  pct: number;
  /** 估算净值 */
  nav: number;
}

/** 盘中估值分时走势（重仓股行情加权合成） */
export interface IntradayTrend {
  /** 分时对应的交易日 YYYY-MM-DD */
  date: string;
  /** 基准（上一交易日）单位净值 */
  lastNav: number;
  points: IntradayPoint[];
}

/** 基金重仓行业（前十大重仓股按行业聚合） */
export interface FundIndustry {
  /** 行业名（东财三级行业，如 白酒、白色家电） */
  name: string;
  /** 该行业合计占净值比(%) */
  pct: number;
}

/** 搜索匹配项 */
export interface FundSearchItem {
  code: string;
  name: string;
  type: FundType;
}

/** 自选分组 */
export interface FundGroup {
  id: string;
  name: string;
  /** 仅内置分组不允许删除 */
  builtin?: boolean;
}

/** 单笔买入记录（定投 / 分批建仓） */
export interface FundPurchase {
  id: string;
  /** 买入日期 YYYY-MM-DD */
  date: string;
  /** 买入金额（元） */
  amount: number;
  /** 买入当日单位净值（保存时快照，用于折算份额） */
  nav: number;
}

/** 自选基金条目 */
export interface WatchItem {
  code: string;
  groupId: string;
  addedAt: number;
  /** 持仓金额（元），未设置为 undefined */
  amount?: number;
  /** 买入记录（多笔时优先于 amount 参与收益计算） */
  purchases?: FundPurchase[];
}

/** 用户设置 */
export interface UserSettings {
  /** 刷新频率(ms) */
  refreshInterval: number;
  /** 主题：auto 跟随系统偏好 */
  themeMode: 'auto' | 'light' | 'dark';
  /** 隐私模式 */
  privacyMode: boolean;
}

/** 时间段 */
export type NavRange = '1D' | '1M' | '3M' | '1Y' | '3Y' | 'ALL';