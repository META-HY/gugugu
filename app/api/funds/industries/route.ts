import { DATA_MODE } from '@/lib/config';
import { mockFunds } from '@/lib/data/mock';
import { getFundIndustries } from '@/lib/data/sources';
import { NextResponse } from 'next/server';

const fetcher = DATA_MODE === 'mock' ? mockFunds.industries.bind(mockFunds) : getFundIndustries;

/**
 * 批量获取基金重仓行业标签（按前十大重仓股所属行业聚合）。
 * 单只失败不影响其余，返回空数组。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const codes = (searchParams.get('codes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);

  const entries = await Promise.all(
    codes.map(async (code) => {
      try {
        return [code, await fetcher(code)] as const;
      } catch {
        return [code, []] as const;
      }
    })
  );
  return NextResponse.json({ ok: true, data: Object.fromEntries(entries) });
}
