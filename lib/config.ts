/** 全局配置与常量 */

export const APP_NAME = '咕咕咕';

/** 应用版本（与 package.json 保持同步） */
export const APP_VERSION = '1.0.0';

export const DISCLAIMER =
  '注：基金估值数据仅供参考，不构成投资建议。实际净值以基金公司披露为准。';

/** 可选的刷新频率(ms) */
export const REFRESH_OPTIONS: { label: string; value: number }[] = [
  { label: '5 秒', value: 5000 },
  { label: '10 秒', value: 10000 },
  { label: '15 秒', value: 15000 },
  { label: '30 秒', value: 30000 },
  { label: '60 秒', value: 60000 },
];

export const DEFAULT_REFRESH = 15000;

export const DEFAULT_SETTINGS = {
  refreshInterval: DEFAULT_REFRESH,
  themeMode: 'auto' as const,
  privacyMode: false,
};

/** localStorage 键名 */
export const STORAGE_KEYS = {
  watchlist: 'fund_watchlist',
  groups: 'fund_groups',
  settings: 'fund_settings',
  /** 主题三态化（v1.1）的一次性迁移标记 */
  themeMigrated: 'fund_theme_migrated',
};

/** 默认分组 */
export const DEFAULT_GROUP = { id: 'default', name: '默认分组', builtin: true };
export const DATING_FREQUENCY = '成立以来';

/** 历史净值时间维度 */
export const NAV_RANGES = [
  { key: '1D', label: '当天' },
  { key: '1M', label: '近1月' },
  { key: '3M', label: '近3月' },
  { key: '1Y', label: '近1年' },
  { key: '3Y', label: '近3年' },
  { key: 'ALL', label: DATING_FREQUENCY },
] as const;

/** 数据源切换：real 走真实接口（服务端代理），失败自动降级 mock；mock 为纯本地 */
export const DATA_MODE: 'mock' | 'real' = 'real';

/** 真实接口连续失败多少次后降级 */
export const FALLBACK_THRESHOLD = 3;