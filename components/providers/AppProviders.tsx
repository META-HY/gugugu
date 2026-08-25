'use client';

import { App, ConfigProvider, theme } from 'antd';
import { useEffect, useState, useSyncExternalStore } from 'react';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useFundStore } from '@/lib/store/useFundStore';
import { useResolvedDarkTheme } from '@/lib/hooks/useResolvedDarkTheme';
import { isTradingSession } from '@/lib/utils/tradeCalendar';
import { DATA_MODE } from '@/lib/config';

// dayjs 全局中文 locale：供 DatePicker 等组件输出「星期X」
dayjs.locale('zh-cn');

/** 实时轮询时的数据来源标注 */
const POLL_SOURCE = DATA_MODE === 'mock' ? ('mock' as const) : ('gugu' as const);

/** 主题同步：切换 html[data-theme]，用于自定义 CSS 变量（auto 跟随系统） */
function ThemeController() {
  const dark = useResolvedDarkTheme();
  const privacyMode = useFundStore((s) => s.settings.privacyMode);
  const hydrated = useFundStore((s) => s.hydrated);

  // store 水合完成前不接管属性（首帧由 layout 内联脚本保证）；
  // hydrated 翻转保证效果至少在最终主题态运行一次，规避初始化竞态写入过期值
  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.classList.toggle('privacy-mode', privacyMode);
  }, [dark, privacyMode, hydrated]);

  return null;
}

/** 实时刷新控制：交易时段自动轮询，页面隐藏/非交易时段暂停 */
function RealtimeController() {
  const hydrate = useFundStore((s) => s.hydrate);
  const hydrated = useFundStore((s) => s.hydrated);
  const refreshInterval = useFundStore((s) => s.settings.refreshInterval);
  const watchlist = useFundStore((s) => s.watchlist);
  const refreshQuotes = useFundStore((s) => s.refreshQuotes);
  const [trading, setTrading] = useState(isTradingSession());

  // 初始化：从 localStorage 恢复数据
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // 每分钟校准一次交易日/交易时段
  useEffect(() => {
    const t = setInterval(() => setTrading(isTradingSession()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const codes = watchlist.map((w) => w.code);
    const doRefresh = () => {
      if (!isTradingSession()) return;
      refreshQuotes(codes, POLL_SOURCE);
    };
    // 进入页面立即拉取一次（无数据时兜底展示）
    refreshQuotes(codes, POLL_SOURCE);
    // 交易时段才启动轮询
    if (!trading) return;
    const timer = setInterval(doRefresh, refreshInterval);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshQuotes(codes, POLL_SOURCE);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hydrated, watchlist, refreshInterval, trading, refreshQuotes]);

  return null;
}

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const dark = useResolvedDarkTheme();
  const hydrated = useFundStore((s) => s.hydrated);
  // store 水合前，以 layout 内联脚本已写入的首帧主题为准，保证 antd 算法与首帧一致。
  // 经 useSyncExternalStore + 服务端快照读取：水合首帧与 SSR 一致（不直接读客户端 DOM，
  // 避免水合属性不匹配告警），水合完成后立即以内联脚本写入的真实首帧主题重渲染。
  const initialDark = useSyncExternalStore(
    () => () => {},
    () => document.documentElement.getAttribute('data-theme') === 'dark',
    () => false
  );
  const effectiveDark = hydrated ? dark : initialDark;

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: effectiveDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#d01c1c',
          borderRadius: 10,
          // 控件玻璃面与受光描边（globals.css 提供变量；blur/高光由 CSS 补充）
          colorBgContainer: 'var(--card-input)',
          colorBorder: 'var(--border-input)',
          colorBorderSecondary: 'var(--border-soft)',
          // Apple 手感：更快、更柔和的缓动（P2）；reduce-motion 由全局 CSS 与 antd 自动降级处理
          motionDurationFast: '0.06s',
          motionDurationMid: '0.12s',
          motionDurationSlow: '0.2s',
          motionEaseInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
        },
        components: {
          Layout: { bodyBg: 'transparent', headerBg: 'transparent', siderBg: 'transparent' },
          Card: {
            headerFontSize: 15,
            // 卡片玻璃面（半透明，透出环境光）；圆角/高光/阴影由全局 CSS 定义
            colorBgContainer: 'var(--card)',
            borderRadiusLG: 18,
          },
          Segmented: {
            // 玻璃轨道 + 浮起滑块（Apple segmented control）
            trackBg: 'var(--glass-track)',
            itemSelectedBg: 'var(--card-solid)',
          },
          Tabs: {
            cardBg: 'var(--card)',
          },
          Alert: {
            // 语义色半透明化，配合 CSS 的玻璃托盘
            colorWarningBg: 'rgba(250, 173, 20, 0.16)',
            colorErrorBg: 'rgba(255, 77, 79, 0.16)',
            colorInfoBg: 'rgba(22, 119, 255, 0.14)',
          },
        },
      }}
    >
      <App style={{ minHeight: '100vh' }}>
        <ThemeController />
        <RealtimeController />
        {children}
      </App>
    </ConfigProvider>
  );
}