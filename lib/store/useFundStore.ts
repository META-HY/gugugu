import { DEFAULT_GROUP, DEFAULT_SETTINGS, STORAGE_KEYS } from '@/lib/config';
import { fundApi } from '@/lib/data/fundApi';
import type { FundGroup, FundPurchase, FundQuote, UserSettings, WatchItem } from '@/lib/types';
import { storageGet, storageSet } from '@/lib/utils/storage';
import { create } from 'zustand';

/** 通过「导出 JSON」得到的外部备份结构 */
export interface FundBackup {
  app?: string;
  version?: string;
  exportedAt?: string;
  settings?: Partial<UserSettings>;
  groups?: FundGroup[];
  watchlist?: WatchItem[];
  fundCount?: number;
}

interface FundState {
  hydrated: boolean;
  quoteLoading: boolean;
  quoteError: string | null;
  quotes: Record<string, FundQuote>;
  lastUpdated: string;
  watchlist: WatchItem[];
  groups: FundGroup[];
  settings: UserSettings;

  hydrate: () => void;
  addWatch: (code: string, groupId?: string) => void;
  removeWatch: (code: string) => void;
  updateAmount: (code: string, amount: number | undefined) => void;
  addPurchase: (code: string, purchase: Omit<FundPurchase, 'id'>) => void;
  removePurchase: (code: string, id: string) => void;
  toggleWatch: (code: string, groupId?: string) => boolean;
  isWatched: (code: string) => boolean;
  addGroup: (name: string) => void;
  removeGroup: (id: string) => void;
  moveToGroup: (code: string, groupId: string) => void;
  updateSettings: (patch: Partial<UserSettings>) => void;
  importData: (backup: FundBackup) => { ok: boolean; error?: string };
  setQuoteError: (msg: string | null) => void;
  refreshQuotes: (codes: string[], source?: 'mock' | 'tiantian' | 'gugu') => Promise<void>;
  sortWatchlist?: never;
}

function persistWatchlist(list: WatchItem[]) {
  storageSet(STORAGE_KEYS.watchlist, list);
}
function persistGroups(groups: FundGroup[]) {
  storageSet(STORAGE_KEYS.groups, groups);
}

/** 导入时校验买入记录：日期 YYYY-MM-DD、金额/净值为正有限数，id 缺失则补 */
function sanitizePurchases(list: unknown, code: string, idx: number): FundPurchase[] | undefined {
  if (!Array.isArray(list) || !list.length) return undefined;
  const valid = list.filter(
    (p): p is FundPurchase =>
      !!p &&
      typeof p === 'object' &&
      typeof p.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
      typeof p.amount === 'number' &&
      Number.isFinite(p.amount) &&
      p.amount > 0 &&
      typeof p.nav === 'number' &&
      Number.isFinite(p.nav) &&
      p.nav > 0
  );
  if (!valid.length) return undefined;
  return valid.map((p, i) => ({
    ...p,
    id: typeof p.id === 'string' && p.id ? p.id : `p_${code}_${idx}_${i}`,
  }));
}

let allowRefresh = true;
/** 允许停止（例如非交易时段节流），由 RealtimeProvider 控制 */
export function setRefreshAllowed(allowed: boolean) {
  allowRefresh = allowed;
}

