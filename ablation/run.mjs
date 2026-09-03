/**
 * dsh-ollama-usage 消融运行脚本（ablation/run.mjs）
 *
 * 对每个变体：
 *   - code 变体（M1..M7）：git apply ablation/variants/<ID>.patch → 跑探针
 *     （注入 DSH_HOME/HOME 临时目录）→ git checkout 恢复 lib/index.js；
 *   - M8（静态验证）：直接跑探针（无 patch）。
 * 结果写入 ablation/results.json，并打印摘要。
 *
 * 运行：node ablation/run.mjs
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const CODE_VARIANTS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']
const STATIC_VARIANTS = ['M8']
const ALL = [...CODE_VARIANTS, ...STATIC_VARIANTS]

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts })
}

// lib/index.js 是否被修改(git diff --quiet 有差异时退出码非 0)
function libDirty() {
  try {
    run('git', ['diff', '--quiet', '--', 'lib/index.js'])
    return false
  } catch {
    return true
  }
}

// 前置检查:lib/index.js 必须未被修改(patch 生成后已恢复)
if (libDirty()) {
  console.error('abort: lib/index.js is dirty, restore it first (git checkout -- lib/index.js)')
  process.exit(1)
}

const results = []
for (const variant of ALL) {
  let applied = false
  try {
    if (CODE_VARIANTS.includes(variant)) {
      run('git', ['apply', path.join('ablation', 'variants', variant + '.patch')])
      applied = true
    }
    const out = run('node', ['ablation/probe.mjs', variant], {
      env: { ...process.env, DSH_HOME: '.tmp-ablation-dsh-home', HOME: '.tmp-ablation-home' },
    })
    const parsed = JSON.parse(out.trim().split('\n').pop())
    results.push(parsed)
    console.log(`${parsed.pass ? 'PASS' : 'FAIL'} ${variant}: ${parsed.note}`)
    for (const [k, v] of Object.entries(parsed.checks)) {
      if (v !== 'ok') console.log(`      ${k}: ${v}`)
    }
  } catch (err) {
    results.push({ variant, loadOk: false, checks: { run: 'FAIL: ' + String(err?.message ?? err) }, pass: false, note: 'run error' })
    console.log(`ERROR ${variant}: ${String(err?.message ?? err)}`)
  } finally {
    if (applied) {
      run('git', ['checkout', '--', 'lib/index.js'])
    }
  }
}

// 后置检查:lib/index.js 必须已恢复
if (libDirty()) {
  console.error('warning: lib/index.js was not restored after the run')
}

fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify(results, null, 2))
const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} variants passed`)
