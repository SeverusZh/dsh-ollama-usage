<div align="center">

# ⚡ dsh-ollama-usage

**Ollama Cloud 用量余量可视化 · DeepSeek Harness 插件**

[![npm version](https://img.shields.io/npm/v/dsh-ollama-usage?color=7c66e8&label=npm)](https://www.npmjs.com/package/dsh-ollama-usage)
[![GitHub release](https://img.shields.io/github/v/release/SeverusZh/dsh-ollama-usage?color=b39df7&label=release)](https://github.com/SeverusZh/dsh-ollama-usage/releases)
[![License](https://img.shields.io/badge/license-MIT-9ece6a)](LICENSE)
[![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.1.0--rc.5-7aa2f7)](https://github.com/deepseek-ai/dsh)

可视化你的 **Ollama Cloud** 用量余量 —— 每 5 小时会话用量 + 周用量，
侧边栏极简双横条常驻显示，设置页完整面板，Key 与快照持久化，自动刷新。

*Ollama Cloud usage & remaining-quota visualization for DeepSeek Harness —
5-hour session + weekly quota, always-visible sidebar bars, a full settings
panel, persisted credentials & snapshots, auto-refresh.*

</div>

---

## ✨ 功能特性 Features

| 能力 | 说明 |
| --- | --- |
| 🎯 **会话用量（每 5 小时）** | Ollama Cloud 的 5 小时会话配额，置顶展示「已用 X% · 剩余 Y%」 |
| 📅 **周用量（Weekly）** | 本周配额进度，与会话用量并排展示 |
| 🎨 **侧边栏双横条** | 极简透明风格：会话 5h **淡紫** + 周用量**深紫**，各带百分比数字，悬停显示详情，每 60 秒自动更新（窄栏自动隐藏） |
| 🖥️ **设置页完整面板** | 周期起止时间、近 4 周费用、模型请求数排行、最近 5 条会话用量历史 |
| 💾 **持久化** | API Key 与用量快照写入 `$DSH_HOME/storages/ollama-usage/usage.json`（权限 600，保留 24 条历史），跨对话 / 重启自动恢复 |
| 🔄 **自动刷新** | Host 每 10 分钟自动查询（页面关闭也持续）；Key 失效（401）自动清除并提示 |
| 🔑 **登录引导** | 未登录时一键打开 [ollama.com/settings](https://ollama.com/settings) 登录、到 [settings/keys](https://ollama.com/settings/keys) 创建 API Key；兼容旧版 CLI 的 `~/.ollama/auth.json` |

数据来源为 Ollama 官方接口 `GET https://ollama.com/api/usage`，与
[ollama.com/settings](https://ollama.com/settings) 页面一致。

## 📦 安装 Install

```bash
dsh plugin --profile web add dsh-ollama-usage
dsh --profile web
```

> 也可手动把 `dsh-ollama-usage` 加入 profile `package.json` 的
> `dsh.profile.bundles` 后重启。

## 🚀 使用 Usage

1. 打开 **设置 → Ollama 用量**；
2. 未登录时按面板指引：登录 [ollama.com](https://ollama.com/settings) →
   [settings/keys](https://ollama.com/settings/keys) 创建 API Key（`ollama-` 开头）→
   粘贴并点 **检测**（或终端 `ollama signin` 后点 **重新检测本地凭证**）；
3. 检测成功后即持久化，展开侧边栏即可看到底部双横条，面板可随时查看详情与历史；
4. 不再需要时点 **清除已存 Key** 移除本地凭证（历史保留）。

## 🔒 数据与隐私 Privacy

- 仅向 `https://ollama.com/api/usage` 发送带 Bearer 的查询请求；
- Key 以明文保存在本机 `$DSH_HOME/storages/ollama-usage/usage.json`（权限 600，
  与 `~/.ollama/auth.json` 同等级信任），随时可清除。

## 🏗️ 架构 Architecture

```
┌──────────────────────────┐        ┌─────────────────────────────┐
│  browser (client bundle) │  RPC   │  host (lib/index.js)        │
│  lib/client.js           │◄──────►│  webServer /ollama-usage    │
│  · sidebar dual bars     │ 信封协议 │  · fetch api/usage (Bearer)│
│  · settings panel        │        │  · $DSH_HOME 持久化(0600)   │
│  · login guidance        │        │  · 10min auto-refresh       │
└──────────────────────────┘        └─────────────────────────────┘
```

- 宿主入口 `lib/index.js`：ESM，导出 `name` + 默认插件；`webServer` 前缀路由 +
  Connection RPC 信封协议（`check` / `snapshot` / `forget` / `auth-state`）。
- 客户端入口 `lib/client.js`：`window.__ModuleLoader__.load` bundle，经
  `connection.rpc.call('/ollama-usage', endpoint, payload)` 与宿主通信。
- 接线：`cordis.patch.yml`（Loader 行）+ `package.json` 的
  `dsh.bundle.patch` / `dsh.client` 声明。

## 🧪 测试 Tests

```bash
DSH_HOME=.tmp-dsh-home HOME=.tmp-home node test/bridge-smoke.mjs
```

17 项冒烟测试覆盖：路由注册、no-token / 401 分支、持久化读写与清理、
snapshot / forget / auth-state、非法信封与请求方法校验。

## 🛠️ 开发 / 发布 Develop & Publish

```bash
npm install                 # 安装依赖(@deepseek-ai/dsh-home-paths)
npm test                    # 冒烟测试(见上)
npm pack                    # 本地打包检查
npm publish                 # 发布到 npm
```

## 📄 License

[MIT](LICENSE) © 2026 dsh-ollama-usage contributors
