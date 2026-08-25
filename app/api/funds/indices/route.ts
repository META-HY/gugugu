import { mockFunds } from '@/lib/data/mock';
import { getIndices } from '@/lib/data/sources';
import { NextResponse } from 'next/server';

/** 大盘指数实时行情（真实数据源优先，失败降级 mock） */
export async function GET() {
  try {
    const data = await getIndices();
    return NextResponse.json({ ok: true, data });
  } catch {
    const data = await mockFunds.indices();
    return NextResponse.json({ ok: true, data, fallback: true });
  }
}