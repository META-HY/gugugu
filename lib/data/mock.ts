import type {
  FundDetail,
  FundIndustry,
  FundQuote,
  FundSearchItem,
  FundType,
  HoldingStock,
  IndexQuote,
  IndexTrend,
  IndexTrendPoint,
  IndexTrendRange,
  IntradayTrend,
  NavPoint,
  NavRange,
} from '@/lib/types';
import { hashCode, mulberry32 } from '@/lib/utils/format';
import dayjs from 'dayjs';

const FUND_POOL: {
  code: string;
  name: string;
  type: FundType;
  lastNav: number;
  company: string;
  manager: string;
  inceptionDate: string;
  scale: string;
}[] = [
  { code: '110011', name: '易方达中小盘混合', type: '混合型', lastNav: 4.8123, company: '易方达基金', manager: '张坤', inceptionDate: '2008-06-19', scale: '169.32亿' },
  { code: '005827', name: '易方达蓝筹精选混合', type: '混合型', lastNav: 1.9631, company: '易方达基金', manager: '张坤', inceptionDate: '2018-09-05', scale: '438.22亿' },
  { code: '161725', name: '招商中证白酒指数(LOF)A', type: '指数型', lastNav: 1.1024, company: '招商基金', manager: '侯昊', inceptionDate: '2015-05-27', scale: '417.56亿' },
  { code: '001594', name: '天弘中证银行ETF联接A', type: '指数型', lastNav: 1.1843, company: '天弘基金', manager: '陈瑶', inceptionDate: '2015-07-08', scale: '118.77亿' },
  { code: '008888', name: '华夏国证半导体芯片ETF联接A', type: '指数型', lastNav: 1.5407, company: '华夏基金', manager: '荣膺', inceptionDate: '2020-08-05', scale: '204.61亿' },
  { code: '003096', name: '中欧医疗健康混合A', type: '混合型', lastNav: 2.1435, company: '中欧基金', manager: '葛兰', inceptionDate: '2016-09-29', scale: '302.89亿' },
  { code: '110022', name: '易方达消费行业股票', type: '股票型', lastNav: 3.2107, company: '易方达基金', manager: '萧楠', inceptionDate: '2010-08-20', scale: '211.43亿' },
  { code: '007301', name: '国联安中证全指半导体ETF联接A', type: '指数型', lastNav: 1.8729, company: '国联安基金', manager: '黄欣', inceptionDate: '2019-06-24', scale: '98.05亿' },
  { code: '012348', name: '天弘恒生科技指数(QDII)A', type: 'QDII', lastNav: 0.9822, company: '天弘基金', manager: '胡超', inceptionDate: '2021-04-26', scale: '56.71亿' },
  { code: '162411', name: '华宝标普中国A股红利机会指数(LOF)A', type: '指数型', lastNav: 1.4735, company: '华宝基金', manager: '胡洁', inceptionDate: '2017-01-18', scale: '132.48亿' },
  { code: '260108', name: '景顺长城新兴成长混合', type: '混合型', lastNav: 3.5508, company: '景顺长城基金', manager: '刘彦春', inceptionDate: '2006-06-28', scale: '243.17亿' },
  { code: '001632', name: '天弘中证食品饮料指数A', type: '指数型', lastNav: 2.5879, company: '天弘基金', manager: '沙川', inceptionDate: '2015-09-16', scale: '87.36亿' },
];

const STOCK_POOL = [
  '贵州茅台', '宁德时代', '五粮液', '中国平安', '招商银行', '比亚迪',
  '东方财富', '隆基绿能', '立讯精密', '恒瑞医药', '药明康德', '美的集团',
  '伊利股份', '泸州老窖', '山西汾酒', '海天味业', '隆基股份', '韦尔股份',
  '海康威视', '迈瑞医疗', '紫金矿业', '中芯国际', '工业富联', '阳光电源',
];

const INDEX_POOL = [
  { code: 'sh000001', name: '上证指数', base: 2967.4 },
  { code: 'sz399001', name: '深证成指', base: 9432.1 },
  { code: 'sh000300', name: '沪深300', base: 3586.9 },
  { code: 'sh000016', name: '上证50', base: 2411.6 },
  { code: 'sz399006', name: '创业板指', base: 1845.8 },
  { code: 'usDJI', name: '道琼斯', base: 53132.2 },
  { code: 'usIXIC', name: '纳斯达克', base: 26128.9 },
  { code: 'usINX', name: '标普500', base: 7672.6 },
];

