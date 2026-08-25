import type { FundPurchase, FundQuote, NavPoint, NavRange } from '@/lib/types';

/** 由买入记录汇总出的持仓概况 */
export interface Holdings {
  /** 总投入（元） */
  invested: number;
  /** 持有份额 */
  shares: number;
  /** 有效笔数 */
  count: number;
}

/** 汇总买入记录：金额 ÷ 净值 = 份额。无效记录（金额/净值 ≤ 0）跳过 */
export function sumPurchases(purchases?: FundPurchase[]): Holdings | null {
  if (!purchases?.length) return null;
  let invested = 0;
  let shares = 0;
  let count = 0;
  for (const p of purchases) {
    if (!(p.amount > 0) || !(p.nav > 0)) continue;
    invested += p.amount;
    shares += p.amount / p.nav;
    count++;
  }
  return count ? { invested, shares, count } : null;
}

/**
 * 今日预估收益：
 * - 有买入记录：市值 × 估算涨跌幅（份额模式，比「金额 × 涨跌幅」更接近真实）
 * - 仅有持仓金额：金额 × 估算涨跌幅
 * - 都没有：接口模拟值（1 万份）
 */
export function calcTodayProfit(
  holdings: Holdings | null,
  amount: number | undefined,
  quote?: FundQuote
): number | undefined {
  if (!quote) return undefined;
  if (holdings) return holdings.shares * quote.estimateNav * (quote.estimateChangePct / 100);
  if (amount != null) return amount * (quote.estimateChangePct / 100);
  return quote.estimatedProfit;
}

/** 累计收益（按估算净值暂估）：市值 − 总投入 */
export function calcCumulativeProfit(holdings: Holdings, quote?: FundQuote): number | undefined {
  if (!quote) return undefined;
  return holdings.shares * quote.estimateNav - holdings.invested;
}

/** 持有收益率(%)：累计收益 ÷ 总投入 */
export function calcCumulativePct(holdings: Holdings, quote?: FundQuote): number | undefined {
  if (!quote || holdings.invested <= 0) return undefined;
  const profit = calcCumulativeProfit(holdings, quote);
  return profit == null ? undefined : (profit / holdings.invested) * 100;
}

/**
 * 从历史净值（按日期升序）中解析买入日的单位净值：
 * 当日无净值（非交易日/未披露）时取「不晚于该日的最近一个净值」，
 * 日期晚于全部历史（如今天买入）则取最新净值（份额待当晚确认，暂按此估算）。
 */
export function lookupNav(history: NavPoint[], date: string): number | undefined {
  if (!history.length) return undefined;
  let result: number | undefined;
  for (const p of history) {
    if (p.date <= date) result = p.unitNav;
    else break;
  }
  return result ?? history[history.length - 1].unitNav;
}

/** 组合收益走势的单日截面 */
export interface PortfolioTrendPoint {
  date: string;
  /** 累计投入 */
  invested: number;
  /** 持仓市值 */
  marketValue: number;
  /** 累计收益 = 市值 − 投入 */
  profit: number;
}

/** 依据持有天数选择覆盖买入历史所需的净值区间 */
export function pickNavRange(days: number): NavRange {
  if (days <= 31) return '1M';
  if (days <= 92) return '3M';
  if (days <= 366) return '1Y';
  if (days <= 366 * 3) return '3Y';
  return 'ALL';
}

/** 组合收益走势序列：组合累计收益 + 各持仓基金累计收益（同一时间轴对齐） */
export interface PortfolioTrendSeries {
  /** 时间轴日期（与 portfolio、各 fund points 等长对齐） */
  dates: string[];
  /** 组合逐日截面 */
  portfolio: PortfolioTrendPoint[];
  /** 各基金逐日截面（该基金首笔买入前为 null） */
  funds: { code: string; points: (PortfolioTrendPoint | null)[] }[];
}

