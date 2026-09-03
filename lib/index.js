/**
 * dsh-ollama-usage 宿主插件:读取 Ollama 凭证(持久化 Key 或旧版 ~/.ollama/auth.json),
 * 请求 https://ollama.com/api/usage 获取用量(会话 5h 桶 + 周桶),持久化到
 * $DSH_HOME/storages/ollama-usage/usage.json(0600),每 10 分钟自动刷新,
 * 并在 webServer 注册 /ollama-usage 前缀路由,与客户端走 Connection RPC 信封协议
 * (check / snapshot / forget / auth-state)。纯 ESM,仅依赖 node: 内建与 dsh-home-paths。
 */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

export const name = 'ollama-usage'

const RPC_CHANNEL = '/ollama-usage'
const USAGE_URL = 'https://ollama.com/api/usage'
const FETCH_TIMEOUT_MS = 20000
const AUTO_REFRESH_MS = 10 * 60 * 1000
const HISTORY_CAP = 24
const BODY_LIMIT = 64 * 1024

/* 持久化: $DSH_HOME/storages/ollama-usage/usage.json { token, updatedAt, usage, history[] } */

function filePath() {
  return join(resolveDshHome(), 'storages', 'ollama-usage', 'usage.json')
}

function readFile() {
  try {
    const parsed = JSON.parse(readFileSync(filePath(), 'utf8'))
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    /* 文件不存在或损坏 */
  }
  return null
}

function writeFile(obj) {
  try {
    const dir = join(resolveDshHome(), 'storages', 'ollama-usage')
    mkdirSync(dir, { recursive: true })
    writeFileSync(filePath(), JSON.stringify(obj), { mode: 0o600 })
    return true
  } catch {
    return false
  }
}

/** 清除持久化 token,保留用量与历史(401 失效与 forget 端点共用)。 */
function clearToken(rec) {
  if (!rec) return
  writeFile({ token: null, updatedAt: rec.updatedAt, usage: rec.usage, history: rec.history || [] })
}

/* 凭证 */

/** 兼容旧版 ollama CLI:~/.ollama/auth.json 里的 { "token": "..." }。 */
function readLocalToken() {
  try {
    const parsed = JSON.parse(readFileSync(join(homedir(), '.ollama', 'auth.json'), 'utf8'))
    const token = parsed && typeof parsed.token === 'string' ? parsed.token.trim() : ''
    return token || null
  } catch {
    return null
  }
}

/* 用量查询与解析 */

async function fetchUsage(token) {
  const res = await fetch(USAGE_URL, {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  return { status: res.status, body: await res.text() }
}

/** API 返回 0~1 小数(如 0.213 = 21.3%),统一转百分比数字。 */
function toPercent(v) {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : null
  if (n === null || !Number.isFinite(n)) return null
  return Math.round((n <= 1 ? n * 100 : n) * 10) / 10
}

function parseUsage(body) {
  let json
  try {
    json = JSON.parse(body)
  } catch {
    return { ok: false, message: '响应不是合法 JSON' }
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, message: '响应格式异常' }
  }
  const limits = json.limits || {}
  const activity = json.activity || {}
  const sessionUsage = limits.session && typeof limits.session === 'object' ? toPercent(limits.session.usage) : null
  const weeklyUsage = limits.weekly && typeof limits.weekly === 'object' ? toPercent(limits.weekly.usage) : null
  // 模型请求数:真实响应在 limits.weekly.models(有时 activity.models 也有),按优先级取非空
  const pick = (arr) => (Array.isArray(arr) && arr.length ? arr : null)
  const models = (pick(limits.weekly && limits.weekly.models) || pick(limits.session && limits.session.models) || (Array.isArray(activity.models) ? activity.models : []))
    .map((m) => ({ name: String((m && m.name) || ''), requestCount: Number((m && m.request_count)) || 0 }))
    .filter((m) => m.name)
    .sort((a, b) => b.requestCount - a.requestCount)
  const period = activity.period
  return {
    ok: true,
    usage: {
      cost: typeof activity.cost === 'string' ? activity.cost : null,
      periodType: period && typeof period.type === 'string' ? period.type : null,
      periodStart: period && typeof period.starting_at === 'string' ? period.starting_at : null,
      periodEnd: period && typeof period.ending_at === 'string' ? period.ending_at : null,
      sessionPercent: sessionUsage,
      weeklyPercent: weeklyUsage,
      models,
    },
  }
}

/* 周重置时间推算(API 不提供,按配额语义):weekly = 下周一 00:00 UTC。 */

function withResetTimes(usage, nowIso) {
  const now = new Date(nowIso)
  const daysUntilMonday = ((7 - now.getUTCDay()) % 7) + 1
  return Object.assign({}, usage, {
    weeklyResetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday)).toISOString(),
  })
}

