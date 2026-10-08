/**
 * dsh-ollama-usage 用量来源回归测试(GET /api/balance)。
 *
 * 回归背景:2026-10 起 Ollama 的 GET /api/usage 只返回按小时/天的请求量分桶
 * ({ range, scope, granularity, totals, buckets }),不再带 limits.session /
 * limits.weekly。旧代码只读这两个字段,于是 sessionPercent / weeklyPercent
 * 恒为 null —— 详情页面板显示“暂无数据”、侧边栏双横条显示“—”。
 * 限额进度的唯一来源改为 GET /api/balance 的 included.session / included.weekly。
 *
 * 本测试不联网:用真实抓取的响应体替身 globalThis.fetch,驱动桥接的
 * /ollama-usage/check 端点,断言百分比换算、重置时间透传与持久化结果。
 *
 * 运行: DSH_HOME=.tmp-balance-dsh-home HOME=.tmp-balance-home node test/balance-parse.mjs
 */
import { Readable } from 'node:stream'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import plugin from '../lib/index.js'

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

/* ── 真实响应体(2026-10-08 抓取,契约见 https://docs.ollama.com/api/balance) ── */

// legacy plan(session/weekly 限额):余额端点的 canonical 形态
const BALANCE_LEGACY = JSON.stringify({
  included: {
    session: { remaining_percent: 96.52, resets_at: '2026-10-08T09:00:00Z' },
    weekly: { remaining_percent: 97.87, resets_at: '2026-10-12T00:00:00Z' },
  },
  purchased: { balance_usd: 0 },
})

// 按美元计费的套餐:没有 5h/周限额可展示(百分比应为 null,而不是报错)
const BALANCE_USD = JSON.stringify({
  included: {
    balance_usd: 72.5,
    allowance_usd: 100,
    period: { from: '2026-09-15T09:30:00Z', until: '2026-10-15T09:30:00Z' },
  },
  purchased: { balance_usd: 25 },
})

// 造成本轮回归的 /api/usage 新响应:只含请求量分桶,没有任何限额字段
const USAGE_BUCKETS = JSON.stringify({
  range: '7d',
  scope: 'self',
  granularity: 'day',
  totals: { request_count: 505 },
  buckets: [{ from: '2026-10-01T00:00:00Z', until: '2026-10-02T00:00:00Z', request_count: 32 }],
})

/* ── 临时环境(必须先清空:apply() 会立即尝试一次读持久化 token 的自动刷新) ── */

const tmp = process.env.DSH_HOME
assert(typeof tmp === 'string' && tmp.length > 0, 'DSH_HOME 已指向临时目录: ' + tmp)
const tmpHome = process.env.HOME
if (tmp.includes('.tmp')) rmSync(tmp, { recursive: true, force: true })
if (typeof tmpHome === 'string' && tmpHome.includes('.tmp')) rmSync(tmpHome, { recursive: true, force: true })
const usageDir = join(tmp, 'storages', 'ollama-usage')
mkdirSync(usageDir, { recursive: true })
const usageFile = join(usageDir, 'usage.json')

/* ── fetch 替身 ─────────────────────────────────────────────────────────── */

const fetchCalls = []
const queued = []
globalThis.fetch = async (url, init) => {
  fetchCalls.push({ url, auth: init && init.headers ? init.headers.Authorization : undefined })
  const next = queued.shift()
  if (!next) throw new Error('unexpected fetch: ' + url)
  if (next.throw) throw new Error(next.throw)
  return { status: next.status, text: async () => next.body }
}
const queue = (status, body) => queued.push({ status, body })

/* ── 假 ctx / 桥接 handler(bridge-smoke.mjs 同款) ───────────────────────── */

let capturedHandler = null
const fakeCtx = {
  webServer: {
    register(route) {
      capturedHandler = route.handler
      return () => {}
    },
  },
  get(name) {
    return name === 'webServer' ? this.webServer : undefined
  },
  effect(fn) {
    return fn()
  },
  interval() {
    return () => {}
  },
}
plugin.apply(fakeCtx)
assert(capturedHandler !== null, '已捕获 /ollama-usage 路由 handler')

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
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.end = (data) => { res.body = data }
  return res
}
let rpcSeq = 0
async function call(endpoint, payload) {
  const res = fakeRes()
  const envelope = { type: 'client-request', rpcId: 'b' + (++rpcSeq), method: endpoint, payload: payload === undefined ? {} : payload }
  await capturedHandler(fakeReq(envelope, '/ollama-usage/' + endpoint), res)
  return JSON.parse(res.body)
}

