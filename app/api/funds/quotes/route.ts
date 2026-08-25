import { mockFunds } from '@/lib/data/mock';
import { getFundQuotes } from '@/lib/data/sources';
import { NextRequest, NextResponse } from 'next/server';

/** 实时估值（真实数据源优先，失败降级 mock），codes 逗号分隔 */
export async function GET(request: NextRequest) {
  const codes = (request.nextUrl.searchParams.get('codes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!codes.length) {
    return NextResponse.json({ ok: false, error: '缺少 codes 参数' }, { status: 400 });
  }
  try {
    const data = await getFundQuotes(codes);
    return NextResponse.json({ ok: true, data });
  } catch {
    const data = await mockFunds.quotes(codes);
    return NextResponse.json({ ok: true, data, fallback: true });
  }
}