'use client';

import { useMemo, useState } from 'react';
import FundGroupTabs from '@/components/fund/FundGroupTabs';
import FundList from '@/components/fund/FundList';
import SearchAdd from '@/components/fund/SearchAdd';
import StatusBanner from '@/components/common/StatusBanner';
import IndexBoard from '@/components/index/IndexBoard';
import { useFundStore } from '@/lib/store/useFundStore';

export default function FundsPage() {
  const [group, setGroup] = useState<string>('all');
  const watchlist = useFundStore((s) => s.watchlist);
  const groups = useFundStore((s) => s.groups);

  const codes = useMemo(() => {
    if (group === 'all') return watchlist.map((w) => w.code);
    const gid = groups.find((g) => g.id === group)?.id;
    if (!gid) return [];
    return watchlist.filter((w) => w.groupId === gid).map((w) => w.code);
  }, [group, watchlist, groups]);

  // 分组被删除后，回到默认视图
  const activeGroupValid = group === 'all' || groups.some((g) => g.id === group);
  const activeGroup = activeGroupValid ? group : 'all';

  return (
    <div className="section-stagger">
      <SearchAdd />
      <IndexBoard />
      <StatusBanner />
      <FundGroupTabs value={activeGroup} onChange={setGroup} />
      <FundList codes={codes} />
    </div>
  );
}