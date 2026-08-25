import { DATA_MODE } from '@/lib/config';
import { mockFunds } from '@/lib/data/mock';
import type {
  FundDetail,
  FundIndustry,
  FundQuote,
  FundSearchItem,
  HoldingStock,
  IndexQuote,
  IndexTrend,
  IndexTrendRange,
  IntradayTrend,
  NavPoint,
  NavRange,
} from '@/lib/types';

/**
 * 数据访问统一入口。
 * - DATA_MODE = 'mock'：直接读取本地 mock（MVP 主路径，稳定无跨域）。
 * - DATA_MODE = 'real'：走服务端 API Routes（代理真实数据源，解决跨域）。
 * 切换 only 需要在 lib/config.ts 修改 DATA_MODE。
 */

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json()) as { ok: boolean; data: T; error?: string };
  if (!json.ok) throw new Error(json.error ?? '请求失败');
  return json.data;
}

const realSource = {
  // 搜索走 POST + 请求体：中文关键词放 URL 查询串会被预览代理网关拒掉（400），请求体不受影响
  search: async (kw: string) => {
    const res = await fetch('/api/funds/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: kw }),
      cache: 'no-store',
    });
    const json = (await res.json()) as { ok: boolean; data: FundSearchItem[]; error?: string };
    if (!json.ok) throw new Error(json.error ?? '请求失败');
    return json.data;
  },
  indices: () => getJSON<IndexQuote[]>('/api/funds/indices'),
  indexTrend: (code: string, range: IndexTrendRange) =>
    getJSON<IndexTrend>(`/api/funds/indices/${code}/trend?range=${range}`),
  quotes: (codes: string[]) => getJSON<FundQuote[]>(`/api/funds/quotes?codes=${codes.join(',')}`),
  history: (code: string, range: NavRange) =>
    getJSON<NavPoint[]>(`/api/funds/${code}/history?range=${range}`),
  detail: (code: string) => getJSON<FundDetail>(`/api/funds/${code}/detail`),
  holdings: (code: string) => getJSON<HoldingStock[]>(`/api/funds/${code}/holdings`),
  intraday: (code: string) => getJSON<IntradayTrend>(`/api/funds/${code}/intraday`),
  industries: (codes: string[]) =>
    getJSON<Record<string, FundIndustry[]>>(`/api/funds/industries?codes=${codes.join(',')}`),
  meta: () => undefined,
};

export const fundApi = {
  meta: (code: string) => (DATA_MODE === 'mock' ? mockFunds.meta(code) : realSource.meta()),
  search: (kw: string) => (DATA_MODE === 'mock' ? mockFunds.search(kw) : realSource.search(kw)),
  indices: () => (DATA_MODE === 'mock' ? mockFunds.indices() : realSource.indices()),
  indexTrend: (code: string, range: IndexTrendRange) =>
    DATA_MODE === 'mock' ? mockFunds.indexTrend(code, range) : realSource.indexTrend(code, range),
  quotes: (codes: string[]) =>
    DATA_MODE === 'mock' ? mockFunds.quotes(codes) : realSource.quotes(codes),
  history: (code: string, range: NavRange) =>
    DATA_MODE === 'mock' ? mockFunds.history(code, range) : realSource.history(code, range),
  detail: (code: string) => (DATA_MODE === 'mock' ? mockFunds.detail(code) : realSource.detail(code)),
  holdings: (code: string) =>
    DATA_MODE === 'mock' ? mockFunds.holdings(code) : realSource.holdings(code),
  intraday: (code: string) =>
    DATA_MODE === 'mock' ? mockFunds.intraday(code) : realSource.intraday(code),
  industries: (codes: string[]) =>
    DATA_MODE === 'mock'
      ? Promise.all(
          codes.map(async (c) => [c, await mockFunds.industries(c)] as const)
        ).then((entries) => Object.fromEntries(entries))
      : realSource.industries(codes),
};

export type {
  FundDetail,
  FundIndustry,
  FundQuote,
  FundSearchItem,
  HoldingStock,
  IndexQuote,
  IndexTrend,
  IndexTrendRange,
  IntradayTrend,
  NavPoint,
  NavRange,
};