'use client';

import { Alert } from 'antd';
import { useFundStore } from '@/lib/store/useFundStore';
import { getTradeState } from '@/lib/utils/tradeCalendar';

export default function StatusBanner() {
  const quoteError = useFundStore((s) => s.quoteError);
  const refreshQuotes = useFundStore((s) => s.refreshQuotes);
  const watchlist = useFundStore((s) => s.watchlist);
  const state = getTradeState();

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
      {!state.isSession && (
        <Alert
          type="warning"
          showIcon
          closable={false}
          title={
            state.isSession ? '' : '当前为非交易时段，数据为上一交易日收盘'
          }
        />
      )}
      {quoteError && (
        <Alert
          type="error"
          showIcon
          title={`数据获取失败：${quoteError}`}
          action={
            <a
              onClick={() => refreshQuotes(watchlist.map((w) => w.code), 'mock')}
              style={{ cursor: 'pointer' }}
            >
              重试
            </a>
          }
        />
      )}
    </div>
  );
}