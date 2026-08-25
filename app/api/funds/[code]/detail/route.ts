import { mockFunds } from '@/lib/data/mock';
import { getFundDetail } from '@/lib/data/sources';
import { NextResponse } from 'next/server';

type Ctx = { params: Promise<{ code: string }> };

/** 基金基本信息（真实数据源优先，失败降级 mock） */
export async function GET(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  try {
    const data = await getFundDetail(code);
    return NextResponse.json({ ok: true, data });
  } catch {
    const data = await mockFunds.detail(code);
    return NextResponse.json({ ok: true, data, fallback: true });
  }
}