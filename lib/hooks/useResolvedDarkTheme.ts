'use client';

import { useSyncExternalStore } from 'react';
import { useFundStore } from '@/lib/store/useFundStore';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeSystemDark(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getSystemDark() {
  return window.matchMedia(DARK_QUERY).matches;
}

/**
 * 解析后的主题是否为暗色：
 * - 显式选择 light/dark 时以选择为准
 * - auto（默认）跟随系统 prefers-color-scheme，且系统切换时实时更新
 *
 * systemDark 经 useSyncExternalStore 读取：水合首帧采用服务端快照 false（与 SSR 一致，
 * 避免水合属性不匹配告警），水合完成后 React 立即以真实系统偏好重渲染。
 */
export function useResolvedDarkTheme(): boolean {
  const themeMode = useFundStore((s) => s.settings.themeMode);
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);

  return themeMode === 'dark' || (themeMode !== 'light' && systemDark);
}
