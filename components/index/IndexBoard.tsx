'use client';

import { Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import useSWR from 'swr';
import { fundApi } from '@/lib/data/fundApi';
import { useFundStore } from '@/lib/store/useFundStore';
import { isTradingSession } from '@/lib/utils/tradeCalendar';
import { changeColor, formatSigned } from '@/lib/utils/format';
import type { IndexQuote } from '@/lib/types';
import IndexTrendModal from './IndexTrendModal';

const fetcher = () => fundApi.indices();

/**
 * 滚轮转横滑 + 鼠标拖拽平移（滚动条隐藏后桌面的主要平移方式）。
 * movedRef 标记本次按拖是否发生位移，用于区分「拖拽」和「点击卡片」。
 * 松手后按释放瞬间的指针速度惯性滑行（Apple 滚动减速曲线 0.998），可随时抓取打断。
 */
function useHorizontalPan() {
  const ref = useRef<HTMLDivElement>(null);
  const movedRef = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /** 边缘渐隐状态：有溢出才启用；滚到头的一侧不再渐隐 */
    const updateEdges = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('has-overflow', max > 1);
      el.classList.toggle('at-start', el.scrollLeft <= 1);
      el.classList.toggle('at-end', el.scrollLeft >= max - 1);
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // 已是横向滚动
      const canScroll = el.scrollWidth > el.clientWidth;
      if (!canScroll) return;
      e.preventDefault();
      stopGlide(); // 滚轮接管，打断惯性滑行
      el.scrollLeft += e.deltaY;
    };

    let dragging = false;
    let startX = 0;
    let startLeft = 0;
    let lastX = 0;
    let lastT = 0;
    let vx = 0; // 指针水平速度 px/s（滑动平均）
    let raf = 0;

    const stopGlide = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    /** 惯性滑行：从释放速度起按指数衰减（Apple UIScrollView 同款曲线），到边界即停 */
    const glide = (velocity: number) => {
      let v = velocity;
      let prev = performance.now();
      const DECAY = 0.998;
      const step = (now: number) => {
        raf = 0;
        if (dragging) return; // 被重新抓取，立即让位于 1:1 跟手
        const dt = Math.min(now - prev, 40);
        prev = now;
        v *= Math.pow(DECAY, dt);
        el.scrollLeft -= (v * dt) / 1000;
        const max = el.scrollWidth - el.clientWidth;
        if (Math.abs(v) > 40 && el.scrollLeft > 0 && el.scrollLeft < max) {
          raf = requestAnimationFrame(step);
        }
      };
      raf = requestAnimationFrame(step);
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      stopGlide(); // 抓取可随时打断惯性（interruptibility）
      dragging = true;
      movedRef.current = false;
      startX = e.pageX;
      startLeft = el.scrollLeft;
      lastX = e.pageX;
      lastT = performance.now();
      vx = 0;
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) {
        const nv = ((e.pageX - lastX) / dt) * 1000;
        vx = vx === 0 ? nv : vx * 0.6 + nv * 0.4;
      }
      lastX = e.pageX;
      lastT = now;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 4) {
        movedRef.current = true;
        el.classList.add('dragging');
        el.scrollLeft = startLeft - dx;
      }
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      // 以释放瞬间速度继续滑行（速度较小视为有意停住，不滑）
      if (movedRef.current && Math.abs(vx) > 80) glide(vx);
    };

    // 滚动/内容变化时刷新边缘渐隐（子元素渲染后 scrollWidth 才确定）
    const mo = new MutationObserver(updateEdges);
    mo.observe(el, { childList: true });

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onDown);
    el.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    updateEdges();
    return () => {
      stopGlide();
      mo.disconnect();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);
  return { ref, movedRef };
}

export default function IndexBoard() {
  const refreshInterval = useFundStore((s) => s.settings.refreshInterval);
  const trading = isTradingSession();
  const { ref: boardRef, movedRef } = useHorizontalPan();
  const [active, setActive] = useState<IndexQuote | null>(null);
  const { data, isLoading } = useSWR<IndexQuote[]>('indices', fetcher, {
    refreshInterval: trading ? refreshInterval : 0,
    revalidateOnFocus: false,
    dedupingInterval: 3000,
  });

  /** 拖拽刚结束时不触发卡片点击（click 在 mouseup 之后派发，需手动拦截） */
  const handleClickCapture = (e: React.SyntheticEvent) => {
    if (movedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      movedRef.current = false;
    }
  };

  if (isLoading && !data) {
    return (
      <div ref={boardRef} className="index-board" style={{ padding: '12px 0' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="index-tile"
            style={{
              height: 84,
              borderRadius: 14,
              background: 'var(--card-solid)',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <div ref={boardRef} className="index-board stagger-in" onClickCapture={handleClickCapture}>
        {data?.map((idx, i) => {
          const color = changeColor(idx.changePct);
          return (
            <div
              key={idx.code}
              className="index-tile glass-tile glass-hover"
              style={{ '--i': i, borderRadius: 14, padding: '10px 14px' } as CSSProperties}
              role="button"
              tabIndex={0}
              title="点击查看走势"
              onClick={() => setActive(idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setActive(idx);
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{idx.name}</div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color,
                  letterSpacing: '-0.015em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {idx.point.toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color }}>
                {formatSigned(idx.change, 2)}&nbsp; {idx.changePct > 0 ? '+' : ''}
                {idx.changePct.toFixed(2)}%
              </div>
            </div>
          );
        })}
        {(data?.length || 0) === 0 && !isLoading && <Spin size="small" />}
      </div>
      <IndexTrendModal index={active} open={!!active} onClose={() => setActive(null)} />
    </>
  );
}
