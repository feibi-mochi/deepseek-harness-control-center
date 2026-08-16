/* deepseek-harness-wallet client half: the composer input wallet chip
 * with multi-account management.
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
    var useLayoutEffect = React.useLayoutEffect || React.useEffect

    var POLL_MS = 15000
    var CONFIRM_KEY = 'dsh-wallet-recharge-confirmed'

    var css = [
      '.dshw_chip{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;height:22px;color:var(--dsw-alias-label-primary,#1f2328);white-space:nowrap;border-radius:999px;align-items:stretch;font-size:12px;line-height:1;display:inline-flex;position:relative}',
      '.dshw_chip:hover,.dshw_chip:focus-within{border-color:var(--dsw-alias-brand-primary,#4aa3ff)}',
      '.dshw_chipLow{border-color:var(--dsw-alias-state-error-primary,#e5534b);color:var(--dsw-alias-state-error-primary,#e5534b);animation:dshwPulse 1.8s infinite}',
      '@keyframes dshwPulse{0%,100%{box-shadow:0 0 0 0 rgba(229,83,75,.45)}50%{box-shadow:0 0 0 5px rgba(229,83,75,0)}}',
      '.dshw_sep{opacity:.45}',
      '.dshw_chipMain,.dshw_recharge{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;align-items:center;display:inline-flex;gap:6px;margin:0}',
      '.dshw_chipMain{padding:0 7px;border-radius:999px 0 0 999px}',
      '.dshw_recharge{color:var(--dsw-alias-brand-primary,#4aa3ff);border-left:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));padding:0 7px 0 6px;border-radius:0 999px 999px 0}',
      '.dshw_chipMain:focus-visible,.dshw_recharge:focus-visible,.dshw_btn:focus-visible,.dshw_floatBtn:focus-visible,.dshw_dot:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4aa3ff);outline-offset:2px}',
      '.dshw_panel{z-index:40;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-overlay,#ffffff);box-sizing:border-box;width:min(300px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;color:var(--dsw-alias-label-primary,#1f2328);border-radius:8px;flex-direction:column;gap:6px;padding:10px 12px;font-size:12px;display:flex;position:fixed;box-shadow:0 4px 12px #0000004d}',
      '.dshw_row{justify-content:space-between;align-items:center;gap:10px;display:flex}',
      '.dshw_row>span:last-child{text-align:right;overflow-wrap:anywhere}',
      '.dshw_title{font-weight:600;opacity:.9}',
      '.dshw_muted{color:var(--dsw-alias-label-tertiary,#6b7280)}',
      '.dshw_divider{border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));margin-top:2px;padding-top:6px}',
      '.dshw_input{background:var(--dsw-alias-bg-layer-1,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));color:var(--dsw-alias-label-primary,#1f2328);border-radius:5px;padding:3px 6px;width:56px;font-size:12px}',
      '.dshw_btn{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;color:var(--dsw-alias-label-primary,#1f2328);border-radius:5px;padding:3px 8px;font-size:12px;cursor:pointer}',
      '.dshw_btnPrimary{background:var(--dsw-alias-brand-primary,#4aa3ff);border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#ffffff)}',
      '.dshw_overlay{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-drop,rgba(0,0,0,.55));display:flex;align-items:center;justify-content:center;z-index:100}',
      '.dshw_overlayBox{background:var(--dsw-alias-bg-overlay,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));color:var(--dsw-alias-label-primary,#1f2328);border-radius:8px;padding:14px 18px;width:min(320px,calc(100vw - 32px));box-sizing:border-box;font-size:13px;line-height:1.7}',
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

    function fmtCurrency(value, currency) {
      var number = typeof value === 'number' ? value : Number.parseFloat(value)
      if (!Number.isFinite(number)) return '--'
      var code = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency.toUpperCase()) ? currency.toUpperCase() : 'CNY'
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency', currency: code, currencyDisplay: 'narrowSymbol',
          minimumFractionDigits: 2, maximumFractionDigits: 2
        }).format(number)
      } catch (e) {
        return code + ' ' + number.toFixed(2)
      }
    }

    function computePanelPosition(chipRect, panelRect, viewportWidth, viewportHeight) {
      var margin = 8
      var gap = 6
      var left = Math.max(margin, Math.min(chipRect.left, viewportWidth - panelRect.width - margin))
      var below = chipRect.bottom + gap
      var above = chipRect.top - panelRect.height - gap
      var top = below + panelRect.height <= viewportHeight - margin ? below : Math.max(margin, above)
      return { left: left, top: top, visibility: 'visible' }
    }

    function clampPosition(pos, width, height, viewportWidth, viewportHeight) {
      return {
        x: Math.max(4, Math.min(viewportWidth - width - 4, pos.x)),
        y: Math.max(4, Math.min(viewportHeight - height - 4, pos.y))
      }
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
      var chipButtonRef = React.useRef(null)
      var panelRef = React.useRef(null)
      var confirmRef = React.useRef(null)
      var cancelButtonRef = React.useRef(null)
      var confirmButtonRef = React.useRef(null)
      var restoreFocusRef = React.useRef(null)
      var thresholdInitializedRef = React.useRef(false)
      var [data, setData] = React.useState(null)
      var [open, setOpen] = React.useState(false)
      var [panelStyle, setPanelStyle] = React.useState({ visibility: 'hidden' })
      var [thresholdDraft, setThresholdDraft] = React.useState(null)
      var [confirming, setConfirming] = React.useState(false)
      var [accounts, setAccounts] = React.useState(null)
      var [accountsError, setAccountsError] = React.useState(null)
      var [accountNotice, setAccountNotice] = React.useState(null)
      var [addName, setAddName] = React.useState('')
      var [addKey, setAddKey] = React.useState('')
      var [adding, setAdding] = React.useState(false)
      var [switchingId, setSwitchingId] = React.useState(null)
      var [floated, setFloated] = React.useState(function () {
        try { return window.localStorage.getItem('dshw-float-mode') === 'float' || window.localStorage.getItem('dshw-float-mode') === 'dot' } catch (e) { return false }
      })
      var [minimized, setMinimized] = React.useState(function () {
        try { return window.localStorage.getItem('dshw-float-mode') === 'dot' } catch (e) { return false }
      })
      var [floatPos, setFloatPos] = React.useState(null)
      var floatPosRef = React.useRef(null)
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
            if (!thresholdInitializedRef.current && json.threshold !== undefined && json.threshold !== null) {
              thresholdInitializedRef.current = true
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
      }, [sessionId])
      React.useEffect(function () {
        loadAccounts()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      React.useEffect(function () {
        function onMove(event) {
          var d = dragRef.current
          if (d === null || event.pointerId !== d.pointerId) return
          var x = Math.max(4, Math.min(window.innerWidth - d.w - 4, event.clientX - d.dx))
          var y = Math.max(4, Math.min(window.innerHeight - d.h - 4, event.clientY - d.dy))
          if (Math.abs(event.clientX - d.startX) > 3 || Math.abs(event.clientY - d.startY) > 3) didDragRef.current = true
          d.x = x
          d.y = y
          floatPosRef.current = { x: x, y: y }
          setFloatPos(floatPosRef.current)
        }
        function onUp(event) {
          var d = dragRef.current
          if (d === null || event.pointerId !== d.pointerId) return
          dragRef.current = null
          try { window.localStorage.setItem('dshw-float-pos', d.x + ',' + d.y) } catch (e) { /* ignore */ }
          if (d.node && d.node.releasePointerCapture) {
            try { d.node.releasePointerCapture(d.pointerId) } catch (e) { /* ignore */ }
          }
        }
        document.addEventListener('pointermove', onMove)
        document.addEventListener('pointerup', onUp)
        document.addEventListener('pointercancel', onUp)
        return function () {
          document.removeEventListener('pointermove', onMove)
          document.removeEventListener('pointerup', onUp)
          document.removeEventListener('pointercancel', onUp)
        }
      }, [])

      React.useEffect(function () {
        if (!open) return
        function onDocDown(event) {
          var t = event.target
          if (chipRef.current && chipRef.current.contains(t)) return
          if (panelRef.current && panelRef.current.contains(t)) return
          if (confirmRef.current && confirmRef.current.contains(t)) return
          setOpen(false)
        }
        function onKeyDown(event) {
          if (event.key === 'Escape' && !confirming) {
            setOpen(false)
            if (chipButtonRef.current) chipButtonRef.current.focus()
          }
        }
        document.addEventListener('pointerdown', onDocDown)
        document.addEventListener('keydown', onKeyDown)
        return function () {
          document.removeEventListener('pointerdown', onDocDown)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open, confirming])

      useLayoutEffect(function () {
        if (!open || floated) return
        var chipNode = chipRef.current
        var panelNode = panelRef.current
        if (chipNode === null || panelNode === null) return
        function placePanel() {
          var chipRect = chipNode.getBoundingClientRect()
          var panelRect = panelNode.getBoundingClientRect()
          setPanelStyle(computePanelPosition(chipRect, panelRect, window.innerWidth, window.innerHeight))
        }
        placePanel()
        window.addEventListener('resize', placePanel)
        window.addEventListener('scroll', placePanel, true)
        return function () {
          window.removeEventListener('resize', placePanel)
          window.removeEventListener('scroll', placePanel, true)
        }
      }, [open, floated, data])

      React.useEffect(function () {
        if (!confirming) return
        restoreFocusRef.current = document.activeElement
        if (confirmButtonRef.current) confirmButtonRef.current.focus()
        function onKeyDown(event) {
          if (event.key === 'Escape') setConfirming(false)
          if (event.key === 'Tab' && cancelButtonRef.current && confirmButtonRef.current) {
            if (event.shiftKey && document.activeElement === cancelButtonRef.current) {
              event.preventDefault()
              confirmButtonRef.current.focus()
            } else if (!event.shiftKey && document.activeElement === confirmButtonRef.current) {
              event.preventDefault()
              cancelButtonRef.current.focus()
            }
          }
        }
        document.addEventListener('keydown', onKeyDown)
        return function () {
          document.removeEventListener('keydown', onKeyDown)
          var previous = restoreFocusRef.current
          if (previous && typeof previous.focus === 'function') previous.focus()
        }
      }, [confirming])

      function clampPos(pos, width, height) {
        return clampPosition(pos, width, height, window.innerWidth, window.innerHeight)
      }

      function readSavedPos(width, height) {
        try {
          var raw = window.localStorage.getItem('dshw-float-pos')
          if (raw === null) return null
          var parts = raw.split(',')
          var x = Number.parseFloat(parts[0]); var y = Number.parseFloat(parts[1])
          if (Number.isFinite(x) && Number.isFinite(y)) {
            return clampPos({ x: x, y: y }, width, height)
          }
        } catch (e) { /* ignore */ }
        return null
      }

      function onFloatDown(event) {
        if (event.pointerType !== 'touch' && event.button !== 0) return
        var target = event.target
        var node = floatRef.current
        if (node === null) return
        if (target !== node && target && target.closest && target.closest('button,input,a')) return
        var rect = node.getBoundingClientRect()
        dragRef.current = {
          pointerId: event.pointerId,
          dx: event.clientX - rect.left,
          dy: event.clientY - rect.top,
          startX: event.clientX,
          startY: event.clientY,
          x: rect.left,
          y: rect.top,
          w: rect.width,
          h: rect.height,
          node: node
        }
        didDragRef.current = false
        if (node.setPointerCapture) {
          try { node.setPointerCapture(event.pointerId) } catch (e) { /* ignore */ }
        }
        event.preventDefault()
      }

      useLayoutEffect(function () {
        if (!floated || floatRef.current === null) return
        var node = floatRef.current
        function fitFloatingWindow() {
          var rect = node.getBoundingClientRect()
          var current = floatPosRef.current || readSavedPos(rect.width, rect.height) || {
            x: window.innerWidth - rect.width - 16,
            y: 80
          }
          var fitted = clampPos(current, rect.width, rect.height)
          floatPosRef.current = fitted
          setFloatPos(fitted)
        }
        fitFloatingWindow()
        window.addEventListener('resize', fitFloatingWindow)
        return function () { window.removeEventListener('resize', fitFloatingWindow) }
      }, [floated, minimized])

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
          fetch(url).then(function (r) { return r.json() }).then(function (json) {
            dataRef.current = json
            setData(json)
          }).catch(function () {})
        }).catch(function () {})
      }

      function refreshBalance() {
        fetch('/api/wallet/refresh', { method: 'POST' }).then(function () {
          setTimeout(function () {
            var url = '/api/wallet/snapshot'
            if (sessionId) url = url + '?session=' + encodeURIComponent(sessionId)
            fetch(url).then(function (r2) { return r2.json() }).then(function (json) {
              dataRef.current = json
              setData(json)
            }).catch(function () { /* ignore */ })
          }, 300)
        }).catch(function () { /* ignore */ })
      }

      // -- multi-account management ------------------------------------------
      function loadAccounts() {
        fetch('/api/wallet/accounts').then(function (resp) {
          if (!resp.ok) throw new Error(String(resp.status))
          return resp.json()
        }).then(function (json) {
          if (json && json.ok) {
            setAccounts(json)
            setAccountsError(null)
          }
        }).catch(function () {
          setAccountsError('\u8d26\u6237\u5217\u8868\u52a0\u8f7d\u5931\u8d25')
        })
      }

      function addAccount() {
        if (adding) return
        var name = addName.trim()
        var key = addKey.trim()
        if (name === '' || key === '') {
          setAccountNotice('\u8bf7\u586b\u5199\u540d\u79f0\u548c API Key')
          return
        }
        setAdding(true)
        setAccountNotice(null)
        fetch('/api/wallet/accounts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: name, apiKey: key })
        }).then(function (resp) { return resp.json() }).then(function (json) {
          setAdding(false)
          if (json && json.ok) {
            setAddName('')
            setAddKey('')
            setAccountNotice(json.synced
              ? '\u5df2\u6dfb\u52a0\u5e76\u8bbe\u4e3a\u5f53\u524d\u8d26\u6237'
              : '\u5df2\u6dfb\u52a0' + (json.syncError ? '\uff08\u540c\u6b65\u5931\u8d25: ' + json.syncError + '\uff09' : ''))
            loadAccounts()
            refreshBalance()
          } else {
            setAccountNotice((json && json.error) || '\u6dfb\u52a0\u5931\u8d25')
          }
        }).catch(function () {
          setAdding(false)
          setAccountNotice('\u6dfb\u52a0\u5931\u8d25')
        })
      }

      function activateAccount(id, name) {
        if (switchingId !== null) return
        if (!window.confirm('\u5207\u6362\u5230\u8d26\u6237\u300c' + name + '\u300d\uff1f\n\u5207\u6362\u540e\uff0c\u540e\u7eed LLM \u8bf7\u6c42\u5c06\u4f7f\u7528\u8be5\u8d26\u6237\u7684 Key \u8ba1\u8d39\u3002')) return
        setSwitchingId(id)
        setAccountNotice(null)
        fetch('/api/wallet/accounts/activate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: id })
        }).then(function (resp) { return resp.json() }).then(function (json) {
          setSwitchingId(null)
          if (json && json.ok) {
            setAccountNotice('\u5df2\u5207\u6362\u5230\u300c' + json.account.name + '\u300d')
            loadAccounts()
            refreshBalance()
          } else {
            setAccountNotice((json && json.error) || '\u5207\u6362\u5931\u8d25')
          }
        }).catch(function () {
          setSwitchingId(null)
          setAccountNotice('\u5207\u6362\u5931\u8d25')
        })
      }

      function removeAccount(id, name) {
        if (!window.confirm('\u5220\u9664\u8d26\u6237\u300c' + name + '\u300d\uff1f\n\u4ec5\u5220\u9664\u672c\u63d2\u4ef6\u7684\u8d26\u6237\u8bb0\u5f55\uff0c\u4e0d\u5f71\u54cd .credentials.yaml \u4e2d\u5df2\u6709\u7684 Key\u3002')) return
        fetch('/api/wallet/accounts/remove', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: id })
        }).then(function (resp) { return resp.json() }).then(function (json) {
          if (json && json.ok) {
            setAccountNotice('\u5df2\u5220\u9664')
            loadAccounts()
            refreshBalance()
          } else {
            setAccountNotice((json && json.error) || '\u5220\u9664\u5931\u8d25')
          }
        }).catch(function () {
          setAccountNotice('\u5220\u9664\u5931\u8d25')
        })
      }

      function accountsSection() {
        var activeName = snapshot.accounts && snapshot.accounts.activeName ? snapshot.accounts.activeName : null
        var list = accounts && accounts.accounts ? accounts.accounts : []
        var children = []
        children.push(React.createElement('div', { key: 't', className: 'dshw_title' }, '\u8d26\u6237\u7ba1\u7406'))
        if (accountsError) {
          children.push(React.createElement('div', { key: 'e', className: 'dshw_muted' }, accountsError))
        } else {
          children.push(React.createElement('div', { key: 'cur', className: 'dshw_row' },
            React.createElement('span', { className: 'dshw_muted' }, '\u5f53\u524d\u8d26\u6237'),
            React.createElement('span', null, activeName ? activeName + ' \u00b7 LLM \u8ba1\u8d39' : '\u8ddf\u968f\u7cfb\u7edf Key')))
          if (list.length === 0) {
            children.push(React.createElement('div', { key: 'none', className: 'dshw_muted' },
              '\u6682\u65e0\u8d26\u6237\uff0c\u6dfb\u52a0\u540e\u5c06\u81ea\u52a8\u6210\u4e3a\u5f53\u524d\u8d26\u6237'))
          }
          list.forEach(function (acc) {
            var rowChildren = []
            rowChildren.push(React.createElement('span', {
              key: 'n',
              className: 'dshw_title',
              style: { flex: '1 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
            }, acc.name))
            rowChildren.push(React.createElement('span', { key: 'k', className: 'dshw_muted' }, acc.maskedKey))
            if (acc.active) {
              rowChildren.push(React.createElement('span', { key: 'a', className: 'dshw_muted' }, '\u5f53\u524d'))
            } else {
              rowChildren.push(React.createElement('button', {
                key: 's',
                type: 'button',
                className: 'dshw_btn',
                style: { padding: '2px 8px' },
                disabled: switchingId !== null,
                onClick: function () { activateAccount(acc.id, acc.name) }
              }, switchingId === acc.id ? '\u2026' : '\u5207\u6362'))
            }
            rowChildren.push(React.createElement('button', {
              key: 'r',
              type: 'button',
              className: 'dshw_btn',
              style: { padding: '2px 6px' },
              onClick: function () { removeAccount(acc.id, acc.name) }
            }, '\u00d7'))
            children.push(React.createElement('div', { key: acc.id, className: 'dshw_row' }, rowChildren))
          })
          children.push(React.createElement('div', { key: 'add', className: 'dshw_row', style: { gap: '4px' } },
            React.createElement('input', {
              className: 'dshw_input',
              type: 'text',
              placeholder: '\u540d\u79f0',
              style: { width: '72px' },
              value: addName,
              onChange: function (e) { setAddName(e.target.value) }
            }),
            React.createElement('input', {
              className: 'dshw_input',
              type: 'password',
              placeholder: 'sk-...',
              style: { flex: '1 1 auto', minWidth: '0' },
              value: addKey,
              onChange: function (e) { setAddKey(e.target.value) }
            }),
            React.createElement('button', {
              type: 'button',
              className: 'dshw_btn dshw_btnPrimary',
              disabled: adding,
              onClick: addAccount
            }, adding ? '\u2026' : '\u6dfb\u52a0')))
        }
        if (accountNotice) {
          children.push(React.createElement('div', {
            key: 'notice',
            className: 'dshw_muted',
            style: { overflowWrap: 'anywhere' }
          }, accountNotice))
        }
        return React.createElement(React.Fragment, null, children)
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
      chipTextParts.push(React.createElement('span', { key: 'bal' }, '余额 ' + (bal.total === null || bal.total === undefined ? '--' : fmtCurrency(bal.total, bal.currency))))
      if (official.cost !== undefined && official.cost !== null) {
        chipTextParts.push(React.createElement('span', { key: 'cost' }, '\u672c\u573a ' + fmtCurrency(official.cost, 'CNY')))
      }
      chipTextParts.push(React.createElement('span', { key: 'off' }, '\u5b98 ' + fmtTokens(officialTokens)))
      chipTextParts.push(React.createElement('span', { key: 'sep', className: 'dshw_sep' }, '|'))
      chipTextParts.push(React.createElement('span', { key: 'third' }, '\u4e09\u65b9 ' + fmtTokens(thirdTokens)))

      var chip = React.createElement('span', {
        ref: chipRef,
        className: low ? 'dshw_chip dshw_chipLow' : 'dshw_chip',
        role: 'group',
        'aria-label': 'DeepSeek \u94b1\u5305'
      },
        React.createElement('button', {
          ref: chipButtonRef,
          type: 'button',
          className: 'dshw_chipMain',
          title: 'deepseek-harness-wallet \u00b7 \u70b9\u51fb\u67e5\u770b\u660e\u7ec6',
          'aria-expanded': open,
          'aria-haspopup': 'dialog',
          onClick: function () {
          requestNotify()
          if (floated) {
            setFloated(false)
            setPanelStyle({ visibility: 'hidden' })
            setOpen(true)
            return
          }
          if (!open) setPanelStyle({ visibility: 'hidden' })
          setOpen(!open)
          }
        }, chipTextParts),
        React.createElement('button', {
          type: 'button',
          className: 'dshw_recharge',
          title: 'DeepSeek \u5f00\u653e\u5e73\u53f0 \u00b7 \u5b98\u65b9\u5145\u503c\u9875',
          'aria-label': '\u6253\u5f00 DeepSeek \u5b98\u65b9\u5145\u503c\u9875',
          onClick: onRechargeClick
        }, '\u2197\u5145'))

      var confirmOverlay = null
      if (confirming) {
        confirmOverlay = React.createElement('div', { ref: confirmRef, className: 'dshw_overlay', onClick: function () { setConfirming(false) } },
          React.createElement('div', {
            className: 'dshw_overlayBox',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'dshw-confirm-title',
            'aria-describedby': 'dshw-confirm-description',
            onClick: function (e) { e.stopPropagation() }
          },
            React.createElement('div', { id: 'dshw-confirm-title', className: 'dshw_title' }, '\u5c06\u6253\u5f00 DeepSeek \u5f00\u653e\u5e73\u53f0\u5b98\u65b9\u5145\u503c\u9875\uff1a'),
            React.createElement('div', { className: 'dshw_muted' }, 'https://platform.deepseek.com/top_up'),
            React.createElement('div', { id: 'dshw-confirm-description' }, '\u767b\u5f55\u4e0e\u652f\u4ed8\u7531\u5b98\u65b9\u9875\u9762\u5b8c\u6210\uff0c\u672c\u63d2\u4ef6\u4e0d\u63a5\u89e6\u8d26\u53f7\u4e0e\u652f\u4ed8\u4fe1\u606f\u3002'),
            React.createElement('div', { className: 'dshw_overlayRow' },
              React.createElement('button', { ref: cancelButtonRef, type: 'button', className: 'dshw_btn', onClick: function () { setConfirming(false) } }, '\u53d6\u6d88'),
              React.createElement('button', { ref: confirmButtonRef, type: 'button', className: 'dshw_btn dshw_btnPrimary', onClick: goRecharge }, '\u53bb\u5145\u503c'))))
      }

      if (!open && !floated) return React.createElement(React.Fragment, null, chip, confirmOverlay)

      var balanceRows = []
      if (bal.available && bal.balances && bal.balances.length > 0) {
        bal.balances.forEach(function (info, index) {
          balanceRows.push(React.createElement('div', { key: String(info.currency) + '-' + index, className: 'dshw_row' },
            React.createElement('span', { className: 'dshw_muted' }, '\u4f59\u989d (' + info.currency + ')'),
            React.createElement('span', null, fmtCurrency(info.total_balance, info.currency) + '  (\u5145\u503c ' + fmtCurrency(info.topped_up_balance, info.currency) + ' / \u8d60\u9001 ' + fmtCurrency(info.granted_balance, info.currency) + ')')
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
        React.createElement('span', null, official.cost === null ? '\u672a\u5b9a\u4ef7\u6a21\u578b' : fmtCurrency(official.cost, 'CNY'))))

      var thirdRows = []
      thirdRows.push(React.createElement('div', { key: 't-t', className: 'dshw_row' },
        React.createElement('span', { className: 'dshw_muted' }, '\u7b2c\u4e09\u65b9 token'),
        React.createElement('span', null, '\u8f93\u5165 ' + fmtTokens(third.tokens && third.tokens.input) + ' \u00b7 \u7f13\u5b58\u8bfb ' + fmtTokens(third.tokens && third.tokens.cacheRead) + ' \u00b7 \u8f93\u51fa ' + fmtTokens(third.tokens && third.tokens.output))))

      var thresholdInput = React.createElement('input', {
        className: 'dshw_input',
        type: 'number',
        min: '0',
        step: 'any',
        'aria-label': '\u4f59\u989d\u63d0\u9192\u9608\u503c\uff08CNY\uff09',
        value: thresholdDraft === null ? '' : thresholdDraft,
        onChange: function (event) {
          thresholdInitializedRef.current = true
          setThresholdDraft(event.target.value)
        }
      })

      var floatBtnRow = React.createElement('div', { className: 'dshw_row', style: { justifyContent: 'flex-end', marginTop: '2px' } },
        React.createElement('button', {
          type: 'button',
          className: 'dshw_btn',
          style: { height: '22px', fontSize: '11px', padding: '0 10px' },
          title: '浮动窗口模式：可拖动、可最小化',
          onClick: function () { setFloated(true); setOpen(false) }
        }, '◳ 浮动'))

      var panel = React.createElement('div', {
        ref: panelRef,
        className: 'dshw_panel',
        style: panelStyle,
        role: 'dialog',
        'aria-label': 'DeepSeek \u94b1\u5305\u660e\u7ec6',
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
          React.createElement('button', { type: 'button', className: 'dshw_btn', onClick: refreshBalance }, '\u5237\u65b0\u4f59\u989d'),
          React.createElement('button', { type: 'button', className: 'dshw_btn dshw_btnPrimary', onClick: saveThreshold }, '\u4fdd\u5b58\u9608\u503c')),
        React.createElement('button', {
          type: 'button',
          className: 'dshw_btn dshw_btnPrimary',
          style: { textAlign: 'center' },
          onClick: onRechargeClick
        }, '\u2197 \u53bb\u5b98\u65b9\u5145\u503c'),
        React.createElement('div', { className: 'dshw_divider' }),
        React.createElement('button', {
          type: 'button',
          className: 'dshw_btn',
          style: { width: '100%' },
          onClick: function () {
            if (window.confirm('\u786e\u8ba4\u6e05\u9664\u672c\u4f1a\u8bdd\u7684 token \u548c\u82b1\u8d39\u8bb0\u5f55\uff1f\u4e0d\u53ef\u6062\u590d\u3002')) clearSession()
          }
        }, '\u6e05\u9664\u672c\u4f1a\u8bdd\u6570\u636e'),
        React.createElement('div', { className: 'dshw_divider' }),
        accountsSection()
      )

      if (floated) {
        if (minimized) {
          var dotPos = floatPos || readSavedPos(36, 36) || { x: Math.max(4, window.innerWidth - 52), y: 80 }
          var dot = React.createElement('button', {
            ref: floatRef,
            type: 'button',
            className: low ? 'dshw_dot dshw_dotLow' : 'dshw_dot',
            style: { left: dotPos.x, top: dotPos.y },
            title: '钱包 · 点击展开',
            'aria-label': '钱包，点击展开',
            onPointerDown: onFloatDown,
            onClick: function () { if (didDragRef.current !== true) setMinimized(false) }
          }, bal.total === null || bal.total === undefined ? '--' : fmtCurrency(bal.total, bal.currency))
          return React.createElement(React.Fragment, null, chip, dot, confirmOverlay)
        }
        var winPos = floatPos || readSavedPos(306, 340) || { x: Math.max(4, window.innerWidth - 322), y: 80 }
        var floatPanel = React.createElement('div', {
          ref: floatRef,
          className: 'dshw_float',
          style: { left: winPos.x, top: winPos.y },
          role: 'dialog',
          'aria-label': 'DeepSeek 浮动钱包'
        },
          React.createElement('div', { className: 'dshw_floatHeader', onPointerDown: onFloatDown },
            React.createElement('span', null, '钱包'),
            React.createElement('span', null,
              React.createElement('button', {
                type: 'button',
                className: 'dshw_floatBtn',
                title: '最小化为圆点',
                onClick: function (e) { e.stopPropagation(); setMinimized(true) }
              }, '–'),
              React.createElement('button', {
                type: 'button',
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
            React.createElement('button', { type: 'button', className: 'dshw_btn', onClick: refreshBalance }, '刷新'),
            React.createElement('button', { type: 'button', className: 'dshw_btn dshw_btnPrimary', onClick: saveThreshold }, '保存')),
          React.createElement('button', {
            type: 'button',
            className: 'dshw_btn dshw_btnPrimary',
            style: { textAlign: 'center' },
            onClick: onRechargeClick
          }, '↗ 充值'),
          React.createElement('button', {
            type: 'button',
            className: 'dshw_btn', style: { width: '100%' },
            onClick: function () {
              if (window.confirm('确认清除本会话的 token 和花费记录？不可恢复。')) clearSession()
            }
          }, '清除本会话'),
          React.createElement('div', { className: 'dshw_divider' }),
          accountsSection()
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
            name: 'conversation.input.left',
            id: 'wallet',
            order: 130,
            inject: function () { return {} }
          }, WalletChip)
        }, 'dsh-wallet: chip registration')
      })
    }

    exports.apply = apply
    exports.inject = inject
    exports.__testing = {
      clampPosition: clampPosition,
      computePanelPosition: computePanelPosition,
      fmtCurrency: fmtCurrency
    }
    return module.exports
  }
})