let requestCount = 0;

function latency() {
  return new Promise<void>((r) => setTimeout(r, 60 + (requestCount++ % 3) * 20));
}

function historySeed(code: string): NavPoint[] {
  const rand = mulberry32(hashCode(code));
  const points: NavPoint[] = [];
  const today = dayjs();
  // 生成约 5 年日度数据，周末过滤
  let d = today.startOf('day').subtract(5, 'year');
  let nav = 0.8 + rand() * 0.6;
  while (d.isBefore(today)) {
    if (d.day() !== 0 && d.day() !== 6) {
      const prev = nav;
      nav = Math.max(0.2, nav * (1 + (rand() - 0.5) * 0.02));
      points.push({
        date: d.format('YYYY-MM-DD'),
        unitNav: Number(nav.toFixed(4)),
        accNav: Number((nav * (1 + rand() * 0.2)).toFixed(4)),
        dailyChange: Number((((nav - prev) / prev) * 100).toFixed(2)),
      });
    }
    d = d.add(1, 'day');
  }
  return points;
}

function rangeFromPoints(all: NavPoint[], range: NavRange): NavPoint[] {
  const bounds: Record<NavRange, number> = {
    '1D': 1, '1M': 30, '3M': 90, '1Y': 365, '3Y': 365 * 3, ALL: Infinity,
  };
  const days = bounds[range];
  if (!isFinite(days)) return all;
  const start = dayjs().subtract(days, 'day');
  return all.filter((p) => dayjs(p.date).isAfter(start));
}