/* ── 1) legacy plan:5h / 周百分比由 remaining_percent 换算而来 ──────────── */

queue(200, BALANCE_LEGACY)
let r = await call('check', { token: 'ollama-test-key' })
assert(r.result.ok === true, 'check legacy balance → ok')
assert(fetchCalls.length === 1 && fetchCalls[0].url === 'https://ollama.com/api/balance', '只请求 /api/balance')
assert(fetchCalls[0].auth === 'Bearer ollama-test-key', '带上 Bearer 凭证')
assert(r.result.value.usage.sessionPercent === 3.5, '会话 5h 已用 = 100 - 96.52 = 3.5(实际 ' + r.result.value.usage.sessionPercent + ')')
assert(r.result.value.usage.weeklyPercent === 2.1, '周已用 = 100 - 97.87 = 2.1(实际 ' + r.result.value.usage.weeklyPercent + ')')
assert(r.result.value.usage.sessionResetAt === '2026-10-08T09:00:00Z', '透传 session resets_at')
assert(r.result.value.usage.weeklyResetAt === '2026-10-12T00:00:00Z', '透传 weekly resets_at(不再按“下周一”推算)')

/* ── 2) 持久化 ─────────────────────────────────────────────────────────── */

const saved = JSON.parse(readFileSync(usageFile, 'utf8'))
assert(saved.token === 'ollama-test-key', 'token 已持久化')
assert(saved.usage.sessionPercent === 3.5 && saved.usage.weeklyPercent === 2.1, '快照写入非 null 百分比')
assert(saved.history.length === 1 && saved.history[0].sessionPercent === 3.5, '历史记录带会话百分比')

/* ── 3) snapshot 返回同一份数据(侧边栏双横条的数据来源) ───────────────── */

r = await call('snapshot', {})
assert(r.result.ok === true, 'snapshot → ok')
assert(r.result.value.usage.sessionPercent === 3.5 && r.result.value.usage.weeklyPercent === 2.1, 'snapshot 返回双横条所需的百分比')

/* ── 4) 再次刷新:历史追加 ─────────────────────────────────────────────── */

queue(200, BALANCE_LEGACY)
r = await call('check', { token: 'ollama-test-key' })
assert(r.result.ok === true && r.result.value.history.length === 2, '第二次 check 追加历史')

/* ── 5) 按美元计费的套餐:无 5h/周限额 → null,且不报错 ─────────────────── */

queue(200, BALANCE_USD)
r = await call('check', { token: 'ollama-test-key' })
assert(r.result.ok === true, 'check balance_usd 套餐 → ok(不是错误)')
assert(r.result.value.usage.sessionPercent === null && r.result.value.usage.weeklyPercent === null, '无限额套餐 → 百分比为 null(面板显示“暂无数据”)')

/* ── 6) 误把 /api/usage 分桶响应当成余额:同样降级为 null,不抛错 ───────── */

queue(200, USAGE_BUCKETS)
r = await call('check', { token: 'ollama-test-key' })
assert(r.result.ok === true && r.result.value.usage.sessionPercent === null, '/api/usage 分桶响应 → 百分比 null 而非崩溃')

/* ── 7) 响应不是 JSON ──────────────────────────────────────────────────── */

queue(200, '<html>502</html>')
r = await call('check', { token: 'ollama-test-key' })
assert(r.result.ok === false && r.result.error.code === 'internal', '非 JSON 响应 → internal')

/* ── 8) 401 / 403:清掉持久化 token ─────────────────────────────────────── */

queue(401, '{"error":"invalid credentials"}')
r = await call('check', { token: 'ollama-test-key' })
assert(r.result.ok === false && r.result.error.code === 'unauthorized', '401 → unauthorized')
assert(JSON.parse(readFileSync(usageFile, 'utf8')).token === null, '401 后持久化 token 被清除')
queue(403, '{"error":"suspended"}')
r = await call('check', { token: 'ollama-test-key' })
assert(r.result.ok === false && r.result.error.code === 'unauthorized', '403 → unauthorized')

/* ── 9) 网络异常 ───────────────────────────────────────────────────────── */

queued.push({ throw: 'getaddrinfo ENOTFOUND ollama.com' })
r = await call('check', { token: 'ollama-test-key' })
assert(r.result.ok === false && r.result.error.code === 'network', '网络异常 → network')

console.log('\nALL BALANCE PARSE TESTS PASSED')
