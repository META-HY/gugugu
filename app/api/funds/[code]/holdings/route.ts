import { mockFunds } from '@/lib/data/mock';
import { getFundHoldings } from '@/lib/data/sources';
import { NextResponse } from 'next/server';

type Ctx = { params: Promise<{ code: string }> };

/** 前十大重仓股（真实数据源优先，失败降级 mock） */
export async function GET(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  try {
    const data = await getFundHoldings(code);
    return NextResponse.json({ ok: true, data });
  } catch {
    const data = await mockFunds.holdings(code);
    return NextResponse.json({ ok: true, data, fallback: true });
  }
}