export const mockFunds = {
  /** 根据代码返回基础元信息（用于列表即时展示名称与类型） */
  meta(code: string): { name: string; type: FundType } | undefined {
    const f = FUND_POOL.find((x) => x.code === code);
    return f ? { name: f.name, type: f.type } : undefined;
  },

  async search(keyword: string): Promise<FundSearchItem[]> {
    await latency();
    const kw = keyword.trim();
    if (!kw) return FUND_POOL.slice(0, 6).map((f) => ({ code: f.code, name: f.name, type: f.type }));
    return FUND_POOL.filter(
      (f) => f.name.includes(kw) || f.code.includes(kw) || f.name.toLowerCase().startsWith(kw.toLowerCase())
    ).map((f) => ({ code: f.code, name: f.name, type: f.type }));
  },

  async indices(): Promise<IndexQuote[]> {
    await latency();
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const time = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    return INDEX_POOL.map((idx) => {
      const rand = mulberry32(hashCode(idx.code) ^ now.getDate());
      const wave = (rand() - 0.5) * 120;
      const changePct = Number((wave / idx.base * 100).toFixed(2));
      return {
        code: idx.code,
        name: idx.name,
        point: Number((idx.base + wave).toFixed(2)),
        change: Number(wave.toFixed(2)),
        changePct,
        time,
      };
    });
  },

  async indexTrend(code: string, range: IndexTrendRange): Promise<IndexTrend> {
    await latency();
    const idx = INDEX_POOL.find((x) => x.code === code);
    if (!idx) throw new Error(`未知指数 ${code}`);
    const rand = mulberry32(hashCode(`${code}:${range}`));
    const today = dayjs();
    const p2 = (n: number) => String(n).padStart(2, '0');

    if (range === 'rt') {
      // 当日分时：09:30 起连续 241 分钟
      const points: IndexTrendPoint[] = [];
      let v = idx.base;
      for (let m = 0; m <= 240; m++) {
        const t = 9 * 60 + 30 + m;
        v = Math.max(1, v * (1 + (rand() - 0.5) * 0.0012));
        points.push({ label: `${p2(Math.floor(t / 60))}:${p2(t % 60)}`, close: Number(v.toFixed(2)) });
      }
      return { code, name: idx.name, range, points, base: idx.base, date: today.format('YYYY-MM-DD') };
    }

    if (range === '5d') {
      // 近 5 个交易日 × 48 根 5 分钟K
      const days: dayjs.Dayjs[] = [];
      let d = today;
      while (days.length < 5) {
        if (d.day() !== 0 && d.day() !== 6) days.unshift(d);
        d = d.subtract(1, 'day');
      }
      const points: IndexTrendPoint[] = [];
      let v = idx.base * (0.97 + rand() * 0.04);
      const base = Number(v.toFixed(2));
      for (const day of days) {
        for (let b = 0; b < 48; b++) {
          const t = 9 * 60 + 35 + b * 5;
          v = Math.max(1, v * (1 + (rand() - 0.5) * 0.002));
          const hhmm = `${p2(Math.floor(t / 60))}:${p2(t % 60)}`;
          points.push({
            label: b === 0 ? `${day.format('MM-DD')} ${hhmm}` : hhmm,
            close: Number(v.toFixed(2)),
          });
        }
      }
      return {
        code,
        name: idx.name,
        range,
        points,
        base,
        date: days[days.length - 1].format('YYYY-MM-DD'),
      };
    }

    if (range === 'day') {
      // 近 250 个交易日
      const points: IndexTrendPoint[] = [];
      let d = today;
      let v = idx.base * (0.8 + rand() * 0.2);
      while (points.length < 250) {
        if (d.day() !== 0 && d.day() !== 6) {
          v = Math.max(1, v * (1 + (rand() - 0.5) * 0.012));
          points.unshift({ label: d.format('YYYY-MM-DD'), close: Number(v.toFixed(2)) });
        }
        d = d.subtract(1, 'day');
      }
      return { code, name: idx.name, range, points, base: points[0].close, date: today.format('YYYY-MM-DD') };
    }

    if (range === 'mon') {
      // 近 130 个月
      const points: IndexTrendPoint[] = [];
      let m = today.startOf('month');
      let v = idx.base * (0.6 + rand() * 0.3);
      while (points.length < 130) {
        v = Math.max(1, v * (1 + (rand() - 0.5) * 0.05));
        points.unshift({ label: m.format('YYYY-MM'), close: Number(v.toFixed(2)) });
        m = m.subtract(1, 'month');
      }
      return { code, name: idx.name, range, points, base: points[0].close, date: today.format('YYYY-MM-DD') };
    }

    // 年K：近 30 年
    const points: IndexTrendPoint[] = [];
    let v = idx.base * (0.3 + rand() * 0.2);
    for (let y = today.year() - 30; y <= today.year(); y++) {
      v = Math.max(1, v * (1 + (rand() - 0.4) * 0.18));
      points.push({ label: String(y), close: Number(v.toFixed(2)) });
    }
    return { code, name: idx.name, range, points, base: points[0].close, date: today.format('YYYY-MM-DD') };
  },

  async quotes(codes: string[]): Promise<FundQuote[]> {
    await latency();
    const now = Date.now();
    const t = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const estimateTime = `${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
    return codes.map((code) => {
      const f = FUND_POOL.find((x) => x.code === code);
      // 池外代码合成中性占位估值：真实源失败降级时不再抛错，避免路由 500 空响应
      const lastNav = f?.lastNav ?? 1;
      // 以时间为种子的轻微随机游走，使每次刷新估值略有变化
      const rand = mulberry32(hashCode(code) ^ Math.floor(now / 5000));
      const estimateChangePct = f ? Number(((rand() - 0.5) * 2.4).toFixed(2)) : 0;
      const estimateChange = Number((lastNav * estimateChangePct / 100).toFixed(4));
      const estimateNav = Number((lastNav + estimateChange).toFixed(4));
      // 模拟持有 10 万份，据此计算预估收益
      const estimatedProfit = Number((estimateChange * 100000).toFixed(2));
      return {
        code,
        name: f?.name ?? code,
        type: f?.type ?? '混合型',
        estimateNav,
        estimateChange,
        estimateChangePct,
        lastNav,
        estimatedProfit,
        estimateTime,
        source: 'mock',
      };
    });
  },

  async history(code: string, range: NavRange): Promise<NavPoint[]> {
    await latency();
    return rangeFromPoints(historySeed(code), range);
  },

  async detail(code: string): Promise<FundDetail> {
    await latency();
    const f = FUND_POOL.find((x) => x.code === code);
    // 池外代码合成基础详情，降级路径不再抛错导致路由 500
    if (!f) {
      return {
        code,
        name: code,
        py: code,
        type: '混合型',
        inceptionDate: '--',
        company: '—',
        manager: '—',
        managerYears: '—',
        scale: '—',
        stockRatio: '—',
        bondRatio: '—',
        cashRatio: '—',
        maxDrawdown: 0,
        description: `${code}：真实数据源暂不可用，且该代码不在模拟数据池中，暂无详细信息。`,
      };
    }
    const rand = mulberry32(hashCode(code + 'detail'));
    const stockRatio = Number((55 + rand() * 40).toFixed(1));
    return {
      code: f.code,
      name: f.name,
      py: code,
      type: f.type,
      inceptionDate: f.inceptionDate,
      company: f.company,
      manager: f.manager,
      managerYears: `${(3 + rand() * 10).toFixed(1)}年`,
      scale: f.scale,
      stockRatio: `${stockRatio}%`,
      bondRatio: `${(2 + rand() * 18).toFixed(1)}%`,
      cashRatio: `${(1 + rand() * 8).toFixed(1)}%`,
      maxDrawdown: Number((-(-8 - rand() * 42)).toFixed(2)),
      description: `${f.name}（${f.code}）为${f.company}旗下${f.type}产品，由${f.manager}基金经理管理，成立于${f.inceptionDate}。本 MVP 版本使用模拟数据演示走势图与持仓展示。`,
    };
  },

  async holdings(code: string): Promise<HoldingStock[]> {
    await latency();
    const rand = mulberry32(hashCode(code + 'holdings'));
    const shuffled = [...STOCK_POOL].sort(() => rand() - 0.5);
    const top = shuffled.slice(0, 10);
    let acc = 0;
    const list = top.map((name, i) => {
      const pct = i === 9 ? Math.max(1, Number((24 - acc).toFixed(2))) : Number((2 + rand() * 4).toFixed(2));
      acc += pct;
      return {
        name,
        pct,
        changePct: Number(((rand() - 0.5) * 5).toFixed(2)),
      };
    });
    return list;
  },

  /** 盘中估值分时（随机游走模拟，与 quotes 同种子） */
  async intraday(code: string): Promise<IntradayTrend> {
    await latency();
    const f = FUND_POOL.find((x) => x.code === code);
    const lastNav = f?.lastNav ?? 1;
    // 时间轴：09:30–11:30 与 13:01–15:00，共 241 分钟
    const axis: string[] = [];
    for (let m = 0; m < 121; m++) {
      const t = 9 * 60 + 30 + m;
      axis.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    }
    for (let m = 1; m <= 120; m++) {
      const t = 13 * 60 + m;
      axis.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    }
    const rand = mulberry32(hashCode(code + 'intraday'));
    let pct = 0;
    const points = axis.map((time, i) => {
      // 开盘半小时波动大，之后收敛；尾盘小幅回升
      const vol = i < 30 ? 0.14 : 0.05;
      pct += (rand() - 0.5) * vol;
      pct = Math.max(-4, Math.min(4, pct));
      return {
        time,
        pct: Number(pct.toFixed(4)),
        nav: Number((lastNav * (1 + pct / 100)).toFixed(4)),
      };
    });
    return { date: dayjs().format('YYYY-MM-DD'), lastNav, points };
  },

  /** 重仓行业（模拟：按代码确定性取两个行业） */
  async industries(code: string): Promise<FundIndustry[]> {
    await latency();
    const pool = ['白酒', '医药', '新能源', '半导体', '消费', '金融', '军工', '制造'];
    const rand = mulberry32(hashCode(code + 'industry'));
    const a = pool[Math.floor(rand() * pool.length)];
    const b = pool[(pool.indexOf(a) + 2 + Math.floor(rand() * 3)) % pool.length];
    return [
      { name: a, pct: Number((20 + rand() * 25).toFixed(1)) },
      { name: b, pct: Number((8 + rand() * 10).toFixed(1)) },
    ];
  },
};