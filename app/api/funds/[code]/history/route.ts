import { mockFunds } from '@/lib/data/mock';
import { getFundHistory } from '@/lib/data/sources';
import type { NavRange } from '@/lib/types';
import { NextResponse } from 'next/server';

type Ctx = { params: Promise<{ code: string }> };

/** 单只基金历史净值（真实数据源优先，失败降级 mock） */
export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const range = (new URL(request.url).searchParams.get('range') ?? '1Y') as NavRange;
  try {
    const data = await getFundHistory(code, range);
    return NextResponse.json({ ok: true, data });
  } catch {
    const data = await mockFunds.history(code, range);
    return NextResponse.json({ ok: true, data, fallback: true });
  }
}