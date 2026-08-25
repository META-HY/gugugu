import { mockFunds } from '@/lib/data/mock';
import { getIndexTrend } from '@/lib/data/sources';
import { NextResponse } from 'next/server';
import type { IndexTrendRange } from '@/lib/types';

const RANGES: IndexTrendRange[] = ['rt', '5d', 'day', 'mon', 'yr'];

type Ctx = { params: Promise<{ code: string }> };

/**
 * 指数走势。range：rt 实时分时 / 5d 五日 / day 日K / mon 月K / yr 年K。
 * 实时分时不降级 mock（伪造盘中走势会误导判断），其余周期失败时降级。
 */
export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const range = new URL(request.url).searchParams.get('range') as IndexTrendRange | null;
  if (!range || !RANGES.includes(range)) {
    return NextResponse.json({ ok: false, error: `无效周期 ${range}` }, { status: 400 });
  }
  try {
    const data = await getIndexTrend(code, range);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    if (range === 'rt') {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
    }
    try {
      const data = await mockFunds.indexTrend(code, range);
      return NextResponse.json({ ok: true, data, fallback: true });
    } catch {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
    }
  }
}
