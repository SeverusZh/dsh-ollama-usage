<div align="center">

# ⚡ dsh-ollama-usage

**Ollama Cloud usage & remaining-quota visualization · a DeepSeek Harness plugin**

[![npm version](https://img.shields.io/npm/v/dsh-ollama-usage?style=flat-square&logo=npm)](https://www.npmjs.com/package/dsh-ollama-usage)
[![npm downloads](https://img.shields.io/npm/dm/dsh-ollama-usage?style=flat-square&logo=npm)](https://www.npmjs.com/package/dsh-ollama-usage)
[![license](https://img.shields.io/npm/l/dsh-ollama-usage?style=flat-square)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square&logo=node.js)](package.json)
[![GitHub release](https://img.shields.io/github/v/release/SeverusZh/dsh-ollama-usage?style=flat-square&logo=github)](https://github.com/SeverusZh/dsh-ollama-usage/releases)
[![GitHub stars](https://img.shields.io/github/stars/SeverusZh/dsh-ollama-usage?style=flat-square&logo=github)](https://github.com/SeverusZh/dsh-ollama-usage)
[![DSH](https://img.shields.io/badge/DSH-0.1.7--rc.1%20%2F%200.2.1--rc.1-blue?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

</div>

Ollama Cloud usage & remaining-quota visualization for DeepSeek Harness —
5-hour session + weekly quota, always-visible sidebar bars, a full panel on the
plugin's own detail page, persisted credentials & snapshots, auto-refresh.

---

## ✨ 功能特性 / Features

| Capability | Description |
| --- | --- |
| 🎯 **Session usage (per 5 hours)** | Ollama Cloud's 5-hour session quota, pinned at the top showing "used X% · remaining Y%" |
| 📅 **Weekly usage** | This week's quota progress, shown next to the session usage |
| 🎨 **Sidebar dual bars** | Minimal, transparent style: session 5h in **light purple** + weekly in **deep purple**, each with a percentage, details on hover, refreshed every 60 seconds (auto-hidden on narrow layouts) |
| 🖥️ **Full panel on the plugin detail page** | Rendered between the description and component rows of the "Plugin list → dsh-ollama-usage" page: session/week usage bars, session and weekly reset countdowns, and the last 5 session-usage history entries; card-based sections with loading / error / success states |
| 💾 **Persistence** | The API Key and usage snapshot are written to `$DSH_HOME/storages/ollama-usage/usage.json` (mode 600, 24 history entries kept), restored automatically across conversations / restarts |
| 🔄 **Auto-refresh** | The host queries every 10 minutes (even when the page is closed); an invalidated Key (401) is cleared automatically with a prompt |
| 🔑 **Login guidance** | When not signed in, one click opens [ollama.com/settings](https://ollama.com/settings) to sign in and [settings/keys](https://ollama.com/settings/keys) to create an API Key; compatible with the legacy CLI's `~/.ollama/auth.json` |

The quota progress data comes from Ollama's official endpoint `GET https://ollama.com/api/balance`
(the `remaining_percent` and `resets_at` of `included.session` / `included.weekly`), matching the
[ollama.com/settings](https://ollama.com/settings) page.

> **v0.1.11 fix**: in 2026-10 Ollama changed `GET /api/usage` to return only hourly/daily
> request-volume buckets and no longer include `limits.session` / `limits.weekly`, so older
> versions parsed both percentages as `null` — the panel showed "no data" and the sidebar bars
> showed "—". Quota progress now comes from `/api/balance` (`used = 100 - remaining_percent`),
> and the reset countdown uses the real `resets_at` sent by the endpoint.

## 📦 安装 / Install

```bash
dsh plugin --profile web add dsh-ollama-usage
dsh --profile web
```

> Alternatively, add `dsh-ollama-usage` to the profile `package.json`'s
> `dsh.profile.bundles` manually and restart.

## 🚀 使用 / Usage

1. Open **Plugin list → dsh-ollama-usage** (the panel is rendered between the description and component rows of that page);
2. When not signed in, follow the panel guidance: sign in at [ollama.com](https://ollama.com/settings) →
   create an API Key at [settings/keys](https://ollama.com/settings/keys) →
   paste it and click **Check** (or run `ollama signin` in a terminal and click **Re-check local credentials**);
3. On success it is persisted; expand the sidebar to see the dual bars at the bottom, and the panel shows details and history at any time;
4. When no longer needed, click **Clear stored Key** to remove the local credential (history is kept).

## 🖼️ 界面预览 / Screenshots

The screenshots below come from a throwaway local preview instance; the example data is for demonstration only:

![Usage panel on the plugin detail page](docs/assets/screenshots/config-panel.png)

![Usage panel on the plugin detail page in dark theme](docs/assets/screenshots/config-panel-dark.png)

![Sidebar usage bars](docs/assets/screenshots/sidebar-bars.png)

## 🔒 数据与隐私 / Privacy

- Only a Bearer-carrying query request is sent to `https://ollama.com/api/balance`;
- The Key is stored in plaintext locally in `$DSH_HOME/storages/ollama-usage/usage.json` (mode 600,
  a trust level equal to `~/.ollama/auth.json`), and can be cleared at any time.

## 🏗️ 架构 / Architecture

```
┌──────────────────────────┐        ┌─────────────────────────────┐
│  browser (client bundle) │  RPC   │  host (lib/index.js)        │
│  lib/client.js           │◄──────►│  webServer /ollama-usage    │
│  · sidebar dual bars     │ 信封协议 │  · fetch api/balance(Bearer)│
│  · settings panel        │        │  · $DSH_HOME 持久化(0600)   │
│  · login guidance        │        │  · 10min auto-refresh       │
└──────────────────────────┘        └─────────────────────────────┘
```

- Host entry `lib/index.js`: ESM, exports `name` + the default plugin; `webServer` prefix route +
  the Connection RPC envelope protocol (`check` / `snapshot` / `forget` / `auth-state`).
- Client entry `lib/client.js`: a `window.__ModuleLoader__.load` bundle that talks to the host via
  `connection.rpc.call('/ollama-usage', endpoint, payload)`.
- Wiring: `cordis.patch.yml` (Loader row) + the `dsh.bundle.patch` / `dsh.client` declarations in
  `package.json`.

## 🧩 兼容性 / Compatibility

Since DSH 0.2.1 the compatibility gate prefers `engines.dsh`. This plugin declares **`engines.dsh: ">=0.1.7-rc.1"`** (no upper bound), keeps the `@deepseek-ai/dsh-home-paths` peer at `>=0.1.7-rc.1`, and has been checked on:

| DSH version | Status |
| --- | --- |
| 0.1.5-rc.1 | ✅ Tested |
| 0.1.5-rc.2 | ✅ Tested |
| 0.1.6-alpha.2 | ✅ Tested |
| 0.1.7-rc.1 | ✅ Tested |
| 0.1.7-rc.2 | ✅ Tested |
| 0.2.0-rc.1 | ✅ Tested |
| 0.2.1-rc.1 | ✅ Gate + probes |
| 0.2.1-rc.2 | ✅ Gate |

> Only versions that were **actually run** are listed; untested versions are omitted.

v0.1.16 targets DSH **≥0.1.5-rc.1** (the `@deepseek-ai/dsh-*` peer was relaxed to `>=0.1.7-rc.1`), verified on **0.1.5-rc.1 / 0.1.5-rc.2 / 0.1.6-alpha.2 / 0.1.7-rc.1 / 0.1.7-rc.2 / 0.2.0-rc.1** (all RPC envelope probes pass; on 0.1.7-rc.2 the `/ollama-usage/snapshot` endpoint returns as measured; on 0.2.0-rc.1 it passes the new compatibility gate and loads normally; on 0.2.1-rc.1 the gate and RPC envelope probes pass, and 0.2.1-rc.2 passes the gate); for older DSH (0.1.0-rc.5 ~ rc.8) use the last compatible npm version, **0.1.5**.

## 🛠️ 开发 / Develop

### 测试 / Tests

```bash
npm test   # bridge-smoke → balance-parse → rpc-envelope-alpha4
```

- `test/bridge-smoke.mjs` (17 checks): route registration, the no-token / 401 branches, persistence
  read/write and cleanup, snapshot / forget / auth-state, and validation of malformed envelopes and
  request methods.
- `test/balance-parse.mjs`: a `/api/balance` parsing regression (no network, a fetch stub). It drives
  `check` with real response bodies and asserts the 5h / weekly percentage conversion, `resets_at`
  passthrough, persistence and history appending, plus the unlimited-plan / non-JSON / 401 / 403 /
  network-error branches.
- `test/rpc-envelope-alpha4.mjs`: every endpoint passes alpha.4's Connection RPC envelope validator.

### 构建与发布 / Build & Publish

```bash
npm install                 # 安装依赖(@deepseek-ai/dsh-home-paths)
npm test                    # 冒烟测试(见上)
npm pack                    # 本地打包检查
npm publish                 # 发布到 npm
```

## 📄 许可证 / License

[MIT](LICENSE) © 2026 dsh-ollama-usage contributors
