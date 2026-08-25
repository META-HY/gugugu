// 真实数据源：天天基金（基金）+ 腾讯行情（指数）
// 仅在服务端（API Routes / Server Components）调用，规避浏览器跨域限制。
// 接口不可用时由上层 API Route 降级到 mock。

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
  FundType,
} from '@/lib/types';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { pinyin } from 'pinyin-pro';

dayjs.extend(utc);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** fundmobapi 按 UA 做风控：桌面 UA 会被拒（ErrCode 61136403 网络繁忙），必须用移动端 UA */
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

/** 带超时与错误处理的 fetch（服务端自走代理 egress） */
async function fetchRes(url: string, headers: Record<string, string> = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, ...headers },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
    return res;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error(`请求超时 (${url})`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** 基金类型归一化（真实源返回的描述串 → 枚举） */
function mapFundType(raw = ''): FundType {
  const s = String(raw).toLowerCase();
  if (s.includes('指数')) return '指数型';
  if (s.includes('货币')) return '货币型';
  if (s.includes('债')) return '债券型';
  if (s.includes('fof')) return 'FOF';
  if (s.includes('qdii')) return 'QDII';
  if (s.includes('股票')) return '股票型';
  if (s.includes('混合')) return '混合型';
  return '混合型';
}

// ============ 基金搜索 ============
interface SearchHit {
  CODE?: string;
  NAME?: string;
  FundBaseInfo?: {
    FCODE?: string;
    SHORTNAME?: string;
    FTYPE?: string;
    JJGS?: string;
    JJJL?: string;
  };
}

/** 全量基金索引条目（fundcode_search.js：代码 / 首字母 / 名称 / 类型 / 全拼） */
interface FundIndexEntry {
  code: string;
  py: string; // 拼音首字母
  name: string;
  type: string; // 原始类型描述串
  fullPy: string; // 拼音全拼
}

let fundIndexCache: FundIndexEntry[] | null = null;
let fundIndexLoading: Promise<FundIndexEntry[]> | null = null;

/**
 * 加载全量基金列表并缓存（约 2.7 万条）。
 * 建议接口对全拼只会命中股票、对部分输入匹配不全，本地索引可对
 * 中文 / 代码 / 首字母 / 全拼做完整模糊匹配。
 */
async function loadFundIndex(): Promise<FundIndexEntry[]> {
  if (fundIndexCache) return fundIndexCache;
  if (!fundIndexLoading) {
    fundIndexLoading = (async () => {
      const res = await fetchRes('https://fund.eastmoney.com/js/fundcode_search.js', {
        referer: 'https://fund.eastmoney.com/',
      });
      const js = await res.text();
      const start = js.indexOf('[[');
      const end = js.lastIndexOf(']]');
      if (start < 0 || end < 0) throw new Error('基金索引解析失败');
      const arr = JSON.parse(js.slice(start, end + 2)) as [
        string,
        string,
        string,
        string,
        string,
      ][];
      fundIndexCache = arr
        .filter((row) => /^\d{6}$/.test(row[0]))
        .map((row) => ({
          code: row[0],
          py: (row[1] ?? '').toLowerCase(),
          name: row[2] ?? '',
          type: row[3] ?? '',
          fullPy: (row[4] ?? '').toLowerCase(),
        }));
      return fundIndexCache;
    })();
  }
  return fundIndexLoading;
}

/** 是否含汉字（需要转换为拼音再匹配） */
function hasCJK(s: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(s);
}

/**
 * 把含汉字的输入转成拼音全拼键（去空格，如「易方达」→ yifangda）。
 * 仅当输入含汉字时返回，否则返回 null。
 */
function toPinyinKey(raw: string): string | null {
  if (!hasCJK(raw)) return null;
  return pinyin(raw, { toneType: 'none' }).replace(/\s+/g, '').toLowerCase();
}

/** 单条匹配评分：代码 > 名称 > 首字母 > 全拼；完全/前缀 > 包含 */
function scoreEntry(f: FundIndexEntry, raw: string, pinyinKey: string | null): number {
  const key = raw.toLowerCase();
  let score = 0;
  if (f.code === raw) score += 1000;
  else if (f.code.startsWith(raw)) score += 800;
  else if (f.code.includes(raw)) score += 600;

  if (f.name === raw) score += 500;
  else if (f.name.startsWith(raw)) score += 400;
  else if (f.name.includes(raw)) score += 300;

  // 拼音匹配：输入为拼音/字母时直接用 key；输入为汉字时用汉字转出的拼音去匹配
  const pyKey = pinyinKey ?? key;
  if (f.py === pyKey) score += 250;
  else if (f.py.startsWith(pyKey)) score += 200;
  else if (f.py.includes(pyKey)) score += 150;

  if (f.fullPy === pyKey) score += 120;
  else if (f.fullPy.startsWith(pyKey)) score += 90;
  else if (f.fullPy.includes(pyKey)) score += 60;

  return score;
}

/** 建议接口兜底：全量索引拉取失败时使用（中文 / 代码 / 首字母） */
async function suggestSearch(kw: string): Promise<FundSearchItem[]> {
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(kw)}`;
  const res = await fetchRes(url, { referer: 'https://fund.eastmoney.com/' });
  const json = (await res.json()) as { Datas?: SearchHit[] };
  return (json.Datas ?? [])
    .filter((it) => it.FundBaseInfo != null)
    .slice(0, 20)
    .map((it) => {
      const fi = it.FundBaseInfo!;
      return {
        code: String(fi.FCODE ?? it.CODE ?? ''),
        name: String(fi.SHORTNAME ?? it.NAME ?? ''),
        type: mapFundType(fi.FTYPE),
      };
    })
    .filter((x) => /^\d{6}$/.test(x.code));
}

export async function searchFunds(kw: string): Promise<FundSearchItem[]> {
  const key = (kw ?? '').trim();
  if (!key) return [];
  try {
    const list = await loadFundIndex();
    // 汉字输入：先把汉字转成拼音，再对拼音字段做模糊匹配
    const pinyinKey = toPinyinKey(key);
    return list
      .map((fund) => ({ fund, score: scoreEntry(fund, key, pinyinKey) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ fund }) => ({
        code: fund.code,
        name: fund.name,
        type: mapFundType(fund.type),
      }));
  } catch {
    return suggestSearch(key);
  }
}

// ============ 基金实时估值 ============
interface QuoteHit {
  FCODE: string;
  SHORTNAME?: string;
  NAV?: string | number;
  PDATE?: string;
  NAVCHGRT?: string | number;
  GSZ?: string | number | null;
  GSZZL?: string | number | null;
  GZTIME?: string | null;
}

export async function getFundQuotes(codes: string[]): Promise<FundQuote[]> {
  // 接口 pageSize 需落在有效区间（实测 20 有效，2/50 会返回「网络繁忙」），
  // 超过 20 只时按 20 一批并发请求。
  const pageSize = 20;
  const toFundQuote = (it: QuoteHit): FundQuote => {
    const lastNav = Number(it.NAV) || 0;
    const gsz = Number(it.GSZ);
    const hasGsz = Number.isFinite(gsz) && gsz > 0;
    // 盘中估算（GSZ）不可用时回退到最新已公布净值：净值 / 涨跌幅 / 日期同样是真实数据
    const estimateNav = hasGsz ? gsz : lastNav;
    const pct = Number((hasGsz ? it.GSZZL : it.NAVCHGRT) ?? 0) || 0;
    // 涨跌幅的基准是昨日净值：change = nav - nav/(1+pct)，比 nav*pct/100 少一层舍入偏差
    const change = hasGsz ? gsz - lastNav : lastNav - lastNav / (1 + pct / 100);
    return {
      code: it.FCODE,
      name: it.SHORTNAME ?? it.FCODE,
      type: mapFundType(), // 实时接口不含类型，函数末尾用全量索引补全
      estimateNav: Number(estimateNav.toFixed(4)),
      estimateChange: Number(change.toFixed(4)),
      estimateChangePct: Number(pct.toFixed(2)),
      lastNav,
      estimatedProfit: Number((change * 100000).toFixed(2)),
      estimateTime: String(it.GZTIME || it.PDATE || '--'),
      source: 'gugu',
    };
  };

  const chunks: string[][] = [];
  for (let i = 0; i < codes.length; i += pageSize) chunks.push(codes.slice(i, i + pageSize));

  // 固定全 0 的 deviceid 会被接口风控（ErrCode 61136403），改用随机串
  const deviceid = Math.random().toString(36).slice(2) + Date.now().toString(36);

  // 并行补全基金类型：全量索引（服务端缓存）含每只代码的类型；失败不阻断行情
  const typeIdx = loadFundIndex()
    .then((list) => new Map(list.map((f) => [f.code, f.type] as const)))
    .catch(() => null);

  const lists = await Promise.all(
    chunks.map(async (chunk) => {
      const url =
        'https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo' +
        `?Fcodes=${chunk.join(',')}&pageIndex=1&pageSize=${pageSize}` +
        `&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=${deviceid}`;
      // 关键：该接口按 UA 风控，桌面 UA 一律 61136403，必须携带移动端 UA
      const res = await fetchRes(url, {
        referer: 'https://fund.eastmoney.com/',
        'user-agent': MOBILE_UA,
      });
      const json = (await res.json()) as { Datas?: QuoteHit[] | null; ErrCode?: number; ErrMsg?: string };
      // 接口风控/异常（如 61136403 网络繁忙）时抛错，交由上层降级 mock
      if (json.ErrCode !== 0 && (json.Datas == null || !(json.Datas as QuoteHit[]).length)) {
        throw new Error(json.ErrMsg || '行情接口响应异常');
      }
      return (json.Datas ?? []).map(toFundQuote);
    })
  );
  const types = await typeIdx;
  return lists.flat().map((q) =>
    types ? { ...q, type: mapFundType(types.get(q.code) ?? '') } : q
  );
}

// ============ 大盘指数（腾讯行情，GBK 编码） ============
const INDEX_POOL: { code: string; q: string; name: string }[] = [
  { code: 'sh000001', q: 'sh000001', name: '上证指数' },
  { code: 'sz399001', q: 'sz399001', name: '深证成指' },
  { code: 'sh000300', q: 'sh000300', name: '沪深300' },
  { code: 'sh000016', q: 'sh000016', name: '上证50' },
  { code: 'sz399006', q: 'sz399006', name: '创业板指' },
  { code: 'usDJI', q: 'usDJI', name: '道琼斯' },
  { code: 'usIXIC', q: 'usIXIC', name: '纳斯达克' },
  { code: 'usINX', q: 'usINX', name: '标普500' },
];

function fmtHHMMSS(raw: string): string {
  const s = String(raw ?? '');
  // 美股行情的时间字段为 "YYYY-MM-DD HH:mm:ss"
  const m = s.match(/\d{2}:\d{2}:\d{2}/);
  if (m) return m[0];
  // A 股行情为 14 位 yyyymmddHHMMss，取末 6 位
  const t = s.slice(-6);
  if (!/^\d{6}$/.test(t)) return '--:--:--';
  return `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
}

