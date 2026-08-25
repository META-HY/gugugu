'use client';

import { useFundStore } from '@/lib/store/useFundStore';
import { formatAmount, formatPct, formatSigned } from '@/lib/utils/format';

/** 隐私模式掩码 */
export function useMasked(): boolean {
  return useFundStore((s) => s.settings.privacyMode);
}

/** 隐私敏感值：隐私模式下显示为 **** */
export function Masked({ text }: { text: string }) {
  const masked = useMasked();
  if (!masked) return <>{text}</>;
  return <span className="privacy-mask">****</span>;
}

/** 带颜色(红涨绿跌)的涨跌文本 */
export function ColoredText({ value, children }: { value: number; children: React.ReactNode }) {
  const cls = value > 0 ? 'value-up' : value < 0 ? 'value-down' : 'value-flat';
  return <span className={cls}>{children}</span>;
}

/** 涨跌幅( %) */
export function PctText({ value, className }: { value: number; className?: string }) {
  return (
    <ColoredText value={value}>
      <span className={className}>{formatPct(value)}</span>
    </ColoredText>
  );
}

/** 带符号数值（估值变动额） */
export function SignedText({ value, digits = 4 }: { value: number; digits?: number }) {
  return (
    <ColoredText value={value}>
      <span>{formatSigned(value, digits)}</span>
    </ColoredText>
  );
}

/** 金额（隐私模式打码） */
export function Amount({ value, digits = 2 }: { value: number; digits?: number }) {
  const masked = useMasked();
  if (masked) return <span className="privacy-mask">****</span>;
  return <>{formatAmount(value, digits)}</>;
}