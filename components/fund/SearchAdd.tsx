'use client';

import { App, AutoComplete, Tag, Input } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { AutoCompleteProps } from 'antd';
import { fundApi } from '@/lib/data/fundApi';
import { useFundStore } from '@/lib/store/useFundStore';

export default function SearchAdd() {
  const [value, setValue] = useState('');
  const [options, setOptions] = useState<AutoCompleteProps['options']>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const addWatch = useFundStore((s) => s.addWatch);
  const isWatched = useFundStore((s) => s.isWatched);
  const { message } = App.useApp();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seqRef = useRef(0);
  // 输入法（IME）组合中标记：拼音未上屏前不搜索，避免中文输入中途拼音干扰结果
  const composingRef = useRef(false);

  // 卸载时清理防抖计时器
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const applyResult = (res: Awaited<ReturnType<typeof fundApi.search>>) => {
    setOptions(
      res.map((f) => ({
        value: f.code,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {f.name}
              <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontSize: 12 }}>
                {f.code}
              </span>
            </span>
            <Tag style={{ fontSize: 11, margin: 0 }}>{f.type}</Tag>
          </div>
        ),
      }))
    );
  };

  // 300ms 防抖 + 竞态控制：仅采纳最新一次请求结果
  const runSearch = (text: string) => {
    const kw = text.trim();
    clearTimeout(timerRef.current);
    if (!kw) {
      seqRef.current += 1;
      setLoading(false);
      setOptions([]);
      return;
    }
    setOpen(true); // 有输入即展开下拉，等待服务端结果回填
    setLoading(true);
    timerRef.current = setTimeout(() => {
      const seq = ++seqRef.current;
      fundApi
        .search(kw)
        .then((res) => {
          if (seq !== seqRef.current) return;
          applyResult(res);
        })
        .catch(() => {
          if (seq === seqRef.current) setOptions([]);
        })
        .finally(() => {
          if (seq === seqRef.current) setLoading(false);
        });
    }, 300);
  };

  const handleSelect = (code: string) => {
    if (isWatched(code)) {
      message.info('该基金已在自选中');
    } else {
      addWatch(code);
      message.success('已添加到自选');
    }
    setValue('');
    setOptions([]);
    setOpen(false);
  };

  return (
    <AutoComplete
      style={{ width: '100%' }}
      options={options}
      value={value}
      // 服务端已返回匹配结果，禁止客户端再按 value(代码) 二次过滤，否则中文/拼音会被全部滤掉
      filterOption={false}
      onSelect={handleSelect}
      notFoundContent="未找到匹配基金"
      open={open}
      onOpenChange={setOpen}
    >
      <Input.Search
        placeholder="输入基金名称 / 代码 / 首字母模糊搜索添加"
        allowClear
        loading={loading}
        // 用原生 onChange 驱动搜索：汉字输入法组合中不搜，等上屏后由 onCompositionEnd 补发
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          if (composingRef.current) return; // 拼音组合中略过，避免中间拼音污染
          if (!v.trim()) {
            seqRef.current += 1;
            clearTimeout(timerRef.current);
            setLoading(false);
            setOptions([]);
            setOpen(false);
            return;
          }
          runSearch(v);
        }}
        onCompositionStart={() => {
          composingRef.current = true;
          // 作废组合前挂起的旧搜索，避免拼音组合途中回填过期结果
          seqRef.current += 1;
          clearTimeout(timerRef.current);
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          // 关键：汉字上屏后再补发一次真实搜索（以最终中文文本为准）
          const v = (e.currentTarget as HTMLInputElement).value;
          if (!v.trim()) {
            setOpen(false);
            setOptions([]);
          } else {
            runSearch(v);
          }
        }}
      />
    </AutoComplete>
  );
}