export async function getIndices(): Promise<IndexQuote[]> {
  const q = INDEX_POOL.map((x) => x.q).join(',');
  const res = await fetchRes(`https://qt.gtimg.cn/q=${q}`, { referer: 'https://gu.qq.com/' });
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('gbk').decode(buf);

  const out: IndexQuote[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/v_(\w+)="([^"]*)"/);
    if (!m) continue;
    const code = m[1];
    const f = m[2].split('~');
    const point = Number(f[3]) || 0;
    const prevClose = Number(f[4]) || 0;
    const change = point - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;
    out.push({
      code,
      name: f[1] ?? code,
      point: Number(point.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      time: fmtHHMMSS(f[30] ?? ''),
    });
  }
  return out;
}

// ============ 指数走势（东财 push2his：分时 + 多周期K线） ============
/** 指数代码 → 东财 secid */
const EM_SECID: Record<string, string> = {
  sh000001: '1.000001',
  sz399001: '0.399001',
  sh000300: '1.000300',
  sh000016: '1.000016',
  sz399006: '0.399006',
  usDJI: '100.DJIA',
  usIXIC: '100.NDX',
  usINX: '100.SPX',
};

const indexTrendCache = new Map<string, { at: number; data: IndexTrend }>();
const INDEX_TREND_TTL: Record<IndexTrendRange, number> = {
  rt: 60 * 1000,
  '5d': 5 * 60 * 1000,
  day: 30 * 60 * 1000,
  mon: 6 * 60 * 60 * 1000,
  yr: 24 * 60 * 60 * 1000,
};

