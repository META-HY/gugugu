'use client';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const MEMORY: Map<string, string> = new Map();

/**
 * 浏览器 localStorage 的安全封装：
 * - SSR/隐私模式下自动降级为内存存储（仍能满足会话内读取）
 * - 值自动 JSON 序列化
 */
function resolve(): StorageLike {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    /* ignore */
  }
  return {
    getItem: (k) => MEMORY.get(k) ?? null,
    setItem: (k, v) => MEMORY.set(k, v),
    removeItem: (k) => MEMORY.delete(k),
  };
}

export function storageGet<T>(key: string, fallback: T): T {
  try {
    const raw = resolve().getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function storageSet<T>(key: string, value: T): void {
  try {
    resolve().setItem(key, JSON.stringify(value));
  } catch {
    /* 存储满或不可用则静默忽略 */
  }
}

export function storageRemove(key: string): void {
  try {
    resolve().removeItem(key);
  } catch {
    /* ignore */
  }
}