/** 用 token 查询并写入持久化;返回 RpcResult({ ok, value|error })。 */
async function checkWithToken(token) {
  let res
  try {
    res = await fetchUsage(token)
  } catch (e) {
    return fail('network', String((e && e.message) || e))
  }
  if (res.status === 401 || res.status === 403) {
    // 凭证失效:清掉持久化 token,保留历史
    const rec = readFile()
    if (rec && rec.token) clearToken(rec)
    return fail('unauthorized', '凭证无效或已过期(' + res.status + '),请重新登录或更换 API Key')
  }
  if (res.status >= 400) {
    return fail('http-error', res.body || ('HTTP ' + res.status))
  }
  const parsed = parseUsage(res.body)
  if (!parsed.ok) {
    return fail('internal', parsed.message)
  }
  // 持久化:token + 快照 + 历史(保留最近 24 条)
  const now = new Date().toISOString()
  const prev = readFile()
  const history = (Array.isArray(prev && prev.history) ? prev.history.slice() : []).concat([{ at: now, sessionPercent: parsed.usage.sessionPercent, weeklyPercent: parsed.usage.weeklyPercent }])
  const trimmed = history.slice(-HISTORY_CAP)
  const usage = withResetTimes(parsed.usage, now)
  const persisted = writeFile({ token, updatedAt: now, usage, history: trimmed })
  return {
    ok: true,
    value: { usage, updatedAt: now, persisted, history: trimmed.slice(-5) },
  }
}

/** 自动刷新:读持久化 token 重新查询(页面关闭也持续)。 */
async function autoRefresh() {
  try {
    const rec = readFile()
    if (rec && rec.token) await checkWithToken(rec.token)
  } catch {
    /* 静默失败,下一轮再试 */
  }
}

/* RPC 端点分派 */

/**
 * Canonical Connection RPC failure。alpha.4 浏览器端(parseConnectionResponse)
 * 拒绝无 details 对象的失败响应,故每个错误结果必须携带 details:{}。
 */
function fail(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}

async function dispatch(endpoint, payload) {
  if (endpoint === 'check') {
    const manual = payload && typeof payload.token === 'string' ? payload.token.trim() : ''
    let token = manual
    if (!token) token = (readFile() || {}).token || null
    if (!token) token = readLocalToken()
    if (!token) return fail('no-token', '未检测到本地登录凭证,也未提供 API Key')
    return checkWithToken(token)
  }
  if (endpoint === 'snapshot') {
    const rec = readFile()
    if (!rec || !rec.usage) return fail('no-data', '暂无持久化的用量数据')
    const usage = withResetTimes(rec.usage, new Date().toISOString())
    // snapshot 读自磁盘(插件无内存缓存),必然已持久化;与 check 一致报告 persisted
    return { ok: true, value: { tokenPersisted: !!rec.token, persisted: true, updatedAt: rec.updatedAt, history: (rec.history || []).slice(-5), usage } }
  }
  if (endpoint === 'forget') {
    clearToken(readFile())
    return { ok: true, value: null }
  }
  if (endpoint === 'auth-state') {
    const rec = readFile()
    return { ok: true, value: { localTokenPresent: !!(rec && rec.token) } }
  }
  throw new Error('unknown bridge endpoint ' + JSON.stringify(endpoint))
}

/* HTTP 桥(镜像 Connection RPC 信封协议)
 * 请求: POST /ollama-usage/<endpoint> { type:'client-request', rpcId, method, payload }
 * 响应: { type:'server-response', rpcId, result:{ ok, value|error } } */

function readRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let done = false
    const fail = (err) => {
      if (done) return
      done = true
      reject(err)
    }
    req.on('data', (chunk) => {
      if (done) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
      size += buf.length
      if (size > limit) {
        fail(Object.assign(new Error('request body too large'), { code: 'LIMIT' }))
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => {
      if (done) return
      done = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (err) => fail(err))
  })
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) &&
    parts[0] === '127'
  )
}

