/**
 * dsh-ollama-usage 浏览器端 bundle(经 __ModuleLoader__ 加载)。
 *
 * 提供三处界面:
 *  - settings.section「Ollama 用量」:完整面板(会话 5h / 周用量进度条、费用、
 *    模型请求数、历史记录、API Key 配置、清除 Key);
 *  - sidebar.footer.action:极简双横条(会话 5h 淡紫 / 周用量深紫,透明背景);
 *  - tool.view.cordis:Run 卡片内的同款面板。
 *
 * 数据通道:Host 在 webServer 注册的 /ollama-usage 前缀路由,经 Connection
 * RPC 信封协议调用(check / snapshot / forget)。样式为手写 <style> 注入,
 * 全部使用 --dsw-* 主题变量(带回退值)。
 */

window.__ModuleLoader__.load({
  id: 'dsh-ollama-usage',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const RPC_CHANNEL = '/ollama-usage'
    const CSS_TAG_ID = 'dsh-ollama-usage/client.css'
    const SESSION_COLOR = '#b39df7'
    const WEEKLY_COLOR = '#7c66e8'

    const CSS = [
      '.olusa-panel{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1,#3a3a3a);border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.07));font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary,#e8e8e8)}',
      '.olusa-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.olusa-title{font-weight:650;font-size:13.5px}',
      '.olusa-btn{border:1px solid var(--dsw-alias-border-l2,#555);background:transparent;color:var(--dsw-alias-label-primary,#e8e8e8);border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer}',
      '.olusa-btn:disabled{opacity:.55;cursor:default}',
      '.olusa-btn-primary{border-color:var(--dsw-alias-brand-primary,#7aa2f7);color:var(--dsw-alias-brand-primary,#7aa2f7)}',
      '.olusa-hint{color:var(--dsw-alias-label-secondary,#9a9a9a);font-size:12px}',
      '.olusa-error{color:var(--dsw-alias-state-error-primary,#f7768e)}',
      '.olusa-ok{color:var(--dsw-alias-state-success-primary,#9ece6a)}',
      '.olusa-block{display:flex;flex-direction:column;gap:4px}',
      '.olusa-barhead{display:flex;justify-content:space-between;align-items:baseline;gap:8px}',
      '.olusa-barlabel{color:var(--dsw-alias-label-primary,#e8e8e8)}',
      '.olusa-barval{color:var(--dsw-alias-label-secondary,#9a9a9a);font-size:12px;font-variant-numeric:tabular-nums}',
      '.olusa-bar{height:8px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.18));overflow:hidden}',
      '.olusa-barfill{height:100%;border-radius:4px;transition:width .3s ease}',
      '.olusa-row{display:flex;justify-content:space-between;gap:8px}',
      '.olusa-link{color:var(--dsw-alias-brand-primary,#7aa2f7);text-decoration:none}',
      '.olusa-steps{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px}',
      '.olusa-input{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.15));border:1px solid var(--dsw-alias-border-l2,#555);color:var(--dsw-alias-label-primary,#e8e8e8);border-radius:6px;padding:5px 8px;font-size:12px;font-family:monospace}',
      '.olusa-login-title{font-weight:600}',
      '.olusa-rowbtns{display:flex;gap:6px;margin-top:8px}',
      '.olusa-models{display:flex;flex-direction:column;gap:3px}',
      '.olusa-model{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary,#9a9a9a)}',
      '.olusa-modelname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.olusa-modelcount{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#e8e8e8)}',
      '.olusa-ver{color:var(--dsw-alias-label-secondary,#9a9a9a);font-size:11px;opacity:.8}',
      '.olusa-hist{display:flex;flex-direction:column;gap:2px}',
      '.olusa-histrow{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary,#9a9a9a);font-variant-numeric:tabular-nums}',
      '.olusa-session{order:-1}',
      '.olusa-bars{display:flex;flex-direction:column;gap:6px;padding:6px 8px;width:120px;min-width:120px;flex-shrink:0;box-sizing:border-box;background:transparent;border:none}',
      '.olusa-barsrow{display:flex;flex-direction:column;gap:2px}',
      '.olusa-barshead{display:flex;justify-content:space-between;align-items:baseline;gap:6px}',
      '.olusa-barslabel{font-size:10px;color:var(--dsw-alias-label-secondary,#9a9a9a);white-space:nowrap}',
      '.olusa-barsval{font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#e8e8e8);white-space:nowrap}',
      '.olusa-minibar{height:8px;border-radius:4px;background:rgba(128,128,128,.28);overflow:hidden}',
      '.olusa-minibarfill{height:100%;border-radius:4px;transition:width .3s ease}',
    ].join('\n')

    function injectCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="' + CSS_TAG_ID + '"]') !== null) return
      const tag = document.createElement('style')
      tag.dataset.pluginCss = CSS_TAG_ID
      tag.textContent = CSS
      ;(document.head || document.documentElement).appendChild(tag)
    }

    const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null)
    const colorFor = (p) => {
      if (p === null) return 'var(--dsw-alias-label-secondary,#9a9a9a)'
      if (p < 70) return 'var(--dsw-alias-state-success-primary,#9ece6a)'
      if (p < 90) return 'var(--dsw-alias-state-warn-primary,#e0af68)'
      return 'var(--dsw-alias-state-error-primary,#f7768e)'
    }
    const PERIOD_LABELS = { last_4_weeks: '近 4 周', weekly: '本周', session: '本次会话' }
    const fmtTime = (iso) => {
      try {
        const d = new Date(iso)
        const p2 = (n) => (n < 10 ? '0' + n : String(n))
        return p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes())
      } catch (e) {
        return String(iso || '')
      }
    }

    function apply(ctx) {
      injectCss()

      const slots = ctx.get('slots')
      if (slots === undefined) return

      const connection = ctx.get('connection')
      const rpc = (endpoint, payload) => {
        if (connection === undefined || connection === null || typeof connection.rpc !== 'object' || typeof connection.rpc.call !== 'function') {
          return Promise.resolve({ ok: false, error: { code: 'internal', message: 'connection 不可用' } })
        }
        return connection.rpc.call(RPC_CHANNEL, endpoint, payload).then((result) => {
          if (result === null || typeof result !== 'object' || !('ok' in result)) {
            return { ok: false, error: { code: 'internal', message: 'rpc 响应格式异常' } }
          }
          return result
        })
      }

      // ── 面板组件 ──────────────────────────────────────────────────

      function BarRow(props) {
        const p = pct(props.percent)
        const width = p === null ? 0 : Math.min(100, Math.max(0, p))
        const remaining = p === null ? null : Math.round((100 - p) * 10) / 10
        return React.createElement('div', { className: 'olusa-block' + (props.em ? ' olusa-session' : '') },
          React.createElement('div', { className: 'olusa-barhead' },
            React.createElement('span', { className: 'olusa-barlabel' }, props.label),
            React.createElement('span', { className: 'olusa-barval' }, p === null ? '暂无数据' : ('已用 ' + p + '% · 剩余 ' + remaining + '%'))
          ),
          React.createElement('div', { className: 'olusa-bar' },
            React.createElement('div', { className: 'olusa-barfill', style: { width: width + '%', background: colorFor(p) } })
          )
        )
      }

      function LoginBody(props) {
        return React.createElement('div', { className: 'olusa-block' },
          React.createElement('div', { className: 'olusa-login-title' }, '尚未登录 Ollama 账号'),
          React.createElement('ol', { className: 'olusa-steps' },
            React.createElement('li', null,
              React.createElement('a', { className: 'olusa-link', href: 'https://ollama.com/settings', target: '_blank', rel: 'noreferrer' }, '打开 ollama.com/settings'),
              ' 并登录（或注册）Ollama 账号'
            ),
            React.createElement('li', null,
              '在 API Keys 页 ',
              React.createElement('a', { className: 'olusa-link', href: 'https://ollama.com/settings/keys', target: '_blank', rel: 'noreferrer' }, 'settings/keys'),
              ' 创建一个 API Key'
            ),
            React.createElement('li', null, '把 Key 粘贴到下方点击“检测”；或先在终端运行 ollama signin / ollama login，再点“重新检测本地凭证”')
          ),
          React.createElement('input', { className: 'olusa-input', placeholder: '粘贴 API Key', value: props.tokenInput, onChange: (e) => props.onInput(e.target.value), spellCheck: false }),
          React.createElement('div', { className: 'olusa-rowbtns' },
            React.createElement('button', { className: 'olusa-btn olusa-btn-primary', disabled: props.busy || !props.tokenInput.trim(), onClick: () => props.onCheck(props.tokenInput.trim()) }, props.busy ? '检测中…' : '检测'),
            React.createElement('button', { className: 'olusa-btn', disabled: props.busy, onClick: () => props.onRetryLocal() }, '重新检测本地凭证')
          ),
          React.createElement('div', { className: 'olusa-hint' }, '提示：检测成功后，Key 与用量快照会保存到 $DSH_HOME/storages/ollama-usage/usage.json（权限 600），跨对话/重启自动恢复并每 10 分钟自动刷新。')
        )
      }

      function UsageBody(props) {
        const d = props.data
        const periodLabel = PERIOD_LABELS[d.periodType] || (d.periodType ? String(d.periodType).toUpperCase() : '')
        const periodText = periodLabel && d.periodStart && d.periodEnd
          ? (periodLabel + '  ' + d.periodStart + ' → ' + d.periodEnd)
          : periodLabel
        const costNum = d.cost !== null && d.cost !== undefined && d.cost !== '' ? Number(d.cost) : NaN
        const costText = Number.isFinite(costNum) ? '$' + costNum.toFixed(2) : null
        const models = Array.isArray(d.models) ? d.models.slice(0, 5) : []
        const history = Array.isArray(props.history) ? props.history.slice(-5).reverse() : []
        return React.createElement('div', { className: 'olusa-block' },
          (periodText ? React.createElement('div', { className: 'olusa-hint' }, periodText) : null),
          React.createElement(BarRow, { label: '会话用量（每 5 小时）', percent: d.sessionPercent, em: true }),
          React.createElement(BarRow, { label: '本周用量（Weekly）', percent: d.weeklyPercent }),
          (costText !== null
            ? React.createElement('div', { className: 'olusa-row' },
                React.createElement('span', null, '近 4 周费用'),
                React.createElement('span', null, costText))
            : null),
          (models.length > 0
            ? React.createElement('div', { className: 'olusa-models' },
                React.createElement('div', { className: 'olusa-hint' }, '模型请求数（本周）'),
                models.map((m) => React.createElement('div', { className: 'olusa-model', key: m.name },
                  React.createElement('span', { className: 'olusa-modelname' }, m.name),
                  React.createElement('span', { className: 'olusa-modelcount' }, String(m.requestCount) + ' 次')
                )))
            : null),
          (history.length > 0
            ? React.createElement('div', { className: 'olusa-hist' },
                React.createElement('div', { className: 'olusa-hint' }, '最近记录（会话用量）'),
                history.map((h, i) => React.createElement('div', { className: 'olusa-histrow', key: String(i) },
                  React.createElement('span', null, fmtTime(h.at)),
                  React.createElement('span', null, (h.sessionPercent === null || h.sessionPercent === undefined) ? '—' : (h.sessionPercent + '%'))
                )))
            : null),
          (props.updatedAt
            ? React.createElement('div', { className: 'olusa-hint' }, '上次更新：' + fmtTime(props.updatedAt) + '（每 10 分钟自动刷新）')
            : null),
          React.createElement('div', { className: props.persisted ? 'olusa-hint olusa-ok' : 'olusa-error' },
            props.persisted ? '✓ 已持久化到本地（$DSH_HOME/storages/ollama-usage/usage.json）' : '⚠ 未能写入本地文件（持久化失败，仅当前进程内存）')
        )
      }

      function OllamaUsagePanel() {
        const [phase, setPhase] = React.useState('login')
        const [data, setData] = React.useState(null)
        const [history, setHistory] = React.useState(null)
        const [updatedAt, setUpdatedAt] = React.useState(null)
        const [persisted, setPersisted] = React.useState(null)
        const [error, setError] = React.useState('')
        const [busy, setBusy] = React.useState(false)
        const [tokenInput, setTokenInput] = React.useState('')

        const applyResult = (res) => {
          if (res && res.ok) {
            const v = res.value || {}
            setData(v.usage || null)
            setHistory(v.history || null)
            setUpdatedAt(v.updatedAt || null)
            if (typeof v.persisted === 'boolean') setPersisted(v.persisted)
            setError('')
            setPhase('usage')
          } else if (res && res.error && (res.error.code === 'no-token' || res.error.code === 'no-data')) {
            setError('')
            setPhase('login')
          } else if (data) {
            setError((res && res.error && res.error.message) || '刷新失败')
          } else {
            setError((res && res.error && res.error.message) || '未知错误')
            setPhase('error')
          }
        }

        const doCheck = (token) => {
          setBusy(true)
          rpc('check', token ? { token: token } : {}).then(applyResult).catch((e) => {
            if (data) setError('刷新失败：' + String((e && e.message) || e))
            else { setError('调用失败：' + String((e && e.message) || e)); setPhase('error') }
          }).then(() => setBusy(false))
        }

        const doForget = () => {
          rpc('forget', {}).then(() => {
            setData(null); setHistory(null); setUpdatedAt(null); setPersisted(null); setError(''); setPhase('login')
          }).catch(() => {})
        }

        React.useEffect(() => {
          let disposed = false
          const refresh = () => rpc('snapshot', {}).then((res) => {
            if (disposed) return
            if (res && res.ok && res.value && res.value.usage) {
              setData(res.value.usage); setHistory(res.value.history || null); setUpdatedAt(res.value.updatedAt || null); setError(''); setPhase('usage')
            }
          }).catch(() => {})
          refresh()
          const dispose = ctx.interval(refresh, 60000)
          return () => { disposed = true; dispose() }
        }, [])

        const body = phase === 'login'
          ? React.createElement(LoginBody, { tokenInput: tokenInput, onInput: setTokenInput, onCheck: doCheck, onRetryLocal: () => doCheck(''), busy: busy })
          : phase === 'usage' && data
            ? React.createElement('div', { className: 'olusa-block' },
                React.createElement(UsageBody, { data: data, history: history, updatedAt: updatedAt, persisted: persisted }),
                (error ? React.createElement('div', { className: 'olusa-error' }, String(error)) : null),
                React.createElement('div', { className: 'olusa-rowbtns' },
                  React.createElement('button', { className: 'olusa-btn', disabled: busy, onClick: () => doForget() }, '清除已存 Key')
                )
              )
            : React.createElement('div', { className: 'olusa-block' },
                React.createElement('div', { className: 'olusa-error' }, String(error || '查询失败')),
                React.createElement('div', { className: 'olusa-hint' },
                  '请确认已登录：',
                  React.createElement('a', { className: 'olusa-link', href: 'https://ollama.com/settings', target: '_blank', rel: 'noreferrer' }, '打开 ollama.com/settings'),
                  '，或粘贴 API Key 重试。'
                ),
                React.createElement('input', { className: 'olusa-input', placeholder: '粘贴 API Key', value: tokenInput, onChange: (e) => setTokenInput(e.target.value), spellCheck: false }),
                React.createElement('div', { className: 'olusa-rowbtns' },
                  React.createElement('button', { className: 'olusa-btn olusa-btn-primary', disabled: busy || !tokenInput.trim(), onClick: () => doCheck(tokenInput.trim()) }, busy ? '检测中…' : '检测'),
                  React.createElement('button', { className: 'olusa-btn', disabled: busy, onClick: () => doCheck('') }, '重试')
                )
              )

        return React.createElement('div', { className: 'olusa-panel' },
          React.createElement('div', { className: 'olusa-head' },
            React.createElement('span', { className: 'olusa-title' }, '⚡ Ollama 用量余量'),
            React.createElement('button', { className: 'olusa-btn', disabled: busy, onClick: () => doCheck('') }, busy ? '查询中…' : '刷新')
          ),
          body,
          React.createElement('div', { className: 'olusa-ver' }, 'dsh-ollama-usage · v0.1.0')
        )
      }

      // ── 侧边栏双横条 ──────────────────────────────────────────────

      function UsageBars(props) {
        const [data, setData] = React.useState(null)
        const [updatedAt, setUpdatedAt] = React.useState(null)

        React.useEffect(() => {
          let disposed = false
          const refresh = () => rpc('snapshot', {}).then((res) => {
            if (disposed) return
            if (res && res.ok && res.value) { setData(res.value.usage || null); setUpdatedAt(res.value.updatedAt || null) }
            else { setData(null); setUpdatedAt(null) }
          }).catch(() => { if (!disposed) { setData(null); setUpdatedAt(null) } })
          refresh()
          const dispose = ctx.interval(refresh, 60000)
          return () => { disposed = true; dispose() }
        }, [])

        // 防御性判断:仅显式 wide === false(窄栏)才隐藏
        if (props.wide === false) return null

        const sp = data && typeof data.sessionPercent === 'number' ? Math.min(100, Math.max(0, data.sessionPercent)) : null
        const wp = data && typeof data.weeklyPercent === 'number' ? Math.min(100, Math.max(0, data.weeklyPercent)) : null
        const tip = sp === null
          ? 'Ollama 用量：未登录（设置 → Ollama 用量 配置）'
          : 'Ollama 会话用量（每 5 小时）：' + (Math.round(sp * 10) / 10) + '% · 周用量：' + (Math.round(wp * 10) / 10) + '%' + (updatedAt ? ' · 更新于 ' + fmtTime(updatedAt) : '')
        const rows = [
          { label: '会话5h', p: sp, color: SESSION_COLOR },
          { label: '周用量', p: wp, color: WEEKLY_COLOR },
        ]
        return React.createElement('div', { className: 'olusa-bars', title: tip },
          rows.map((b) => React.createElement('div', { className: 'olusa-barsrow', key: b.label },
            React.createElement('div', { className: 'olusa-barshead' },
              React.createElement('span', { className: 'olusa-barslabel' }, b.label),
              React.createElement('span', { className: 'olusa-barsval' }, b.p === null ? '—' : (Math.round(b.p * 10) / 10) + '%')
            ),
            React.createElement('div', { className: 'olusa-minibar' },
              React.createElement('div', { className: 'olusa-minibarfill', style: { width: (b.p === null ? 0 : b.p) + '%', background: b.color } })
            )
          ))
        )
      }

      // ── 槽位注册 ──────────────────────────────────────────────────

      slots.inject('tool.view.cordis', () => slots.register(
        { name: 'tool.view.cordis', key: 'self' },
        () => React.createElement(OllamaUsagePanel)
      ))

      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'ollama-usage', order: 40, label: 'Ollama 用量' },
        () => React.createElement(OllamaUsagePanel)
      ))

      slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: 'olusa-bars', order: -10, label: 'Ollama 用量' },
        (props) => React.createElement(UsageBars, { wide: !!(props && props.wide) })
      ))
    }

    exports.apply = apply
    exports.inject = ['slots', 'connection', 'timer']
    return module.exports
  },
})
