# dsh-ollama-usage 消融实验

基线：dev-slim @ 77faa3b (0.1.6-beta.0)，`npm test` 通过（bridge-smoke + rpc-envelope-alpha4，假 ctx 捕获路由 + 真实 alpha.4 信封协议验证）。

## 模块清单（lib/index.js 宿主侧单文件 + lib/client.js 浏览器侧）

| ID | 模块 | 消融方式 |
|---|---|---|
| M1 | 凭证读取（持久化 token + 旧版 CLI `~/.ollama/auth.json` 回退） | code：移除 `readLocalToken` 函数与 check 端点回退调用 |
| M2 | 用量查询（fetchUsage/parseUsage） | code：移除两个函数，`checkWithToken` 恒返回 no-data |
| M3 | 持久化（usage.json 读写） | code：`writeFile` 变 no-op（内存态），`readFile` 保留 |
| M4 | 自动刷新（10 分钟定时器） | code：移除 `ctx.interval` 注册（保留启动时一次性刷新） |
| M5 | RPC 路由（/ollama-usage 前缀注册） | code：移除 `ctx.webServer.register` |
| M6 | 周重置时间推算 | code：移除 `computeResetTimes`，`withResetTimes` 原样返回 |
| M7 | 历史记录（24 条 HISTORY_CAP） | code：移除 history push/trim，恒为空 |
| M8 | 客户端 UI（lib/client.js） | 静态验证：client.js 独立于 index.js，index.js 不 import client.js（模块解耦） |

## 消融方式

- **code 变体（M1..M7）**：`ablation/variants/<ID>.patch` 为 `git diff` 生成的补丁，移除对应模块逻辑。探针在 patch 已应用的前提下挂载插件。
- **M8（静态验证）**：无 patch，探针直接读取 `lib/index.js` / `lib/client.js` / `package.json` 源码断言模块解耦。

## 探针设计（ablation/probe.mjs）

对每个变体：

1. **loadOk**：用假 ctx（参考 `test/bridge-smoke.mjs` 的 fakeCtx 结构：`webServer.register` 捕获 handler、`effect` 执行 disposer、`interval` 打标记）挂载插件，`apply` 不抛错；
2. **patch-applied**：静态自检源码中消融标记存在（防止 patch 未生效）；
3. **负向（ablationEffective）**：被消融模块功能消失——如 M1 仅本地 auth.json 有 token 时 check 返回 no-token、M2 check 返回 no-data 且 fetch 零调用、M3 check 成功但 usage.json 不落盘、M4 定时器未注册、M5 路由未注册、M6 snapshot 无 weeklyResetAt、M7 历史恒为空；
4. **正向（corePass）**：保留模块仍可用——如 M1 持久化 token 仍被读取、M2/M3/M6/M7 snapshot 仍返回用量、M4 路由与端点可用、M5 定时器仍注册。

网络依赖：探针用 `globalThis.fetch` stub 模拟 ollama.com 200 响应（M1/M2/M3/M7 需要成功查询路径），不发起真实请求。

输出单行 JSON `{ variant, loadOk, checks, pass, note }`。

## 运行

```bash
node ablation/run.mjs
```

`run.mjs` 对每个 code 变体执行 `git apply patch → node ablation/probe.mjs <ID> → git checkout 恢复 lib/index.js`，M8 直接跑探针；结果写入 `ablation/results.json`。运行前后校验 `lib/index.js` 未被污染。

## 结果摘要

**8/8 变体通过**（全部 loadOk=true，负向 + 正向断言全绿）。详见 `ablation/report.md`。
