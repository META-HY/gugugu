'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { App, Button, Space, Tag, Tooltip, theme as antdTheme } from 'antd';
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  MoonOutlined,
  SettingOutlined,
  SunOutlined,
} from '@ant-design/icons';
import { APP_NAME, DISCLAIMER } from '@/lib/config';
import { useFundStore } from '@/lib/store/useFundStore';
import { useResolvedDarkTheme } from '@/lib/hooks/useResolvedDarkTheme';
import { getTradeState } from '@/lib/utils/tradeCalendar';

function TradeBadge() {
  const state = getTradeState();
  const color = state.isSession ? 'success' : 'default';
  const text = state.isSession ? '交易中' : state.isTradingDay ? '已收盘' : '休市';
  return <Tag color={color} style={{ margin: 0 }}>{text}</Tag>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const dark = useResolvedDarkTheme();
  const privacyMode = useFundStore((s) => s.settings.privacyMode);
  const updateSettings = useFundStore((s) => s.updateSettings);
  const lastUpdated = useFundStore((s) => s.lastUpdated);
  const quoteError = useFundStore((s) => s.quoteError);
  const { message } = App.useApp();
  const { token } = antdTheme.useToken();

  return (
    <div className="app-shell">
      <header className="sticky-header">
        <div className="header-inner">
          <Link href="/funds" className="header-brand">
            <span
              className="brand-mark"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                overflow: 'hidden',
                display: 'inline-flex',
                background: '#fff',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow), inset 0 1px 0 var(--glass-top-highlight)',
                flexShrink: 0,
              }}
            >
              <img
                src="/LOGO.svg"
                alt={APP_NAME}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </span>
            <span className="header-brand-name">{APP_NAME}</span>
          </Link>

          <Space size={12} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <TradeBadge />
            <Space size={4} className="header-updated-at" style={{ color: token.colorTextSecondary, fontSize: 12 }}>
              {lastUpdated ? (
                <>
                  <span>更新于</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{lastUpdated}</span>
                </>
              ) : (
                <span>暂无自选数据</span>
              )}
              {quoteError && (
                <Tooltip title={quoteError}>
                  <span style={{ color: token.colorWarning }}>· 异常</span>
                </Tooltip>
              )}
            </Space>
          </Space>

          <Space size={8}>
            <Button
              aria-label="切换主题"
              type="text"
              shape="circle"
              icon={dark ? <SunOutlined /> : <MoonOutlined />}
              onClick={() => updateSettings({ themeMode: dark ? 'light' : 'dark' })}
            />
            <Tooltip title={privacyMode ? '关闭隐私模式' : '开启隐私模式'}>
              <Button
                aria-label="隐私模式"
                type="text"
                icon={privacyMode ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                style={privacyMode ? { color: token.colorWarning } : undefined}
                onClick={() => {
                  updateSettings({ privacyMode: !privacyMode });
                  message.info(privacyMode ? '已关闭隐私模式' : '已开启隐私模式，敏感数据已隐藏');
                }}
              />
            </Tooltip>
            <Link href="/settings">
              <Button
                type={pathname === '/settings' ? 'primary' : 'text'}
                icon={<SettingOutlined />}
                aria-label="设置"
              >
                <span className="header-settings-label">设置</span>
              </Button>
            </Link>
          </Space>
        </div>
      </header>

      <main className="app-content">{children}</main>

      <footer className="app-footer">
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>{DISCLAIMER}</div>
      </footer>
    </div>
  );
}