async function emJson(path: string): Promise<Record<string, any>> {
  const res = await fetchRes(`https://push2his.eastmoney.com${path}`, {
    referer: 'https://quote.eastmoney.com/',
  });
  return (await res.json()) as Record<string, any>;
}

/** K线行 → 走势点（f[0]=时间, f[2]=收盘） */
function parseKlines(rows: string[]): { dt: string; close: number }[] {
  return rows
    .map((r) => {
      const f = r.split(',');
      return { dt: f[0] ?? '', close: Number(f[2]) || 0 };
    })
    .filter((p) => p.dt && p.close > 0);
}

export async function getIndexTrend(code: string, range: IndexTrendRange): Promise<IndexTrend> {
  const meta = INDEX_POOL.find((x) => x.code === code);
  const secid = EM_SECID[code];
  if (!meta || !secid) throw new Error(`未知指数 ${code}`);

  const key = `${code}:${range}`;
  const hit = indexTrendCache.get(key);
  if (hit && Date.now() - hit.at < INDEX_TREND_TTL[range]) return hit.data;

  let data: IndexTrend;

  if (range === 'rt') {
    // 当日分时：trends 行格式 "YYYY-MM-DD HH:mm,open,price,high,low,volume,amount,avg"
    const j = await emJson(
      `/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=1`
    );
    const d = j?.data ?? {};
    const rows: string[] = d.trends ?? [];
    const points = rows
      .map((line) => {
        const f = line.split(',');
        return { label: (f[0] ?? '').slice(11, 16), close: Number(f[2]) || 0 };
      })
      .filter((p) => p.label && p.close > 0);
    if (!points.length) throw new Error('指数分时数据暂不可用');
    data = {
      code,
      name: meta.name,
      range,
      points,
      base: Number(d.preClose) || points[0].close,
      date: (rows[0].split(',')[0] ?? '').slice(0, 10),
    };
  } else if (range === '5d') {
    // 五日分时连图：5 分钟K线取最后 5 个交易日，基准取窗口前一根收盘
    const j = await emJson(
      `/api/qt/stock/kline/get?secid=${secid}&klt=5&fqt=1&lmt=500&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58`
    );
    const parsed = parseKlines(j?.data?.klines ?? []);
    if (!parsed.length) throw new Error('指数走势数据暂不可用');
    const days = [...new Set(parsed.map((p) => p.dt.slice(0, 10)))].slice(-5);
    const firstIdx = parsed.findIndex((p) => p.dt.slice(0, 10) === days[0]);
    const base =
      firstIdx > 0 ? parsed[firstIdx - 1].close : parsed[firstIdx]?.close ?? 0;
    let curDay = '';
    const points = parsed
      .filter((p) => days.includes(p.dt.slice(0, 10)))
      .map((p) => {
        const [d, t] = p.dt.split(' ');
        const isDayStart = d !== curDay;
        curDay = d;
        // 换日首点带日期前缀，图表据此只显示换日处的轴标签
        return { label: isDayStart ? `${d.slice(5)} ${t}` : t, close: p.close };
      });
    data = { code, name: meta.name, range, points, base, date: days[days.length - 1] };
  } else {
    // 日K(近1年) / 月K(近10年) / 年K(月K全量按年聚合)
    const klt = range === 'day' ? 101 : 103;
    const lmt = range === 'day' ? 250 : range === 'mon' ? 130 : 1200;
    const j = await emJson(
      `/api/qt/stock/kline/get?secid=${secid}&klt=${klt}&fqt=1&lmt=${lmt}&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58`
    );
    const rows: string[] = j?.data?.klines ?? [];
    let points = parseKlines(rows).map((p) => ({ label: p.dt, close: p.close }));
    if (!points.length) throw new Error('指数走势数据暂不可用');
    if (range === 'mon') {
      // 月K标签统一为 YYYY-MM（原始数据为月末日期 YYYY-MM-DD）
      points = points.map((p) => ({ label: p.label.slice(0, 7), close: p.close }));
    }
    if (range === 'yr') {
      // 每年取最后一个收盘
      const byYear = new Map<string, number>();
      for (const p of points) byYear.set(p.label.slice(0, 4), p.close);
      points = [...byYear.entries()].map(([y, close]) => ({ label: y, close }));
    }
    data = {
      code,
      name: meta.name,
      range,
      points,
      base: points[0].close,
      date: rows[rows.length - 1]?.split(',')[0] ?? '',
    };
  }

  indexTrendCache.set(key, { at: Date.now(), data });
  return data;
}

