# 咕咕咕基金估值 · 本地开发交接文档

> 交接时间：2026-08-21 · 版本：v1.1.0（行业标签 + 持仓金额）
> 上一稳定版：v1.0.0（git 提交 `382dfd1`）

---

## 一、项目概览

基金走势估值实时查看网站，核心功能：

- 基金实时估值（估算净值/涨跌幅/预估收益/更新时间，真实数据）
- 历史净值走势 + 当天盘中分时走势（ECharts 可视化）
- 自选基金管理：分组、行业标签、**持仓金额**（按持仓算预估收益）
- 搜索添加基金（支持代码/汉字/拼音首字母/全拼模糊匹配）
- 亮色/暗色主题、隐私模式（金额打码）、自选 JSON 导入导出
- Apple 液态玻璃 UI 风格，多端自适应（手机/平板/桌面）

## 二、技术栈

| 类别 | 选型 | 版本 |
|---|---|---|
| 框架 | Next.js（App Router） | 16.3.1 |
| 语言 | TypeScript | ^5 |
| UI 组件库 | Ant Design | ^6.6.1 |
| 图表 | ECharts + echarts-for-react | 6.1.0 |
| 状态管理 | Zustand | ^5.0.15 |
| 数据请求 | SWR | ^2.5.1 |
| 拼音匹配 | pinyin-pro | ^3.29.3 |

**注意**：Next.js 16 与训练认知差异较大，写代码前先看 `node_modules/next/dist/docs/` 里的指南（API 路由 params 是 Promise、RouteContext 类型变更等）。

## 三、本地环境搭建

```bash
# 方式 A：源码包（推荐）
unzip gugu-v1.1.0-source.zip -d gugu && cd gugu
npm install          # 需要网络
npm run dev          # 开发模式 http://localhost:3000

# 方式 B：完整包（离线可用，已含 node_modules + .next）
unzip gugu-v1.1.0-full.zip -d gugu && cd gugu
npm start            # 直接跑生产构建
# 若需重新构建：npm run build && npm start
```

Node 版本建议 ≥ 20（沙箱内用的是 24.1.0）。

```bash
npm run dev      # 开发（Turbopack）
npm run build    # 生产构建
npm start        # 生产运行
npm run lint     # ESLint
npx tsc --noEmit # 类型检查
```

## 四、目录结构

```
app/
├── page.tsx                 # 首页（重定向/落地）
├── funds/page.tsx           # 自选列表页（主页）
├── fund/[code]/page.tsx     # 基金详情页（动态路由）
├── settings/page.tsx        # 设置页（含 JSON 导入导出）
├── globals.css              # 液态玻璃设计令牌 + 全局样式（核心！）
├── layout.tsx               # 根布局
└── api/funds/               # 服务端 API 路由（代理真实数据源）
    ├── search/              #   搜索（含拼音匹配）
    ├── quotes/              #   实时估值（POST, body: {codes:[]})
    ├── indices/             #   大盘指数
    ├── industries/          #   重仓行业聚合
    └── [code]/
        ├── detail/          #   基金详情
        ├── history/         #   历史净值
        ├── holdings/        #   前十大重仓股
        └── intraday/        #   盘中分时（重仓股加权合成）

components/
├── layout/AppShell.tsx      # 页面骨架（头部/导航）
├── providers/AppProviders.tsx # hydration + 轮询控制（交易时段/页面可见性）
├── fund/
│   ├── FundList.tsx         # 自选列表（桌面表格/移动卡片 + AmountEditor 持仓编辑）
│   ├── FundGroupTabs.tsx    # 分组页签
│   ├── SearchAdd.tsx        # 搜索添加（composition 事件守卫中文输入）
│   ├── NavChart.tsx         # 历史净值图
│   ├── IntradayChart.tsx    # 盘中分时图
│   └── NavTable.tsx         # 净值表格
├── index/IndexBoard.tsx     # 指数板
├── common/StatusBanner.tsx  # 状态/错误横幅
└── ui/Value.tsx             # 数值组件（PctText/Amount/隐私打码）

lib/
├── config.ts                # 常量：DATA_MODE、STORAGE_KEYS、APP_VERSION 等
├── types.ts                 # 全部类型定义（WatchItem 含 amount? 字段）
├── data/
│   ├── fundApi.ts           # 统一数据入口（client 调它，不直接碰 sources/mock）
│   ├── sources.ts           # 真实数据源（天天基金+腾讯行情，仅服务端）
│   └── mock.ts              # 模拟数据
├── store/useFundStore.ts    # Zustand 全局状态（自选/分组/设置/行情）
└── utils/
    ├── format.ts            # 格式化（涨跌色/金额/百分比）
    ├── storage.ts           # localStorage 封装（SSR/隐私模式降级）
    └── tradeCalendar.ts     # 交易时段判断（轮询开关）
```

## 五、核心架构

### 1. 数据层（重点）

```
组件 → fundApi（lib/data/fundApi.ts）
         ├─ DATA_MODE='mock' → mock.ts（纯本地）
         └─ DATA_MODE='real' → /api/funds/*（服务端路由）
                                └─ sources.ts（天天基金 fundmobapi + 腾讯行情）
                                     └─ 失败降级 mock（FALLBACK_THRESHOLD=3 次连续失败）
```