/**
 * 构建组合逐日收益走势（含分基金曲线）：
 * - 时间轴 = 各基金历史净值日期 ∪ 买入日期（≥ 最早买入日，≤ today）
 * - 每日市值 = Σ 份额(按当日已买入记录) × 净值(前向填充；历史缺失时退回最近买入净值，呈平台)
 * - 每日投入 = Σ 当日及之前买入金额
 * - todayNavs 提供今日估算净值时追加「今日」点，与汇总栏口径一致
 */
export function buildPortfolioSeries(
  funds: { code: string; purchases: FundPurchase[]; history: NavPoint[] }[],
  todayNavs?: { date: string; navs: Record<string, number> }
): PortfolioTrendSeries {
  const valid = funds
    .map((f) => ({
      code: f.code,
      history: f.history,
      purchases: f.purchases.filter((p) => p.date && p.amount > 0 && p.nav > 0),
    }))
    .filter((f) => f.purchases.length);
  if (!valid.length) return { dates: [], portfolio: [], funds: [] };

  const today = todayNavs?.date ?? '';
  const earliest = valid.reduce(
    (min, f) => f.purchases.reduce((m, p) => (p.date < m ? p.date : m), min),
    '9999-99-99'
  );

  const dates = new Set<string>();
  for (const f of valid) {
    for (const p of f.purchases) dates.add(p.date);
    for (const h of f.history) if (h.unitNav > 0 && h.date >= earliest) dates.add(h.date);
  }
  const timeline = [...dates].filter((d) => d >= earliest && (!today || d <= today)).sort();

  // 每只基金的净值游标（时间轴与净值序列均升序，双指针前向填充）
  const cursor = valid.map(() => 0);
  const navNow = valid.map(() => undefined as number | undefined);
  const fundMaps = valid.map(() => new Map<string, PortfolioTrendPoint>());

  const portfolio: PortfolioTrendPoint[] = [];
  for (const d of timeline) {
    let mv = 0;
    let invested = 0;
    valid.forEach((f, i) => {
      while (cursor[i] < f.history.length && f.history[cursor[i]].date <= d) {
        const h = f.history[cursor[i]];
        if (h.unitNav > 0) navNow[i] = h.unitNav;
        cursor[i]++;
      }
      let shares = 0;
      let inv = 0;
      let fallbackNav: number | undefined;
      for (const p of f.purchases) {
        if (p.date <= d) {
          shares += p.amount / p.nav;
          inv += p.amount;
          fallbackNav = p.nav;
        }
      }
      if (shares <= 0) return;
      // 历史净值缺失的日期退回最近买入净值（平台段），避免单基金缺数据打断整条组合曲线
      const nav = navNow[i] ?? fallbackNav;
      if (nav == null) return;
      const fmv = shares * nav;
      mv += fmv;
      invested += inv;
      fundMaps[i].set(d, { date: d, invested: inv, marketValue: fmv, profit: fmv - inv });
    });
    if (invested > 0) {
      portfolio.push({ date: d, invested, marketValue: mv, profit: mv - invested });
    }
  }

  // 追加今日估算点（与汇总栏「累计总盈亏」同口径，用估算净值）
  if (todayNavs && portfolio.length && todayNavs.date > portfolio[portfolio.length - 1].date) {
    let mv = 0;
    let invested = 0;
    let ok = true;
    valid.forEach((f, i) => {
      const inv = f.purchases.reduce((s, p) => s + p.amount, 0);
      const shares = f.purchases.reduce((s, p) => s + p.amount / p.nav, 0);
      const nav = todayNavs.navs[f.code];
      invested += inv;
      if (nav > 0) {
        const fmv = shares * nav;
        mv += fmv;
        fundMaps[i].set(todayNavs.date, {
          date: todayNavs.date,
          invested: inv,
          marketValue: fmv,
          profit: fmv - inv,
        });
      } else {
        ok = false;
      }
    });
    if (ok && invested > 0) {
      portfolio.push({ date: todayNavs.date, invested, marketValue: mv, profit: mv - invested });
    }
  }

  return {
    dates: portfolio.map((p) => p.date),
    portfolio,
    funds: valid.map((f, i) => ({
      code: f.code,
      points: portfolio.map((p) => fundMaps[i].get(p.date) ?? null),
    })),
  };
}