// ============ 基金详情 / 历史净值（pingzhongdata 脚本解析） ============
interface ParsedPz {
  name: string;
  code: string;
  netWorthTrend: { x: number; y: number; equityReturn?: number | null }[];
  accWorthTrend: [number, number][];
  managers: { name: string; workTime: string }[];
  scale: { series?: { y: number }[] } | null;
  allocation: { categories?: string[]; series?: { data?: number[] }[] } | null;
}

async function loadPingzhongData(code: string): Promise<ParsedPz> {
  const res = await fetchRes(`https://fund.eastmoney.com/pingzhongdata/${code}.js`, {
    referer: `https://fund.eastmoney.com/${code}.html`,
  });
  const js = await res.text();
  const body = `${js}\nreturn {
    name: typeof fS_name !== 'undefined' ? fS_name : '',
    code: typeof fS_code !== 'undefined' ? fS_code : '',
    netWorthTrend: typeof Data_netWorthTrend !== 'undefined' ? Data_netWorthTrend : [],
    accWorthTrend: typeof Data_ACWorthTrend !== 'undefined' ? Data_ACWorthTrend : [],
    managers: typeof Data_currentFundManager !== 'undefined' ? Data_currentFundManager : [],
    scale: typeof Data_fluctuationScale !== 'undefined' ? Data_fluctuationScale : null,
    allocation: typeof Data_assetAllocation !== 'undefined' ? Data_assetAllocation : null,
  };`;
  const fn = new Function(body) as () => ParsedPz;
  return fn();
}

