import { mockFunds } from '@/lib/data/mock';
import { searchFunds } from '@/lib/data/sources';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 基金搜索（真实数据源优先，失败降级 mock）。
 * 关键词放 POST 请求体：经预览代理网关时，中文出现在 URL 查询串会被直接拒掉（实测 400 空响应），
 * 请求体不受影响。GET 保留给无中文场景（代码 / 拼音）与直连调试。
 */
async function handle(q: string) {
  try {
    if (q.trim()) {
      const data = await searchFunds(q);
      return NextResponse.json({ ok: true, data });
    }
    return NextResponse.json({ ok: true, data: [] });
  } catch {
    const data = await mockFunds.search(q);
    return NextResponse.json({ ok: true, data, fallback: true });
  }
}

export async function GET(request: NextRequest) {
  return handle(request.nextUrl.searchParams.get('q') ?? '');
}

export async function POST(request: NextRequest) {
  let q = '';
  try {
    const body = (await request.json()) as { q?: unknown };
    q = typeof body?.q === 'string' ? body.q : '';
  } catch {
    q = '';
  }
  return handle(q);
}