function isLoopbackHost(rawHost) {
  let host = typeof rawHost === 'string' ? rawHost.trim() : ''
  if (host.length === 0) return false
  if (host.startsWith('[')) {
    const close = host.indexOf(']')
    if (close === -1) return false
    host = host.slice(0, close + 1)
  } else {
    const colon = host.indexOf(':')
    if (colon !== -1) host = host.slice(0, colon)
  }
  return isLoopbackHostname(host)
}

function endpointFromPath(channel, pathname) {
  if (!pathname.startsWith(channel + '/')) return undefined
  const endpoint = pathname.slice(channel.length + 1)
  if (endpoint.length === 0) return undefined
  if (endpoint.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return undefined
  }
  return endpoint
}

function sendPlain(res, status, text) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(text)
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function buildServerResponse(rpcId, result) {
  return { type: 'server-response', rpcId, result }
}

function buildBadRequestResponse(rpcId) {
  return buildServerResponse(rpcId, {
    ok: false,
    error: { code: 'bad-request', message: 'invalid client-request message', details: { issues: [] } },
  })
}

async function handleBridgeRequest(req, res) {
  if (typeof req.method !== 'string' || req.method !== 'POST') {
    sendPlain(res, 404, 'not found')
    return
  }
  const contentType = (req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') {
    sendPlain(res, 415, 'content type must be application/json')
    return
  }
  const hostHeader = req.headers.host
  if (hostHeader === undefined || !isLoopbackHost(hostHeader)) {
    sendPlain(res, 403, 'forbidden')
    return
  }
  let raw
  try {
    raw = await readRequestBody(req, BODY_LIMIT)
  } catch (err) {
    if (err && err.code === 'LIMIT') {
      sendPlain(res, 413, 'request body too large')
    } else {
      sendPlain(res, 400, 'body is not JSON')
    }
    return
  }
  let body
  try {
    body = raw.length === 0 ? {} : JSON.parse(raw)
  } catch {
    sendPlain(res, 400, 'body is not JSON')
    return
  }
  const envelope = body
  if (
    envelope === null ||
    typeof envelope !== 'object' ||
    Array.isArray(envelope) ||
    envelope.type !== 'client-request' ||
    typeof envelope.rpcId !== 'string' ||
    typeof envelope.method !== 'string'
  ) {
    sendJson(res, 200, buildBadRequestResponse('invalid-request'))
    return
  }
  const rawUrl = typeof req.url === 'string' ? req.url : '/'
  const pathname = new URL(rawUrl, 'http://dsh.internal').pathname
  const endpoint = endpointFromPath(RPC_CHANNEL, pathname)
  if (endpoint === undefined || envelope.method !== endpoint) {
    sendJson(res, 200, buildBadRequestResponse(envelope.rpcId))
    return
  }
  const result = await dispatch(endpoint, envelope.payload)
  sendJson(res, 200, buildServerResponse(envelope.rpcId, result))
}

/* 插件入口 */

export default {
  // webServer 必须经 inject 声明:ctx.get('webServer') 在提供方 fiber 激活前
  // 可能返回 undefined,导致路由注册被跳过;声明后 Cordis 等 webServer 可用再 apply。
  inject: ['timer', 'webServer'],
  apply(ctx) {
    try {
      ctx.effect(
        () => ctx.webServer.register({ kind: 'prefix', path: RPC_CHANNEL, handler: handleBridgeRequest }),
        'ollama-usage: rpc bridge',
      )
      console.log('[ollama-usage] RPC 路由已注册: ' + RPC_CHANNEL)
    } catch (e) {
      console.error('[ollama-usage] 路由注册失败: ' + String((e && e.message) || e))
    }
    try {
      ctx.effect(() => ctx.interval(autoRefresh, AUTO_REFRESH_MS), 'ollama-usage: auto refresh')
    } catch (e) {
      console.error('[ollama-usage] 自动刷新定时器不可用: ' + String((e && e.message) || e))
    }
    autoRefresh().catch((e) => {
      console.error('[ollama-usage] 首次自动刷新失败: ' + String((e && e.message) || e))
    })
  },
}