function rangeDays(range: NavRange): number {
  const bounds: Record<NavRange, number> = {
    '1D': 1, '1M': 30, '3M': 90, '1Y': 365, '3Y': 365 * 3, ALL: Infinity,
  };
  return bounds[range];
}

export async function getFundHistory(code: string, range: NavRange): Promise<NavPoint[]> {
  const data = await loadPingzhongData(code);
  const accMap = new Map<number, number>(data.accWorthTrend.map(([x, v]) => [x, Number(v)]));
  const all: NavPoint[] = data.netWorthTrend.map((p) => ({
    date: dayjs(p.x).utcOffset(8).format('YYYY-MM-DD'),
    unitNav: Number(p.y),
    accNav: Number(accMap.get(p.x) ?? p.y),
    dailyChange: p.equityReturn == null ? null : Number(p.equityReturn),
  }));
  const days = rangeDays(range);
  if (!isFinite(days)) return all;
  const start = dayjs().subtract(days, 'day');
  return all.filter((p) => dayjs(p.date).isAfter(start));
}

function calcMaxDrawdown(trend: ParsedPz['netWorthTrend']): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of trend) {
    const v = Number(p.y);
    if (v > peak) peak = v;
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - v) / peak) * 100);
  }
  return Number((-maxDd).toFixed(2));
}

/** 按代码搜索单只基金的基础信息（用于详情页的类型/公司/经理） */
interface FundBrief {
  code: string;
  name: string;
  type: FundType;
  company: string;
  manager: string;
}