export const useFundStore = create<FundState>((set, get) => ({
  hydrated: false,
  quoteLoading: false,
  quoteError: null,
  quotes: {},
  lastUpdated: '',
  watchlist: [],
  groups: [DEFAULT_GROUP],
  settings: { ...DEFAULT_SETTINGS },

  hydrate: () => {
    if (get().hydrated) return;
    const watchlist = storageGet<WatchItem[]>(STORAGE_KEYS.watchlist, []);
    const groups = storageGet<FundGroup[]>(STORAGE_KEYS.groups, [DEFAULT_GROUP]);
    const stored = storageGet<Partial<UserSettings>>(STORAGE_KEYS.settings, {});
    // 一次性迁移：旧版无「跟随系统」，且改任意设置都会连带持久化当时的默认亮色，
    // 无法区分用户是否主动选过主题 → 统一重置为 auto（跟随系统）
    const migrated = storageGet<boolean>(STORAGE_KEYS.themeMigrated, false);
    const themeMode =
      migrated && (stored.themeMode === 'auto' || stored.themeMode === 'light' || stored.themeMode === 'dark')
        ? stored.themeMode
        : DEFAULT_SETTINGS.themeMode;
    const settings: UserSettings = { ...DEFAULT_SETTINGS, ...stored, themeMode };
    if (!migrated) {
      storageSet(STORAGE_KEYS.settings, settings);
      storageSet(STORAGE_KEYS.themeMigrated, true);
    }
    set({ hydrated: true, watchlist, groups, settings });
  },

  addWatch: (code, groupId = DEFAULT_GROUP.id) => {
    const { watchlist } = get();
    if (watchlist.some((w) => w.code === code)) return;
    const next = [...watchlist, { code, groupId, addedAt: Date.now() }];
    persistWatchlist(next);
    set({ watchlist: next });
  },

  removeWatch: (code) => {
    const next = get().watchlist.filter((w) => w.code !== code);
    persistWatchlist(next);
    set({ watchlist: next });
  },

  updateAmount: (code, amount) => {
    // 归一化：非有限数 / 负数 / NaN 一律视为未设置
    const valid = typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : undefined;
    const watchlist = get().watchlist.map((w) =>
      w.code === code ? { ...w, amount: valid } : w
    );
    persistWatchlist(watchlist);
    set({ watchlist });
  },

  addPurchase: (code, purchase) => {
    if (!(purchase.amount > 0) || !(purchase.nav > 0)) return;
    const record: FundPurchase = { ...purchase, id: `p_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}` };
    const watchlist = get().watchlist.map((w) =>
      w.code === code
        ? { ...w, purchases: [...(w.purchases ?? []), record].sort((a, b) => a.date.localeCompare(b.date)) }
        : w
    );
    persistWatchlist(watchlist);
    set({ watchlist });
  },

  removePurchase: (code, id) => {
    const watchlist = get().watchlist.map((w) =>
      w.code === code ? { ...w, purchases: (w.purchases ?? []).filter((p) => p.id !== id) } : w
    );
    persistWatchlist(watchlist);
    set({ watchlist });
  },

  toggleWatch: (code, groupId = DEFAULT_GROUP.id) => {
    if (get().isWatched(code)) {
      get().removeWatch(code);
      return false;
    }
    get().addWatch(code, groupId);
    return true;
  },

  isWatched: (code) => get().watchlist.some((w) => w.code === code),

  addGroup: (name) => {
    const g: FundGroup = { id: `g_${Date.now().toString(36)}`, name: name.trim() };
    if (!g.name) return;
    const next = [...get().groups, g];
    persistGroups(next);
    set({ groups: next });
  },

  removeGroup: (id) => {
    if (id === DEFAULT_GROUP.id) return;
    const groups = get().groups.filter((g) => g.id !== id);
    // 被删分组的基金归入默认分组
    const watchlist = get().watchlist.map((w) =>
      w.groupId === id ? { ...w, groupId: DEFAULT_GROUP.id } : w
    );
    persistGroups(groups);
    persistWatchlist(watchlist);
    set({ groups, watchlist });
  },

  moveToGroup: (code, groupId) => {
    const watchlist = get().watchlist.map((w) => (w.code === code ? { ...w, groupId } : w));
    persistWatchlist(watchlist);
    set({ watchlist });
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    storageSet(STORAGE_KEYS.settings, settings);
    set({ settings });
  },

  importData: (backup) => {
    if (!backup || typeof backup !== 'object') {
      return { ok: false, error: '文件内容不是有效的对象' };
    }

    // 校验并规范化分组：始终保留内置默认分组
    let groups: FundGroup[] = [DEFAULT_GROUP];
    if (Array.isArray(backup.groups) && backup.groups.length) {
      const valid = backup.groups.filter(
        (g) => g && typeof g === 'object' && typeof g.id === 'string' && typeof g.name === 'string'
      );
      const ids = new Set(valid.map((g) => g.id));
      if (!ids.has(DEFAULT_GROUP.id)) valid.unshift(DEFAULT_GROUP);
      groups = valid;
    }
    const validGroupIds = new Set(groups.map((g) => g.id));

    // 校验并规范化自选列表：代码为 6 位数字，分组不存在则归入默认分组
    let watchlist: WatchItem[] = [];
    if (Array.isArray(backup.watchlist)) {
      watchlist = backup.watchlist
        .filter((w) => w && typeof w.code === 'string' && /^\d{6}$/.test(w.code))
        .map((w, idx) => ({
          code: w.code,
          groupId: validGroupIds.has(String(w.groupId)) ? String(w.groupId) : DEFAULT_GROUP.id,
          addedAt: typeof w.addedAt === 'number' ? w.addedAt : Date.now(),
          amount:
            typeof w.amount === 'number' && Number.isFinite(w.amount) && w.amount >= 0
              ? w.amount
              : undefined,
          purchases: sanitizePurchases(w.purchases, w.code, idx),
        }));
    }

    // 校验并规范化设置
    const src = backup.settings && typeof backup.settings === 'object' ? backup.settings : {};
    const settings: UserSettings = {
      refreshInterval: [5000, 10000, 15000, 30000, 60000].includes(src.refreshInterval ?? -1)
        ? (src.refreshInterval as number)
        : DEFAULT_SETTINGS.refreshInterval,
      themeMode:
        src.themeMode === 'dark' || src.themeMode === 'light' || src.themeMode === 'auto'
          ? src.themeMode
          : DEFAULT_SETTINGS.themeMode,
      privacyMode: !!src.privacyMode,
    };

    if (!watchlist.length && !groups.length && !src.refreshInterval) {
      return { ok: false, error: '文件中未找到有效的自选/分组/设置数据' };
    }

    persistGroups(groups);
    persistWatchlist(watchlist);
    storageSet(STORAGE_KEYS.settings, settings);
    set({ groups, watchlist, settings });
    return { ok: true };
  },

  setQuoteError: (msg) => set({ quoteError: msg }),

  refreshQuotes: async (codes, source = 'mock') => {
    if (!allowRefresh || !codes.length) return;
    set({ quoteLoading: true, quoteError: null });
    try {
      const list = await fundApi.quotes(codes);
      const map: Record<string, FundQuote> = {};
      // source 以数据自带为准（真实源 'gugu' / 降级 mock 'mock'），入参仅作缺失时兜底
      list.forEach((q) => (map[q.code] = { ...q, source: q.source ?? source }));
      set((s) => ({ quotes: { ...s.quotes, ...map }, lastUpdated: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }));
    } catch (e) {
      set({ quoteError: (e as Error).message });
    } finally {
      set({ quoteLoading: false });
    }
  },
}));