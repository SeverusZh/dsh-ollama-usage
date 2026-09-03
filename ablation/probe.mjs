/**
 * dsh-ollama-usage 消融探针（ablation/probe.mjs）
 *
 * 用法：node ablation/probe.mjs <variant-id>
 * 环境：run.mjs 会设置 DSH_HOME / HOME 指向 .tmp-ablation-* 临时目录。
 *
 * 对每个变体：
 *   - code 变体（M1..M7）：假设 ablation/variants/<ID>.patch 已应用，用假 ctx
 *     （参考 test/bridge-smoke.mjs 的 fakeCtx 结构）挂载插件，断言：
 *       loadOk：apply 不抛错；
 *       patch-applied：源码中消融标记存在（静态自检，防止 patch 未生效）；
 *       负向：被消融模块功能消失（ablationEffective）；
 *       正向：保留模块功能可用（corePass）。
 *   - M8（静态验证）：不挂载插件，验证 lib/client.js 与 lib/index.js 的模块解耦。
 *
 * 输出：单行 JSON { variant, loadOk, checks, pass, note }。
 */
import { Readable } from 'node:stream'
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import plugin from '../lib/index.js'

const variantId = process.argv[2]

/* ------------------------------------------------------------------ *
 * 变体矩阵
 * ------------------------------------------------------------------ */