export async function getFundBrief(code: string): Promise<FundBrief | undefined> {
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(code)}`;
  const res = await fetchRes(url, { referer: 'https://fund.eastmoney.com/' });
  const json = (await res.json()) as { Datas?: SearchHit[] };
  const hit = (json.Datas ?? []).find(
    (x) => String(x.FundBaseInfo?.FCODE ?? x.CODE ?? '') === code
  );
  if (!hit) return undefined;
  const fi = hit.FundBaseInfo ?? {};
  return {
    code: String(fi.FCODE ?? hit.CODE ?? ''),
    name: String(fi.SHORTNAME ?? hit.NAME ?? ''),
    type: mapFundType(fi.FTYPE),
    company: String(fi.JJGS ?? ''),
    manager: String(fi.JJJL ?? '').split(',')[0],
  };
}

export async function getFundDetail(code: string): Promise<FundDetail> {
  const [brief, data] = await Promise.all([getFundBrief(code), loadPingzhongData(code)]);
  const manager = data.managers[0];
  const scaleLatest = data.scale?.series?.at(-1)?.y;
  const alloc = data.allocation;
  const lastIdx = (alloc?.categories?.length ?? 1) - 1;
  const stockRatio = alloc?.series?.[0]?.data?.[lastIdx];
  const bondRatio = alloc?.series?.[1]?.data?.[lastIdx];
  const cashRatio = alloc?.series?.[2]?.data?.[lastIdx];
  const inception = data.netWorthTrend[0]
    ? dayjs(data.netWorthTrend[0].x).utcOffset(8).format('YYYY-MM-DD')
    : '--';

  const name = data.name || brief?.name || code;
  const type = brief?.type ?? '混合型';
  const company = brief?.company || '—';
  const managerName = brief?.manager || manager?.name || '—';
  return {
    code,
    name,
    py: code,
    type,
    inceptionDate: inception,
    company,
    manager: managerName,
    managerYears: manager?.workTime ?? '—',
    scale: scaleLatest != null ? `${scaleLatest}亿` : '—',
    stockRatio: stockRatio != null ? `${Number(stockRatio).toFixed(1)}%` : '—',
    bondRatio: bondRatio != null ? `${Number(bondRatio).toFixed(1)}%` : '—',
    cashRatio: cashRatio != null ? `${Number(cashRatio).toFixed(1)}%` : '—',
    maxDrawdown: calcMaxDrawdown(data.netWorthTrend),
    description: `${name}（${code}），数据来源于天天基金公开接口，仅供参考，实际净值以基金公司与托管机构披露为准。`,
  };
}

// ============ 重仓股 / 盘中估值分时（重仓股行情加权合成） ============

/** 天天基金 App 重仓股接口条目 */
interface PositionHit {
  GPDM?: string; // 股票代码
  GPJC?: string; // 股票名称
  JZBL?: string; // 占净值比例(%)
}

/** A 股代码 → 腾讯市场前缀；非 A 股（港股/美股/北交所）返回 null */
function stockMarket(code: string): string | null {
  if (!/^\d{6}$/.test(code)) return null;
  if (code.startsWith('6') || code.startsWith('9')) return 'sh';
  if (code.startsWith('0') || code.startsWith('2') || code.startsWith('3')) return 'sz';
  return null;
}

/** 随机 deviceid（fundmobapi 风控要求） */
function randDeviceId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 拉取前十大重仓股（天天基金 App 接口，需移动端 UA） */
async function fetchPositions(code: string): Promise<PositionHit[]> {
  const url =
    'https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition' +
    `?FCODE=${code}&deviceid=${randDeviceId()}&plat=Iphone&appType=ttjj&product=EFund&Version=1`;
  const res = await fetchRes(url, {
    referer: 'https://fund.eastmoney.com/',
    'user-agent': MOBILE_UA,
  });
  const json = (await res.json()) as {
    Datas?: { fundStocks?: PositionHit[] } | null;
    ErrCode?: number;
  };
  if (json.ErrCode !== 0 && !json.Datas?.fundStocks) {
    throw new Error('重仓股接口响应异常');
  }
  return (json.Datas?.fundStocks ?? []).filter((p) => stockMarket(String(p.GPDM ?? '')) != null);
}

/** 腾讯批量行情：code → { 现价, 昨收 }（GBK） */
async function fetchStockQuotes(
  symbols: string[]
): Promise<Map<string, { price: number; prevClose: number }>> {
  const res = await fetchRes(`https://qt.gtimg.cn/q=${symbols.join(',')}`, {
    referer: 'https://gu.qq.com/',
  });
  const text = new TextDecoder('gbk').decode(await res.arrayBuffer());
  const map = new Map<string, { price: number; prevClose: number }>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/v_(\w+)="([^"]*)"/);
    if (!m) continue;
    const f = m[2].split('~');
    const price = Number(f[3]) || 0;
    const prevClose = Number(f[4]) || 0;
    if (price > 0 && prevClose > 0) map.set(m[1], { price, prevClose });
  }
  return map;
}