- **DATA_MODE 在 `lib/config.ts` 第 50 行**：`'real'`（默认，真实数据）/ `'mock'`（本地模拟）
- 真实接口只在服务端调用，规避浏览器跨域
- **风控要点**：天天基金 fundmobapi 按 UA 风控，桌面 UA 返回 ErrCode 61136403，必须用 MOBILE_UA（sources.ts 第 27 行）
- 自选数据存 `localStorage`，键名见 `STORAGE_KEYS`（watchlist/groups/settings）

### 2. 状态管理（Zustand）

`lib/store/useFundStore.ts`：
- `watchlist: WatchItem[]` — 自选项（code/groupId/addedAt/**amount?** 持仓金额）
- `quotes: Record<code, FundQuote>` — 实时估值缓存
- `settings` — 刷新频率/主题/隐私模式
- 关键 action：`addWatch`/`removeWatch`/`updateAmount`/`importData`/`refreshQuotes`
- 所有写操作同步 persist 到 localStorage

### 3. 实时刷新

`components/providers/AppProviders.tsx`：
- 仅交易时段（`isTradingSession()`）轮询，页面隐藏（visibilitychange）暂停
- 刷新频率由 settings.refreshInterval 控制（默认 15s）

### 4. UI 设计体系

`app/globals.css` 是液态玻璃风格的核心：
- CSS 变量令牌：`--card`/`--glass-blur`/`--shadow`/`--up`(红涨)/`--down`(绿跌) 等，亮暗双主题
- `data-theme` 属性切换主题，antd 用 ConfigProvider algorithm 联动
- 环境光背景：body::before 多层 radial-gradient（Apple 系统色板：蓝 0071E3/紫 BF5AF2/橙 FF9500）
- 交互遵循 Apple Design：动效令牌、`prefers-reduced-motion` 支持、投影不被裁切（overflow-clip-margin 技巧）

## 六、近期改动（v1.1.0，尚未 git 提交！）

`git status` 显示以下文件已修改未提交：

| 文件 | 改动 |
|---|---|
| `lib/types.ts` | WatchItem 增加 `amount?: number` |
| `lib/store/useFundStore.ts` | 新增 `updateAmount` action；importData 校验保留 amount |
| `components/fund/FundList.tsx` | 持仓金额列 AmountEditor（点击编辑/回车保存/Esc 取消）；预估收益 = amount × 涨跌幅%（未设置时退回 1 万份模拟值）；排序/导出适配 |
| `app/api/funds/industries/` | 新增：重仓行业聚合接口 |
| `app/globals.css`、`app/settings/page.tsx`、`lib/data/*` | 行业标签配套 + 样式微调 |

**建议本地起步后先提交这批改动**（用户确认后）：
```bash
git add -A && git commit -m "feat: 基金重仓行业标签 + 持仓金额设置(v1.1.0)"
```

## 七、已知问题与坑（重要！）

1. **开发环境 hydration 假死**：远程沙箱的 Turbopack dev + 代理环境下，客户端 hydration 可能不执行（表现为数据一直 loading、主题切换无效）。**这不是代码 bug**，生产构建（`npm run build && npm start`）正常。本地开发一般不会遇到；若遇到先用生产构建验证。
2. **antd v6 + Next 16 类型差异**：
   - API 路由 params 是 `Promise`，需 `const { code } = await ctx.params`
   - `AliasToken` 无 `motionEaseIn/Out`；`ThemeConfig` 无顶层 `motion` 字段
3. **搜索中文输入**：用 `Input.Search` 的 onChange 驱动 + `compositionstart/end` 守卫，确保输入法上屏后才触发搜索（rc-select combobox 不触发 onSearch）
4. **搜索结果混入股票**：天天基金接口会返回股票，已用 `.filter(it => it.FundBaseInfo != null)` 过滤，改动搜索逻辑时别丢
5. **投影被裁切**：横向滚动容器（如指数板）要用不对称 padding 留投影空间；`.ant-tabs-nav-wrap` 用 `overflow: clip + overflow-clip-margin`
6. **真实接口风控**：见第五章 MOBILE_UA 说明；接口偶发失败会自动降级 mock，行情会带「模拟」标记

## 八、后续可做的方向（建议）

- 自选列表汇总栏：总持仓金额 / 今日预估总盈亏
- 净值更新提醒（净值披露后对比估值偏差）
- 持仓收益走势图（按持仓金额+历史净值回测）
- 基金对比功能
- PWA / 移动端安装支持

## 九、数据源参考

| 数据 | 来源 | 说明 |
|---|---|---|
| 基金搜索/估值/净值/重仓 | 天天基金 fundmobapi | 需 MOBILE_UA |
| 全量基金索引 | fund.eastmoney.com/js/fundcode_search.js | 拼音匹配数据基础 |
| 大盘指数 | 腾讯行情 qt.gtimg.cn | 上证/深成/创业板/恒指/纳指 |

**合规提示**：数据仅供参考，页面已带免责声明（`lib/config.ts` DISCLAIMER），勿用于商业数据转售。
