# dsh-ollama-usage

DeepSeek Harness 插件：可视化 **Ollama Pro** 账号的用量余量（每 5 小时会话用量 + 周用量），
支持侧边栏双横条、设置页完整面板、API Key 与用量快照持久化、自动刷新与登录引导。

A DeepSeek Harness plugin that visualizes your **Ollama Pro** usage / remaining quota
(5-hour session bucket + weekly bucket), with a minimalist sidebar double-bar,
a full settings panel, persisted API key and usage snapshots, auto-refresh,
and login guidance.

数据来源为 Ollama 官方接口 `GET https://ollama.com/api/usage`
（数据与 [ollama.com/settings](https://ollama.com/settings) 页面一致）。

## 功能

- **侧边栏底部双横条**（极简、透明背景）：`会话5h` 淡紫条 + `周用量` 深紫条，
  各带百分比数字；悬停显示详情；每 60 秒自动更新；窄栏（rail）自动隐藏。
- **设置页「Ollama 用量」完整面板**：会话（每 5 小时）/ 周用量进度条（已用 X% · 剩余 Y%）、
  周期起止时间、近 4 周费用、模型请求数排行、最近 5 条会话用量历史、清除 Key。
- **持久化**：API Key 与用量快照写入 `$DSH_HOME/storages/ollama-usage/usage.json`
  （权限 600，保留最近 24 条历史），跨对话 / 重启自动恢复。
- **自动刷新**：Host 每 10 分钟自动查询一次（浏览器页面关闭也持续）；
  Key 失效（401）自动清除并提示重新登录。
- **登录引导**：未登录时面板显示步骤指引，一键打开
  [ollama.com/settings](https://ollama.com/settings) 登录、到
  [settings/keys](https://ollama.com/settings/keys) 创建 API Key 并粘贴检测；
  也兼容旧版 CLI 的 `~/.ollama/auth.json` 凭证。

## 安装

```bash
dsh plugin --profile web add dsh-ollama-usage
dsh --profile web
```

或手动把包加入 profile 的 `package.json` 的 `dsh.profile.bundles` 后重启。

## 使用

1. 打开 设置 → **Ollama 用量**。
2. 若未登录：按面板指引打开 [ollama.com/settings](https://ollama.com/settings)
   登录账号，在 [settings/keys](https://ollama.com/settings/keys) 创建 API Key
   （`ollama-` 开头），粘贴到输入框点 **检测**；或在终端运行 `ollama signin` 后点
   **重新检测本地凭证**。
3. 检测成功后 Key 与快照即持久化，之后全自动：展开侧边栏即可在底部看到双横条，
   面板可随时查看详情与历史。
4. 不再需要时，在面板点 **清除已存 Key** 即可移除本地凭证（历史保留）。

## 数据与隐私

- 仅向 `https://ollama.com/api/usage` 发送带 Bearer 的查询请求；
- Key 以明文保存在本机 `$DSH_HOME/storages/ollama-usage/usage.json`（权限 600），
  与 `~/.ollama/auth.json` 同等级信任；需要时可随时清除。

## 开发 / 发布

```bash
npm install          # 安装依赖(@deepseek-ai/dsh-home-paths)
npm pack             # 本地打包检查
npm publish          # 发布到 npm(需先 npm login)
```

- 宿主入口：`lib/index.js`（ESM，导出 `name` + 默认插件；在 webServer 注册
  `/ollama-usage` 前缀路由，走 Connection RPC 信封协议）。
- 客户端入口：`lib/client.js`（`window.__ModuleLoader__.load` bundle；
  经 `connection.rpc.call('/ollama-usage', endpoint, payload)` 调用宿主）。
- bundle 接线：`cordis.patch.yml`（Loader 行）+ `package.json` 的
  `dsh.bundle.patch` / `dsh.client` 声明。

## License

MIT
