/* deepseek-harness-wallet client half: the composer-dock chip.
 * Loaded through the client module loader (CJS wrapper). The loader id MUST
 * equal the package name: client-modules verifies the boot graph row id
 * (the package name) against the id registered via __ModuleLoader__.load. */
window.__ModuleLoader__.load({
  id: 'deepseek-harness-wallet',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var React = require('react')

    var POLL_MS = 15000
    var CONFIRM_KEY = 'dsh-wallet-recharge-confirmed'

    var css = [
      '.dshw_chip{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;height:22px;color:var(--dsw-alias-label-primary,#1f2328);cursor:pointer;white-space:nowrap;border-radius:999px;align-items:center;gap:6px;padding:0 8px;font-size:12px;line-height:1;display:inline-flex;position:relative}',
      '.dshw_chip:hover{border-color:var(--dsw-alias-brand-primary,#4aa3ff)}',
      '.dshw_chipLow{border-color:var(--dsw-alias-state-error-primary,#e5534b);color:var(--dsw-alias-state-error-primary,#e5534b);animation:dshwPulse 1.8s infinite}',
      '@keyframes dshwPulse{0%,100%{box-shadow:0 0 0 0 rgba(229,83,75,.45)}50%{box-shadow:0 0 0 5px rgba(229,83,75,0)}}',
      '.dshw_sep{opacity:.45}',
      '.dshw_recharge{color:var(--dsw-alias-brand-primary,#4aa3ff);text-decoration:none;border-left:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));padding-left:6px}',
      '.dshw_panel{z-index:40;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-overlay,#ffffff);min-width:240px;max-width:300px;color:var(--dsw-alias-label-primary,#1f2328);border-radius:8px;flex-direction:column;gap:6px;padding:10px 12px;font-size:12px;display:flex;position:absolute;top:calc(100% + 6px);right:0;box-shadow:0 4px 12px #0000004d}',
      '.dshw_row{justify-content:space-between;align-items:center;gap:10px;display:flex}',
      '.dshw_title{font-weight:600;opacity:.9}',
      '.dshw_muted{color:var(--dsw-alias-label-tertiary,#6b7280)}',
      '.dshw_divider{border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));margin-top:2px;padding-top:6px}',
      '.dshw_input{background:var(--dsw-alias-bg-layer-1,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));color:var(--dsw-alias-label-primary,#1f2328);border-radius:5px;padding:3px 6px;width:56px;font-size:12px}',
      '.dshw_btn{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;color:var(--dsw-alias-label-primary,#1f2328);border-radius:5px;padding:3px 8px;font-size:12px;cursor:pointer}',
      '.dshw_btnPrimary{background:var(--dsw-alias-brand-primary,#4aa3ff);border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#ffffff)}',
      '.dshw_overlay{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-drop,rgba(0,0,0,.55));display:flex;align-items:center;justify-content:center;z-index:60}',
      '.dshw_overlayBox{background:var(--dsw-alias-bg-overlay,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));color:var(--dsw-alias-label-primary,#1f2328);border-radius:8px;padding:14px 18px;max-width:320px;font-size:13px;line-height:1.7}',
      '.dshw_overlayRow{margin-top:10px;display:flex;gap:8px;justify-content:flex-end}',

      '.dshw_float{position:fixed;z-index:80;min-width:230px;max-width:280px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1f2328);border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:6px;padding:10px 12px;font-size:12px;user-select:none}',
      '.dshw_floatHeader{display:flex;align-items:center;justify-content:space-between;cursor:move;font-weight:600;opacity:.9;touch-action:none}',
      '.dshw_floatBtn{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;color:inherit;border-radius:5px;width:22px;height:20px;font-size:12px;line-height:1;cursor:pointer;padding:0}',
      '.dshw_floatBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.dshw_dot{position:fixed;z-index:80;width:36px;height:36px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1f2328);font-size:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.2);user-select:none;touch-action:none}',
      '.dshw_dotLow{border-color:var(--dsw-alias-state-error-primary,#e5534b);color:var(--dsw-alias-state-error-primary,#e5534b)}'
    ].join('')

    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin="deepseek-harness-wallet"]') === null) {
      var tag = document.createElement('style')
      tag.dataset.plugin = 'deepseek-harness-wallet'
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function fmtTokens(n) {
      n = n || 0
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
      if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
      return String(n)
    }

    function fmtMoney(n) {
      if (n === null || n === undefined || Number.isNaN(n)) return '--'
      return n.toFixed(2)
    }

    function totalTokens(counters) {
      if (!counters) return 0
      return (counters.input || 0) + (counters.output || 0) + (counters.cacheRead || 0) + (counters.cacheWrite || 0)
    }

    function WalletChip(props) {
      props = props || {}
      var sessionId = props.sessionId
      var dataRef = React.useRef(null)
      var notifiedRef = React.useRef(false)
      var chipRef = React.useRef(null)
      var panelRef = React.useRef(null)
      var [alignLeft, setAlignLeft] = React.useState(false)
      var [data, setData] = React.useState(null)
      var [open, setOpen] = React.useState(false)
      var [thresholdDraft, setThresholdDraft] = React.useState(null)
      var [confirming, setConfirming] = React.useState(false)
      var [floated, setFloated] = React.useState(function () {
        try { return window.localStorage.getItem('dshw-float-mode') === 'float' || window.localStorage.getItem('dshw-float-mode') === 'dot' } catch (e) { return false }
      })
      var [minimized, setMinimized] = React.useState(function () {
        try { return window.localStorage.getItem('dshw-float-mode') === 'dot' } catch (e) { return false }
      })
      var [floatPos, setFloatPos] = React.useState(null)
      var floatRef = React.useRef(null)
      var dragRef = React.useRef(null)
      var didDragRef = React.useRef(false)

      React.useEffect(function () {
        var alive = true
        function tick() {
          var url = '/api/wallet/snapshot'
          if (sessionId) url = url + '?session=' + encodeURIComponent(sessionId)
          fetch(url).then(function (resp) {
            if (!resp.ok) throw new Error(String(resp.status))
            return resp.json()
          }).then(function (json) {
            if (!alive) return
            dataRef.current = json
            setData(json)
            if (thresholdDraft === null && json.threshold !== undefined && json.threshold !== null) {
              setThresholdDraft(json.threshold.toFixed(2))
            }
            if (json.lowBalance) {
              if (!notifiedRef.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                notifiedRef.current = true
                try {
                  new Notification('DeepSeek \u4f59\u989d\u4e0d\u8db3', { body: '\u4f59\u989d\u5df2\u4f4e\u4e8e\u63d0\u9192\u7ebf ' + json.threshold + ' \u5143', tag: 'dsh-wallet-low' })
                } catch (e) { /* ignore */ }
              }
            } else {
              notifiedRef.current = false
            }
          }).catch(function () {
            if (alive) setData({ ok: false })
          })
        }
        tick()
        var timer = setInterval(tick, POLL_MS)
        return function () { alive = false; clearInterval(timer) }
      }, [])
      React.useEffect(function () {
        function onMove(event) {
          var d = dragRef.current
          if (d === null) return
          didDragRef.current = true
          var x = Math.max(4, Math.min(window.innerWidth - d.w - 4, event.clientX - d.dx))
          var y = Math.max(4, Math.min(window.innerHeight - d.h - 4, event.clientY - d.dy))
          setFloatPos({ x: x, y: y })
        }
        function onUp() {
          if (dragRef.current === null) return
          dragRef.current = null
          try { window.localStorage.setItem('dshw-float-pos', floatPos.x + ',' + floatPos.y) } catch (e) { /* ignore */ }
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        return function () {
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
      })

      React.useEffect(function () {
        if (!open) return
        function onDocDown(event) {
          var t = event.target
          if (chipRef.current && chipRef.current.contains(t)) return
          if (panelRef.current && panelRef.current.contains(t)) return
          setOpen(false)
        }
        document.addEventListener('mousedown', onDocDown)
        return function () { document.removeEventListener('mousedown', onDocDown) }
      }, [open])

      function readSavedPos() {
        try {
          var raw = window.localStorage.getItem('dshw-float-pos')
          if (raw === null) return null
          var parts = raw.split(',')
          var x = Number.parseFloat(parts[0]); var y = Number.parseFloat(parts[1])
          if (Number.isFinite(x) && Number.isFinite(y)) {
            var maxX = Math.max(4, window.innerWidth - 300)
            var maxY = Math.max(4, window.innerHeight - 40)
            return { x: Math.min(Math.max(4, x), maxX), y: Math.min(Math.max(4, y), maxY) }
          }
        } catch (e) { /* ignore */ }
        return null
      }

      function onFloatDown(event) {
        if (event.button !== 0) return
        var target = event.target
        if (target && target.closest && target.closest('button,input,a')) return
        var node = floatRef.current
        if (node === null) return
        var rect = node.getBoundingClientRect()
        dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, w: rect.width, h: rect.height }
        didDragRef.current = false
        event.preventDefault()
      }

      React.useEffect(function () {
        try {
          var mode = 'chip'
          if (floated) mode = minimized ? 'dot' : 'float'
          window.localStorage.setItem('dshw-float-mode', mode)
        } catch (e) { /* ignore */ }
      }, [floated, minimized])

      function requestNotify() {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          try { Notification.requestPermission() } catch (e) { /* ignore */ }
        }
      }

      function saveThreshold() {
        var value = Number.parseFloat(thresholdDraft)
        if (!Number.isFinite(value)) return
        value = Math.min(100000, Math.max(0, Math.round(value * 100) / 100))
        fetch('/api/wallet/threshold', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ threshold: value })
        }).then(function (resp) { return resp.json() }).then(function (json) {
          if (json && json.ok) {
            setThresholdDraft(json.threshold.toFixed(2))
            if (dataRef.current) { dataRef.current.threshold = json.threshold; setData(Object.assign({}, dataRef.current)) }
          }
        }).catch(function () { /* ignore */ })
      }

      function clearSession() {
        if (!sessionId) return
        fetch('/api/wallet/clear-session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: sessionId })
        }).then(function () {
          var url = '/api/wallet/snapshot'
          if (sessionId) url = url + '?session=' + encodeURIComponent(sessionId)
          fetch(url).then(function (r) { return r.json() }).then(function (json) { setData(json) }).catch(function () {})
        }).catch(function () {})
      }

      function refreshBalance() {
        fetch('/api/wallet/refresh', { method: 'POST' }).then(function () {
          setTimeout(function () {
            var url = '/api/wallet/snapshot'
            if (sessionId) url = url + '?session=' + encodeURIComponent(sessionId)
            fetch(url).then(function (r2) { return r2.json() }).then(function (json) { setData(json) }).catch(function () { /* ignore */ })
          }, 300)
        }).catch(function () { /* ignore */ })
      }

      function goRecharge() {
        setConfirming(false)
        try { window.localStorage.setItem(CONFIRM_KEY, '1') } catch (e) { /* ignore */ }
        var url = data && data.rechargeUrl ? data.rechargeUrl : 'https://platform.deepseek.com/top_up'
        window.open(url, '_blank', 'noopener,noreferrer')
      }

      function onRechargeClick(event) {
        if (event && event.stopPropagation) event.stopPropagation()
        if (event && event.preventDefault) event.preventDefault()
        var confirmed = false
        try { confirmed = window.localStorage.getItem(CONFIRM_KEY) === '1' } catch (e) { /* ignore */ }
        if (confirmed) goRecharge()
        else setConfirming(true)
      }

      var snapshot = data || {}
      var bal = snapshot.balance || {}
      var session = snapshot.session || {}
      var official = session.official || {}
      var third = session.third || {}
      var officialTokens = official.tokens ? totalTokens(official.tokens) : 0
      var thirdTokens = third.tokens ? totalTokens(third.tokens) : 0
      var low = snapshot.lowBalance === true

      var chipTextParts = []
      chipTextParts.push(React.createElement('span', { key: 'bal' }, '余额 ' + (bal.total === null || bal.total === undefined ? '--' : fmtMoney(bal.total))))
      if (official.cost !== undefined && official.cost !== null) {
        chipTextParts.push(React.createElement('span', { key: 'cost' }, '\u672c\u573a ' + fmtMoney(official.cost)))
      }
      chipTextParts.push(React.createElement('span', { key: 'off' }, '\u5b98 ' + fmtTokens(officialTokens)))
      chipTextParts.push(React.createElement('span', { key: 'sep' }, '|'))
      chipTextParts.push(React.createElement('span', { key: 'third' }, '\u4e09\u65b9 ' + fmtTokens(thirdTokens)))
      chipTextParts.push(React.createElement('a', {
        key: 'recharge',
        className: 'dshw_recharge',
        href: snapshot.rechargeUrl || 'https://platform.deepseek.com/top_up',
        title: 'DeepSeek \u5f00\u653e\u5e73\u53f0 \u00b7 \u5b98\u65b9\u5145\u503c\u9875',
        onClick: onRechargeClick
      }, '\u2197\u5145'))

      var chip = React.createElement('span', {
        ref: chipRef,
        className: low ? 'dshw_chip dshw_chipLow' : 'dshw_chip',
        title: 'deepseek-harness-wallet \u00b7 \u70b9\u51fb\u67e5\u770b\u660e\u7ec6',
        onClick: function (event) {
          requestNotify()
          if (floated) { setFloated(false); setOpen(true); return }
          if (!open && chipRef.current) {
            var rect = chipRef.current.getBoundingClientRect()
            setAlignLeft(rect.left > rect.right - rect.left + 200)
          }
          setOpen(!open)
        }
      }, chipTextParts)

      if (!open && !floated) return chip

      var balanceRows = []
      if (bal.available && bal.balances && bal.balances.length > 0) {
        bal.balances.forEach(function (info) {
          balanceRows.push(React.createElement('div', { key: info.currency, className: 'dshw_row' },
            React.createElement('span', { className: 'dshw_muted' }, '\u4f59\u989d (' + info.currency + ')'),
            React.createElement('span', null, '\u00a5' + String(info.total_balance) + '  (\u5145\u503c ' + String(info.topped_up_balance) + ' / \u8d60\u9001 ' + String(info.granted_balance) + ')')
          ))
        })
      } else {
        balanceRows.push(React.createElement('div', { key: 'no-bal', className: 'dshw_row dshw_muted' }, bal.error ? ('\u4f59\u989d\u4e0d\u53ef\u7528: ' + bal.error) : '\u4f59\u989d\u67e5\u8be2\u4e2d\u2026'))
      }

      var officialRows = []
      if (official.tokens) {
        officialRows.push(React.createElement('div', { key: 'o-t', className: 'dshw_row' },
          React.createElement('span', { className: 'dshw_muted' }, '\u5b98\u65b9 token'),
          React.createElement('span', null, '\u8f93\u5165 ' + fmtTokens(official.tokens.input) + ' \u00b7 \u7f13\u5b58\u8bfb ' + fmtTokens(official.tokens.cacheRead) + ' \u00b7 \u8f93\u51fa ' + fmtTokens(official.tokens.output))))
      }
      officialRows.push(React.createElement('div', { key: 'o-c', className: 'dshw_row' },
        React.createElement('span', { className: 'dshw_muted' }, '\u672c\u4f1a\u8bdd\u82b1\u8d39'),
        React.createElement('span', null, official.cost === null ? '\u672a\u5b9a\u4ef7\u6a21\u578b' : '\u00a5' + fmtMoney(official.cost))))

      var thirdRows = []
      thirdRows.push(React.createElement('div', { key: 't-t', className: 'dshw_row' },
        React.createElement('span', { className: 'dshw_muted' }, '\u7b2c\u4e09\u65b9 token'),
        React.createElement('span', null, '\u8f93\u5165 ' + fmtTokens(third.tokens && third.tokens.input) + ' \u00b7 \u7f13\u5b58\u8bfb ' + fmtTokens(third.tokens && third.tokens.cacheRead) + ' \u00b7 \u8f93\u51fa ' + fmtTokens(third.tokens && third.tokens.output))))

      var thresholdInput = React.createElement('input', {
        className: 'dshw_input',
        type: 'number',
        min: '0',
        step: 'any',
        value: thresholdDraft === null ? '' : thresholdDraft,
        onChange: function (event) { setThresholdDraft(event.target.value) }
      })

      var floatBtnRow = React.createElement('div', { className: 'dshw_row', style: { justifyContent: 'flex-end', marginTop: '2px' } },
        React.createElement('button', {
          className: 'dshw_btn',
          style: { height: '22px', fontSize: '11px', padding: '0 10px' },
          title: '浮动窗口模式：可拖动、可最小化',
          onClick: function () { setFloated(true); setOpen(false) }
        }, '◳ 浮动'))

      var panel = React.createElement('div', {
        ref: panelRef,
        className: 'dshw_panel',
        style: alignLeft ? { left: 0, right: 'auto' } : undefined,
        onClick: function (e) { e.stopPropagation() }
      },
        floatBtnRow,
        React.createElement('div', { className: 'dshw_title' }, '\u5b98\u65b9 DeepSeek'),
        balanceRows,
        officialRows,
        React.createElement('div', { className: 'dshw_divider' }),
        React.createElement('div', { className: 'dshw_title' }, '\u7b2c\u4e09\u65b9\u5408\u8ba1'),
        thirdRows,
        React.createElement('div', { className: 'dshw_divider' }),
        React.createElement('div', { className: 'dshw_row' },
          React.createElement('span', { className: 'dshw_muted' }, '\u4f59\u989d\u63d0\u9192\u9608\u503c (\u00a5, 0=\u5173)'),
          thresholdInput),
        React.createElement('div', { className: 'dshw_row' },
          React.createElement('button', { className: 'dshw_btn', onClick: refreshBalance }, '\u5237\u65b0\u4f59\u989d'),
          React.createElement('button', { className: 'dshw_btn dshw_btnPrimary', onClick: saveThreshold }, '\u4fdd\u5b58\u9608\u503c')),
        React.createElement('a', {
          className: 'dshw_btn dshw_btnPrimary',
          href: snapshot.rechargeUrl || 'https://platform.deepseek.com/top_up',
          style: { textDecoration: 'none', textAlign: 'center' },
          onClick: onRechargeClick
        }, '\u2197 \u53bb\u5b98\u65b9\u5145\u503c'),
        React.createElement('div', { className: 'dshw_divider' }),
        React.createElement('button', {
          className: 'dshw_btn',
          style: { width: '100%' },
          onClick: function () {
            if (window.confirm('\u786e\u8ba4\u6e05\u9664\u672c\u4f1a\u8bdd\u7684 token \u548c\u82b1\u8d39\u8bb0\u5f55\uff1f\u4e0d\u53ef\u6062\u590d\u3002')) clearSession()
          }
        }, '\u6e05\u9664\u672c\u4f1a\u8bdd\u6570\u636e')
      )

      var confirmOverlay = null
      if (confirming) {
        confirmOverlay = React.createElement('div', { className: 'dshw_overlay', onClick: function () { setConfirming(false) } },
          React.createElement('div', { className: 'dshw_overlayBox', onClick: function (e) { e.stopPropagation() } },
            React.createElement('div', null, '\u5c06\u6253\u5f00 DeepSeek \u5f00\u653e\u5e73\u53f0\u5b98\u65b9\u5145\u503c\u9875\uff1a'),
            React.createElement('div', { className: 'dshw_muted' }, 'https://platform.deepseek.com/top_up'),
            React.createElement('div', null, '\u767b\u5f55\u4e0e\u652f\u4ed8\u7531\u5b98\u65b9\u9875\u9762\u5b8c\u6210\uff0c\u672c\u63d2\u4ef6\u4e0d\u63a5\u89e6\u8d26\u53f7\u4e0e\u652f\u4ed8\u4fe1\u606f\u3002'),
            React.createElement('div', { className: 'dshw_overlayRow' },
              React.createElement('button', { className: 'dshw_btn', onClick: function () { setConfirming(false) } }, '\u53d6\u6d88'),
              React.createElement('button', { className: 'dshw_btn dshw_btnPrimary', onClick: goRecharge }, '\u53bb\u5145\u503c'))))
      }

      if (floated) {
        if (minimized) {
          var dotPos = floatPos || readSavedPos() || { x: window.innerWidth - 300, y: 80 }
          var dot = React.createElement('div', {
            ref: floatRef,
            className: low ? 'dshw_dot dshw_dotLow' : 'dshw_dot',
            style: { left: dotPos.x, top: dotPos.y },
            title: '钱包 · 点击展开',
            onMouseDown: onFloatDown,
            onClick: function () { if (didDragRef.current !== true) setMinimized(false) }
          }, '¥' + (bal.total === null || bal.total === undefined ? '--' : fmtMoney(bal.total)))
          return React.createElement(React.Fragment, null, chip, dot, confirmOverlay)
        }
        var winPos = floatPos || readSavedPos() || { x: window.innerWidth - 300, y: 80 }
        var floatPanel = React.createElement('div', {
          ref: floatRef,
          className: 'dshw_float',
          style: { left: winPos.x, top: winPos.y },
          onMouseDown: onFloatDown
        },
          React.createElement('div', { className: 'dshw_floatHeader' },
            React.createElement('span', null, '钱包'),
            React.createElement('span', null,
              React.createElement('button', {
                className: 'dshw_floatBtn',
                title: '最小化为圆点',
                onClick: function (e) { e.stopPropagation(); setMinimized(true) }
              }, '–'),
              React.createElement('button', {
                className: 'dshw_floatBtn',
                style: { marginLeft: '4px' },
                title: '收回标签模式',
                onClick: function (e) { e.stopPropagation(); setFloated(false); setOpen(false) }
              }, '×'))),
          balanceRows,
          officialRows,
          React.createElement('div', { className: 'dshw_divider' }),
          thirdRows,
          React.createElement('div', { className: 'dshw_divider' }),
          React.createElement('div', { className: 'dshw_row' },
            React.createElement('span', { className: 'dshw_muted' }, '阈值(¥,0=关)'),
            thresholdInput),
          React.createElement('div', { className: 'dshw_row' },
            React.createElement('button', { className: 'dshw_btn', onClick: refreshBalance }, '刷新'),
            React.createElement('button', { className: 'dshw_btn dshw_btnPrimary', onClick: saveThreshold }, '保存')),
          React.createElement('a', {
            className: 'dshw_btn dshw_btnPrimary',
            href: snapshot.rechargeUrl || 'https://platform.deepseek.com/top_up',
            style: { textDecoration: 'none', textAlign: 'center' },
            onClick: onRechargeClick
          }, '↗ 充值'),
          React.createElement('button', {
            className: 'dshw_btn', style: { width: '100%' },
            onClick: function () {
              if (window.confirm('确认清除本会话的 token 和花费记录？不可恢复。')) clearSession()
            }
          }, '清除本会话')
        )
        return React.createElement(React.Fragment, null, chip, floatPanel, confirmOverlay)
      }
      return React.createElement(React.Fragment, null, chip, panel, confirmOverlay)
    }

    var inject = ['slots']

    function apply(ctx) {
      ctx.inject(['slots', 'conversation'], function (scope) {
        scope.effect(function () {
          return scope.slots.register({
            name: 'conversation.composer.dock',
            id: 'wallet',
            order: 130,
            inject: function () { return {} }
          }, WalletChip)
        }, 'dsh-wallet: chip registration')
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