export async function getFundHoldings(code: string): Promise<HoldingStock[]> {
  const positions = await fetchPositions(code);
  if (!positions.length) return [];
  const symbols = positions.map((p) => `${stockMarket(String(p.GPDM))}${p.GPDM}`);
  const quotes = await fetchStockQuotes(symbols);
  return positions.map((p, i) => {
    const q = quotes.get(symbols[i]);
    const changePct = q ? ((q.price - q.prevClose) / q.prevClose) * 100 : 0;
    return {
      code: String(p.GPDM ?? ''),
      name: String(p.GPJC ?? p.GPDM ?? ''),
      pct: Number(p.JZBL) || 0,
      changePct: Number(changePct.toFixed(2)),
    };
  });
}

// ============ 重仓行业（重仓股所属行业聚合） ============

/** 东财 F10 公司概况响应（只取关心的字段） */
interface CompanySurvey {
  jbzl?: { EM2016?: string | null; INDUSTRYCSRC1?: string | null }[];
}

/** 股票行业缓存（行业极少变化，TTL 24h） */
const stockIndustryCache = new Map<string, { at: number; name: string | null }>();

/** 基金重仓行业结果缓存（TTL 6h，避免列表页反复聚合） */
const fundIndustriesCache = new Map<string, { at: number; data: FundIndustry[] }>();

/** 查询单只股票所属行业（东财 EM2016 三级行业，如 "食品饮料-饮料-白酒" → 白酒） */
async function fetchStockIndustry(code: string): Promise<string | null> {
  const hit = stockIndustryCache.get(code);
  if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return hit.name;

  let name: string | null = null;
  try {
    const market = stockMarket(code) === 'sh' ? 'SH' : 'SZ';
    const res = await fetchRes(
      `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${market}${code}`,
      { referer: 'https://emweb.securities.eastmoney.com/' }
    );
    const json = (await res.json()) as CompanySurvey;
    const brief = json.jbzl?.[0];
    // EM2016 为东财行业链，取最细一级；缺失时回退证监会行业（如 "制造业-酒、饮料…"）
    const raw = brief?.EM2016 || brief?.INDUSTRYCSRC1 || '';
    const segs = raw.split('-').map((s) => s.trim()).filter(Boolean);
    name = segs.length ? segs[segs.length - 1] : null;
  } catch {
    name = null; // 单股失败不阻断整体聚合
  }
  stockIndustryCache.set(code, { at: Date.now(), name });
  return name;
}

/** 基金重仓行业：前十大重仓股按所属行业聚合占净值比，取前三大 */
export async function getFundIndustries(code: string): Promise<FundIndustry[]> {
  const hit = fundIndustriesCache.get(code);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.data;

  const positions = await fetchPositions(code);
  if (!positions.length) return [];

  const items = await Promise.all(
    positions.map(async (p) => ({
      pct: Number(p.JZBL) || 0,
      industry: await fetchStockIndustry(String(p.GPDM ?? '')),
    }))
  );

  const acc = new Map<string, number>();
  for (const it of items) {
    if (!it.industry) continue;
    acc.set(it.industry, (acc.get(it.industry) ?? 0) + it.pct);
  }
  const data = [...acc.entries()]
    .map(([name, pct]) => ({ name, pct: Number(pct.toFixed(1)) }))
    .filter((d) => d.pct >= 4) // 过滤零散行业，只留有明显持仓的
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  fundIndustriesCache.set(code, { at: Date.now(), data });
  return data;
}

/** pingzhongdata 内存缓存（分时轮询时避免反复拉全量净值脚本） */
const pzCache = new Map<string, { at: number; data: ParsedPz }>();
const PZ_TTL = 10 * 60 * 1000;

