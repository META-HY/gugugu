import { getFundIntraday } from '@/lib/data/sources';
import { NextResponse } from 'next/server';

type Ctx = { params: Promise<{ code: string }> };

/**
 * 盘中估值分时（重仓股行情加权合成）。
 * 失败不降级 mock：估值走势造假会误导判断，前端按错误态展示提示。
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  try {
    const data = await getFundIntraday(code);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
