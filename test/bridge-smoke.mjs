/**
 * dsh-ollama-usage 冒烟测试:用假 ctx / 假 webServer 捕获 /ollama-usage 前缀路由,
 * 以真实 Connection RPC 信封协议驱动 check / snapshot / forget / auth-state 端点,
 * 并用临时 DSH_HOME / HOME 验证持久化与凭证读取。
 *
 * 运行: DSH_HOME=./.tmp-dsh-home node test/bridge-smoke.mjs
 */
import { Readable } from 'node:stream'
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import plugin from '../lib/index.js'

const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); process.exit(1) }
  console.log('ok:', msg)
}

// ── 假 ctx ────────────────────────────────────────────────────────────
let capturedHandler = null
let intervalStarted = false
const fakeCtx = {
  // 插件经 inject 声明 webServer 后,apply 里直接读 ctx.webServer(属性访问)
  webServer: {
    register(route) {
      assert(route.kind === 'prefix' && route.path === '/ollama-usage', '路由注册为 /ollama-usage prefix')
      capturedHandler = route.handler
      return () => {}
    },
  },
  get(name) {
    if (name === 'webServer') return this.webServer
    return undefined
  },
  effect(fn, label) {
    const disposer = fn()
    assert(typeof disposer === 'function', 'effect disposer: ' + label)
    return disposer
  },
  interval(cb) {
    intervalStarted = true
    return () => {}
  },
}

plugin.apply(fakeCtx)
assert(capturedHandler !== null, '已捕获路由 handler')
assert(intervalStarted, '自动刷新定时器已注册')

// ── 假请求/响应 ────────────────────────────────────────────────────────
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
  const envelope = { type: 'client-request', rpcId: 't' + (++rpcSeq), method: endpoint, payload: payload === undefined ? {} : payload }
  await capturedHandler(fakeReq(envelope, '/ollama-usage/' + endpoint), res)
  return JSON.parse(res.body)
}

// ── 临时环境 ───────────────────────────────────────────────────────────
const tmp = process.env.DSH_HOME
assert(typeof tmp === 'string' && tmp.length > 0, 'DSH_HOME 已指向临时目录: ' + tmp)
const tmpHome = process.env.HOME
// 清理上次运行残留,保证可重复执行(仅限 .tmp 前缀的临时目录)
if (tmp.includes('.tmp')) rmSync(tmp, { recursive: true, force: true })
if (typeof tmpHome === 'string' && tmpHome.includes('.tmp')) rmSync(tmpHome, { recursive: true, force: true })
const usageDir = join(tmp, 'storages', 'ollama-usage')
mkdirSync(usageDir, { recursive: true })
const usageFile = join(usageDir, 'usage.json')

// 1) 无凭证 → no-token
let r = await call('check', {})
assert(r.type === 'server-response' && r.result.ok === false && r.result.error.code === 'no-token', 'check 无凭证 → no-token')

// 2) 伪造 ~/.ollama/auth.json(用临时 HOME)→ 走 401 分支并清除持久化 token
const ollamaDir = join(tmpHome, '.ollama')
mkdirSync(ollamaDir, { recursive: true })
writeFileSync(join(ollamaDir, 'auth.json'), JSON.stringify({ token: 'ollama-dummy-invalid' }))
writeFileSync(usageFile, JSON.stringify({ token: 'ollama-dummy-invalid', updatedAt: '2026-08-20T00:00:00.000Z', usage: { sessionPercent: 1, weeklyPercent: 2 }, history: [] }))
r = await call('check', {})
assert(r.result.ok === false && r.result.error.code === 'unauthorized', '无效 token → unauthorized')
const cleared = JSON.parse(readFileSync(usageFile, 'utf8'))
assert(cleared.token === null, '401 后持久化 token 被清除(历史保留)')

// 3) snapshot:手工种入用量记录
writeFileSync(usageFile, JSON.stringify({
  token: 'ollama-test-key',
  updatedAt: '2026-08-20T12:00:00.000Z',
  usage: { sessionPercent: 0.3, weeklyPercent: 21.3, cost: '0.00000', periodType: 'last_4_weeks', periodStart: '2026-07-27T00:00:00Z', periodEnd: '2026-08-20T12:00:00Z', models: [] },
  history: [{ at: '2026-08-20T11:00:00.000Z', sessionPercent: 0.3, weeklyPercent: 21.3 }],
}))
r = await call('snapshot', {})
assert(r.result.ok === true && r.result.value.usage.weeklyPercent === 21.3, 'snapshot 返回持久化用量')
assert(r.result.value.tokenPersisted === true && r.result.value.history.length === 1, 'snapshot 带 tokenPersisted 与历史')
assert(r.result.value.persisted === true, 'snapshot 报告 persisted: true(数据读自磁盘)')
const now = new Date()
const daysUntilMonday = ((7 - now.getUTCDay()) % 7) + 1
const expectedWeeklyReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday)).toISOString()
assert(r.result.value.usage.weeklyResetAt === expectedWeeklyReset, '周重置 = 下周一 00:00 UTC(当前为 ' + now.toISOString() + ')')

// 4) forget
r = await call('forget', {})
assert(r.result.ok === true, 'forget ok')
const after = JSON.parse(readFileSync(usageFile, 'utf8'))
assert(after.token === null && after.usage !== undefined, 'forget 后 token 清除、用量保留')

// 5) auth-state
r = await call('auth-state', {})
assert(r.result.ok === true && r.result.value.localTokenPresent === false, 'auth-state 反映已清除')

// 6) 非法信封 / 方法
const bad = fakeRes()
await capturedHandler(fakeReq({ type: 'nope' }, '/ollama-usage/check'), bad)
assert(JSON.parse(bad.body).result.ok === false, '非法信封 → bad-request')
const wrong = fakeRes()
await capturedHandler(fakeReq({ type: 'client-request', rpcId: 'x', method: 'check' }, '/ollama-usage/other'), wrong)
assert(JSON.parse(wrong.body).result.ok === false, '端点与方法不符 → bad-request')
const notPost = fakeRes()
await capturedHandler(fakeReq({}, '/ollama-usage/check', 'localhost', 'GET'), notPost)
assert(notPost.statusCode === 404, '非 POST → 404')

console.log('\nALL BRIDGE SMOKE TESTS PASSED')
