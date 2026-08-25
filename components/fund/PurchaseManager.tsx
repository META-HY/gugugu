'use client';

import {
  Button,
  DatePicker,
  Empty,
  InputNumber,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  App as AntApp,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fundApi } from '@/lib/data/fundApi';
import { useFundStore } from '@/lib/store/useFundStore';
import type { FundPurchase, FundQuote } from '@/lib/types';
import { changeColor } from '@/lib/utils/format';
import {
  calcCumulativePct,
  calcCumulativeProfit,
  calcTodayProfit,
  lookupNav,
  sumPurchases,
} from '@/lib/utils/portfolio';
import { Amount, PctText } from '@/components/ui/Value';

/** 详情页持仓管理：录入多笔买入（定投/分批），按份额计算累计收益 */
export default function PurchaseManager({ code, quote }: { code: string; quote?: FundQuote }) {
  const { message } = AntApp.useApp();
  const item = useFundStore((s) => s.watchlist.find((w) => w.code === code));
  const addWatch = useFundStore((s) => s.addWatch);
  const updateAmount = useFundStore((s) => s.updateAmount);
  const addPurchase = useFundStore((s) => s.addPurchase);
  const removePurchase = useFundStore((s) => s.removePurchase);
  // 全量历史净值：用于自动带出买入日净值（非交易日取最近已披露净值）
  const { data: history } = useSWR(['history-all', code], () => fundApi.history(code, 'ALL'));

  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [amount, setAmount] = useState<number | null>(null);
  const [nav, setNav] = useState<number | null>(null);

  const purchases = item?.purchases;
  const holdings = useMemo(() => sumPurchases(purchases), [purchases]);

  // 默认净值：按所选日期从历史净值派生（当日无净值取最近已披露），用户手动修改后以输入为准
  const defaultNav = useMemo(() => {
    if (!date || !history?.length) return undefined;
    const found = lookupNav(history, date.format('YYYY-MM-DD'));
    return found != null ? Number(found.toFixed(4)) : undefined;
  }, [date, history]);
  const navValue = nav ?? defaultNav;

  const handleDateChange = (d: Dayjs | null) => {
    setDate(d);
    setNav(null); // 重置手动净值，重新按日期带出默认值
  };

  const handleAdd = () => {
    const dateStr = date?.format('YYYY-MM-DD');
    if (!dateStr) {
      message.warning('请选择买入日期');
      return;
    }
    if (!(amount != null && amount > 0)) {
      message.warning('请输入买入金额');
      return;
    }
    if (!(navValue != null && navValue > 0)) {
      message.warning('请输入成交净值（或等待历史净值加载后自动填入）');
      return;
    }
    // 记录买入隐含持有该基金：未自选时先静默加入
    if (!item) addWatch(code);
    addPurchase(code, { date: dateStr, amount, nav: navValue });
    setAmount(null);
    message.success('已记录买入');
  };

  const marketValue = holdings && quote ? holdings.shares * quote.estimateNav : undefined;
  const cumulative = holdings ? calcCumulativeProfit(holdings, quote) : undefined;
  const cumulativePct = holdings ? calcCumulativePct(holdings, quote) : undefined;
  const todayProfit = holdings ? calcTodayProfit(holdings, undefined, quote) : undefined;

  return (
    <>
      {/* 录入表单 */}
      <Space size="small" wrap style={{ marginBottom: 16 }}>
        <DatePicker
          value={date}
          onChange={handleDateChange}
          allowClear={false}
          disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          format="YYYY-M-D"
          style={{ width: 175 }}
          placeholder="买入日期"
        />
        <InputNumber
          value={amount}
          min={0}
          step={1000}
          style={{ width: 140 }}
          placeholder="买入金额（元）"
          onChange={(v) => setAmount(v)}
          onPressEnter={handleAdd}
        />
        <InputNumber
          value={navValue}
          min={0}
          step={0.0001}
          precision={4}
          style={{ width: 130 }}
          placeholder="成交净值"
          onChange={(v) => setNav(v)}
          onPressEnter={handleAdd}
        />
        <Button type="primary" onClick={handleAdd}>
          记一笔
        </Button>
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
        选择日期后自动带出当日单位净值（非交易日取最近已披露净值，可手动修改）；份额 = 金额 ÷ 净值。收益按买入记录的份额计算，优先于旧的单值持仓。
      </Typography.Text>

      {/* 持仓汇总 */}
      {holdings ? (
        <div className="summary-bar" style={{ marginBottom: 16, paddingLeft: 0, paddingRight: 0 }}>
          <div className="summary-item">
            <div className="summary-label">总投入（{holdings.count} 笔）</div>
            <div className="summary-value">
              <Amount value={holdings.invested} digits={2} /> 元
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-label">持有份额</div>
            <div className="summary-value">
              {holdings.shares.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 份
            </div>
          </div>
          {quote && marketValue != null && (
            <div className="summary-item">
              <div className="summary-label">最新估值市值</div>
              <div className="summary-value">
                <Amount value={marketValue} digits={2} /> 元
              </div>
            </div>
          )}
          {cumulative != null && (
            <div className="summary-item">
              <div className="summary-label">累计收益</div>
              <div className="summary-value">
                <span style={{ color: changeColor(cumulative) }}>
                  {cumulative > 0 ? '+' : cumulative < 0 ? '-' : ''}
                  <Amount value={Math.abs(cumulative)} digits={2} />
                </span>
                {cumulativePct != null && (
                  <span className="summary-hint">
                    <PctText value={cumulativePct} />
                  </span>
                )}
              </div>
            </div>
          )}
          {todayProfit != null && (
            <div className="summary-item">
              <div className="summary-label">今日预估</div>
              <div className="summary-value">
                <span style={{ color: changeColor(todayProfit) }}>
                  {todayProfit > 0 ? '+' : todayProfit < 0 ? '-' : ''}
                  <Amount value={Math.abs(todayProfit)} digits={2} />
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无买入记录，记录后可查看累计收益"
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 买入明细 */}
      <Table<FundPurchase>
        rowKey="id"
        size="small"
        dataSource={purchases ?? []}
        locale={{ emptyText: '暂无买入记录' }}
        pagination={false}
        columns={[
          {
            title: '买入日期',
            dataIndex: 'date',
            width: 120,
            render: (v: string) => (
              <span style={{ whiteSpace: 'nowrap' }}>{dayjs(v).format('YYYY-M-D')}</span>
            ),
          },
          {
            title: '买入金额',
            dataIndex: 'amount',
            align: 'right',
            render: (v: number) => (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                <Amount value={v} digits={2} /> 元
              </span>
            ),
          },
          {
            title: '成交净值',
            dataIndex: 'nav',
            align: 'right',
            render: (v: number) => (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v.toFixed(4)}</span>
            ),
          },
          {
            title: '折算份额',
            key: 'shares',
            align: 'right',
            render: (_, r) => (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {(r.amount / r.nav).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
              </span>
            ),
          },
          {
            title: '操作',
            key: 'action',
            width: 70,
            align: 'right',
            render: (_, r) => (
              <Popconfirm
                title="删除这笔买入记录？"
                okText="删除"
                okButtonProps={{ danger: true }}
                onConfirm={() => removePurchase(code, r.id)}
              >
                <a href="#" onClick={(e) => e.preventDefault()}>
                  删除
                </a>
              </Popconfirm>
            ),
          },
        ]}
      />
      {/* 旧单值持仓提示与清除（逐步迁移到买入记录模式） */}
      {item?.amount != null && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          <Tag style={{ fontSize: 11, lineHeight: '18px', paddingInline: 6 }}>旧模式</Tag>
          该基金还设有一笔单值持仓{' '}
          <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
            <Amount value={item.amount} digits={2} /> 元
          </span>
          {purchases?.length
            ? '。已有买入记录时，收益以买入记录为准，建议清除以免混淆。'
            : '。记录买入后将自动按买入记录计算收益，届时建议清除。'}
          <Popconfirm
            title="清除单值持仓？"
            description="仅移除旧的单值金额，买入记录不受影响"
            okText="清除"
            okButtonProps={{ danger: true }}
            onConfirm={() => {
              updateAmount(code, undefined);
              message.success('已清除单值持仓');
            }}
          >
            <a href="#" onClick={(e) => e.preventDefault()} style={{ marginLeft: 8 }}>
              清除
            </a>
          </Popconfirm>
        </Typography.Text>
      )}
    </>
  );
}
