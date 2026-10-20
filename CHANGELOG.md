# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.16 - 2026-10-20

### 新增

- 侧边栏用量组件补充上下留白，与上方侧栏条目、下方账号行拉开间距，避免整行铺满后贴边。

### 文档

- 更新侧边栏界面预览截图，版本引用同步至 0.1.16。

## 0.1.15 - 2026-10-20

### 新增

- 侧边栏用量组件改为占满侧栏底部整行宽度，进度条延伸到侧栏右边界附近，标签与百分比分列两端，更贴合侧栏布局。

### 文档

- 更新侧边栏界面预览截图，版本引用同步至 0.1.15。

## 0.1.14 - 2026-10-20

### 新增

- **侧边栏用量组件改版**：每个指标增加彩色状态点与更轻的 5px 进度条，百分比右对齐并使用等宽数字；用量达到 70% / 90% 时数值与填充自动切换为警告 / 错误语义色，与面板配色保持一致。
- 极小的非零用量也能看到可见的圆头填充；未登录时显示克制的占位状态，不再显示两条空白进度条。
- 悬浮提示补充会话与周用量的重置倒计时，进度条补充无障碍语义。

### 文档

- 更新侧边栏界面预览截图，版本引用同步至 0.1.14。

## 0.1.13 - 2026-10-19

### 新增

- **客户端界面按 DSH 官方设计语言重做**：插件配置面板、侧栏双横条与 tool 视图卡片统一为 token 化视觉；面板改为「标题 + 状态说明 + 分区列表 + 底部操作」结构，会话 / 周用量进度条、模型请求数、最近记录与持久化状态分区展示。
- 首屏 snapshot 落定前显示加载骨架；未登录、查询失败与已登录三种状态均有明确反馈。

### 修复

- 移除客户端样式中的硬编码中性色与字号，改用 `--dsw-*` 主题 token 与 11/12/13/14 字号阶梯、6/8 圆角与 token 阴影；暗色主题下的文字与进度条对比度恢复一致。
- 面板底部版本号同步至 0.1.13。

### 文档

- README 与贡献指南标题规范化，版本引用同步至 0.1.13。

## 0.1.12 - 2026-10-17

### Compatibility

- **DSH 0.2.1-rc.1 / rc.2**: added `engines.dsh: ">=0.1.7-rc.1"` (DSH 0.2.1 prefers
  `engines.dsh` over peer ranges) and compatibility-matrix entries for both
  `0.2.1-rc.1` and `0.2.1-rc.2`. The existing `@deepseek-ai/dsh-home-paths`
  peer (`>=0.1.7-rc.1`) and the `webServer.register` / `connection.rpc.call`
  surfaces used here are unchanged in 0.2.1.
- **Verified**: the RPC envelope/balance probes pass on the 0.2.1-rc.1 dependency
  set; `evaluatePluginCompatibility()` passes for 0.2.1-rc.1 and 0.2.1-rc.2.

## 0.1.11 - 2026-10-08

### Fixed

- **会话(5h)/周用量进度恒为 `null`：详情页面板显示「暂无数据」、侧边栏双横条显示「—」。**
  Ollama 已把 `GET https://ollama.com/api/usage` 改成「Cloud usage」统计接口，只返回
  `range` / `scope` / `granularity` / `totals` / `buckets`（请求量、token、美元分桶），
  不再包含 `limits.session` / `limits.weekly`。旧实现只解析这两个字段，于是每次刷新
  都持久化 `sessionPercent: null, weeklyPercent: null`（本机历史记录连续 24 条全为 `null`）。
- 限额进度的唯一来源改为官方 `GET https://ollama.com/api/balance`
  （契约见 <https://docs.ollama.com/api/balance>）。带会话/周限额的 legacy plan 返回
  `included.session|weekly = { remaining_percent, resets_at }`，插件按
  `已用% = 100 - remaining_percent` 换算并 clamp 到 `0~100`，不再依赖已消失的字段。
- **重置时间改用接口真实值。** 移除 `weekly = 下周一 00:00 UTC` 的本地推算（那是接口
  不下发 `resets_at` 时代的兜底）；`sessionResetAt` / `weeklyResetAt` 现在直接透传
  `resets_at`，会话进度条也会显示重置倒计时。
- 按美元计费的套餐（`included.balance_usd` / `allowance_usd` / `period`，没有 5h/周
  限额）不再被当成解析失败：接口返回 200 即视为成功，两个百分比为 `null`，面板显示
  「暂无数据」而不是错误。

### Removed

- `parseUsage` / `toPercent`（解析 `/api/usage` 的 `limits` / `activity`）与
  `computeResetTimes`（本地推算周重置）——这些字段在 2026-10 的接口中已不存在。
  模型请求数排行的数据源同样消失（官方文档标注 “usage breakdowns by model” 为
  coming soon），面板的模型区块按空数据自动隐藏，`models` 字段保留在快照结构中
  待官方上线。

### Added

- `test/balance-parse.mjs`：用真实抓取到的 `/api/balance` 响应体替身 `fetch`，驱动
  桥接 `check`，回归断言百分比换算、`resets_at` 透传、持久化与历史追加，并覆盖
  无限额套餐 / 非 JSON / 401 / 403 / 网络异常分支（不联网）。`npm test` 现在跑三个套件。

## 0.1.10 - 2026-09-29

### Compatibility

