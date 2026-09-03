# dsh-ollama-usage 消融实验报告

基线：dev-slim @ 77faa3b (0.1.6-beta.0) · 原测试套件 `npm test` 通过 · 消融探针 **8/8 通过**

## 结果总览

| 变体 | 类型 | 消融目标 | 结果 | 关键观察 |
|---|---|---|---|---|
| M1 | code | 凭证读取（readLocalToken 回退） | ✅ | 仅 `~/.ollama/auth.json` 有 token 时 check 返回 no-token；持久化 token 读取保留（fetch stub 200 成功返回用量） |
| M2 | code | 用量查询（fetchUsage/parseUsage） | ✅ | check 恒返回 no-data 且 fetch 零调用；snapshot/auth-state 保留 |
| M3 | code | 持久化写入（writeFile） | ✅ | check 成功但 usage.json 不落盘；snapshot 磁盘读取保留 |
| M4 | code | 自动刷新（ctx.interval） | ✅ | 定时器未注册；RPC 路由与 check/snapshot 端点保留 |
| M5 | code | RPC 路由（webServer.register） | ✅ | 无路由 handler（客户端无法连接）；自动刷新定时器保留 |
| M6 | code | 周重置时间推算（computeResetTimes） | ✅ | snapshot 不再带 weeklyResetAt；用量数据完整 |
| M7 | code | 历史记录（24 条） | ✅ | check 后历史恒为空；用量数据保留 |
| M8 | 静态 | 客户端 UI（lib/client.js） | ✅ | index.js 不 import client.js；client.js 为自包含浏览器 bundle（`__ModuleLoader__.load`，无相对 require）；package.json 经 exports 独立暴露 `./client` |

全部变体 `loadOk=true`（apply 不抛错），负向（ablationEffective）与正向（corePass）断言全绿。

## 原测试套件在 code 消融下的反应

### M4（移除自动刷新定时器）

`npm test` 中 `test/bridge-smoke.mjs`：

- **通过 3/4**：路由注册为 /ollama-usage prefix、effect disposer（rpc bridge）、已捕获路由 handler → **核心保留**
- **失败 1/4**：`自动刷新定时器已注册`（被消融模块的断言）→ **消融生效**
- `test/rpc-envelope-alpha4.mjs` 因 `&&` 短路未执行（bridge-smoke 首个失败即退出）

### M6（移除周重置时间推算）

`npm test` 中 `test/bridge-smoke.mjs`：

- **通过 12/13**：路由注册、effect disposer×2、定时器注册、no-token、unauthorized、401 后 token 清除、snapshot 用量/tokenPersisted/persisted、auth-state → **核心保留**
- **失败 1/13**：`周重置 = 下周一 00:00 UTC`（被消融模块的断言）→ **消融生效**

`test/rpc-envelope-alpha4.mjs`（单独运行）：**13/13 全部通过**（信封协议不依赖周重置推算）→ **核心保留**

## 结论

1. **模块独立性高**：7 个宿主侧功能模块全部可独立 code 消融（M1..M7），互不级联破坏；M8 客户端 UI 与宿主侧完全解耦（静态验证通过）。
2. **依赖关系**：
   - M2（用量查询）是 M7（历史）的上游——历史条目由查询结果产生，消融 M2 后 M7 自然无数据可记；但 M7 可独立消融（查询成功路径下历史恒为空）。
   - M3（持久化）是 M1/M2/M7 的落盘载体——消融 M3 后数据仅存于内存，跨重启丢失，但单次会话内 check/snapshot 仍可用（fail-soft）。
   - M4（自动刷新）与 M5（RPC 路由）互不依赖：消融其一，另一仍正常注册。
   - M6（周重置推算）是纯展示增强：消融后 snapshot 数据完整，仅缺 `weeklyResetAt` 字段。
3. **可消融性**：全部 8 个模块可消融且插件保持可加载（loadOk=true）；无「消融即插件崩溃」的硬依赖。M5 消融后插件失去对外接口（客户端无法连接），但宿主侧仍正常启动——属预期行为而非缺陷。
4. **测试套件敏感性**：原测试对 M4/M6 的消融有精确的单点断言（定时器注册、周重置推算），失败即定位到被消融模块，证明测试与模块一一对应。
