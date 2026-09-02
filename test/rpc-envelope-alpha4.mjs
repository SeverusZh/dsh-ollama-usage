/**
 * dsh-ollama-usage RPC-envelope probe against the REAL alpha.4 Connection
 * envelope validator.
 *
 * The bridge endpoints emit `{ type:'server-response', rpcId, result }` with
 * `{ ok:false, error:{ code, message } }` failures. alpha.4's browser caller
 * (packages/client/connection/src/client/rpc.ts, dsh-client-connection
 * 0.1.2-alpha.4) REJECTS any failure whose `error.details` is not an object
 * (`TypeError: connection: invalid server-response failure`), so every
 * non-`bad-request` error the plugin returns would throw in the real client
 * and the UI would never see its `error.code` (no-token / no-data / ...).
 *
 * This file embeds the alpha.4 validator verbatim (only the RpcId brand is
 * stripped; it is a plain string at runtime) and drives every endpoint
 * through the real bridge handler, asserting that each response parses.
 *
 * Run:  DSH_HOME=.tmp-env-dsh-home HOME=.tmp-env-home node test/rpc-envelope-alpha4.mjs
 */
import { Readable } from 'node:stream'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import plugin from '../lib/index.js'

const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); process.exit(1) }
  console.log('ok:', msg)
}

/* ── alpha.4 Connection envelope validator (verbatim, RpcId brand stripped) ──
 * Source: harness-src packages/client/connection/src/client/rpc.ts,
 * function parseConnectionResponse + isRecord, at dsh-v0.1.2-alpha.4.
 */
function parseConnectionResponse(value) {
  if (!isRecord(value) || value.type !== 'server-response' || typeof value.rpcId !== 'string') {
    throw new TypeError('connection: invalid server-response envelope')
  }
  const result = value.result
  if (!isRecord(result)) throw new TypeError('connection: invalid server-response result')
  if (result.ok === true) {
    return { rpcId: value.rpcId, result: { ok: true, value: result.value } }
  }
  if (result.ok !== false || !isRecord(result.error)) {
    throw new TypeError('connection: invalid server-response result')
  }
  const error = result.error
  if (typeof error.code !== 'string' || typeof error.message !== 'string' || !isRecord(error.details)) {
    throw new TypeError('connection: invalid server-response failure')
  }
  return {
    rpcId: value.rpcId,
    result: { ok: false, error: { code: error.code, message: error.message, details: error.details } },
  }
}
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ── fake ctx + bridge capture (same pattern as bridge-smoke.mjs) ──────────
let capturedHandler = null
const fakeCtx = {
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
    return () => {}
  },
}
plugin.apply(fakeCtx)
assert(capturedHandler !== null, '已捕获路由 handler')

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

// ── 临时环境 ───────────────────────────────────────────────────────────────
const tmp = process.env.DSH_HOME
const tmpHome = process.env.HOME
if (typeof tmp === 'string' && tmp.includes('.tmp')) rmSync(tmp, { recursive: true, force: true })
if (typeof tmpHome === 'string' && tmpHome.includes('.tmp')) rmSync(tmpHome, { recursive: true, force: true })
mkdirSync(join(tmp, 'storages', 'ollama-usage'), { recursive: true })

// 1) no-token failure must satisfy the alpha.4 validator.
let r = await call('check', {})
assert(r.type === 'server-response', 'check: envelope type server-response')
assert(r.result.ok === false, 'check: no-token is a failure result')
let parsed
let threw = null
try { parsed = parseConnectionResponse(r) } catch (e) { threw = e }
assert(threw === null, 'check no-token: alpha.4 validator accepts the failure envelope' + (threw ? ` (${threw.message})` : ''))
assert(parsed.result.ok === false && parsed.result.error.code === 'no-token', 'check no-token: error.code surfaces to the client')

// 2) no-data failure (snapshot without persisted usage) must parse.
r = await call('snapshot', {})
threw = null
try { parsed = parseConnectionResponse(r) } catch (e) { threw = e }
assert(threw === null, 'snapshot no-data: alpha.4 validator accepts the failure envelope' + (threw ? ` (${threw.message})` : ''))
assert(parsed.result.ok === false && parsed.result.error.code === 'no-data', 'snapshot no-data: error.code surfaces to the client')

// 3) success envelope (seeded snapshot) must parse and carry the value.
writeFileSync(join(tmp, 'storages', 'ollama-usage', 'usage.json'), JSON.stringify({
  token: 'ollama-test-key',
  updatedAt: '2026-08-20T12:00:00.000Z',
  usage: { sessionPercent: 0.3, weeklyPercent: 21.3, models: [] },
  history: [],
}))
r = await call('snapshot', {})
threw = null
try { parsed = parseConnectionResponse(r) } catch (e) { threw = e }
assert(threw === null, 'snapshot success: alpha.4 validator accepts the envelope' + (threw ? ` (${threw.message})` : ''))
assert(parsed.result.ok === true && parsed.result.value.usage.weeklyPercent === 21.3, 'snapshot success: value surfaces to the client')

// 4) forget success (value null) must parse.
r = await call('forget', {})
threw = null
try { parsed = parseConnectionResponse(r) } catch (e) { threw = e }
assert(threw === null, 'forget: alpha.4 validator accepts the envelope' + (threw ? ` (${threw.message})` : ''))
assert(parsed.result.ok === true, 'forget: ok surfaces to the client')

// 5) auth-state success must parse.
r = await call('auth-state', {})
threw = null
try { parsed = parseConnectionResponse(r) } catch (e) { threw = e }
assert(threw === null, 'auth-state: alpha.4 validator accepts the envelope' + (threw ? ` (${threw.message})` : ''))
assert(parsed.result.ok === true && parsed.result.value.localTokenPresent === false, 'auth-state: value surfaces to the client (token cleared by forget)')

console.log('\nALL ALPHA.4 RPC ENVELOPE PROBES PASSED')