async function loadPingzhongDataCached(code: string): Promise<ParsedPz> {
  const hit = pzCache.get(code);
  if (hit && Date.now() - hit.at < PZ_TTL) return hit.data;
  const data = await loadPingzhongData(code);
  pzCache.set(code, { at: Date.now(), data });
  return data;
}

/** 基准净值：取净值序列最后一个「早于今天」的点（今天净值公布后用倒数第二个） */
function baseNavOf(trend: ParsedPz['netWorthTrend']): number {
  const today = dayjs().utcOffset(8).format('YYYY-MM-DD');
  for (let i = trend.length - 1; i >= 0; i--) {
    const d = dayjs(trend[i].x).utcOffset(8).format('YYYY-MM-DD');
    if (d < today) return Number(trend[i].y);
  }
  return trend.length ? Number(trend[trend.length - 1].y) : 0;
}

/**
 * 盘中估值分时：对前十大重仓股的腾讯分时行情按持仓占比加权合成。
 * 非重仓部分（其余股票/债券/现金）近似零波动。
 */
export async function getFundIntraday(code: string): Promise<IntradayTrend> {
  const positions = await fetchPositions(code);
  if (!positions.length) throw new Error('该基金无 A 股重仓，无法估算盘中走势');

  const symbols = positions.map((p) => `${stockMarket(String(p.GPDM))}${p.GPDM}`);

  // 每只重仓股拉腾讯分时（单只接口，需并行），带上持仓权重
  const minutes = await Promise.all(
    symbols.map(async (sym, i) => {
      const res = await fetchRes(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${sym}`);
      // 响应结构：data[sym].qt[sym] = 行情数组（现价/昨收/时间戳）；
      //           data[sym].data.data = 分时行（"0930 85.38 1138 9716244.00"）
      const json = (await res.json()) as {
        data?: Record<
          string,
          { data?: { data?: string[] }; qt?: Record<string, string[]> }
        >;
      };
      const qt = json.data?.[sym]?.qt?.[sym];
      const prevClose = qt ? Number(qt[4]) || 0 : 0;
      const lines = json.data?.[sym]?.data?.data ?? [];
      const series = new Map<string, number>();
      for (const line of lines) {
        const [t, p] = line.split(' ');
        const price = Number(p);
        if (t && Number.isFinite(price) && price > 0) series.set(t, price);
      }
      // 交易日：取 qt 时间戳（如 20260821161449）前 8 位
      const dateRaw = qt?.[30] ?? '';
      const date = /^\d{14}$/.test(dateRaw)
        ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
        : dayjs().utcOffset(8).format('YYYY-MM-DD');
      return { weight: (Number(positions[i].JZBL) || 0) / 100, prevClose, series, date };
    })
  );

  // 有效分时的重仓股（拿到昨收与至少一个点）
  const usable = minutes.filter((m) => m.prevClose > 0 && m.series.size > 0);
  if (!usable.length) throw new Error('重仓股分时数据暂不可用');

  // 时间主轴：取点数最多的一只（权重最高、数据最全的概率大）
  const axis = [...usable.reduce((a, b) => (b.series.size > a.series.size ? b : a)).series.keys()];
  axis.sort();

  const pz = await loadPingzhongDataCached(code);
  const lastNav = baseNavOf(pz.netWorthTrend);
  if (!(lastNav > 0)) throw new Error('基准净值不可用');

  // 逐分钟合成：每只股票缺该分钟时沿用其最近前值
  const lasts = usable.map(() => NaN);
  const points = axis.map((t) => {
    let acc = 0;
    usable.forEach((m, i) => {
      const p = m.series.get(t);
      if (p != null) lasts[i] = p;
      if (Number.isFinite(lasts[i])) {
        acc += ((lasts[i] - m.prevClose) / m.prevClose) * m.weight;
      }
    });
    const pct = acc * 100;
    return {
      time: `${t.slice(0, 2)}:${t.slice(2)}`,
      pct: Number(pct.toFixed(4)),
      nav: Number((lastNav * (1 + pct / 100)).toFixed(4)),
    };
  });

  return { date: usable[0].date, lastNav, points };
}