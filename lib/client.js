/**
 * dsh-ollama-usage 浏览器端 bundle(经 __ModuleLoader__ 加载)。
 *
 * 提供三处界面:
 *  - plugins.bundle.config(以包名为键)「Ollama 用量」:完整面板(会话 5h / 周用量
 *    进度条、会话与周用量重置倒计时、历史记录、API Key 配置、清除 Key)。
 *    渲染在「插件列表 → dsh-ollama-usage」页面的描述与组件行之间 ——
 *    配置不再位于设置面板(settings.section 已退役);
 *  - sidebar.footer.action:极简双横条(会话 5h / 周用量,紫为主的数据可视化强调色);
 *  - tool.view.cordis:Run 卡片内的同款面板。
 *
 * 数据通道:Host 在 webServer 注册的 /ollama-usage 前缀路由,经 Connection
 * RPC 信封协议调用(check / snapshot / forget)。
 *
 * 呈现层:手写 <style> 注入,颜色/字体/圆角/阴影/焦点环全部来自官方 --dsw-*
 * 主题变量,亮暗主题自动成立。唯一保留的硬编码颜色是双横条的两档紫色,按规范
 * 只作为「数据可视化强调色」用于横条填充,不扩散到任何通用控件。
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
    // 数据可视化强调色:仅用于侧栏双横条的填充(会话 5h 淡紫 / 周用量深紫),
    // 属于插件品牌识别,不用于按钮、边框、文字等通用控件。
    const SESSION_COLOR = '#b39df7'
    const WEEKLY_COLOR = '#7c66e8'

    const CSS = [
      // ── 面板骨架 ────────────────────────────────────────────────
      '.olusa-panel{display:flex;flex-direction:column;gap:12px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);box-sizing:border-box}',
      '.olusa-panel *{box-sizing:border-box}',
      '.olusa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0}',
      '.olusa-head-main{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.olusa-title{font:var(--dsw-font-s-14);font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.olusa-sub{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary)}',
      '.olusa-block{display:flex;flex-direction:column;gap:12px;min-width:0}',
      '.olusa-ver{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-caption)}',

      // ── 用量进度条 ──────────────────────────────────────────────
      '.olusa-barblock{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.olusa-barhead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0}',
      '.olusa-barlabel{font:var(--dsw-font-xxs-strong-12);font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.olusa-barval{font:var(--dsw-font-xxxs-strong-11);font-weight:500;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.olusa-bar{height:6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,var(--dsw-alias-bg-layer-2));overflow:hidden}',
      '.olusa-barfill{height:100%;border-radius:999px;transition:width .2s ease}',

      // ── 说明 / 分区 / 列表 ──────────────────────────────────────
      '.olusa-hint{margin:0;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);line-height:16px}',
      '.olusa-sec{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.olusa-sec-title{margin:0 0 2px;font:var(--dsw-font-xxxs-strong-11);font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.02em}',
      '.olusa-list{display:flex;flex-direction:column;min-width:0}',
      '.olusa-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0;font:var(--dsw-font-xxs-12)}',
      '.olusa-row:last-child{border-bottom:none}',
      '.olusa-rowname{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.olusa-rowval{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.olusa-link{color:var(--dsw-alias-link);text-decoration:none;border-radius:var(--dsw-radius-xs)}',
      '.olusa-link:hover{text-decoration:underline}',
      '.olusa-link:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.olusa-steps{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);line-height:18px}',

      // ── 输入 / 按钮 / 状态 ──────────────────────────────────────
      '.olusa-input{flex:1;min-width:0;height:30px;padding:0 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);font:var(--dsw-font-xs-13);transition:border-color .15s ease}',
      '.olusa-input:hover{border-color:var(--dsw-alias-border-l3)}',
      '.olusa-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      '.olusa-input:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.olusa-input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.olusa-login-title{font:var(--dsw-font-xs-strong-13);font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.olusa-rowbtns{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:2px}',
      '.olusa-btn{display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 12px;color:var(--dsw-alias-label-primary);background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);font:var(--dsw-font-xxs-strong-12);font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color .15s ease,border-color .15s ease,color .15s ease,opacity .15s ease}',
      '.olusa-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.olusa-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}',
      '.olusa-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.olusa-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.olusa-btn-primary{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}',
      '.olusa-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.olusa-btn-primary:active:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.olusa-btn-danger{color:var(--dsw-alias-state-error-primary)}',
      '.olusa-btn-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}',
      '.olusa-error{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);line-height:18px;word-break:break-word}',
      '.olusa-state{display:inline-flex;align-items:center;align-self:flex-start;padding:2px 8px;border-radius:999px;font:var(--dsw-font-xxxs-strong-11);font-weight:500;max-width:100%}',
      '.olusa-state[data-tone=ok]{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-state-success-primary) 20%,transparent)}',
      '.olusa-state[data-tone=err]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 20%,transparent)}',
      '.olusa-loading{display:flex;flex-direction:column;gap:8px}',
      '.olusa-skeleton{height:10px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-skeleton)}',
      '.olusa-skeleton.is-wide{width:56%}',

      // ── 侧栏双横条 ──────────────────────────────────────────────
      // 侧栏底部空间窄:用 5px 圆点把标签和填充色绑定,数值右对齐,进度条压到 5px;
      // 填充色由行内 --olusa-fill 注入,达到 70%/90% 阈值时切换警告/错误语义色,
      // 与面板里的用量配色保持一致。
      '.olusa-bars{display:flex;flex-direction:column;gap:10px;padding:0;width:100%;min-width:0;flex:1 1 auto;box-sizing:border-box;background:transparent;border:none}',
      '.olusa-barsrow{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.olusa-barshead{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}',
      '.olusa-barslabel{display:inline-flex;align-items:center;gap:5px;min-width:0;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.olusa-barsdot{width:5px;height:5px;border-radius:999px;flex:none;background:var(--olusa-fill,var(--dsw-alias-brand-primary))}',
      '.olusa-barsval{font:var(--dsw-font-xxxs-strong-11);font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);white-space:nowrap;min-width:34px;text-align:right}',
      '.olusa-minibar{height:5px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);overflow:hidden}',
      '.olusa-minibarfill{height:100%;border-radius:999px;background:var(--olusa-fill,var(--dsw-alias-brand-primary));transition:width .3s cubic-bezier(.2,.7,.3,1),background-color .2s ease}',
      '.olusa-barsrow[data-tone=warn] .olusa-barsval{color:var(--dsw-alias-state-warn-primary)}',
      '.olusa-barsrow[data-tone=error] .olusa-barsval{color:var(--dsw-alias-state-error-primary)}',
      '.olusa-barsempty{display:inline-flex;align-items:center;gap:6px;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.olusa-barsempty::before{content:"";width:5px;height:5px;border-radius:999px;flex:none;background:var(--dsw-alias-state-idle-primary)}',

      '@media (prefers-reduced-motion:reduce){.olusa-barfill,.olusa-minibarfill{transition:none}}',
    ].join('\n')

    function injectCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="' + CSS_TAG_ID + '"]') !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-ollama-usage'
      tag.dataset.pluginCss = CSS_TAG_ID
      tag.textContent = CSS
      ;(document.head || document.documentElement).appendChild(tag)
    }

    const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null)
    const colorFor = (p) => {
      if (p === null) return 'var(--dsw-alias-label-secondary)'
      if (p < 70) return 'var(--dsw-alias-state-success-primary)'
      if (p < 90) return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-state-error-primary)'
    }
    const fmtTime = (iso) => {      try {
        const d = new Date(iso)
        const p2 = (n) => (n < 10 ? '0' + n : String(n))
        return p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes())
      } catch (e) {
        return String(iso || '')
      }
    }
    /** 距重置时间还有多久,如 "2 小时 33 分钟"、"6 天 15 小时 38 分钟"。 */
    const fmtCountdown = (iso) => {
      try {
        const end = new Date(iso).getTime()
        if (!Number.isFinite(end)) return null
        const ms = end - Date.now()
        if (ms < 60000) return '不到 1 分钟'
        const totalMin = Math.floor(ms / 60000)
        const days = Math.floor(totalMin / 1440)
        const hours = Math.floor((totalMin % 1440) / 60)
        const mins = totalMin % 60
        const parts = []
        if (days > 0) parts.push(days + ' 天')
        if (hours > 0 || days > 0) parts.push(hours + ' 小时')
        parts.push(mins + ' 分钟')
        return parts.join(' ')
      } catch (e) {
        return null
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
        return React.createElement('div', { className: 'olusa-barblock' },
          React.createElement('div', { className: 'olusa-barhead' },
            React.createElement('span', { className: 'olusa-barlabel' }, props.label),
            React.createElement('span', { className: 'olusa-barval' }, p === null ? '暂无数据' : ('已用 ' + p + '% · 剩余 ' + remaining + '%'))
          ),
          React.createElement('div', { className: 'olusa-bar' },
            React.createElement('div', { className: 'olusa-barfill', style: { width: width + '%', background: colorFor(p) } })
          ),
          (props.resetText ? React.createElement('div', { className: 'olusa-hint' }, props.resetText) : null)
        )
      }

      function LoginBody(props) {
        return React.createElement('div', { className: 'olusa-block' },
          React.createElement('div', { className: 'olusa-login-title' }, '尚未登录 Ollama 账号'),
          React.createElement('ol', { className: 'olusa-steps' },
            React.createElement('li', null,
              '打开 ',
              React.createElement('a', { className: 'olusa-link', href: 'https://ollama.com/settings', target: '_blank', rel: 'noreferrer' }, 'ollama.com/settings'),
              ' 并登录（或注册）Ollama 账号'
            ),
            React.createElement('li', null,
              '在 API Keys 页 ',
              React.createElement('a', { className: 'olusa-link', href: 'https://ollama.com/settings/keys', target: '_blank', rel: 'noreferrer' }, 'settings/keys'),
              ' 创建一个 API Key'
            ),
            React.createElement('li', null, '把 Key 粘贴到下方点击「检测」；或先在终端运行 ollama signin / ollama login，再点「重新检测本地凭证」')
          ),
          React.createElement('input', { className: 'olusa-input', placeholder: '粘贴 API Key', value: props.tokenInput, onChange: (e) => props.onInput(e.target.value), spellCheck: false }),
          React.createElement('div', { className: 'olusa-rowbtns' },
            React.createElement('button', { className: 'olusa-btn olusa-btn-primary', disabled: props.busy || !props.tokenInput.trim(), onClick: () => props.onCheck(props.tokenInput.trim()) }, props.busy ? '检测中…' : '检测'),
            React.createElement('button', { className: 'olusa-btn', disabled: props.busy, onClick: () => props.onRetryLocal() }, '重新检测本地凭证')
          ),
          React.createElement('div', { className: 'olusa-hint' }, '检测成功后，Key 与用量快照会保存到 $DSH_HOME/storages/ollama-usage/usage.json（权限 600），跨对话 / 重启自动恢复并每 10 分钟自动刷新。')
        )
      }

      function UsageBody(props) {
        const d = props.data
        const sessionResetText = d.sessionResetAt ? fmtCountdown(d.sessionResetAt) : null
        const weeklyResetText = d.weeklyResetAt ? fmtCountdown(d.weeklyResetAt) : null
        const models = Array.isArray(d.models) ? d.models.slice(0, 5) : []
        const history = Array.isArray(props.history) ? props.history.slice(-5).reverse() : []
        return React.createElement('div', { className: 'olusa-block' },
          React.createElement(BarRow, { label: '会话用量（每 5 小时）', percent: d.sessionPercent, resetText: sessionResetText ? '还有 ' + sessionResetText + ' 重置' : null }),
          React.createElement(BarRow, { label: '本周用量（Weekly）', percent: d.weeklyPercent, resetText: weeklyResetText ? '还有 ' + weeklyResetText + ' 重置' : null }),
          (models.length > 0
            ? React.createElement('div', { className: 'olusa-sec' },
                React.createElement('div', { className: 'olusa-sec-title' }, '模型请求数（本周）'),
                React.createElement('div', { className: 'olusa-list' },
                  models.map((m) => React.createElement('div', { className: 'olusa-row', key: m.name },
                    React.createElement('span', { className: 'olusa-rowname', title: m.name }, m.name),
                    React.createElement('span', { className: 'olusa-rowval' }, String(m.requestCount) + ' 次')
                  )))
              )
            : null),
          (history.length > 0
            ? React.createElement('div', { className: 'olusa-sec' },
                React.createElement('div', { className: 'olusa-sec-title' }, '最近记录（会话用量）'),
                React.createElement('div', { className: 'olusa-list' },
                  history.map((h, i) => React.createElement('div', { className: 'olusa-row', key: String(i) },
                    React.createElement('span', { className: 'olusa-rowname' }, fmtTime(h.at)),
                    React.createElement('span', { className: 'olusa-rowval' }, (h.sessionPercent === null || h.sessionPercent === undefined) ? '—' : (h.sessionPercent + '%'))
                  )))
              )
            : null),
          (props.updatedAt
            ? React.createElement('div', { className: 'olusa-hint' }, '上次更新：' + fmtTime(props.updatedAt) + '（每 10 分钟自动刷新）')
            : null),
          React.createElement('div', {
            className: 'olusa-state',
            'data-tone': props.persisted ? 'ok' : 'err',
            title: props.persisted ? '$DSH_HOME/storages/ollama-usage/usage.json' : undefined,
          }, props.persisted ? '✓ 已持久化到本地' : '⚠ 未能写入本地文件')
        )
      }

      /** 加载骨架:首屏 snapshot 落定前占位,避免登录表单闪现。 */
      function LoadingBody() {
        return React.createElement('div', { className: 'olusa-loading', role: 'status', 'aria-live': 'polite' },
          React.createElement('div', { className: 'olusa-skeleton is-wide' }),
          React.createElement('div', { className: 'olusa-skeleton' })
        )
      }

      function OllamaUsagePanel() {
        const [phase, setPhase] = React.useState('loading')
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
            // 无 usage 快照时留在登录引导，避免“无错误却显示查询失败”的 usage/error 分支。
            setPhase(v.usage ? 'usage' : 'login')
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
              // snapshot 数据读自磁盘文件(插件无内存缓存),必然已持久化;服务端字段优先,缺省按不变式置 true
              setPersisted(typeof res.value.persisted === 'boolean' ? res.value.persisted : true)
            } else {
              // 首屏无数据(未登录 / 无快照)落到登录引导;已有数据时保持当前视图。
              setPhase((current) => (current === 'loading' ? 'login' : current))
            }
          }).catch(() => {
            if (!disposed) setPhase((current) => (current === 'loading' ? 'login' : current))
          })
          refresh()
          const dispose = ctx.interval(refresh, 60000)
          return () => { disposed = true; dispose() }
        }, [])

        const body = phase === 'loading'
          ? React.createElement(LoadingBody)
          : phase === 'login'
            ? React.createElement(LoginBody, { tokenInput: tokenInput, onInput: setTokenInput, onCheck: doCheck, onRetryLocal: () => doCheck(''), busy: busy })
            : phase === 'usage' && data
              ? React.createElement('div', { className: 'olusa-block' },
                  React.createElement(UsageBody, { data: data, history: history, updatedAt: updatedAt, persisted: persisted }),
                  (error ? React.createElement('div', { className: 'olusa-error' }, String(error)) : null),
                  React.createElement('div', { className: 'olusa-rowbtns' },
                    React.createElement('button', { className: 'olusa-btn olusa-btn-danger', disabled: busy, onClick: () => doForget() }, '清除已存 Key')
                  )
                )
              : React.createElement('div', { className: 'olusa-block' },
                  React.createElement('div', { className: 'olusa-error' }, String(error || '查询失败')),
                  React.createElement('div', { className: 'olusa-hint' },
                    '请确认已登录：',
                    React.createElement('a', { className: 'olusa-link', href: 'https://ollama.com/settings', target: '_blank', rel: 'noreferrer' }, 'ollama.com/settings'),
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
            React.createElement('div', { className: 'olusa-head-main' },
              React.createElement('span', { className: 'olusa-title' }, '⚡ Ollama 用量'),
              React.createElement('span', { className: 'olusa-sub' }, '会话 5h · 周用量 · 每 10 分钟自动刷新')
            ),
            React.createElement('button', { className: 'olusa-btn', disabled: busy, onClick: () => doCheck('') }, busy ? '查询中…' : '刷新')
          ),
          body,
          React.createElement('div', { className: 'olusa-ver' }, 'dsh-ollama-usage · v0.1.15')
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
        const fmtPct = (p) => {
          if (p === null) return '—'
          const v = Math.round(p * 10) / 10
          return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + '%'
        }
        const resetNote = (iso) => {
          const text = iso ? fmtCountdown(iso) : null
          return text ? ' · ' + text + '后重置' : ''
        }
        const toneOf = (p) => (p !== null && p >= 90 ? 'error' : p !== null && p >= 70 ? 'warn' : undefined)
        const fillOf = (p, base) => (p === null
          ? 'var(--dsw-alias-state-idle-primary)'
          : p >= 90
            ? 'var(--dsw-alias-state-error-primary)'
            : p >= 70
              ? 'var(--dsw-alias-state-warn-primary)'
              : base)
        // 极小百分比也要留下可见的圆头:0.2% 在 120px 容器里不足 1px。
        const widthOf = (p) => (p === null || p <= 0 ? 0 : Math.max(p, 2))
        const tip = sp === null && wp === null
          ? 'Ollama 用量：未登录，点击插件列表中的 dsh-ollama-usage 完成登录'
          : 'Ollama 用量 · 会话 5h ' + fmtPct(sp) + resetNote(data && data.sessionResetAt) +
            ' · 本周 ' + fmtPct(wp) + resetNote(data && data.weeklyResetAt) +
            (updatedAt ? ' · 更新于 ' + fmtTime(updatedAt) : '')
        const rows = [
          { label: '会话 5h', aria: '会话 5 小时用量', p: sp, base: SESSION_COLOR, resetAt: data && data.sessionResetAt },
          { label: '周用量', aria: '本周用量', p: wp, base: WEEKLY_COLOR, resetAt: data && data.weeklyResetAt },
        ]
        if (sp === null && wp === null) {
          return React.createElement('div', { className: 'olusa-bars', title: tip, role: 'group', 'aria-label': 'Ollama 用量' },
            React.createElement('span', { className: 'olusa-barsempty' }, 'Ollama 未登录'))
        }
        return React.createElement('div', { className: 'olusa-bars', title: tip, role: 'group', 'aria-label': 'Ollama Cloud 用量' },
          rows.map((b) => {
            const tone = toneOf(b.p)
            const fill = fillOf(b.p, b.base)
            return React.createElement('div', { className: 'olusa-barsrow', key: b.label, 'data-tone': tone },
              React.createElement('div', { className: 'olusa-barshead' },
                React.createElement('span', { className: 'olusa-barslabel' },
                  React.createElement('span', { className: 'olusa-barsdot', style: { '--olusa-fill': fill } }),
                  b.label
                ),
                React.createElement('span', { className: 'olusa-barsval' }, fmtPct(b.p))
              ),
              React.createElement('div', {
                className: 'olusa-minibar',
                role: 'progressbar',
                'aria-label': b.aria,
                'aria-valuemin': 0,
                'aria-valuemax': 100,
                'aria-valuenow': b.p === null ? 0 : Math.round(b.p),
              },
                React.createElement('div', { className: 'olusa-minibarfill', style: { width: widthOf(b.p) + '%', '--olusa-fill': fill } })
              )
            )
          })
        )
      }

      // ── 槽位注册 ──────────────────────────────────────────────────

      slots.inject('tool.view.cordis', () => slots.register(
        { name: 'tool.view.cordis', key: 'self' },
        () => React.createElement(OllamaUsagePanel)
      ))

      // 配置面板挂在本插件自己的详情页上(插件列表 → dsh-ollama-usage),渲染位置
      // 是页面的描述与组件行之间。该 keyed slot 只在注册了等于包名的 key 时才由
      // 插件管理页渲染(dsh-client-ui-plugin-manager: configured =
      // ledger.bundles.has(pkg.name)),没有原生兜底表单。bundle 页可能含多个条目,
      // 因此页面不传宿主 form,面板自持数据通道(/ollama-usage 前缀路由)。
      slots.inject('plugins.bundle.config', () => slots.register(
        { name: 'plugins.bundle.config', key: 'dsh-ollama-usage' },
        (props) => (props && props.view === 'summary' ? null : React.createElement(OllamaUsagePanel))
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