- **DSH 0.2.0-rc.1 support**: widened the `@deepseek-ai/dsh-home-paths`
  `peerDependencies` range from `^0.1.7-rc.1` to the open-ended `>=0.1.7-rc.1`.
  DSH 0.2.0-rc.1 adds a plugin compatibility gate that runs an `includePrerelease` semver
  check over every `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer; the old `^0.1.7-rc.1`
  range does not match 0.2.0-rc.1 and causes the whole bundle to be skipped
  (`skipping profile bundle`), while `>=0.1.7-rc.1` satisfies both 0.1.7-rc.2 and
  0.2.0-rc.1.
- Verified by a real load on **0.2.0-rc.1** (plugin loads cleanly, no gate skip);
  `dsh.compatibility.dshReleases` gains `"0.2.0-rc.1": "compatible"` and the README
  badge / compatibility note are updated.

## 0.1.9 - 2026-09-27

### Changed

- **The configuration panel moved to the plugin's own detail page** (插件列表 →
  `dsh-ollama-usage`), rendered between the package description and the component
  rows — the DSH settings page is no longer used for configuration.
  - Removed the `settings.section` registration.
  - Added a `plugins.bundle.config` registration keyed by the npm package name
    (`dsh-ollama-usage`). That keyed slot is rendered by the plugin manager only
    while a registration with exactly the package name exists
    (`configured = ledger.bundles.has(pkg.name)` in `dsh-client-ui-plugin-manager`);
    it has no native schema fallback form. A bundle page may hold several entries,
    so the page passes no host `form` — the panel keeps owning its `/ollama-usage`
    data channel. `view === 'summary'` renders nothing.
  - The sidebar bars (`sidebar.footer.action`) and the `tool.view.cordis` panel are
    unchanged.
  - The signed-out tooltip now points at 插件列表 → dsh-ollama-usage instead of
    设置 → Ollama 用量.
- No inject change: this plugin does not read any `ctx.remote.*` namespace.

## 0.1.8 - 2026-09-25

### Changed

- **DSH 0.1.7-rc.1 / 0.1.7-rc.2 compatibility.** The `@deepseek-ai/dsh-home-paths`
  peer range moves from `^0.1.5-rc.1` to `^0.1.7-rc.1`;
  `dsh.compatibility.dshReleases` gains `"0.1.7-rc.1"` / `"0.1.7-rc.2":
  "compatible"`; README badges and the compatibility note are updated. Verified
  by a real load on 0.1.7-rc.1 and 0.1.7-rc.2 (host entry active, zero errors,
  no pending) plus the `/ollama-usage/snapshot` RPC envelope probe on
  0.1.7-rc.2. The 0.1.7-rc.1 → rc.2 official API delta removes/renames nothing
  (additive only), so no source adaptation was required.

### Verified: no source change required

- `@deepseek-ai/dsh-home-paths@0.1.7-rc.1` still exports `resolveDshHome`
  with the same signature, so the harness-home resolution and the state file
  path layout are unchanged.
- The host contracts it consumes — the `webServer` prefix route
  (`/ollama-usage`) with `inject: ['timer', 'webServer']`, and the Connection
  RPC result envelope — are unchanged in 0.1.7-rc.1.

## 0.1.7 - 2026-09-22

### Fixed

- **`@deepseek-ai/dsh-home-paths` is now a `peerDependency`, not a
  `dependency`.** The community contributing guidelines require official
  `@deepseek-ai/*` packages to be declared as peer dependencies so the host
  provides a single copy at runtime. The `resolveDshHome()` import in
  `lib/index.js` is unchanged; the host's `@deepseek-ai/dsh-home-paths`
  resolves the import exactly as before (verified by loading the packed
  artifact on a real DSH host).

### Added

- **`dsh.compatibility` declaration (DSH STORE listing contract).** A new
  `compatibility` block under the `dsh` field (the existing `bundle` and
  `client` entries are unchanged) declares per-release compatibility through
  `dshReleases`: `0.1.5-rc.1`, `0.1.5-rc.2` and `0.1.6-alpha.2` are all marked
  `compatible` — the plugin was actually loaded and run on all three, with no
  errors. Releases that were not tested are deliberately left unlisted (the
  scanner treats them as `unknown`). `node` is declared as `>=20`, matching
  the existing `dshhub.compatibility.node` field.

## 0.1.6 - 2026-09-04

### Fixed

- **alpha.4 compatibility: `@deepseek-ai/dsh-home-paths` range now matches the
  shipped version.** The dependency was `^0.1.0-rc.6`, which under the semver
  prerelease tuple rule does NOT satisfy `0.1.2-alpha.4` — `npm install`
  resolved `0.1.0-rc.8` instead, while the real host ships `0.1.2-alpha.4`.
  The range is now `^0.1.2-alpha.4`; `resolveDshHome()` (the only import) is
  unchanged in alpha.4.
- **RPC failure envelopes now satisfy alpha.4's Connection RPC validator.**
  Every `{ ok: false, error: { code, message } }` result was missing the
  `details` object that `dsh-client-connection@0.1.2-alpha.4`'s
  `parseConnectionResponse` requires — any error (no-token, no-data,
  unauthorized, http-error, network, internal) would throw
  `TypeError: connection: invalid server-response failure` in the real
  browser client and the UI would never see `error.code`. All failure sites
  now emit the canonical `ConnectionRpcFailure` shape via a single `fail()`
  helper (`code`, `message`, `details: {}`).

### Added

- `test/rpc-envelope-alpha4.mjs`: drives every bridge endpoint through the
  real handler and parses each response with the alpha.4 envelope validator
  embedded verbatim from `packages/client/connection/src/client/rpc.ts`
  (dsh-v0.1.2-alpha.4), pinning the wire contract. `npm test` now runs it
  after the existing smoke test.
