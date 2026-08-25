import type { Metadata, Viewport } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Geist, Geist_Mono } from 'next/font/google';
import AppProviders from '@/components/providers/AppProviders';
import AppShell from '@/components/layout/AppShell';
import { APP_NAME } from '@/lib/config';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: '基金估值走势实时查看工具 · 数据仅供参考，不构成投资建议',
  icons: { icon: '/LOGO.svg' },
};

export const viewport: Viewport = {
  themeColor: '#d01c1c',
  width: 'device-width',
  initialScale: 1,
};

/**
 * 首帧主题同步脚本：在首帧渲染前解析主题并设置 html[data-theme]，
 * 避免「SSR 默认亮色 → 水合后切换」的闪烁（键名与 lib/config.ts 的 STORAGE_KEYS 对应）。
 * - 显式选过 light/dark：以选择为准（迁移标记 fund_theme_migrated 存在时才信任旧值）
 * - 未选择/auto：跟随系统 prefers-color-scheme
 * 必须内联同步执行，不可 defer/async。
 */
const THEME_INIT_SCRIPT = `(function(){try{var d=null;try{d=JSON.parse(localStorage.getItem('fund_settings'))}catch(e){}var t=d?d.themeMode:null;var m=false;try{m=localStorage.getItem('fund_theme_migrated')==='true'}catch(e){}if(!m)t=null;var dark=t==='dark';if(t!=='dark'&&t!=='light'){dark=!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)}if(dark)document.documentElement.setAttribute('data-theme','dark');if(d&&d.privacyMode)document.documentElement.classList.add('privacy-mode');}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="zh-CN"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AntdRegistry>
          <AppProviders>
            <AppShell>{children}</AppShell>
          </AppProviders>
        </AntdRegistry>
      </body>
    </html>
  );
}