const VARIANTS = {
  M1: {
    note: '移除 readLocalToken 回退:仅 ~/.ollama/auth.json 有 token 时 check 返回 no-token;持久化 token 读取保留',
    stubFetch: true,
    staticCheck: (src) => !src.includes('readLocalToken'),
    async run(ctx, env) {
      const checks = {}
      // 负向:只有本地 CLI auth.json、无持久化 token → no-token(回退已消融)
      mkdirSync(join(env.tmpHome, '.ollama'), { recursive: true })
      writeFileSync(join(env.tmpHome, '.ollama', 'auth.json'), JSON.stringify({ token: 'local-token-abc' }))
      let r = await call('check', {})
      checks['check-no-local-fallback'] =
        r.result.ok === false && r.result.error.code === 'no-token'
          ? 'ok'
          : `FAIL: expected no-token, got ${JSON.stringify(r.result)}`
      // 正向:持久化 token 仍被读取(经 fetch stub 200 成功返回用量)
      writeFileSync(
        env.usageFile,
        JSON.stringify({ token: 'persisted-token-abc', updatedAt: '2026-08-20T12:00:00.000Z', usage: { sessionPercent: 0.3, weeklyPercent: 21.3 }, history: [] }),
      )
      r = await call('check', {})
      checks['check-persisted-token'] =
        r.result.ok === true && r.result.value.usage.sessionPercent === 21.3
          ? 'ok'
          : `FAIL: expected ok with usage, got ${JSON.stringify(r.result)}`
      return checks
    },
  },
  M2: {
    note: '移除 fetchUsage/parseUsage:check 端点恒返回 no-data 且不发起网络请求;snapshot/auth-state 保留',
    stubFetch: true,
    staticCheck: (src) => !src.includes('fetchUsage') && !src.includes('parseUsage'),
    async run(ctx, env) {
      const checks = {}
      // 负向:check 返回 no-data 且 fetch 从未被调用
      const r = await call('check', { token: 'any-token' })
      checks['check-no-data'] =
        r.result.ok === false && r.result.error.code === 'no-data'
          ? 'ok'
          : `FAIL: expected no-data, got ${JSON.stringify(r.result)}`
      checks['fetch-not-called'] = fetchCalls === 0 ? 'ok' : `FAIL: fetch called ${fetchCalls} times`
      // 正向:snapshot / auth-state 保留
      writeFileSync(env.usageFile, seedUsage())
      const s = await call('snapshot', {})
      checks['snapshot-ok'] =
        s.result.ok === true && s.result.value.usage.weeklyPercent === 21.3
          ? 'ok'
          : `FAIL: ${JSON.stringify(s.result)}`
      const a = await call('auth-state', {})
      checks['auth-state-ok'] = a.result.ok === true ? 'ok' : `FAIL: ${JSON.stringify(a.result)}`
      return checks
    },
  },
  M3: {
    note: '移除 writeFile(持久化写入):check 成功但 usage.json 不落盘;snapshot 磁盘读取保留',
    stubFetch: true,
    staticCheck: (src) => !src.includes('writeFileSync(filePath()'),
    async run(ctx, env) {
      const checks = {}
      // 负向:check 成功但文件从未被写入磁盘
      const r = await call('check', { token: 't' })
      checks['check-ok'] = r.result.ok === true ? 'ok' : `FAIL: ${JSON.stringify(r.result)}`
      checks['no-file-written'] = !existsSync(env.usageFile) ? 'ok' : 'FAIL: usage.json was written to disk'
      // 正向:snapshot 仍从磁盘读取
      writeFileSync(env.usageFile, seedUsage())
      const s = await call('snapshot', {})
      checks['snapshot-reads-file'] =
        s.result.ok === true && s.result.value.usage.weeklyPercent === 21.3
          ? 'ok'
          : `FAIL: ${JSON.stringify(s.result)}`
      return checks
    },
  },
  M4: {
    note: '移除 ctx.interval 注册:自动刷新定时器不再注册;RPC 路由与端点保留',
    stubFetch: false,
    staticCheck: (src) => !src.includes('ctx.interval'),
    async run(ctx, env) {
      const checks = {}
      // 负向:定时器未注册
      checks['no-interval'] = intervalStarted ? 'FAIL: interval was registered' : 'ok'
      // 正向:路由注册 + 端点仍可用
      checks['route-registered'] = capturedHandler !== null ? 'ok' : 'FAIL: route not registered'
      const r = await call('check', {})
      checks['check-route-works'] =
        r.result.ok === false && r.result.error.code === 'no-token'
          ? 'ok'
          : `FAIL: ${JSON.stringify(r.result)}`
      return checks
    },
  },
  M5: {
    note: '移除 ctx.webServer.register:无 RPC 路由(客户端无法连接);自动刷新定时器保留',
    stubFetch: false,
    staticCheck: (src) => !src.includes('webServer.register'),
    async run(ctx, env) {
      const checks = {}
      // 负向:路由未注册
      checks['no-route'] = capturedHandler === null ? 'ok' : 'FAIL: route was registered'
      // 正向:自动刷新定时器仍注册
      checks['interval-registered'] = intervalStarted ? 'ok' : 'FAIL: interval not registered'
      return checks
    },
  },
  M6: {
    note: '移除 computeResetTimes/withResetTimes:snapshot 不再带 weeklyResetAt;用量数据保留',
    stubFetch: false,
    staticCheck: (src) => !src.includes('computeResetTimes'),
    async run(ctx, env) {
      const checks = {}
      writeFileSync(env.usageFile, seedUsage())
      const s = await call('snapshot', {})
      // 负向:无 weeklyResetAt 字段
      checks['no-weekly-reset'] =
        s.result.ok === true && s.result.value.usage.weeklyResetAt === undefined
          ? 'ok'
          : `FAIL: weeklyResetAt still present: ${JSON.stringify(s.result.value && s.result.value.usage)}`
      // 正向:用量数据完整
      checks['snapshot-data-intact'] =
        s.result.ok === true && s.result.value.usage.weeklyPercent === 21.3
          ? 'ok'
          : `FAIL: ${JSON.stringify(s.result)}`
      return checks
    },
  },
  M7: {
    note: '移除 history 维护:check 后历史恒为空;用量数据保留',
    stubFetch: true,
    staticCheck: (src) => !src.includes('history.push'),
    async run(ctx, env) {
      const checks = {}
      // 种入带 1 条历史的文件,check 成功后历史应被清空(不再维护)
      writeFileSync(env.usageFile, seedUsage())
      const r = await call('check', { token: 't' })
      checks['check-usage-ok'] =
        r.result.ok === true && r.result.value.usage.sessionPercent === 21.3
          ? 'ok'
          : `FAIL: ${JSON.stringify(r.result)}`
      const s = await call('snapshot', {})
      checks['history-not-maintained'] =
        s.result.ok === true && Array.isArray(s.result.value.history) && s.result.value.history.length === 0
          ? 'ok'
          : `FAIL: history expected empty, got ${JSON.stringify(s.result.value && s.result.value.history)}`
      return checks
    },
  },
  M8: {
    note: '静态验证:client.js 独立于 index.js(模块解耦),index.js 不 import client.js',
    stubFetch: false,
    staticCheck: null,
    async run(ctx, env) {
      const checks = {}
      const indexSrc = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
      const clientSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
      const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
      // 负向:index.js 不 import client.js
      checks['index-no-client-import'] =
        !/import[^;]*['"]\.\/client/.test(indexSrc) && !indexSrc.includes('client.js')
          ? 'ok'
          : 'FAIL: lib/index.js imports client.js'
      // 正向:client.js 是自包含浏览器 bundle(经 __ModuleLoader__ 加载,无相对 require)
      checks['client-self-contained'] =
        clientSrc.includes('__ModuleLoader__.load') && !/require\(['"]\.\.?\//.test(clientSrc)
          ? 'ok'
          : 'FAIL: lib/client.js is not a self-contained browser bundle'
      // 正向:package.json 经 exports 映射独立暴露 ./client(模块解耦)
      checks['exports-decoupled'] = pkg.exports && pkg.exports['./client'] ? 'ok' : 'FAIL: package.json exports lacks ./client'
      return checks
    },
  },
}

/* ------------------------------------------------------------------ *
 * 假 ctx(参考 test/bridge-smoke.mjs 的 fakeCtx 结构)
 * ------------------------------------------------------------------ */

let capturedHandler = null
let intervalStarted = false
const fakeCtx = {
  // 插件经 inject 声明 webServer 后,apply 里直接读 ctx.webServer(属性访问)
  webServer: {
    register(route) {
      capturedHandler = route.handler
      return () => {}
    },
  },
  get(name) {
    if (name === 'webServer') return this.webServer
    return undefined
  },
  effect(fn) {
    return fn()
  },
  interval() {
    intervalStarted = true
    return () => {}
  },
}

/* ------------------------------------------------------------------ *
 * 假请求/响应 + RPC 信封调用
 * ------------------------------------------------------------------ */

function fakeReq(body, url, host = 'localhost', method = 'POST', contentType = 'application/json') {
  const req = new Readable()
  req.push(body === undefined ? '' : JSON.stringify(body))
  req.push(null)
  req.method = method
  req.url = url
  req.headers = { 'content-type': contentType, host }
  return req
}

function fakeRes() {
  const res = { statusCode: 0, headers: {}, end() {} }
  res.setHeader = (k, v) => {
    res.headers[k] = v
  }
  res.end = (data) => {
    res.body = data
  }
  return res
}

let rpcSeq = 0
async function call(endpoint, payload) {
  const res = fakeRes()
  const envelope = { type: 'client-request', rpcId: 'a' + (++rpcSeq), method: endpoint, payload: payload === undefined ? {} : payload }
  await capturedHandler(fakeReq(envelope, '/ollama-usage/' + endpoint), res)
  return JSON.parse(res.body)
}

/* ------------------------------------------------------------------ *
 * fetch stub(避免真实网络,模拟 ollama.com 200 响应)
 * ------------------------------------------------------------------ */

let fetchCalls = 0
const realFetch = globalThis.fetch
const USAGE_BODY = JSON.stringify({
  limits: {
    session: { usage: 0.213 },
    weekly: { usage: 0.5, models: [{ name: 'deepseek-v3', request_count: 12 }] },
  },
  activity: {
    cost: '0.00000',
    period: { type: 'last_4_weeks', starting_at: '2026-07-27T00:00:00Z', ending_at: '2026-08-20T12:00:00Z' },
    models: [],
  },
})

function stubFetch() {
  fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls++
    return { status: 200, text: async () => USAGE_BODY }
  }
}

function restoreFetch() {
  if (realFetch !== undefined) globalThis.fetch = realFetch
  else delete globalThis.fetch
}

/* ------------------------------------------------------------------ *
 * 临时环境(由 run.mjs 注入 DSH_HOME / HOME)
 * ------------------------------------------------------------------ */

const tmp = process.env.DSH_HOME
const tmpHome = process.env.HOME
if (typeof tmp === 'string' && tmp.includes('.tmp')) rmSync(tmp, { recursive: true, force: true })
if (typeof tmpHome === 'string' && tmpHome.includes('.tmp')) rmSync(tmpHome, { recursive: true, force: true })
const usageDir = join(tmp, 'storages', 'ollama-usage')
mkdirSync(usageDir, { recursive: true })
const usageFile = join(usageDir, 'usage.json')

function seedUsage() {
  return JSON.stringify({
    token: 'ollama-test-key',
    updatedAt: '2026-08-20T12:00:00.000Z',
    usage: { sessionPercent: 0.3, weeklyPercent: 21.3, cost: '0.00000', periodType: 'last_4_weeks', periodStart: '2026-07-27T00:00:00Z', periodEnd: '2026-08-20T12:00:00Z', models: [] },
    history: [{ at: '2026-08-20T11:00:00.000Z', sessionPercent: 0.3, weeklyPercent: 21.3 }],
  })
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const variant = VARIANTS[variantId]
if (!variant) {
  console.error('usage: node ablation/probe.mjs <variant-id>')
  console.error('variants: ' + Object.keys(VARIANTS).join(', '))
  process.exit(2)
}

const result = { variant: variantId, loadOk: false, checks: {}, pass: false, note: variant.note }

try {
  if (variant.stubFetch) stubFetch()

  if (variantId === 'M8') {
    // 静态验证:不挂载插件
    result.loadOk = true
    result.checks = await variant.run(null, { tmp, tmpHome, usageDir, usageFile })
  } else {
    // 静态自检:确认 patch 已应用(消融标记存在)
    const src = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
    if (variant.staticCheck) {
      result.checks['patch-applied'] = variant.staticCheck(src) ? 'ok' : 'FAIL: ablation marker not found in lib/index.js'
    }
    plugin.apply(fakeCtx)
    result.loadOk = true
    const checks = await variant.run(fakeCtx, { tmp, tmpHome, usageDir, usageFile })
    Object.assign(result.checks, checks)
  }
  result.pass = Object.values(result.checks).every((v) => v === 'ok')
} catch (err) {
  result.checks.scenario = 'FAIL: ' + String(err?.message ?? err)
  result.pass = false
} finally {
  restoreFetch()
}

console.log(JSON.stringify(result))
