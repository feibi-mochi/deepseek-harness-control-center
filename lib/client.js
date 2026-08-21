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
    // Keep in lockstep with package.json; a test enforces the sync.
    var WALLET_VERSION = '0.2.3'
    var CONFIRM_KEY = 'dsh-wallet-recharge-confirmed'
    var CHIP_LAYOUT_KEY = 'dshw-chip-layout-v4'
    var PANEL_POS_KEY = 'dshw-panel-pos-v1'
    var CHIP_SCALE_KEY = 'dshw-chip-scale-v1'
    var DATA_VISIBILITY_KEY = 'dshw-data-visibility-v1'
    var NOTIFY_CONFIG_KEY = 'dshw-completion-notify-v1'
    var NOTIFY_CONFIG_EVENT = 'dshw-completion-notify-change'
    var SETTINGS_EVENT = 'dshw-settings-change'
    var LOW_BLINK_KEY = 'dshw-low-blink-v1'
    var PEAK_RING_KEY = 'dshw-peakring-v1'
    var CLASSIC_CARD_KEY = 'dshw-classic-card-v1'
    var PEAK_NOTIFY_KEY = 'dshw-peaknotify-v1'
    var PEAK_NOTIFY_LAST_KEY = 'dshw-peaknotify-last-v1'
    var PEAK_RING_EVENT = 'dshw-peakring-change'
    var NOTIFY_LEADER_KEY = 'dshw-completion-notify-leader-v1'
    var PERMANENT_DELETE_KEY = 'dshw-permanent-delete-v1'
    var PERMANENT_DELETE_EVENT = 'dshw-permanent-delete-change'
    var HOST_CAPABILITY_EVENT = 'dshw-host-capabilities-change'
    var CHIP_EDGE_MARGIN = 2
    var CHIP_EDGE_SNAP = 32
    var CHIP_HOME_SNAP = 96

    /**
     * Platform-specific behavior lives here. Desktop wrappers may define
     * window.__DSH_WALLET_ADAPTER__ before this bundle loads; ordinary browsers
     * need no adapter and use standards-based fallbacks.
     */
    function createCompatibilityAdapter(root) {
      root = root || {}
      var extension = root.__DSH_WALLET_ADAPTER__ && typeof root.__DSH_WALLET_ADAPTER__ === 'object'
        ? root.__DSH_WALLET_ADAPTER__
        : {}
      var memory = Object.create(null)
      var nativeStorage = extension.storage || root.localStorage || null
      var pageNotices = new Map()

      var storage = {
        getItem: function (key) {
          if (nativeStorage && typeof nativeStorage.getItem === 'function') {
            try { return nativeStorage.getItem(key) } catch (e) { /* storage may be disabled */ }
          }
          return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null
        },
        setItem: function (key, value) {
          value = String(value)
          memory[key] = value
          if (nativeStorage && typeof nativeStorage.setItem === 'function') {
            try { nativeStorage.setItem(key, value); return } catch (e) { /* use memory below */ }
          }
        },
        removeItem: function (key) {
          delete memory[key]
          if (nativeStorage && typeof nativeStorage.removeItem === 'function') {
            try { nativeStorage.removeItem(key); return } catch (e) { /* use memory below */ }
          }
        }
      }

      function getNotificationConstructor() {
        if (typeof Notification !== 'undefined') return Notification
        return typeof root.Notification === 'function' ? root.Notification : null
      }

      function createPageNotice(title, options) {
        var doc = root.document
        if (!doc || !doc.body || typeof doc.createElement !== 'function') return null
        var tag = options.tag || ''
        if (tag && pageNotices.has(tag)) pageNotices.get(tag).close()
        var stack = doc.querySelector && doc.querySelector('.dshw_noticeStack')
        if (!stack) {
          stack = doc.createElement('div')
          stack.className = 'dshw_noticeStack'
          stack.setAttribute('aria-live', 'polite')
          doc.body.appendChild(stack)
        }
        var notice = doc.createElement('div')
        notice.className = 'dshw_notice'
        notice.setAttribute('role', 'status')
        notice.tabIndex = 0
        var copy = doc.createElement('div')
        copy.className = 'dshw_noticeCopy'
        var heading = doc.createElement('strong')
        heading.textContent = title
        var body = doc.createElement('span')
        body.textContent = options.body || ''
        var close = doc.createElement('button')
        close.type = 'button'
        close.className = 'dshw_noticeClose'
        close.setAttribute('aria-label', '关闭提醒')
        close.textContent = '×'
        copy.appendChild(heading)
        copy.appendChild(body)
        notice.appendChild(copy)
        notice.appendChild(close)
        stack.appendChild(notice)
        var handle = {
          onclick: null,
          onclose: null,
          closed: false,
          close: function () {
            if (handle.closed) return
            handle.closed = true
            if (tag) pageNotices.delete(tag)
            if (notice.parentNode) notice.parentNode.removeChild(notice)
            if (stack.parentNode && stack.childNodes.length === 0) stack.parentNode.removeChild(stack)
            if (typeof handle.onclose === 'function') handle.onclose()
          }
        }
        notice.addEventListener('click', function (event) {
          if (event.target === close) return
          if (typeof handle.onclick === 'function') handle.onclick()
        })
        notice.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          if (typeof handle.onclick === 'function') handle.onclick()
        })
        close.addEventListener('click', function (event) {
          event.stopPropagation()
          handle.close()
        })
        if (tag) pageNotices.set(tag, handle)
        return handle
      }

      function notify(title, options) {
        options = options || {}
        function webFallback() {
          var NativeNotification = getNotificationConstructor()
          if (NativeNotification && NativeNotification.permission === 'granted') {
            try { return new NativeNotification(title, options) } catch (e) { /* use page fallback */ }
          }
          return createPageNotice(title, options)
        }
        if (typeof extension.notify === 'function') {
          try {
            var bridgeHandle = {
              onclick: null,
              onclose: null,
              closed: false,
              delegate: null,
              close: function () {
                if (bridgeHandle.closed) return
                bridgeHandle.closed = true
                if (bridgeHandle.delegate && typeof bridgeHandle.delegate.close === 'function') {
                  try { bridgeHandle.delegate.close() } catch (e) { /* native close is optional */ }
                }
              }
            }
            var payload = {
              title: title,
              body: options.body || '',
              tag: options.tag || '',
              requireInteraction: options.requireInteraction === true,
              onClick: function () {
                if (typeof bridgeHandle.onclick === 'function') bridgeHandle.onclick()
              },
              onClose: function () {
                if (bridgeHandle.closed) return
                bridgeHandle.closed = true
                if (typeof bridgeHandle.onclose === 'function') bridgeHandle.onclose()
              }
            }
            var bridged = extension.notify(payload)
            if (bridged && typeof bridged.close === 'function') return bridged
            if (bridged !== false) {
              if (bridged && typeof bridged.then === 'function') {
                function attachDelegate(delegate) {
                  if (delegate === false) delegate = webFallback()
                  bridgeHandle.delegate = delegate || null
                  if (delegate && typeof delegate === 'object') {
                    try { delegate.onclick = payload.onClick } catch (e) { /* optional callback */ }
                    try { delegate.onclose = payload.onClose } catch (e) { /* optional callback */ }
                  }
                  if (bridgeHandle.closed && delegate && typeof delegate.close === 'function') delegate.close()
                }
                Promise.resolve(bridged).then(attachDelegate).catch(function () { attachDelegate(false) })
              }
              return bridgeHandle
            }
          } catch (e) { /* use browser fallback */ }
        }
        return webFallback()
      }

      function requestNotificationPermission() {
        if (typeof extension.requestNotificationPermission === 'function') {
          try { return Promise.resolve(extension.requestNotificationPermission()).catch(function () { return 'page' }) }
          catch (e) { return Promise.resolve('page') }
        }
        if (typeof extension.notify === 'function') return Promise.resolve('bridge')
        var NativeNotification = getNotificationConstructor()
        if (!NativeNotification || typeof NativeNotification.requestPermission !== 'function') return Promise.resolve('page')
        if (NativeNotification.permission !== 'default') return Promise.resolve(NativeNotification.permission)
        try { return Promise.resolve(NativeNotification.requestPermission()).catch(function () { return 'page' }) }
        catch (e) { return Promise.resolve('page') }
      }

      function openExternal(url) {
        if (typeof extension.openExternal === 'function') {
          try {
            if (extension.openExternal(url) !== false) return true
          } catch (e) { /* use browser fallback */ }
        }
        if (typeof root.open !== 'function') return false
        try { root.open(url, '_blank', 'noopener,noreferrer'); return true } catch (e) { return false }
      }

      function hasCapability(name) {
        if (extension.capabilities && extension.capabilities[name] === true) return true
        var doc = root.document
        if (!doc || !doc.documentElement || typeof doc.documentElement.getAttribute !== 'function') return false
        return doc.documentElement.getAttribute('data-dshw-capability-' + name.replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase() })) === 'true'
      }

      function supportsCssZoom() {
        var doc = root.document
        if (!doc || !doc.documentElement || !doc.documentElement.style) return true
        if ('zoom' in doc.documentElement.style) return true
        return !!(root.CSS && typeof root.CSS.supports === 'function' && root.CSS.supports('zoom', '1'))
      }

      function dispatch(name) {
        if (typeof root.dispatchEvent !== 'function') return
        try {
          var EventCtor = root.Event || (typeof Event !== 'undefined' ? Event : null)
          if (EventCtor) root.dispatchEvent(new EventCtor(name))
        } catch (e) { /* an isolated WebView may not expose DOM events */ }
      }

      return {
        storage: storage,
        notify: notify,
        requestNotificationPermission: requestNotificationPermission,
        openExternal: openExternal,
        hasCapability: hasCapability,
        supportsCssZoom: supportsCssZoom,
        dispatch: dispatch
      }
    }

    var compatibility = createCompatibilityAdapter(window)

    var css = [
      '.dshw_anchor{display:inline-flex;align-items:center;min-height:22px;min-width:0;vertical-align:middle}',
      '.dshw_anchorHome{overflow:hidden;min-width:44px}',
      '.dshw_chipLift{z-index:80!important}',
      '.dshw_anchorHome>.dshw_chip{box-sizing:border-box;max-width:100%;min-width:0;overflow:hidden}',
      '.dshw_chip{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;height:22px;color:var(--dsw-alias-label-primary,#1f2328);white-space:nowrap;border-radius:999px;align-items:stretch;font-size:12px;line-height:1;display:inline-flex;position:relative;touch-action:none;user-select:none;cursor:grab}',
      '.dshw_chip:hover,.dshw_chip:focus-within{border-color:var(--dsw-alias-brand-primary,#4aa3ff)}',
      '.dshw_chipLow{border-color:var(--dsw-alias-state-error-primary,#e5534b);color:var(--dsw-alias-state-error-primary,#e5534b);animation:dshwChipPulseIn 1.8s ease-in-out infinite}',
      '.dshw_chipLow:hover,.dshw_chipLow:focus-within{border-color:var(--dsw-alias-state-error-primary,#e5534b)}',
      '.dshw_chipDocked{position:fixed;z-index:79;background:var(--dsw-alias-bg-overlay,#fff);box-shadow:0 2px 10px rgba(0,0,0,.16)}',
      '.dshw_chipDragging{cursor:grabbing;box-shadow:0 6px 18px rgba(0,0,0,.22)}',
      '.dshw_snapPreview{position:fixed;z-index:78;pointer-events:none;box-sizing:border-box;border:2px dashed var(--dsw-alias-brand-primary,#4aa3ff);background:rgba(74,163,255,.10);box-shadow:0 0 0 3px rgba(74,163,255,.10);border-radius:999px;transition:left .06s ease,top .06s ease,width .06s ease,height .06s ease}',
      '.dshw_snapPreviewVertical{border-radius:7px}',
      '.dshw_chipVertical{height:auto;width:40px;min-width:40px;max-width:40px;box-sizing:border-box;overflow:hidden;flex-direction:column;border-radius:7px;align-items:stretch;white-space:normal;font-size:10px;line-height:1.1}',
      '.dshw_chipVertical .dshw_chipMain{width:100%;box-sizing:border-box;flex-direction:column;align-items:stretch;gap:0;padding:0;border-radius:7px 7px 0 0}',
      '.dshw_chipVertical .dshw_chipMain>span{display:flex;flex-direction:column;align-items:center;gap:1px;padding:2px 0;text-align:center}',
      '.dshw_chipVertical .dshw_metricLabel{opacity:.72}',
      '.dshw_chipVertical .dshw_metricValue{font-variant-numeric:tabular-nums}',
      '.dshw_chipVertical .dshw_sep{display:none}',
      '.dshw_chipVertical .dshw_recharge{width:100%;box-sizing:border-box;border-left:0;border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));padding:3px 1px;justify-content:center;border-radius:0 0 7px 7px}',
      '.dshw_bottomDockHost{box-sizing:border-box!important;padding-bottom:30px!important}',
      '@keyframes dshwChipPulseIn{0%,100%{box-shadow:inset 0 0 0 0 rgba(229,83,75,0)}50%{box-shadow:inset 0 0 0 3px rgba(229,83,75,.32)}}',
      '@keyframes dshwPulse{0%,100%{box-shadow:0 0 0 0 rgba(229,83,75,.45)}50%{box-shadow:0 0 0 5px rgba(229,83,75,0)}}',
      '.dshw_sep{opacity:.45}',
      '.dshw_chipMain,.dshw_recharge{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;align-items:center;display:inline-flex;gap:6px;margin:0}',
      '.dshw_chipMain{padding:0 7px;border-radius:999px 0 0 999px}',
      '.dshw_chipNoRecharge .dshw_chipMain{border-radius:999px}',
      '.dshw_chipVertical.dshw_chipNoRecharge .dshw_chipMain{border-radius:7px}',
      '.dshw_recharge{color:var(--dsw-alias-brand-primary,#4aa3ff);border-left:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));padding:0 7px 0 6px;border-radius:0 999px 999px 0}',
      '.dshw_chipMain:focus-visible,.dshw_recharge:focus-visible,.dshw_btn:focus-visible,.dshw_floatBtn:focus-visible,.dshw_dot:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4aa3ff);outline-offset:2px}',
      '.dshw_panel{z-index:40;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-overlay,#ffffff);box-sizing:border-box;width:min(276px,calc(100vw - 12px));max-height:calc(100vh - 16px);overflow:auto;color:var(--dsw-alias-label-primary,#1f2328);border-radius:8px;flex-direction:column;gap:4px;padding:8px 9px;font-size:12px;display:flex;position:fixed;box-shadow:0 4px 12px #0000004d}',
      '.dshw_panelHeader{min-height:24px;cursor:move;touch-action:none;user-select:none}',
      '.dshw_panelHeader .dshw_btn{cursor:pointer}',
      '.dshw_row{justify-content:space-between;align-items:center;gap:6px;display:flex}',
      '.dshw_row>span:last-child{text-align:right;overflow-wrap:anywhere}',
      '.dshw_title{font-weight:600;opacity:.9}',
      '.dshw_muted{color:var(--dsw-alias-label-tertiary,#6b7280)}',
      '.dshw_divider{border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));margin-top:1px;padding-top:4px}',
      '.dshw_input{background:var(--dsw-alias-bg-layer-1,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));color:var(--dsw-alias-label-primary,#1f2328);border-radius:5px;padding:3px 6px;width:56px;font-size:12px}',
      '.dshw_scaleControl{display:flex;align-items:center;gap:7px;min-width:126px;justify-content:flex-end}',
      '.dshw_scaleInput{width:78px;accent-color:var(--dsw-alias-brand-primary,#4aa3ff);cursor:pointer}',
      '.dshw_scaleValue{width:34px;text-align:right;font-variant-numeric:tabular-nums}',
      '.dshw_visibilityControl{display:flex;align-items:center;gap:7px}',
      '.dshw_check{display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap}',
      '.dshw_check input{margin:0;accent-color:var(--dsw-alias-brand-primary,#4aa3ff)}',
      '.dshw_select{background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));color:var(--dsw-alias-label-primary,#1f2328);border-radius:5px;padding:2px 4px;font-size:12px}',
      '.dshw_btn{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;color:var(--dsw-alias-label-primary,#1f2328);border-radius:5px;padding:2px 6px;font-size:12px;cursor:pointer}',
      '.dshw_btnPrimary{background:var(--dsw-alias-brand-primary,#4aa3ff);border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#ffffff)}',
      // ---- v0.2 panel restyle: balance card, settings card, account scroll ----
      '.dshw_balanceCard{margin:2px 0 2px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));border-radius:8px;background:var(--dsw-alias-bg-l1,rgba(127,127,127,.06))}',
      '.dshw_balLine{display:flex;align-items:center;gap:7px;white-space:nowrap}',
      '.dshw_balNum{font-size:18px;font-weight:650;line-height:1.1;letter-spacing:-.01em;font-variant-numeric:tabular-nums}',
      '.dshw_balWarn{display:inline-flex;align-items:center;gap:4px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-state-error-soft,rgba(229,83,75,.12));color:var(--dsw-alias-state-error-primary,#e5534b);font-size:10px;font-weight:500;line-height:16px;white-space:nowrap}',
      '.dshw_balWarn::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-error-primary,#e5534b);animation:dshwPulse 1.8s infinite}',
      '.dshw_balFill{flex:1}',
      '.dshw_balSession{text-align:right;white-space:nowrap}',
      '.dshw_balSession .dshw_muted{margin-right:5px}',
      '.dshw_balSessionNum{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}',
      '.dshw_balSub{margin-top:4px;font-size:11px;color:var(--dsw-alias-label-secondary,rgba(31,35,40,.68));display:flex;align-items:center;gap:7px;white-space:nowrap}',
      '.dshw_balSub .dshw_balDot{color:var(--dsw-alias-label-quaternary,rgba(31,35,40,.45))}',
      '.dshw_setCard{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));border-radius:8px;background:var(--dsw-alias-bg-elevated,transparent);overflow:hidden;margin:2px 0}',
      '.dshw_setCell{display:flex;align-items:center;gap:8px;padding:6px 9px;min-height:34px}',
      '.dshw_setCell+.dshw_setCell{border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}',
      '.dshw_setCell:hover{background:var(--dsw-alias-bg-l1,rgba(127,127,127,.06))}',
      '.dshw_setCell .dshw_scaleControl{min-width:0;flex:1;justify-content:flex-end}',
      '.dshw_chipToggle{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));border-radius:999px;background:transparent;font-size:11.5px;color:var(--dsw-alias-label-secondary,rgba(31,35,40,.68));cursor:pointer;white-space:nowrap;transition:color .12s,border-color .12s,background-color .12s}',
      '.dshw_chipToggle:hover{border-color:var(--dsw-alias-brand-primary,#4aa3ff)}',
      '.dshw_chipToggle input{margin:0;accent-color:var(--dsw-alias-brand-primary,#4aa3ff)}',
      '.dshw_acctScroll{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));border-radius:8px;overflow-y:auto;max-height:58px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l3,rgba(0,0,0,.25)) transparent;margin:2px 0}',
      '.dshw_acctScroll::-webkit-scrollbar{width:6px}',
      '.dshw_acctScroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l3,rgba(0,0,0,.25));border-radius:3px}',
      '.dshw_acctScroll .dshw_row{padding:2px 6px}',
      '.dshw_balanceCard.dshw_low{border-color:var(--dsw-alias-state-error-primary,#e5534b)}',
      '.dshw_balanceCard.dshw_low .dshw_balNum{color:var(--dsw-alias-state-error-primary,#e5534b)}',
      '.dshw_chipLow .dshw_chipMain>span:not(.dshw_homePrimary):not(.dshw_sep){color:var(--dsw-alias-label-primary,#1f2328)}',
      '.dshw_chipLow .dshw_thirdText .dshw_homePrimaryValue{color:inherit}',
      '.dshw_chipLow .dshw_balanceText .dshw_homePrimaryLabel{color:var(--dsw-alias-label-primary,#1f2328)!important}',
      '.dshw_chipLow .dshw_balanceText .dshw_homePrimaryValue{color:var(--dsw-alias-state-error-primary,#e5534b)!important}',
      '.dshw_chipLow.dshw_chipVertical .dshw_chipMain>.dshw_metric:not(:first-child) .dshw_metricLabel,.dshw_chipLow.dshw_chipVertical .dshw_chipMain>.dshw_metric:not(:first-child) .dshw_metricValue{color:var(--dsw-alias-label-primary,#1f2328)}',
      '.dshw_chipLow.dshw_chipVertical .dshw_chipMain>.dshw_metric:first-child .dshw_metricValue{color:var(--dsw-alias-state-error-primary,#e5534b)}',
      '.dshw_chipLow.dshw_chipVertical .dshw_chipMain>.dshw_metric:first-child .dshw_metricLabel{color:var(--dsw-alias-label-primary,#1f2328)}',
      '.dshw_chipLow.dshw_noBlink{animation:none}',
      '.dshw_acctMore{display:flex;justify-content:flex-end;font-size:10.5px;color:var(--dsw-alias-label-quaternary,rgba(31,35,40,.45));margin-top:3px}',
      ''.trim() || '.dshw_acctRow{display:flex;align-items:center;gap:5px;padding:2px 6px;min-height:26px}',
      '.dshw_acctRow+.dshw_acctRow{border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}',
      '.dshw_acctRow.current{background:var(--dsw-alias-brand-soft,rgba(74,163,255,.10))}',
      '.dshw_acctAvatar{flex:none;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:650;user-select:none}',
      '.dshw_acctInfo{flex:1;min-width:0;display:flex;align-items:center;gap:6px}',
      '.dshw_acctName{font-size:11.5px;font-weight:550;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto}',
      '.dshw_acctBadge{flex:none;font-size:9.5px;color:var(--dsw-alias-brand-primary,#4aa3ff);border:1px solid var(--dsw-alias-brand-primary,#4aa3ff);border-radius:4px;padding:0 4px;line-height:14px;opacity:.85}',
      '.dshw_acctKey{font-family:ui-monospace,Consolas,monospace;font-size:10px;color:var(--dsw-alias-label-quaternary,rgba(31,35,40,.45));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto}',
      '.dshw_acctNow{flex:none;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-brand-soft,rgba(74,163,255,.14));color:var(--dsw-alias-brand-primary,#4aa3ff);font-size:10.5px;font-weight:550;line-height:16px}',
      '.dshw_settingsSection .dshw_setCard{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--dsw-alias-border-l1,rgba(0,0,0,.08))}',
      '.dshw_settingsSection .dshw_setCell{background:var(--dsw-alias-bg-elevated,transparent);border-top:none!important;padding:8px 10px}',
      '.dshw_settingsSection .dshw_setCell:hover{background:var(--dsw-alias-bg-l1,rgba(127,127,127,.06))}',
      '.dshw_settingsSection .dshw_setCell.wide{grid-column:1/-1}',
      '.dshw_settingsSection{--dshw-card-radius:11px;max-width:900px;gap:12px!important}',
      '.dshw_settingsHeader{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}',
      '.dshw_settingsHeading{font-size:16px;font-weight:650;letter-spacing:-.01em}',
      '.dshw_settingsLead{margin-top:2px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#6b7280)}',
      '.dshw_versionBadge{flex:none;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-l1,rgba(127,127,127,.07));color:var(--dsw-alias-label-quaternary,rgba(31,35,40,.45));font-size:10px}',
      '.dshw_settingsHero{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.13));border-radius:var(--dshw-card-radius);background:var(--dsw-alias-bg-elevated,#fff);padding:13px 15px}',
      '.dshw_settingsHero.dshw_low{border-color:var(--dsw-alias-state-error-primary,#e5534b)}',
      '.dshw_settingsHeroTop{display:flex;align-items:center;gap:8px}',
      '.dshw_settingsHeroLabel{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#6b7280)}',
      '.dshw_accountPill{display:inline-flex;align-items:center;max-width:180px;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-brand-soft,rgba(74,163,255,.10));color:var(--dsw-alias-label-secondary,rgba(31,35,40,.68));font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshw_settingsHeroMain{display:flex;align-items:flex-end;gap:18px;margin-top:7px}',
      '.dshw_settingsBalance{font-size:28px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.025em}',
      '.dshw_settingsHero.dshw_low .dshw_settingsBalance{color:var(--dsw-alias-state-error-primary,#e5534b)}',
      '.dshw_settingsSpend{display:flex;flex-direction:column;gap:2px;padding-bottom:1px}',
      '.dshw_settingsSpend strong{font-size:14px;font-variant-numeric:tabular-nums}',
      '.dshw_settingsHeroMeta{display:flex;align-items:center;gap:7px;margin-top:9px;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px;white-space:nowrap}',
      '.dshw_settingsGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}',
      '.dshw_settingsSection .dshw_setCard{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0;border:0;background:transparent;overflow:visible}',
      '.dshw_settingsSection .dshw_setCard>.dshw_setCell{min-width:0;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.13))!important;border-radius:var(--dshw-card-radius);background:var(--dsw-alias-bg-elevated,#fff);padding:11px 12px}',
      '.dshw_settingsSection .dshw_setCard>.dshw_setCell:hover{background:var(--dsw-alias-bg-elevated,#fff)}',
      '.dshw_settingsSection .dshw_setCard>.dshw_setCell.wide{grid-column:1/-1}',
      '.dshw_reminderCard{display:block!important;padding:0!important;overflow:hidden}',
      '.dshw_settingsGroup{min-width:0;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.13));border-radius:var(--dshw-card-radius);background:var(--dsw-alias-bg-elevated,#fff);overflow:hidden}',
      '.dshw_settingsGroupHeader{padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}',
      '.dshw_settingsGroupTitle{font-size:12px;font-weight:650}',
      '.dshw_settingsGroupHint{margin-top:2px;color:var(--dsw-alias-label-quaternary,rgba(31,35,40,.45));font-size:10.5px}',
      '.dshw_settingsField{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:42px;padding:8px 12px}',
      '.dshw_settingsField+.dshw_settingsField{border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.07))}',
      '.dshw_settingsFieldLabel{display:flex;min-width:0;flex-direction:column;gap:2px}',
      '.dshw_settingsFieldLabel>strong{font-size:11.5px;font-weight:550}',
      '.dshw_settingsFieldLabel>span{font-size:10px;color:var(--dsw-alias-label-quaternary,rgba(31,35,40,.45))}',
      '.dshw_settingsInline{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0}',
      '.dshw_settingsInline .dshw_input{height:26px;box-sizing:border-box}',
      '.dshw_settingsInline .dshw_select{height:26px}',
      '.dshw_settingChoices{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:9px 12px}',
      '.dshw_settingChoice{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09));border-radius:8px;background:var(--dsw-alias-bg-l1,rgba(127,127,127,.04))}',
      '.dshw_settingChoiceCopy{min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.dshw_settingChoiceCopy strong{font-size:11px;font-weight:550;white-space:nowrap}',
      '.dshw_settingChoiceCopy span{font-size:9.5px;color:var(--dsw-alias-label-quaternary,rgba(31,35,40,.45));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshw_switch{position:relative;flex:none;width:34px;height:20px;display:inline-flex;cursor:pointer}',
      '.dshw_switch>input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}',
      '.dshw_track{position:absolute;inset:0;border-radius:999px;background:var(--dsw-alias-border-l3,rgba(0,0,0,.22));transition:background-color .15s}',
      '.dshw_knob{position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-overlay,#fff);box-shadow:0 1px 3px rgba(0,0,0,.24);transition:transform .15s}',
      '.dshw_switch>input:checked+.dshw_track{background:var(--dsw-alias-brand-primary,#4aa3ff)}',
      '.dshw_switch>input:checked~.dshw_knob{transform:translateX(14px)}',
      '.dshw_switch>input:focus-visible+.dshw_track{outline:2px solid var(--dsw-alias-brand-primary,#4aa3ff);outline-offset:2px}',
      '.dshw_switch>input:disabled+.dshw_track{opacity:.38}.dshw_switch>input:disabled~.dshw_knob{opacity:.7}',
      '.dshw_accountHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:2px}',
      '.dshw_accountCount{font-size:10.5px;color:var(--dsw-alias-label-quaternary,rgba(31,35,40,.45))}',
      '.dshw_settingsSection .dshw_acctScroll{max-height:150px;margin:0;border-radius:var(--dshw-card-radius)}',
      '.dshw_settingsSection .dshw_acctRow{min-height:38px;padding:6px 9px;gap:8px}',
      '.dshw_settingsSection .dshw_acctAvatar{width:24px;height:24px;font-size:11px}',
      '.dshw_settingsSection .dshw_acctInfo{align-items:flex-start;flex-direction:column;gap:1px}',
      '.dshw_settingsSection .dshw_acctName{font-size:11.5px}',
      '.dshw_settingsSection .dshw_acctKey{font-size:9.5px}',
      '.dshw_accountAdd{display:grid;grid-template-columns:120px minmax(150px,1fr) auto;gap:6px;padding:9px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.13));border-radius:var(--dshw-card-radius);background:var(--dsw-alias-bg-l1,rgba(127,127,127,.035))}',
      '.dshw_accountAdd .dshw_input{box-sizing:border-box;width:100%;height:28px}',
      '.dshw_settingsFooter{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:2px}',
      '.dshw_settingsFooterActions{display:flex;align-items:center;gap:7px}',
      '.dshw_settingsFooter .dshw_btn{height:30px;padding:0 14px}',
      '.dshw_footRing{width:100%;box-sizing:border-box;display:flex;align-items:center;gap:9px;min-height:70px;margin:2px 0 5px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));border-radius:11px;background:var(--dsw-alias-bg-l1,rgba(127,127,127,.035));color:var(--dsw-alias-label-primary,#1f2328);font-size:12.5px;cursor:default;user-select:none;transition:all .15s ease}',
      '.dshw_footRing:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.15))}',
      '.dshw_footRing.dshw_low{border-color:var(--dsw-alias-state-error-primary,#e5534b)}',
      '.dshw_footRingRail{width:42px;height:42px;min-height:42px;margin:3px 0 6px;padding:0;justify-content:center;border-radius:50%;background:transparent;border:none;cursor:pointer}',
      '.dshw_footRingRail:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.dshw_footRingLabel{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px;overflow:hidden}',
      '.dshw_footRingHeader{display:flex;align-items:center;gap:6px;white-space:nowrap}',
      '.dshw_footRingTitle{font-size:13.5px;font-weight:700;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshw_footRingBadge{font-size:10px;font-weight:600;padding:1px 5px;line-height:15px;border-radius:3px;flex:none}',
      '.dshw_footRingBadgePeak{background:var(--dsw-alias-state-error-soft,rgba(229,83,75,.12));color:var(--dsw-alias-state-error-primary,#e5534b)}',
      '.dshw_footRingBadgeOff{background:var(--dsw-alias-state-success-soft,rgba(26,127,55,.12));color:var(--dsw-alias-state-success-primary,#1a7f37)}',
      '.dshw_footRingMoney{font-size:12.5px;font-variant-numeric:tabular-nums;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshw_footRingMoney.dshw_low .dshw_footBalNum{color:var(--dsw-alias-state-error-primary,#e5534b);font-weight:700}',
      '.dshw_footRingCountdown{font-size:11px;color:var(--dsw-alias-label-secondary,rgba(31,35,40,.72));line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshw_footRingRecharge{flex:none;display:flex;align-items:center}',
      '.dshw_footRingBtnRechargeVertical{border:1px solid var(--dsw-alias-brand-primary,#4aa3ff);background:var(--dsw-alias-brand-soft,rgba(74,163,255,.10));color:var(--dsw-alias-brand-primary,#4aa3ff);border-radius:6px;width:24px;min-height:48px;padding:5px 0;font-size:12px;font-weight:650;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;line-height:1;transition:all .15s ease;flex:none;box-sizing:border-box;user-select:none}',
      '.dshw_footRingBtnRechargeVertical:hover{background:var(--dsw-alias-brand-primary,#4aa3ff);color:#fff}',
      '.dshw_ringPeak{stroke:var(--dsw-alias-state-error-primary,#e5534b)}',
      '.dshw_ringOff{stroke:var(--dsw-alias-state-success-primary,#1a7f37)}',
      '.dshw_ringNeutral{stroke:var(--dsw-alias-border-l3,rgba(0,0,0,.18))}',
      '.dshw_peakRing circle{transition:stroke-width .3s ease}',
      '.dshw_ringNow{stroke-width:6;filter:brightness(1.15)}',
      '.dshw_ringPointer{fill:var(--dsw-alias-label-primary,#1f2328)}',
      '.dshw_ringTick{fill:var(--dsw-alias-label-quaternary,rgba(31,35,40,.45))}',
      '@media (max-width:760px){.dshw_settingsGrid,.dshw_settingsSection .dshw_setCard{grid-template-columns:1fr}.dshw_settingsSection .dshw_setCard>.dshw_setCell.wide{grid-column:1}.dshw_accountAdd{grid-template-columns:1fr}.dshw_settingsFooter{align-items:flex-start;flex-direction:column-reverse}.dshw_settingsFooterActions{width:100%}.dshw_settingsFooterActions .dshw_btn{flex:1}.dshw_settingsHeroMeta{white-space:normal;flex-wrap:wrap}}',
      '.dshw_actionRow{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:2px 0}',
      '.dshw_textDanger{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 4px;border:none;background:transparent;font:inherit;font-size:11px;color:var(--dsw-alias-label-quaternary,rgba(31,35,40,.45));cursor:pointer;border-radius:4px;transition:color .12s,background-color .12s}',
      '.dshw_textDanger:hover{color:var(--dsw-alias-state-error-primary,#e5534b);background:var(--dsw-alias-state-error-soft,rgba(229,83,75,.12))}',
      '.dshw_overlay{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-drop,rgba(0,0,0,.55));display:flex;align-items:center;justify-content:center;z-index:100}',
      '.dshw_overlayBox{background:var(--dsw-alias-bg-overlay,#ffffff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));color:var(--dsw-alias-label-primary,#1f2328);border-radius:8px;padding:14px 18px;width:min(320px,calc(100vw - 32px));box-sizing:border-box;font-size:13px;line-height:1.7}',
      '.dshw_overlayRow{margin-top:10px;display:flex;gap:8px;justify-content:flex-end}',

      '.dshw_float{position:fixed;z-index:80;min-width:230px;max-width:280px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1f2328);border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:6px;padding:10px 12px;font-size:12px;user-select:none}',
      '.dshw_floatHeader{display:flex;align-items:center;justify-content:space-between;cursor:move;font-weight:600;opacity:.9;touch-action:none}',
      '.dshw_floatBtn{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;color:inherit;border-radius:5px;width:22px;height:20px;font-size:12px;line-height:1;cursor:pointer;padding:0}',
      '.dshw_floatBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.dshw_dot{position:fixed;z-index:80;width:36px;height:36px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1f2328);font-size:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.2);user-select:none;touch-action:none}',
      '.dshw_dotLow{border-color:var(--dsw-alias-state-error-primary,#e5534b);color:var(--dsw-alias-state-error-primary,#e5534b)}',
      '.dshw_noticeStack{position:fixed;z-index:120;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));width:min(340px,calc(100vw - 24px));display:flex;flex-direction:column;gap:8px;pointer-events:none}',
      '.dshw_notice{box-sizing:border-box;width:100%;display:flex;align-items:flex-start;gap:8px;padding:10px 10px 10px 12px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));border-radius:9px;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1f2328);box-shadow:0 6px 20px rgba(0,0,0,.2);font-size:12px;line-height:1.45;pointer-events:auto;cursor:pointer}',
      '.dshw_noticeCopy{min-width:0;display:flex;flex:1;flex-direction:column;gap:2px}.dshw_noticeCopy span{white-space:pre-line;overflow-wrap:anywhere}',
      '.dshw_noticeClose{flex:none;width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer}.dshw_noticeClose:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      // Home-fit and compact modes are toggled by measured space (see the
      // home-space effect in WalletChip), not by container queries:
      // container-type:inline-size on a content-sized flex item detaches its
      // width from the chip, so flex layouts resolve it to min-width (44px)
      // even when the row has room.
      '.dshw_anchorHome.dshw_fit .dshw_chipMain>span:not(.dshw_homePrimary){display:none}',
      '.dshw_anchorHome.dshw_compact .dshw_chip{width:100%}.dshw_anchorHome.dshw_compact .dshw_chipMain{box-sizing:border-box;width:100%;min-width:0;overflow:hidden;justify-content:center;padding:0 3px}.dshw_anchorHome.dshw_compact .dshw_chipMain>span{display:none}.dshw_anchorHome.dshw_compact .dshw_chipMain>.dshw_homePrimary{display:inline;min-width:0;overflow:hidden;text-overflow:ellipsis}.dshw_anchorHome.dshw_compact .dshw_homePrimaryLabel{display:none}.dshw_anchorHome.dshw_compact .dshw_recharge{display:none}',
      '@media (max-width:420px){.dshw_chipDocked:not(.dshw_chipVertical){max-width:calc(100vw - 4px);font-size:10px}.dshw_chipDocked:not(.dshw_chipVertical) .dshw_chipMain{gap:3px;padding:0 4px}.dshw_chipDocked:not(.dshw_chipVertical) .dshw_recharge{padding:0 4px}}'
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

    
    // Session cost is priced from the CNY table; when the active account
    // settles in another currency, show a clearly-marked estimate instead
    // of mixing currencies. The rate is the vendor's long-standing list
    // ratio, not a live FX quote.
    var USD_ESTIMATE_PER_CNY = 7.25
    function sessionCostText(costCNY, currency) {
      var val = (costCNY === null || costCNY === undefined) ? 0 : costCNY
      if (currency === 'USD') {
        var usd = val / USD_ESTIMATE_PER_CNY
        return fmtCurrency(usd, 'USD')
      }
      return fmtCurrency(val, currency || 'CNY')
    }
    // 本约 = "本次为估算值"：美元账户的花费由 CNY 价折算，标签本身承担
    // 约算含义，数字前不再加 ≈ 符号；CNY 账户是精确值，用"本场"。
    function sessionCostLabel(currency) {
      return currency === 'USD' ? '本约' : '本场'
    }

    // Ring clock: 24h circle, peak arcs from snapshot.pricingWindows (never
    // hard-coded in the bundle), pointer at current time, active arc bolded.
    // Noon = 0h at 12 o'clock, clockwise. Optional size scales the 76-unit
    // viewBox down for tight hosts (sidebar foot row / rail circle); optional
    // ariaText overrides the fallback label with the full screen-reader state.
    function peakRingSVG(windows, nowHour, size, ariaText) {
      var sizePx = typeof size === 'number' && size > 0 ? size : 76
      var R = 28
      var CX = 38
      var CY = 38
      var CIRC = 2 * Math.PI * R
      // No pricing policy resolved: one neutral full ring, no arcs, no pointer
      // — the clock shows an unconfigured state and claims no price.
      if (!Array.isArray(windows) || windows.length === 0) {
        return React.createElement('svg', {
          width: sizePx, height: sizePx, viewBox: '0 0 76 76',
          role: 'img', className: 'dshw_peakRing',
          'aria-label': ariaText || '峰谷计费时段未配置'
        },
          React.createElement('circle', { key: 'neutral', cx: CX, cy: CY, r: R, fill: 'none', className: 'dshw_ringNeutral', strokeWidth: 4 }))
      }
      var segs = []
      // Build segments: which arcs are peak vs off
      var cursor = 0
      var sorted = (windows || []).slice().sort(function (a, b) { return a.startHour - b.startHour })
      var marks = []
      for (var i = 0; i < sorted.length; i++) {
        var w = sorted[i]
        if (w.startHour > cursor) segs.push({ start: cursor, end: w.startHour, peak: false })
        segs.push({ start: w.startHour, end: w.endHour, peak: true })
        marks.push(w.startHour, w.endHour)
        cursor = w.endHour
      }
      if (cursor < 24) segs.push({ start: cursor, end: 24, peak: false })
      // Is the current hour inside a peak window?
      var inPeak = false
      for (var j = 0; j < sorted.length; j++) {
        if (nowHour >= sorted[j].startHour && nowHour < sorted[j].endHour) { inPeak = true; break }
      }
      var children = []
      for (var k = 0; k < segs.length; k++) {
        var seg = segs[k]
        var frac = (seg.end - seg.start) / 24
        var offset = 1 - (seg.start / 24) // stroke-dashoffset rotates clockwise from 3 o'clock; we want 0h at 12
        var isNow = (nowHour >= seg.start && nowHour < seg.end)
        children.push(React.createElement('circle', {
          key: 'seg' + k,
          cx: CX, cy: CY, r: R,
          fill: 'none',
          className: (seg.peak ? 'dshw_ringPeak' : 'dshw_ringOff') + (isNow ? ' dshw_ringNow' : ''),
          strokeWidth: isNow ? 6.5 : 4,
          strokeDasharray: (frac * CIRC).toFixed(2) + ' ' + (CIRC - frac * CIRC).toFixed(2),
          strokeDashoffset: (offset * CIRC).toFixed(2),
          transform: 'rotate(-90 ' + CX + ' ' + CY + ')' // 0h at 12 o'clock
        }))
      }
      // Boundary ticks: dots at rest, the exact times ride the hover tooltip
      for (var m = 0; m < marks.length; m++) {
        var angle = (marks[m] / 24) * 360 - 90
        var rad = angle * Math.PI / 180
        var tx = CX + (R + 7) * Math.cos(rad)
        var ty = CY + (R + 7) * Math.sin(rad)
        children.push(React.createElement('circle', { key: 'tick' + m, cx: tx.toFixed(1), cy: ty.toFixed(1), r: 2, className: 'dshw_ringTick' }))
      }
      // Pointer: a small triangle riding the ring, apex touching the arc —
      // secondary to the bolded current segment (a 1-min move is 0.25°, invisible)
      var pAngle = (nowHour / 24) * 360 - 90
      var pRad = pAngle * Math.PI / 180
      var cosR = Math.cos(pRad)
      var sinR = Math.sin(pRad)
      var apexX = CX + (R - 1) * cosR
      var apexY = CY + (R - 1) * sinR
      var baseCx = CX + (R + 7) * cosR
      var baseCy = CY + (R + 7) * sinR
      var tri = (baseCx + 3.5 * -sinR).toFixed(1) + ',' + (baseCy + 3.5 * cosR).toFixed(1)
        + ' ' + apexX.toFixed(1) + ',' + apexY.toFixed(1)
        + ' ' + (baseCx - 3.5 * -sinR).toFixed(1) + ',' + (baseCy - 3.5 * cosR).toFixed(1)
      children.push(React.createElement('polygon', { key: 'ptr', points: tri, className: 'dshw_ringPointer' }))
      return React.createElement('svg', {
        width: sizePx, height: sizePx, viewBox: '0 0 76 76',
        role: 'img', className: 'dshw_peakRing',
        'aria-label': ariaText || (inPeak ? '当前为高峰时段' : '当前为低谷时段（半价）')
      }, children)
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

    function selectBalanceInfo(balance) {
      if (!balance || !Array.isArray(balance.balances) || balance.balances.length === 0) return null
      var currency = typeof balance.currency === 'string' ? balance.currency.toUpperCase() : null
      if (currency) {
        var matching = balance.balances.find(function (info) {
          return info && typeof info.currency === 'string' && info.currency.toUpperCase() === currency
        })
        if (matching) return matching
      }
      return balance.balances[0]
    }

    function balanceErrorText(error) {
      switch (error) {
        case 'no-credentials': return '宿主凭证服务不可用'
        case 'no-api-key': return '未配置 DeepSeek API Key'
        case 'unauthorized': return 'API Key 无效或已过期'
        case 'rate-limited': return '余额接口请求过于频繁'
        case 'timeout': return '余额接口请求超时'
        case 'invalid-response': return '余额接口返回无效数据'
        case 'balance-unavailable': return '余额暂不可用'
        case 'upstream-unavailable': return '余额接口暂时不可用'
        default: return '余额暂不可用'
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

    function clampFreeDrop(pos, width, height, viewportWidth, viewportHeight, pointer, contentRect) {
      var fitted = clampPosition(pos, width, height, viewportWidth, viewportHeight)
      if (contentRect && pointer && pointer.x < contentRect.left && contentRect.left >= width + CHIP_EDGE_MARGIN * 2) {
        fitted.x = Math.min(fitted.x, contentRect.left - width - CHIP_EDGE_MARGIN)
      }
      return fitted
    }

    function settleDotPosition(pos, width, height, viewportWidth, viewportHeight) {
      return clampPosition(pos, width, height, viewportWidth, viewportHeight)
    }

    function computeSideDockX(dock, width, viewportWidth, contentRect) {
      var x = dock === 'left' ? CHIP_EDGE_MARGIN : viewportWidth - width - CHIP_EDGE_MARGIN
      if (dock === 'content-left') x = contentRect ? contentRect.left + CHIP_EDGE_MARGIN : CHIP_EDGE_MARGIN
      return Math.max(CHIP_EDGE_MARGIN, Math.min(viewportWidth - width - CHIP_EDGE_MARGIN, x))
    }

    function normalizeChipLayout(value) {
      if (!value || typeof value !== 'object') return { dock: 'home', x: 0, y: 0 }
      var dock = value.dock
      if (dock !== 'home' && dock !== 'free' && dock !== 'bottom' && dock !== 'left' && dock !== 'right' && dock !== 'content-left') dock = 'home'
      var x = Number.parseFloat(value.x)
      var y = Number.parseFloat(value.y)
      return {
        dock: dock,
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0
      }
    }

    function normalizeChipScale(value) {
      var scale = Number.parseFloat(value)
      if (!Number.isFinite(scale)) return 1
      scale = Math.round(scale * 20) / 20
      return Math.max(0.75, Math.min(1.25, scale))
    }

    function normalizeDataVisibility(value) {
      var official = !value || value.official !== false
      var third = !value || value.third !== false
      if (!official && !third) official = true
      return { official: official, third: third }
    }

    function normalizeNotifyConfig(value) {
      var enabled = !value || value.enabled !== false
      var timeout = value && Number.parseInt(value.timeout, 10)
      // Migrate the brief settings-page schema that stored milliseconds under
      // autoCloseMs. The canonical shared shape is { enabled, timeout }.
      if ([0, 5, 10, 30, 60].indexOf(timeout) === -1 && value && Object.hasOwn(value, 'autoCloseMs')) {
        timeout = value.autoCloseMs === null ? 0 : Math.round(Number(value.autoCloseMs) / 1000)
      }
      if ([0, 5, 10, 30, 60].indexOf(timeout) === -1) timeout = 10
      return { enabled: enabled, timeout: timeout }
    }

    function readNotifyConfig() {
      try {
        var saved = compatibility.storage.getItem(NOTIFY_CONFIG_KEY)
        return normalizeNotifyConfig(saved === null ? null : JSON.parse(saved))
      } catch (e) { return normalizeNotifyConfig(null) }
    }

    /**
     * One origin-wide completion notification leader. Web Locks is preferred;
     * a renewable storage lease covers browsers and desktop WebViews without
     * Web Locks. Each completed session is queued once and the next reminder
     * waits until the current one closes.
     */
    function installCompletionNotifier(ctx) {
      if (typeof window === 'undefined' || !ctx.sessions || !ctx.sessions.list) return function () {}
      var stopped = false
      var leader = false
      var initialized = false
      var previousSessionStates = new Map()
      var queuedIds = new Set()
      var queue = []
      var active = null
      var releaseLeader = null
      var leaderAbort = typeof AbortController === 'function' ? new AbortController() : null
      var leaseTimer = null
      var leaseId = String(Date.now()) + '-' + Math.random().toString(36).slice(2)

      function finishActive(closeNotification) {
        var current = active
        if (current === null) return
        active = null
        if (current.timer !== null) clearTimeout(current.timer)
        if (current.notification) {
          current.notification.onclose = null
          current.notification.onclick = null
          if (closeNotification) {
            try { current.notification.close() } catch (e) { /* ignore */ }
          }
        }
        queuedIds.delete(current.item.id)
        setTimeout(showNext, 0)
      }

      function presentActive() {
        if (stopped || !leader || active === null) return
        var config = readNotifyConfig()
        if (!config.enabled) {
          queue = []
          queuedIds.clear()
          finishActive(true)
          return
        }
        var item = active.item
        var remaining = queue.length
        var body = item.title + (remaining > 0 ? '\r\n另有 ' + remaining + ' 个对话等待提醒' : '\r\n点击打开该对话')
        if (active.timer !== null) clearTimeout(active.timer)
        if (active.notification) {
          active.notification.onclose = null
          active.notification.onclick = null
          try { active.notification.close() } catch (e) { /* ignore */ }
        }
        var notification
        try {
          notification = compatibility.notify('DeepSeek Harness · 对话已完成', {
            body: body,
            tag: 'dsh-harness-completion',
            requireInteraction: config.timeout === 0
          })
          if (!notification) throw new Error('no notification surface')
        } catch (e) {
          queuedIds.delete(item.id)
          active = null
          setTimeout(showNext, 0)
          return
        }
        active.notification = notification
        active.timer = null
        notification.onclick = function () {
          try { window.focus() } catch (e) { /* ignore */ }
          try { ctx.sessions.open(item.id) } catch (e) { /* session may have been removed */ }
          finishActive(true)
        }
        notification.onclose = function () { finishActive(false) }
        if (config.timeout > 0) {
          active.timer = setTimeout(function () { finishActive(true) }, config.timeout * 1000)
        }
      }

      function showNext() {
        if (stopped || !leader || active !== null || queue.length === 0) return
        var item = queue.shift()
        if (!item) return
        active = { item: item, notification: null, timer: null }
        presentActive()
      }

      function enqueue(id, title) {
        if (active !== null && active.item.id === id) {
          active.item = { id: id, title: title || '未命名对话' }
          presentActive()
          return
        }
        if (queuedIds.has(id)) return
        queuedIds.add(id)
        queue.push({ id: id, title: title || '未命名对话' })
        if (active !== null) presentActive()
        else showNext()
      }

      function onListChange() {
        var snapshot = ctx.sessions.list.getSnapshot()
        var liveIds = new Set()
        var config = readNotifyConfig()
        var ids = snapshot && Array.isArray(snapshot.ids) ? snapshot.ids : []
        ids.forEach(function (id) {
          var row = snapshot.byId && snapshot.byId[id]
          if (!row) return
          liveIds.add(id)
          var state = { running: row.running === true, completed: row.completed === true }
          var previous = previousSessionStates.get(id)
          previousSessionStates.set(id, state)
          var justFinished = !!previous && (
            (previous.running && !state.running) ||
            (!previous.completed && state.completed)
          )
          if (initialized && leader && config.enabled && justFinished) {
            enqueue(id, row.displayTitle)
          }
        })
        Array.from(previousSessionStates.keys()).forEach(function (id) {
          if (!liveIds.has(id)) previousSessionStates.delete(id)
        })
        initialized = true
      }

      function onConfigChange() {
        var config = readNotifyConfig()
        if (!config.enabled) {
          queue = []
          queuedIds.clear()
          finishActive(true)
          return
        }
        showNext()
      }

      var unsubscribe = ctx.sessions.list.subscribe(onListChange)
      onListChange()
      function onStorage(event) {
        if (event.key === NOTIFY_CONFIG_KEY) onConfigChange()
      }
      window.addEventListener(NOTIFY_CONFIG_EVENT, onConfigChange)
      window.addEventListener('storage', onStorage)

      function becomeLeader() {
        if (stopped) return Promise.resolve()
        leader = true
        showNext()
        return new Promise(function (resolve) { releaseLeader = resolve }).finally(function () {
          leader = false
          releaseLeader = null
          finishActive(true)
        })
      }

      function readLease() {
        try {
          var value = compatibility.storage.getItem(NOTIFY_LEADER_KEY)
          return value === null ? null : JSON.parse(value)
        } catch (e) { return null }
      }

      function renewLease() {
        if (stopped) return
        if (leaseTimer !== null) clearTimeout(leaseTimer)
        var now = Date.now()
        var current = readLease()
        if (!current || current.expires <= now || current.id === leaseId) {
          compatibility.storage.setItem(NOTIFY_LEADER_KEY, JSON.stringify({ id: leaseId, expires: now + 9000 }))
          current = readLease()
        }
        var ownsLease = !!current && current.id === leaseId
        if (ownsLease && !leader) {
          leader = true
          showNext()
        } else if (!ownsLease && leader) {
          leader = false
          finishActive(true)
        }
        leaseTimer = setTimeout(renewLease, 3000)
      }

      function onLeaseStorage(event) {
        if (!event || event.key === NOTIFY_LEADER_KEY) renewLease()
      }

      try {
        if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
          var options = { mode: 'exclusive' }
          if (leaderAbort) options.signal = leaderAbort.signal
          navigator.locks.request('dsh-wallet-completion-notifier', options, becomeLeader).catch(function () {})
        } else {
          renewLease()
          if (typeof window.addEventListener === 'function') window.addEventListener('storage', onLeaseStorage)
        }
      } catch (e) {
        renewLease()
      }

      return function () {
        stopped = true
        unsubscribe()
        window.removeEventListener(NOTIFY_CONFIG_EVENT, onConfigChange)
        window.removeEventListener('storage', onStorage)
        window.removeEventListener('storage', onLeaseStorage)
        if (leaderAbort) leaderAbort.abort()
        if (releaseLeader) releaseLeader()
        if (leaseTimer !== null) clearTimeout(leaseTimer)
        var currentLease = readLease()
        if (currentLease && currentLease.id === leaseId) compatibility.storage.removeItem(NOTIFY_LEADER_KEY)
        queue = []
        queuedIds.clear()
        finishActive(true)
      }
    }

    function computeSnapPreview(dock, pos, viewportWidth, viewportHeight, homeRect, contentRect, anchorRect, sizes) {
      if (dock === 'free') return null
      sizes = sizes || {}
      var horizontal = sizes.horizontal || { width: Math.min(320, viewportWidth - CHIP_EDGE_MARGIN * 2), height: 22 }
      var vertical = sizes.vertical || { width: 40, height: 127 }
      var width = dock === 'left' || dock === 'right' || dock === 'content-left' ? vertical.width : horizontal.width
      var height = dock === 'left' || dock === 'right' || dock === 'content-left' ? vertical.height : horizontal.height
      var x = pos.x
      var y = pos.y

      if (dock === 'home') {
        if (anchorRect) {
          x = anchorRect.left
          y = anchorRect.top + Math.max(0, (anchorRect.height - height) / 2)
        } else if (homeRect) {
          x = homeRect.left + Math.max(0, (homeRect.width - width) / 2)
          y = homeRect.bottom - height - 8
        }
      } else if (dock === 'bottom') {
        x = homeRect && homeRect.width >= 150 ? homeRect.left + (homeRect.width - width) / 2 : (viewportWidth - width) / 2
        y = viewportHeight - height - CHIP_EDGE_MARGIN
      } else {
        x = computeSideDockX(dock, width, viewportWidth, contentRect)
      }

      var fitted = {
        x: Math.max(CHIP_EDGE_MARGIN, Math.min(viewportWidth - width - CHIP_EDGE_MARGIN, x)),
        y: Math.max(CHIP_EDGE_MARGIN, Math.min(viewportHeight - height - CHIP_EDGE_MARGIN, y))
      }
      return {
        dock: dock,
        x: fitted.x,
        y: fitted.y,
        width: width,
        height: height,
        vertical: dock === 'left' || dock === 'right' || dock === 'content-left'
      }
    }

    function findComposerNode(node, viewportWidth, viewportHeight) {
      var current = node
      var minWidth = Math.min(460, viewportWidth * 0.45)
      while (current && current !== document.body) {
        if (typeof current.getBoundingClientRect === 'function') {
          var rect = current.getBoundingClientRect()
          if (rect.width >= minWidth && rect.height >= 60 && rect.height <= 240 && rect.bottom >= viewportHeight * 0.55) return current
        }
        current = current.parentElement
      }
      return node || null
    }

    function isStackingContext(style) {
      if (!style) return false
      if (style.position === 'fixed' || style.position === 'sticky') return true
      if (style.zIndex !== 'auto' && style.position !== 'static') return true
      if (style.transform !== 'none' || style.filter !== 'none' || style.perspective !== 'none') return true
      if (style.willChange === 'transform' || style.willChange === 'filter' || style.willChange === 'opacity' || style.willChange === 'z-index') return true
      if (style.contain && style.contain !== 'none') return true
      if (style.isolation === 'isolate') return true
      if (style.opacity !== '1') return true
      return false
    }

    function findComposerRect(node, viewportWidth, viewportHeight) {
      var composer = findComposerNode(node, viewportWidth, viewportHeight)
      return composer && typeof composer.getBoundingClientRect === 'function' ? composer.getBoundingClientRect() : null
    }

    function findBottomDockHost(node, viewportWidth, viewportHeight) {
      var composer = findComposerNode(node, viewportWidth, viewportHeight)
      if (!composer || typeof composer.getBoundingClientRect !== 'function') return null
      var base = composer.getBoundingClientRect()
      var host = composer
      var current = composer.parentElement
      while (current && current !== document.body && typeof current.getBoundingClientRect === 'function') {
        var rect = current.getBoundingClientRect()
        if (rect.width < base.width * 0.9 || rect.height < base.height || rect.height > base.height + 120 || rect.bottom < viewportHeight * 0.55) break
        host = current
        current = current.parentElement
      }
      return host
    }

    function chooseChipDock(pos, width, height, viewportWidth, viewportHeight, homeRect, pointer, contentRect) {
      var centerX = pos.x + width / 2
      var centerY = pos.y + height / 2
      var probeX = pointer && Number.isFinite(pointer.x) ? pointer.x : centerX
      var probeY = pointer && Number.isFinite(pointer.y) ? pointer.y : centerY

      // Only the thin physical-edge zones turn the chip vertical. The wider
      // sidebar/content gutters remain valid free, horizontal drop areas.
      if (probeX <= CHIP_EDGE_SNAP) return 'left'
      if (probeX >= viewportWidth - CHIP_EDGE_SNAP) return 'right'
      if (contentRect && contentRect.left > CHIP_EDGE_SNAP * 2 && Math.abs(probeX - contentRect.left) <= CHIP_EDGE_SNAP) return 'content-left'

      if (homeRect) {
        if (homeRect.width >= 150 && homeRect.height >= 50) {
          // Check the lower edge first so a single continuous drag can cross
          // the composer and land in the dedicated row below it.
          if (probeX >= homeRect.left && probeX <= homeRect.right && probeY >= homeRect.bottom - 14 && probeY <= homeRect.bottom + 88) return 'bottom'
          if (probeX >= homeRect.left - 12 && probeX <= homeRect.right + 12 && probeY >= homeRect.top - 12 && probeY < homeRect.bottom - 14) return 'home'
          return 'free'
        } else {
          var homeX = homeRect.left + homeRect.width / 2
          var homeY = homeRect.top + homeRect.height / 2
          var homeDistance = Math.hypot(probeX - homeX, probeY - homeY)
          if (homeDistance <= CHIP_HOME_SNAP) return 'home'
        }
      }
      var distances = {
        left: Math.max(0, probeX),
        right: Math.max(0, viewportWidth - probeX),
        bottom: Math.max(0, viewportHeight - pos.y - height)
      }
      var nearest = 'left'
      if (distances.right < distances[nearest]) nearest = 'right'
      if (distances.bottom < distances[nearest]) nearest = 'bottom'
      return distances[nearest] <= CHIP_EDGE_SNAP ? nearest : 'free'
    }

    function totalTokens(counters) {
      if (!counters) return 0
      return (counters.input || 0) + (counters.output || 0) + (counters.cacheRead || 0) + (counters.cacheWrite || 0)
    }

    /**
     * Host settings-panel section: the same wallet controls as the chip panel,
     * as an independent card. Shares state with the chip through the same
     * storage keys plus the SETTINGS_EVENT notification, so both surfaces stay
     * in sync without lifting the chip's internal state.
     */
    function WalletSettingsSection(props) {
      props = props || {}
      var close = typeof props.close === 'function' ? props.close : null
      var [snapshot, setSnapshot] = React.useState(null)
      var [thresholdDraft, setThresholdDraft] = React.useState('')
      var [thresholdNotice, setThresholdNotice] = React.useState(null)
      var [accounts, setAccounts] = React.useState(null)
      var [accountsError, setAccountsError] = React.useState(null)
      var [accountNotice, setAccountNotice] = React.useState(null)
      var [nameDraft, setNameDraft] = React.useState('')
      var [keyDraft, setKeyDraft] = React.useState('')
      var [switchingId, setSwitchingId] = React.useState(null)
      var [visibility, setVisibility] = React.useState(function () {
        try {
          var saved = compatibility.storage.getItem(DATA_VISIBILITY_KEY)
          return saved === null ? normalizeDataVisibility(null) : normalizeDataVisibility(JSON.parse(saved))
        } catch (e) { return normalizeDataVisibility(null) }
      })
      var [scale, setScale] = React.useState(function () {
        try { return normalizeChipScale(compatibility.storage.getItem(CHIP_SCALE_KEY)) } catch (e) { return 1 }
      })
      var [scaleMax, setScaleMax] = React.useState(125)
      var [notifyEnabled, setNotifyEnabled] = React.useState(function () { return readNotifyConfig().enabled })
      var [notifyTimeout, setNotifyTimeout] = React.useState(function () {
        var cfg = readNotifyConfig()
        return cfg.timeout === 0 ? 'keep' : String(cfg.timeout)
      })
      var [lowBlinkEnabled, setLowBlinkEnabled] = React.useState(function () {
        try { return compatibility.storage.getItem(LOW_BLINK_KEY) !== 'false' } catch (e) { return true }
      })
      var [pdEnabled, setPdEnabled] = React.useState(function () {
        try { return compatibility.storage.getItem(PERMANENT_DELETE_KEY) === 'true' } catch (e) { return false }
      })
      var [pdSupported, setPdSupported] = React.useState(function () {
        return compatibility.hasCapability('permanentDelete')
      })
      var [ringEnabled, setRingEnabled] = React.useState(function () {
        try { return compatibility.storage.getItem(PEAK_RING_KEY) !== 'false' } catch (e) { return true }
      })
      var [peakNotifyEnabled, setPeakNotifyEnabled] = React.useState(function () {
        try { return compatibility.storage.getItem(PEAK_NOTIFY_KEY) === 'true' } catch (e) { return false }
      })
      React.useEffect(function () {
        if (typeof window.addEventListener !== 'function') return
        function refreshCap() { setPdSupported(compatibility.hasCapability('permanentDelete')) }
        window.addEventListener(HOST_CAPABILITY_EVENT, refreshCap)
        refreshCap()
        return function () { window.removeEventListener(HOST_CAPABILITY_EVENT, refreshCap) }
      }, [])

      React.useEffect(function () {
        var stopped = false
        function refresh() {
          fetch('/api/wallet/snapshot').then(function (resp) { return resp.json() }).then(function (json) {
            if (!stopped && json && json.ok) {
              setSnapshot(json)
              setThresholdDraft(json.threshold !== undefined && json.threshold !== null ? json.threshold.toFixed(2) : '')
            }
          }).catch(function () { /* ignore */ })
        }
        refresh()
        fetch('/api/wallet/accounts').then(function (resp) { return resp.json() }).then(function (json) {
          if (!stopped && json && json.ok) setAccounts(json)
        }).catch(function () { if (!stopped) setAccountsError('\u8d26\u6237\u63a5\u53e3\u4e0d\u53ef\u7528') })
        try {
          var savedLayout = compatibility.storage.getItem(CHIP_LAYOUT_KEY)
          var dock = savedLayout === null ? 'home' : normalizeChipLayout(JSON.parse(savedLayout)).dock
          setScaleMax(dock === 'home' ? 105 : 125)
        } catch (e) { /* ignore */ }
        return function () { stopped = true }
      }, [])

      function persistVisibility(next) {
        next = normalizeDataVisibility(next)
        setVisibility(next)
        try { compatibility.storage.setItem(DATA_VISIBILITY_KEY, JSON.stringify(next)) } catch (e) { /* ignore */ }
        compatibility.dispatch(SETTINGS_EVENT)
      }

      function persistScale(next) {
        next = normalizeChipScale(next)
        if (next > scaleMax / 100) next = scaleMax / 100
        setScale(next)
        try { compatibility.storage.setItem(CHIP_SCALE_KEY, String(next)) } catch (e) { /* ignore */ }
        compatibility.dispatch(SETTINGS_EVENT)
      }

      var thresholdSaveTimerRef = React.useRef(null)
      function queueThresholdSave(value) {
        if (thresholdSaveTimerRef.current) clearTimeout(thresholdSaveTimerRef.current)
        thresholdSaveTimerRef.current = setTimeout(function () { saveThreshold(value) }, 600)
      }

      function persistNotify(enabled, timeout) {
        var timeoutSeconds = timeout === 'keep' ? 0 : Number.parseInt(timeout, 10)
        if ([0, 5, 10, 30, 60].indexOf(timeoutSeconds) === -1) timeoutSeconds = 10
        try {
          compatibility.storage.setItem(NOTIFY_CONFIG_KEY, JSON.stringify({ enabled: enabled, timeout: timeoutSeconds }))
        } catch (e) { /* ignore */ }
        setNotifyEnabled(enabled)
        setNotifyTimeout(timeoutSeconds === 0 ? 'keep' : String(timeoutSeconds))
        compatibility.dispatch(NOTIFY_CONFIG_EVENT)
      }

      function persistLowBlink(enabled) {
        enabled = enabled === true
        setLowBlinkEnabled(enabled)
        try { compatibility.storage.setItem(LOW_BLINK_KEY, String(enabled)) } catch (e) { /* ignore */ }
        compatibility.dispatch(SETTINGS_EVENT)
      }

      function saveThreshold(valueArg) {
        var value = Number.parseFloat(valueArg !== undefined ? valueArg : thresholdDraft)
        if (!Number.isFinite(value)) return
        value = Math.min(100000, Math.max(0, Math.round(value * 100) / 100))
        fetch('/api/wallet/threshold', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ threshold: value, currency: (snapshot && snapshot.balance && snapshot.balance.currency) || 'CNY' })
        }).then(function (resp) { return resp.json() }).then(function (json) {
          if (json && json.ok) {
            setThresholdDraft(json.threshold.toFixed(2))
            setThresholdNotice('\u5df2\u4fdd\u5b58')
            if (snapshot) { snapshot.threshold = json.threshold; setSnapshot(Object.assign({}, snapshot)) }
          }
        }).catch(function () { setThresholdNotice('\u4fdd\u5b58\u5931\u8d25') })
      }

      function reloadAccounts() {
        fetch('/api/wallet/accounts').then(function (resp) { return resp.json() }).then(function (json) {
          if (json && json.ok) { setAccounts(json); setAccountsError(null) }
        }).catch(function () { /* ignore */ })
        fetch('/api/wallet/snapshot').then(function (resp) { return resp.json() }).then(function (json) {
          if (json && json.ok) {
            setSnapshot(json)
            // 切换账号后阈值输入框立即跳到该账号货币的阈值
            if (json.threshold !== undefined && json.threshold !== null) setThresholdDraft(json.threshold.toFixed(2))
          }
        }).catch(function () { /* ignore */ })
      }

      function addAccount() {
        var name = nameDraft.trim()
        var key = keyDraft.trim()
        if (!name || !key) return
        fetch('/api/wallet/accounts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: name, apiKey: key })
        }).then(function (resp) { return resp.json() }).then(function (json) {
          if (json && json.ok) {
            setNameDraft(''); setKeyDraft('')
            setAccountNotice(json.synced ? '\u5df2\u6dfb\u52a0\u5e76\u8bbe\u4e3a\u5f53\u524d\u8d26\u6237' : '\u5df2\u6dfb\u52a0')
            reloadAccounts()
          } else {
            setAccountNotice(json && json.error ? String(json.error) : '\u6dfb\u52a0\u5931\u8d25')
          }
        }).catch(function () { setAccountNotice('\u6dfb\u52a0\u5931\u8d25') })
      }

      function activateAccount(id, name) {
        if (!window.confirm('\u5207\u6362\u5230\u300c' + name + '\u300d\uff1f\u540e\u7eed LLM \u8bf7\u6c42\u5c06\u6309\u8be5\u8d26\u6237\u8ba1\u8d39\u3002')) return
        setSwitchingId(id)
        fetch('/api/wallet/accounts/activate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: id })
        }).then(function (resp) { return resp.json() }).then(function (json) {
          setSwitchingId(null)
          setAccountNotice(json && json.ok ? '\u5df2\u5207\u6362\u5230\u300c' + name + '\u300d' : (json && json.error ? String(json.error) : '\u5207\u6362\u5931\u8d25'))
          // 阈值输入框零等待跳转: 激活响应自带该账号阈值
          if (json && json.ok && json.threshold !== undefined && json.threshold !== null) setThresholdDraft(json.threshold.toFixed(2))
          reloadAccounts()
        }).catch(function () { setSwitchingId(null); setAccountNotice('\u5207\u6362\u5931\u8d25') })
      }

      function removeAccount(id, name) {
        if (!window.confirm('\u5220\u9664\u8d26\u6237\u300c' + name + '\u300d\uff1f')) return
        fetch('/api/wallet/accounts/remove', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: id })
        }).then(function (resp) { return resp.json() }).then(function (json) {
          setAccountNotice(json && json.ok ? '\u5df2\u5220\u9664' : '\u5220\u9664\u5931\u8d25')
          reloadAccounts()
        }).catch(function () { setAccountNotice('\u5220\u9664\u5931\u8d25') })
      }

      var bal = snapshot && snapshot.balance ? snapshot.balance : null
      var balanceText = bal && bal.total !== null && bal.total !== undefined ? fmtCurrency(bal.total, bal.currency) : '--'
      var activeName = snapshot && snapshot.accounts && snapshot.accounts.activeName ? snapshot.accounts.activeName : null
      var list = accounts && accounts.accounts ? accounts.accounts : []
      var rows = []

      // —— 余额卡 ——
      var lowBalance = snapshot && snapshot.lowBalance === true
      var sessionCost = snapshot && snapshot.session && snapshot.session.official && snapshot.session.official.cost !== null && snapshot.session.official.cost !== undefined ? sessionCostText(snapshot.session.official.cost, snapshot && snapshot.balance ? snapshot.balance.currency : null) : '--'
      var currencyCode = bal && typeof bal.currency === 'string' ? bal.currency : 'CNY'
      var primaryBalance = selectBalanceInfo(bal)
      var toppedText = primaryBalance ? fmtCurrency(primaryBalance.topped_up_balance, primaryBalance.currency) : '--'
      var grantedText = primaryBalance ? fmtCurrency(primaryBalance.granted_balance, primaryBalance.currency) : '--'
      rows.push(React.createElement('div', { key: 'head', className: 'dshw_settingsHeader' },
        React.createElement('div', null,
          React.createElement('div', { className: 'dshw_settingsHeading' }, 'DeepSeek 账户中心'),
          React.createElement('div', { className: 'dshw_settingsLead' }, '余额、展示、提醒与账户切换'))))
      rows.push(React.createElement('div', { key: 'balcard', className: lowBalance ? 'dshw_settingsHero dshw_low' : 'dshw_settingsHero' },
        React.createElement('div', { className: 'dshw_settingsHeroTop' },
          React.createElement('span', { className: 'dshw_settingsHeroLabel' }, 'DeepSeek 官方余额'),
          React.createElement('span', { className: 'dshw_accountPill', title: activeName || '跟随系统 Key' }, activeName ? '当前 · ' + activeName : '跟随系统 Key'),
          React.createElement('span', { className: 'dshw_balFill' }),
          lowBalance ? React.createElement('span', { className: 'dshw_balWarn' }, '余额偏低') : null),
        React.createElement('div', { className: 'dshw_settingsHeroMain' },
          React.createElement('strong', { className: 'dshw_settingsBalance' }, balanceText),
          React.createElement('span', { className: 'dshw_settingsSpend' },
            React.createElement('span', { className: 'dshw_muted' }, sessionCostLabel(currencyCode)),
            React.createElement('strong', null, sessionCost))),
        React.createElement('div', { className: 'dshw_settingsHeroMeta' },
          React.createElement('span', null, '充值 ' + toppedText),
          React.createElement('span', { className: 'dshw_balDot' }, '·'),
          React.createElement('span', null, '赠送 ' + grantedText),
          React.createElement('span', { className: 'dshw_balDot' }, '·'),
          React.createElement('span', null, currencyCode))))

      // —— 设置卡 ——
      var cells = []
      cells.push(React.createElement('div', { key: 'vis', className: 'dshw_setCell' },
        React.createElement('span', { className: 'dshw_settingsFieldLabel' },
          React.createElement('strong', null, '显示内容'),
          React.createElement('span', null, '选择标签中的数据来源')),
        React.createElement('span', { className: 'dshw_balFill' }),
        React.createElement('label', { className: 'dshw_chipToggle' },
          React.createElement('input', {
            type: 'checkbox', checked: visibility.official,
            'aria-label': '\u663e\u793a\u5b98\u65b9\u6570\u636e',
            onChange: function (event) { persistVisibility({ official: event.target.checked, third: visibility.third }) }
          }), '\u5b98\u65b9'),
        React.createElement('label', { className: 'dshw_chipToggle' },
          React.createElement('input', {
            type: 'checkbox', checked: visibility.third,
            'aria-label': '\u663e\u793a\u7b2c\u4e09\u65b9 token',
            onChange: function (event) { persistVisibility({ official: visibility.official, third: event.target.checked }) }
          }), '\u7b2c\u4e09\u65b9')))
      cells.push(React.createElement('div', { key: 'sc', className: 'dshw_setCell' },
        React.createElement('span', { className: 'dshw_settingsFieldLabel' },
          React.createElement('strong', null, '标签比例'),
          React.createElement('span', null, '按当前停靠位置限制上限')),
        React.createElement('span', { className: 'dshw_balFill' }),
        React.createElement('span', { className: 'dshw_scaleControl' },
          React.createElement('input', {
            className: 'dshw_scaleInput', type: 'range', min: '75', max: String(scaleMax), step: '5',
            value: String(Math.round(scale * 100)),
            'aria-label': '\u94b1\u5305\u82af\u7247\u6bd4\u4f8b',
            onInput: function (event) { persistScale(Number.parseFloat(event.target.value) / 100) },
            onChange: function (event) { persistScale(Number.parseFloat(event.target.value) / 100) }
          }),
          React.createElement('span', { className: 'dshw_scaleValue' }, Math.round(scale * 100) + '%'))))
      cells.push(React.createElement('div', { key: 'quad', className: 'dshw_setCell wide dshw_reminderCard' },
        React.createElement('div', { className: 'dshw_settingsGroupHeader' },
          React.createElement('div', { className: 'dshw_settingsGroupTitle' }, '提醒与会话'),
          React.createElement('div', { className: 'dshw_settingsGroupHint' }, '提醒方式、低余额状态与会话控制')),
        React.createElement('div', { className: 'dshw_settingChoices' },
          React.createElement('div', { className: 'dshw_settingChoice' },
            React.createElement('span', { className: 'dshw_settingChoiceCopy' },
              React.createElement('strong', null, '完成提醒'),
              React.createElement('span', null, '对话结束后通知')),
            React.createElement('select', {
              className: 'dshw_select',
              'aria-label': '完成提醒',
              value: notifyEnabled ? notifyTimeout : 'off',
              onChange: function (event) {
                var v = event.target.value
                if (v === 'off') { persistNotify(false, notifyTimeout); return }
                persistNotify(true, v)
              }
            },
              React.createElement('option', { value: 'off' }, '关闭'),
              React.createElement('option', { value: '5' }, '5 秒'),
              React.createElement('option', { value: '10' }, '10 秒'),
              React.createElement('option', { value: '30' }, '30 秒'),
              React.createElement('option', { value: '60' }, '60 秒'),
              React.createElement('option', { value: 'keep' }, '一直保留'))),
          React.createElement('div', { className: 'dshw_settingChoice' },
            React.createElement('span', { className: 'dshw_settingChoiceCopy' },
              React.createElement('strong', null, '低余额阈值'),
              React.createElement('span', null, thresholdNotice || (currencyCode + ' · 输入后自动保存'))),
            React.createElement('span', { className: 'dshw_settingsInline' },
              React.createElement('span', { style: { fontWeight: 700, color: 'var(--dsw-alias-label-primary,inherit)' } }, currencyCode === 'USD' ? '$' : '¥'),
              React.createElement('input', {
                className: 'dshw_input', type: 'number', min: '0', step: '0.01',
                style: { width: '64px' },
                value: thresholdDraft,
                title: '低于此余额时提醒；0 表示关闭',
                'aria-label': '低余额阈值 (' + currencyCode + ')',
                onInput: function (event) { setThresholdDraft(event.target.value); queueThresholdSave(event.target.value) },
                onChange: function (event) { setThresholdDraft(event.target.value); queueThresholdSave(event.target.value) }
              }),
              React.createElement('span', { className: 'dshw_muted' }, currencyCode))),
          React.createElement('div', { className: 'dshw_settingChoice' },
            React.createElement('span', { className: 'dshw_settingChoiceCopy' },
              React.createElement('strong', null, '低余额闪烁'),
              React.createElement('span', null, '红框向内轻微闪烁')),
            React.createElement('label', { className: 'dshw_switch' },
              React.createElement('input', {
                type: 'checkbox', checked: lowBlinkEnabled,
                'aria-label': '低余额时红色闪烁',
                onChange: function (event) { persistLowBlink(event.target.checked) }
              }),
              React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
              React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' }))),
          React.createElement('div', { className: 'dshw_settingChoice' },
            React.createElement('span', { className: 'dshw_settingChoiceCopy' },
              React.createElement('strong', null, '永久删除会话'),
              React.createElement('span', null, pdSupported ? '在会话菜单中提供入口' : '当前宿主不支持')),
            React.createElement('label', { className: 'dshw_switch', title: pdSupported ? '在会话菜单中显示永久删除' : '当前宿主未提供永久删除能力' },
              React.createElement('input', {
                type: 'checkbox', checked: pdSupported && pdEnabled, disabled: !pdSupported,
                'aria-label': '开启永久删除会话',
                onChange: function (event) {
                  if (!pdSupported) return
                  var enabled = event.target.checked
                  setPdEnabled(enabled)
                  try { compatibility.storage.setItem(PERMANENT_DELETE_KEY, String(enabled)) } catch (e) { /* ignore */ }
                  compatibility.dispatch(PERMANENT_DELETE_EVENT)
                }
              }),
              React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
              React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' }))),
          React.createElement('div', { className: 'dshw_settingChoice' },
            React.createElement('span', { className: 'dshw_settingChoiceCopy' },
              React.createElement('strong', null, '峰谷时钟'),
              React.createElement('span', null, '侧边栏底部环形钟（零文字）')),
            React.createElement('label', { className: 'dshw_switch', title: '在侧边栏设置按钮上方显示峰谷环形钟' },
              React.createElement('input', {
                type: 'checkbox', checked: ringEnabled,
                'aria-label': '显示侧边栏峰谷时钟',
                onChange: function (event) {
                  var enabled = event.target.checked
                  setRingEnabled(enabled)
                  try { compatibility.storage.setItem(PEAK_RING_KEY, String(enabled)) } catch (e) { /* ignore */ }
                  try { compatibility.dispatch(SETTINGS_EVENT) } catch (e) { /* ignore */ }
                  try { compatibility.dispatch(PEAK_RING_EVENT) } catch (e) { /* ignore */ }
                }
              }),
              React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
              React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' }))),
          React.createElement('div', { className: 'dshw_settingChoice' },
            React.createElement('span', { className: 'dshw_settingChoiceCopy' },
              React.createElement('strong', null, '峰谷切换提醒'),
              React.createElement('span', null, '进入高峰/低谷时通知一次')),
            React.createElement('label', { className: 'dshw_switch', title: '峰谷切换时间点各通知一次，不重复弹出' },
              React.createElement('input', {
                type: 'checkbox', checked: peakNotifyEnabled,
                'aria-label': '开启峰谷切换提醒',
                onChange: function (event) {
                  var enabled = event.target.checked
                  setPeakNotifyEnabled(enabled)
                  try { compatibility.storage.setItem(PEAK_NOTIFY_KEY, String(enabled)) } catch (e) { /* ignore */ }
                  try { compatibility.dispatch(SETTINGS_EVENT) } catch (e) { /* ignore */ }
                }
              }),
              React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
              React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' })))))
      )
      rows.push(React.createElement('div', { key: 'setcard', className: 'dshw_setCard' }, cells))

      // —— Provider 分桶（Issue #21：包装官方的路由勾选计入官方计费） ——
      var knownProviders = snapshot && snapshot.providers && Array.isArray(snapshot.providers.known) ? snapshot.providers.known : []
      var officialProviders = snapshot && snapshot.providers && Array.isArray(snapshot.providers.official) ? snapshot.providers.official : []
      if (knownProviders.length > 0 || officialProviders.length > 0) {
        rows.push(React.createElement('div', { key: 'pr-t', className: 'dshw_title', style: { marginTop: '8px' } }, 'Provider \u5206\u6876'))
        var providerRows = officialProviders.map(function (p) {
          return React.createElement('div', { key: 'op-' + p, className: 'dshw_setCell' },
            React.createElement('label', { className: 'dshw_check', style: { margin: 0 } },
              React.createElement('input', {
                type: 'checkbox', checked: true,
                'aria-label': p + ' \u8ba1\u5165\u5b98\u65b9',
                onChange: function () {
                  fetch('/api/wallet/official-providers', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ providers: officialProviders.filter(function (x) { return x !== p }) })
                  }).then(reloadAccounts).catch(function () { /* ignore */ })
                }
              }), p + ' \u00b7 \u5b98\u65b9\u8ba1\u8d39'))
        }).concat(knownProviders.map(function (p) {
          return React.createElement('div', { key: 'kp-' + p, className: 'dshw_setCell' },
            React.createElement('label', { className: 'dshw_check', style: { margin: 0 } },
              React.createElement('input', {
                type: 'checkbox', checked: false,
                'aria-label': p + ' \u8ba1\u5165\u5b98\u65b9',
                onChange: function () {
                  fetch('/api/wallet/official-providers', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ providers: officialProviders.concat([p]) })
                  }).then(reloadAccounts).catch(function () { /* ignore */ })
                }
              }), p + ' \u00b7 \u4e09\u65b9\u8ba1\u8d39'))
        }))
        rows.push(React.createElement('div', { key: 'pr-card', className: 'dshw_setCard', style: { display: 'block' } }, providerRows))
      }

      // —— 账户管理 ——
      rows.push(React.createElement('div', { key: 'acc-t', className: 'dshw_accountHeader' },
        React.createElement('span', { className: 'dshw_title' }, '账户管理'),
        React.createElement('span', { className: 'dshw_accountCount' }, list.length + ' 个账户')))
      if (accountsError) {
        rows.push(React.createElement('div', { key: 'acc-e', className: 'dshw_muted' }, accountsError))
      } else if (list.length === 0) {
        rows.push(React.createElement('div', { key: 'acc-none', className: 'dshw_muted' }, '\u6682\u65e0\u8d26\u6237\uff0c\u6dfb\u52a0\u540e\u5c06\u81ea\u52a8\u6210\u4e3a\u5f53\u524d\u8d26\u6237'))
      } else {
        var AVATAR_HUES = [212, 262, 152, 22, 338, 180]
        var acctRows = list.map(function (acc, i) {
          var hue = AVATAR_HUES[i % AVATAR_HUES.length]
          return React.createElement('div', { key: acc.id, className: acc.active ? 'dshw_acctRow current' : 'dshw_acctRow' },
            React.createElement('span', {
              className: 'dshw_acctAvatar',
              style: { background: 'oklch(0.72 0.14 ' + hue + ' / 0.22)', color: 'oklch(0.5 0.16 ' + hue + ')' }
            }, acc.name.trim().charAt(0).toUpperCase()),
            React.createElement('span', { className: 'dshw_acctInfo' },
              React.createElement('span', { className: 'dshw_acctName' },
                acc.name,
                acc.active ? React.createElement('span', { className: 'dshw_acctBadge' }, 'LLM \u8ba1\u8d39\u4e2d') : null),
              React.createElement('span', { className: 'dshw_acctKey' }, acc.maskedKey)),
            acc.active
              ? React.createElement('span', { key: 'a', className: 'dshw_acctNow' }, '\u5f53\u524d')
              : React.createElement('button', {
                  key: 's', type: 'button', className: 'dshw_btn',
                  style: { height: '22px', padding: '0 10px', fontSize: '11px' },
                  disabled: switchingId !== null,
                  onClick: function () { activateAccount(acc.id, acc.name) }
                }, switchingId === acc.id ? '\u2026' : '\u5207\u6362'),
            React.createElement('button', {
              key: 'r', type: 'button', className: 'dshw_btn',
              style: { height: '24px', padding: '0 8px', fontSize: '10.5px' },
              title: '\u5220\u9664\u8d26\u6237',
              'aria-label': '删除账户 ' + acc.name,
              onClick: function () { removeAccount(acc.id, acc.name) }
            }, '删除'))
        })
        rows.push(React.createElement('div', { key: 'acc-scroll', className: 'dshw_acctScroll' }, acctRows))
      }
      rows.push(React.createElement('div', { key: 'acc-add', className: 'dshw_accountAdd' },
        React.createElement('input', {
          className: 'dshw_input',
          placeholder: '\u540d\u79f0', 'aria-label': '\u540d\u79f0',
          value: nameDraft,
          onInput: function (event) { setNameDraft(event.target.value) },
          onChange: function (event) { setNameDraft(event.target.value) }
        }),
        React.createElement('input', {
          className: 'dshw_input', type: 'password',
          placeholder: 'sk-...', 'aria-label': 'API Key',
          value: keyDraft,
          onInput: function (event) { setKeyDraft(event.target.value) },
          onChange: function (event) { setKeyDraft(event.target.value) }
        }),
        React.createElement('button', {
          type: 'button', className: 'dshw_btn dshw_btnPrimary', style: { height: '28px', padding: '0 14px' },
          onClick: addAccount
        }, '添加')))
      if (accountNotice) {
        rows.push(React.createElement('div', { key: 'acc-n', className: 'dshw_muted' }, accountNotice))
      }

      rows.push(React.createElement('div', { key: 'footer', className: 'dshw_settingsFooter' },
        React.createElement('span', { className: 'dshw_versionBadge' }, 'DeepSeek Harness Control Center v' + WALLET_VERSION),
        React.createElement('span', { className: 'dshw_settingsFooterActions' },
        React.createElement('button', {
          type: 'button', className: 'dshw_btn',
          onClick: function () {
            fetch('/api/wallet/refresh', { method: 'POST' }).then(reloadAccounts).catch(function () { /* ignore */ })
          }
        }, '刷新余额'),
        React.createElement('button', {
          type: 'button', className: 'dshw_btn dshw_btnPrimary',
          onClick: function () { if (close) close(); window.open('https://platform.deepseek.com/top_up', '_blank', 'noopener') }
        }, '↗ 去官方充值'))))
      return React.createElement('div', { className: 'dshw_settingsSection', style: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--dsw-alias-label-primary,#1f2328)' } }, rows)
    }

    // Wall-clock hour (0-24, fractional) inside an IANA timezone, via Intl —
    // never a fixed UTC offset, so DST-observing zones stay correct. Falls back
    // to the policy's declared offset only if Intl cannot resolve the zone.
    function wallHourIn(tz, offsetMinutes, date) {
      try {
        var text = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
        }).format(date)
        var parts = text.split(':')
        var h = Number.parseFloat(parts[0])
        var m = Number.parseFloat(parts[1])
        if (Number.isFinite(h) && Number.isFinite(m)) return (h % 24) + m / 60
      } catch (e) { /* fall through to the fixed offset */ }
      return (date.getTime() + (offsetMinutes || 0) * 60000) % 86400000 / 3600000
    }

    // Pure peak-clock math shared by the sidebar ring: current period, next
    // boundary (wrapping past midnight), the reminder dedup id, and the
    // zero-text-friendly tooltip / screen-reader strings. windows come from
    // the wallet snapshot; anything malformed collapses to the neutral state.
    function peakClockState(policy, nowHour, nowMs) {
      var windows = policy && Array.isArray(policy.windows) ? policy.windows.filter(function (w) {
        return w && Number.isFinite(w.startHour) && Number.isFinite(w.endHour) && w.endHour > w.startHour
      }) : []
      if (windows.length === 0) {
        return { configured: false, windows: [], ariaText: '峰谷计费时段未配置', tip: '峰谷时钟 · 计费时段未配置', periodId: null }
      }
      var inPeak = false
      var segStart = null
      var segEnd = null
      for (var i = 0; i < windows.length; i++) {
        if (nowHour >= windows[i].startHour && nowHour < windows[i].endHour) {
          inPeak = true; segStart = windows[i].startHour; segEnd = windows[i].endHour; break
        }
      }
      if (!inPeak) {
        // Off-peak segment runs from the last passed boundary to the next one.
        var bounds = []
        for (var b = 0; b < windows.length; b++) bounds.push(windows[b].startHour, windows[b].endHour)
        bounds.sort(function (a, b2) { return a - b2 })
        segStart = -1
        segEnd = 25
        for (var c = 0; c < bounds.length; c++) {
          if (bounds[c] <= nowHour && bounds[c] > segStart) segStart = bounds[c]
          if (bounds[c] > nowHour && bounds[c] < segEnd) segEnd = bounds[c]
        }
        if (segStart < 0) segStart = bounds[bounds.length - 1] - 24 // late evening wraps to yesterday's last edge
      }
      // Late evening off-peak is past every boundary: the next switch is the
      // FIRST boundary of tomorrow (segEnd still sits at its 25 sentinel).
      var nextHour = !inPeak && segEnd > 24 ? bounds[0] : segEnd
      function hh(h) { return String(Math.floor(((h % 24) + 24) % 24)).padStart(2, '0') + ':00' }
      var winText = windows.map(function (w) { return hh(w.startHour) + '–' + hh(w.endHour) }).join(' / ')
      var tzName = policy.timezone || 'Asia/Shanghai'
      var rate = typeof policy.offPeakRate === 'number' && policy.offPeakRate > 0 ? policy.offPeakRate : 0.5
      var rateWord = rate === 0.5 ? '半价' : '×' + rate
      var hoursLeft = (nextHour - nowHour + 24) % 24
      var msLeft = Math.round(hoursLeft * 3600000)
      var hLeft = Math.floor(msLeft / 3600000)
      var mLeft = Math.floor((msLeft % 3600000) / 60000)
      var leftText = hLeft > 0 ? hLeft + ' 小时 ' + mLeft + ' 分' : mLeft + ' 分钟'
      var leftShort = hLeft > 0 ? (hLeft + 'h' + (mLeft > 0 ? mLeft + 'm' : '')) : (mLeft + 'm')
      var switchText = inPeak ? (hh(nextHour) + ' 后' + rateWord) : (hh(nextHour) + ' 恢复标准价')
      var period = inPeak ? '高峰' : '低谷' + rateWord
      var periodName = inPeak ? '高峰时段' : '低谷时段'
      var rateBadge = inPeak ? '标准价' : (rate === 0.5 ? '半价' : '×' + rate)
      var countdownSummary = hh(nextHour) + ' 切换 · 剩 ' + leftShort
      var windowSummary = '高峰 ' + winText
      // Dual timezone: billing is judged in the policy's base zone; a device
      // elsewhere also sees the local-clock span of the CURRENT segment.
      var localNote = ''
      try {
        var localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (localTz && localTz !== tzName && Number.isFinite(nowMs)) {
          var hoursAgo = (nowHour - segStart + 24) % 24
          var segLenH = ((nextHour - segStart) % 24 + 24) % 24 || 24
          var startInstant = nowMs - hoursAgo * 3600000
          var endInstant = startInstant + segLenH * 3600000
          var fmtLocal = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
          localNote = ' · 当地 ' + fmtLocal.format(startInstant) + '–' + fmtLocal.format(endInstant)
        }
      } catch (e) { /* timezone introspection is best-effort */ }
      var ariaText = inPeak
        ? '当前为高峰时段，' + tzName + ' ' + winText + '，按标准价计费'
        : '当前为低谷时段，按平价的 ' + rate + ' 倍计费，' + tzName + ' 高峰 ' + winText
      var tip = '峰谷时钟 · 当前' + period + ' · ' + switchText + ' · 还有 ' + leftText
        + ' · 高峰 ' + winText + '（' + tzName + '）' + localNote
      return {
        configured: true, windows: windows, inPeak: inPeak,
        nextHour: nextHour, ariaText: ariaText, tip: tip,
        periodName: periodName, rateBadge: rateBadge,
        countdownSummary: countdownSummary, windowSummary: windowSummary,
        // Reminder dedup id: entering this period at this boundary fires once.
        periodId: (inPeak ? 'p' : 'o') + Math.round(segStart * 100),
        switchBody: inPeak ? '已进入高峰时段，按标准价计费' : '已进入低谷时段，按平价的 ' + rate + ' 倍计费',
      }
    }

    // Sidebar foot occupant: the 24h peak/off-peak ring clock, registered on
    // the host's sidebar.footer.action list so it sits in the strip the
    // Sidebar foot occupant: the 24h peak/off-peak ring clock, registered on
    // the host's sidebar.footer.action list so it sits in the strip the
    // sidebar keeps right above its Settings row (bottom left). Zero in-ring text —
    // the arcs, the bolded current segment and the hover tooltip carry the meaning.
    // In wide mode, it displays the 46px ring clock alongside status, balance/cost, and countdown.
    // In rail mode, it collapses to a 34px centered circular widget.
    function PeakRingFooter(props) {
      props = props || {}
      var wide = props.wide !== false
      var [shown, setShown] = React.useState(function () {
        try { return compatibility.storage.getItem(PEAK_RING_KEY) !== 'false' } catch (e) { return true }
      })
      var [snapshot, setSnapshot] = React.useState(undefined) // undefined = loading
      var [nowMs, setNowMs] = React.useState(function () { return Date.now() })

      React.useEffect(function () {
        var stopped = false
        function loadSnap() {
          fetch('/api/wallet/snapshot').then(function (resp) { return resp.json() }).then(function (json) {
            if (!stopped && json && json.ok) setSnapshot(json)
          }).catch(function () { if (!stopped) setSnapshot({ ok: false }) })
        }
        loadSnap()
        var listensEvents = typeof window.addEventListener === 'function'
        function onRingChange() {
          try { setShown(compatibility.storage.getItem(PEAK_RING_KEY) !== 'false') } catch (e) { /* ignore */ }
          loadSnap()
        }
        function onSnapUpdate(event) {
          if (!stopped && event && event.detail && event.detail.ok) {
            setSnapshot(event.detail)
          }
        }
        if (listensEvents) {
          window.addEventListener(PEAK_RING_EVENT, onRingChange)
          window.addEventListener(SETTINGS_EVENT, onRingChange)
          window.addEventListener('dshw-refresh', onRingChange)
          window.addEventListener('dshw-snapshot-update', onSnapUpdate)
        }
        var timer = window.setInterval(function () {
          setNowMs(Date.now())
          loadSnap()
        }, 30000)
        return function () {
          stopped = true
          window.clearInterval(timer)
          if (listensEvents) {
            window.removeEventListener(PEAK_RING_EVENT, onRingChange)
            window.removeEventListener(SETTINGS_EVENT, onRingChange)
            window.removeEventListener('dshw-refresh', onRingChange)
            window.removeEventListener('dshw-snapshot-update', onSnapUpdate)
          }
        }
      }, [])

      var policy = snapshot && snapshot.pricingWindows ? snapshot.pricingWindows : null

      React.useEffect(function () {
        if (policy === undefined || policy === null) return
        try {
          if (compatibility.storage.getItem(PEAK_NOTIFY_KEY) !== 'true') return
        } catch (e) { return }
        var tzName = policy.timezone || 'Asia/Shanghai'
        var state = peakClockState(policy, wallHourIn(tzName, policy.offsetMinutes, new Date(nowMs)), nowMs)
        if (!state.periodId) return
        var last = null
        try { last = compatibility.storage.getItem(PEAK_NOTIFY_LAST_KEY) } catch (e) { /* ignore */ }
        if (last === state.periodId) return
        try { compatibility.storage.setItem(PEAK_NOTIFY_LAST_KEY, state.periodId) } catch (e) { /* ignore */ }
        if (last === null) return
        try {
          compatibility.notify('DeepSeek Harness · 峰谷切换', {
            body: state.switchBody, tag: 'dsh-wallet-peak'
          })
        } catch (e) { /* ignore */ }
      }, [policy, nowMs])

      if (!shown || snapshot === undefined) return null
      var tzName = policy && policy.timezone ? policy.timezone : 'Asia/Shanghai'
      var offsetMinutes = policy && typeof policy.offsetMinutes === 'number' ? policy.offsetMinutes : 480
      var state = peakClockState(policy, wallHourIn(tzName, offsetMinutes, new Date(nowMs)), nowMs)

      var bal = snapshot && snapshot.balance ? snapshot.balance : {}
      var balCurrency = bal && bal.currency ? bal.currency : 'CNY'
      var balText = bal.total !== null && bal.total !== undefined ? fmtCurrency(bal.total, balCurrency) : fmtCurrency(0, balCurrency)
      var session = snapshot && snapshot.session ? snapshot.session : {}
      var official = session && session.official ? session.official : {}
      var costValue = (official.cost === null || official.cost === undefined) ? 0 : official.cost
      var costText = sessionCostText(costValue, balCurrency)
      var costLabel = sessionCostLabel(balCurrency)
      var low = snapshot && snapshot.lowBalance === true

      return React.createElement('div', {
        className: 'dshw_footRing' + (wide ? '' : ' dshw_footRingRail') + (low ? ' dshw_low' : ''),
        title: state.tip + ' · 余额 ' + balText + ' · ' + costLabel + ' ' + costText + (wide ? '' : ' · 点击前往官方充值'),
        'aria-label': state.ariaText + '，余额 ' + balText + '，' + costLabel + ' ' + costText,
        role: 'region',
        onClick: wide ? undefined : function () { window.open('https://platform.deepseek.com/top_up', '_blank', 'noopener') }
      },
        React.createElement('div', { style: { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          peakRingSVG(state.configured ? state.windows : null, wallHourIn(tzName, offsetMinutes, new Date(nowMs)), wide ? 50 : 36, state.ariaText)
        ),
        wide ? React.createElement('div', { className: 'dshw_footRingLabel' },
          React.createElement('div', { className: 'dshw_footRingHeader' },
            React.createElement('span', {
              className: 'dshw_footRingTitle',
              style: { color: state.configured ? (state.inPeak ? 'var(--dsw-alias-state-error-primary,#e5534b)' : 'var(--dsw-alias-state-success-primary,#1a7f37)') : 'inherit' }
            }, state.configured ? state.periodName : '峰谷时钟'),
            state.configured && !state.inPeak ? React.createElement('span', {
              className: 'dshw_footRingBadge dshw_footRingBadgeOff'
            }, state.rateBadge) : null
          ),
          React.createElement('div', { className: 'dshw_footRingMoney' + (low ? ' dshw_low' : '') },
            React.createElement('span', { className: 'dshw_muted' }, '余额 '),
            React.createElement('span', { className: 'dshw_footBalNum', style: { fontWeight: '600' } }, balText),
            React.createElement('span', { className: 'dshw_balDot', style: { margin: '0 3px' } }, '·'),
            React.createElement('span', { className: 'dshw_muted' }, costLabel + ' '),
            React.createElement('span', { style: { fontWeight: '600' } }, costText)
          ),
          React.createElement('span', { className: 'dshw_footRingCountdown' },
            state.configured ? state.countdownSummary : '计费时段未配置')
        ) : null,
        wide ? React.createElement('div', { className: 'dshw_footRingRecharge' },
          React.createElement('button', {
            type: 'button',
            className: 'dshw_footRingBtnRechargeVertical',
            title: 'DeepSeek 开放平台 · 前往官方充值',
            'aria-label': '前往官方充值',
            onClick: function (e) {
              if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
              window.open('https://platform.deepseek.com/top_up', '_blank', 'noopener')
            }
          },
            React.createElement('span', { style: { lineHeight: 1 } }, '充'),
            React.createElement('span', { style: { lineHeight: 1 } }, '值')
          )
        ) : null
      )
    }

    function WalletChip(props) {
      props = props || {}
      var sessionId = props.sessionId
      var dataRef = React.useRef(null)
      var notifiedRef = React.useRef(false)
      var chipAnchorRef = React.useRef(null)
      var chipRef = React.useRef(null)
      var chipButtonRef = React.useRef(null)
      var panelRef = React.useRef(null)
      var panelDragRef = React.useRef(null)
      var confirmRef = React.useRef(null)
      var cancelButtonRef = React.useRef(null)
      var confirmButtonRef = React.useRef(null)
      var restoreFocusRef = React.useRef(null)
      var thresholdInitializedRef = React.useRef(false)
      var thresholdEditTimerRef = React.useRef(null)
      var [data, setData] = React.useState(null)
      var [open, setOpen] = React.useState(false)
      var [panelStyle, setPanelStyle] = React.useState({ visibility: 'hidden' })
      var [panelPos, setPanelPos] = React.useState(function () {
        try {
          var raw = compatibility.storage.getItem(PANEL_POS_KEY)
          if (raw === null) return null
          var parts = raw.split(',')
          var x = Number.parseFloat(parts[0]); var y = Number.parseFloat(parts[1])
          return Number.isFinite(x) && Number.isFinite(y) ? { x: x, y: y } : null
        } catch (e) { return null }
      })
      var panelPosRef = React.useRef(panelPos)
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
        try { return compatibility.storage.getItem('dshw-float-mode') === 'float' || compatibility.storage.getItem('dshw-float-mode') === 'dot' } catch (e) { return false }
      })
      var [minimized, setMinimized] = React.useState(function () {
        try { return compatibility.storage.getItem('dshw-float-mode') === 'dot' } catch (e) { return false }
      })
      var [floatPos, setFloatPos] = React.useState(null)
      var floatPosRef = React.useRef(null)
      var floatRef = React.useRef(null)
      var dragRef = React.useRef(null)
      var didDragRef = React.useRef(false)
      var [chipLayout, setChipLayout] = React.useState(function () {
        try {
          var saved = compatibility.storage.getItem(CHIP_LAYOUT_KEY)
          return saved === null ? normalizeChipLayout(null) : normalizeChipLayout(JSON.parse(saved))
        } catch (e) { return normalizeChipLayout(null) }
      })
      var [chipScale, setChipScale] = React.useState(function () {
        try { return normalizeChipScale(compatibility.storage.getItem(CHIP_SCALE_KEY)) } catch (e) { return 1 }
      })
      var [homeMode, setHomeMode] = React.useState('full')
            var chipLiftHostRef = React.useRef(null)
      var [dataVisibility, setDataVisibility] = React.useState(function () {
        try {
          var savedVisibility = compatibility.storage.getItem(DATA_VISIBILITY_KEY)
          return normalizeDataVisibility(savedVisibility === null ? null : JSON.parse(savedVisibility))
        } catch (e) { return normalizeDataVisibility(null) }
      })
      var [notifyConfig, setNotifyConfig] = React.useState(readNotifyConfig)
      React.useEffect(function () {
        function refreshVisibilityAndScale() {
          try {
            var savedVisibility = compatibility.storage.getItem(DATA_VISIBILITY_KEY)
            setDataVisibility(savedVisibility === null ? normalizeDataVisibility(null) : normalizeDataVisibility(JSON.parse(savedVisibility)))
          } catch (e) { /* ignore */ }
          try { setChipScale(normalizeChipScale(compatibility.storage.getItem(CHIP_SCALE_KEY))) } catch (e) { /* ignore */ }
        }
        window.addEventListener(SETTINGS_EVENT, refreshVisibilityAndScale)
        return function () { window.removeEventListener(SETTINGS_EVENT, refreshVisibilityAndScale) }
      }, [])

      React.useEffect(function () {
        function refreshNotifyConfig() { setNotifyConfig(readNotifyConfig()) }
        window.addEventListener(NOTIFY_CONFIG_EVENT, refreshNotifyConfig)
        window.addEventListener('storage', refreshNotifyConfig)
        return function () {
          window.removeEventListener(NOTIFY_CONFIG_EVENT, refreshNotifyConfig)
          window.removeEventListener('storage', refreshNotifyConfig)
        }
      }, [])
      var [permanentDeleteEnabled, setPermanentDeleteEnabled] = React.useState(function () {
        try { return compatibility.storage.getItem(PERMANENT_DELETE_KEY) === 'true' } catch (e) { return false }
      })
      var [permanentDeleteSupported, setPermanentDeleteSupported] = React.useState(function () {
        return compatibility.hasCapability('permanentDelete')
      })
      React.useEffect(function () {
        function refreshHostCapabilities() { setPermanentDeleteSupported(compatibility.hasCapability('permanentDelete')) }
        window.addEventListener(HOST_CAPABILITY_EVENT, refreshHostCapabilities)
        refreshHostCapabilities()
        return function () { window.removeEventListener(HOST_CAPABILITY_EVENT, refreshHostCapabilities) }
      }, [])

      React.useEffect(function () {
        var pw = data && data.pricingWindows
        if (!pw || !pw.windows) return
        var checkNotify = function () {
          try {
            if (compatibility.storage.getItem(PEAK_NOTIFY_KEY) !== 'true') return
          } catch (e) { return }
          var now = Date.now()
          var tz = pw.timezone || 'Asia/Shanghai'
          var offMin = typeof pw.offsetMinutes === 'number' ? pw.offsetMinutes : 480
          var st = peakClockState(pw, wallHourIn(tz, offMin, new Date(now)), now)
          if (!st.periodId) return
          var last = null
          try { last = compatibility.storage.getItem(PEAK_NOTIFY_LAST_KEY) } catch (e) { /* ignore */ }
          if (last === st.periodId) return
          try { compatibility.storage.setItem(PEAK_NOTIFY_LAST_KEY, st.periodId) } catch (e) { /* ignore */ }
          if (last === null) return
          try {
            compatibility.notify('DeepSeek Harness · 峰谷切换', {
              body: st.switchBody, tag: 'dsh-wallet-peak'
            })
          } catch (e) { /* ignore */ }
        }
        checkNotify()
        var timer = setInterval(checkNotify, 60000)
        return function () { clearInterval(timer) }
      }, [data])
      var showOfficial = dataVisibility.official
      var showThird = dataVisibility.third
      var chipScaleRef = React.useRef(chipScale)
      var chipSizeRef = React.useRef({ horizontal: null, vertical: null })
      var [snapPreview, setSnapPreview] = React.useState(null)
      var chipLayoutRef = React.useRef(chipLayout)
      var chipDragRef = React.useRef(null)
      var chipDidDragRef = React.useRef(false)
      var bottomDockHostRef = React.useRef(null)
      chipLayoutRef.current = chipLayout
      chipScaleRef.current = chipScale
      panelPosRef.current = panelPos

      function applyChipLayout(next) {
        next = normalizeChipLayout(next)
        chipLayoutRef.current = next
        setChipLayout(next)
        try { compatibility.storage.setItem(CHIP_LAYOUT_KEY, JSON.stringify(next)) } catch (e) { /* ignore */ }
      }

      function savePanelPosition(next) {
        panelPosRef.current = next
        setPanelPos(next)
        try { compatibility.storage.setItem(PANEL_POS_KEY, next.x + ',' + next.y) } catch (e) { /* ignore */ }
      }

      function saveChipScale(next) {
        next = normalizeChipScale(next)
        var cap = chipLayoutRef.current.dock === 'home' ? 1.05 : 1.25
        if (next > cap) next = cap
        chipScaleRef.current = next
        setChipScale(next)
        try { compatibility.storage.setItem(CHIP_SCALE_KEY, String(next)) } catch (e) { /* ignore */ }
      }

      function saveDataVisibility(next) {
        next = normalizeDataVisibility(next)
        setDataVisibility(next)
        try { compatibility.storage.setItem(DATA_VISIBILITY_KEY, JSON.stringify(next)) } catch (e) { /* ignore */ }
      }

      function saveNotifyConfig(next) {
        next = normalizeNotifyConfig(next)
        setNotifyConfig(next)
        try { compatibility.storage.setItem(NOTIFY_CONFIG_KEY, JSON.stringify(next)) } catch (e) { /* ignore */ }
        compatibility.dispatch(NOTIFY_CONFIG_EVENT)
      }

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
            try {
              if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('dshw-snapshot-update', { detail: json }))
              }
            } catch (e) { /* ignore */ }
            if (json.threshold !== undefined && json.threshold !== null) {
              // Follow the active currency's own threshold line: switching
              // accounts (and thus currency) refreshes the draft unless the
              // user is mid-edit (the 600ms auto-save owns that window).
              setThresholdDraft(function (prev) {
                if (thresholdInitializedRef.current === 'editing') return prev
                return json.threshold.toFixed(2)
              })
            }
            if (showOfficial && json.lowBalance) {
              if (!notifiedRef.current) {
                try {
                  var lowCurrency = json.balance && json.balance.currency ? json.balance.currency : 'CNY'
                  var lowNotice = compatibility.notify('DeepSeek 余额不足', { body: '余额已低于提醒线 ' + fmtCurrency(json.threshold, lowCurrency), tag: 'dsh-wallet-low' })
                  if (lowNotice) notifiedRef.current = true
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
      }, [sessionId, showOfficial])
      React.useEffect(function () {
        loadAccounts()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      React.useEffect(function () {
        function onMove(event) {
          var chipDrag = chipDragRef.current
          if (chipDrag !== null && event.pointerId === chipDrag.pointerId) {
            var moved = Math.abs(event.clientX - chipDrag.startX) > 3 || Math.abs(event.clientY - chipDrag.startY) > 3
            if (moved) {
              if (!chipDrag.dragged && chipDrag.node && chipDrag.node.setPointerCapture) {
                try { chipDrag.node.setPointerCapture(chipDrag.pointerId) } catch (e) { /* ignore */ }
              }
              chipDrag.dragged = true
              chipDidDragRef.current = true
              setOpen(false)
              var liveRect = chipDrag.node.getBoundingClientRect()
              var liveWidth = liveRect.width || chipDrag.w
              var liveHeight = liveRect.height || chipDrag.h
              var liveSize = { width: liveWidth, height: liveHeight, scale: chipScaleRef.current }
              if (chipDrag.node.classList && chipDrag.node.classList.contains('dshw_chipVertical')) chipSizeRef.current.vertical = liveSize
              else chipSizeRef.current.horizontal = liveSize
              var chipX = Math.max(CHIP_EDGE_MARGIN, Math.min(window.innerWidth - liveWidth - CHIP_EDGE_MARGIN, event.clientX - liveWidth * chipDrag.grabXRatio))
              var chipY = Math.max(CHIP_EDGE_MARGIN, Math.min(window.innerHeight - liveHeight - CHIP_EDGE_MARGIN, event.clientY - liveHeight * chipDrag.grabYRatio))
              chipDrag.x = chipX
              chipDrag.y = chipY
              var movingLayout = { dock: 'free', x: chipX, y: chipY }
              chipLayoutRef.current = movingLayout
              setChipLayout(movingLayout)
              var homeRect = findComposerRect(chipAnchorRef.current, window.innerWidth, window.innerHeight)
              var contentHost = findBottomDockHost(chipAnchorRef.current, window.innerWidth, window.innerHeight)
              var contentRect = contentHost && typeof contentHost.getBoundingClientRect === 'function' ? contentHost.getBoundingClientRect() : null
              var pointer = { x: event.clientX, y: event.clientY }
              var previewDock = chooseChipDock(movingLayout, liveWidth, liveHeight, window.innerWidth, window.innerHeight, homeRect, pointer, contentRect)
              var anchorRect = chipAnchorRef.current && typeof chipAnchorRef.current.getBoundingClientRect === 'function' ? chipAnchorRef.current.getBoundingClientRect() : null
              var scale = chipScaleRef.current
              var savedHorizontal = chipSizeRef.current.horizontal
              var savedVertical = chipSizeRef.current.vertical
              var horizontalFactor = savedHorizontal && savedHorizontal.scale ? scale / savedHorizontal.scale : 1
              var verticalFactor = savedVertical && savedVertical.scale ? scale / savedVertical.scale : 1
              var previewSizes = {
                horizontal: savedHorizontal ? { width: savedHorizontal.width * horizontalFactor, height: savedHorizontal.height * horizontalFactor } : { width: Math.min(320 * scale, window.innerWidth - CHIP_EDGE_MARGIN * 2), height: 22 * scale },
                vertical: savedVertical ? { width: savedVertical.width * verticalFactor, height: savedVertical.height * verticalFactor } : { width: 40 * scale, height: 127 * scale }
              }
              setSnapPreview(computeSnapPreview(previewDock, movingLayout, window.innerWidth, window.innerHeight, homeRect, contentRect, anchorRect, previewSizes))
              if (event.preventDefault) event.preventDefault()
            }
            return
          }
          var panelDrag = panelDragRef.current
          if (panelDrag !== null && event.pointerId === panelDrag.pointerId) {
            var panelMoved = Math.abs(event.clientX - panelDrag.startX) > 3 || Math.abs(event.clientY - panelDrag.startY) > 3
            if (panelMoved) {
              panelDrag.dragged = true
              var panelFitted = clampPosition({
                x: event.clientX - panelDrag.dx,
                y: event.clientY - panelDrag.dy
              }, panelDrag.w, panelDrag.h, window.innerWidth, window.innerHeight)
              panelDrag.x = panelFitted.x
              panelDrag.y = panelFitted.y
              panelPosRef.current = panelFitted
              setPanelStyle({ left: panelFitted.x, top: panelFitted.y, visibility: 'visible' })
              if (event.preventDefault) event.preventDefault()
            }
            return
          }
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
          var chipDrag = chipDragRef.current
          if (chipDrag !== null && event.pointerId === chipDrag.pointerId) {
            chipDragRef.current = null
            setSnapPreview(null)
            if (chipDrag.dragged) {
              var releaseRect = chipDrag.node.getBoundingClientRect()
              var releasePos = {
                x: Number.isFinite(chipDrag.x) ? chipDrag.x : releaseRect.left,
                y: Number.isFinite(chipDrag.y) ? chipDrag.y : releaseRect.top
              }
              var homeRect = findComposerRect(chipAnchorRef.current, window.innerWidth, window.innerHeight)
              var contentHost = findBottomDockHost(chipAnchorRef.current, window.innerWidth, window.innerHeight)
              var contentRect = contentHost && typeof contentHost.getBoundingClientRect === 'function' ? contentHost.getBoundingClientRect() : null
              var pointer = { x: event.clientX, y: event.clientY }
              var dock = chooseChipDock(releasePos, releaseRect.width, releaseRect.height, window.innerWidth, window.innerHeight, homeRect, pointer, contentRect)
              if (dock === 'free') releasePos = clampFreeDrop(releasePos, releaseRect.width, releaseRect.height, window.innerWidth, window.innerHeight, pointer, contentRect)
              applyChipLayout({ dock: dock, x: releasePos.x, y: releasePos.y })
              setTimeout(function () { chipDidDragRef.current = false }, 0)
            } else {
              chipDidDragRef.current = false
            }
            if (chipDrag.node && chipDrag.node.releasePointerCapture) {
              try { chipDrag.node.releasePointerCapture(chipDrag.pointerId) } catch (e) { /* ignore */ }
            }
            return
          }
          var panelDrag = panelDragRef.current
          if (panelDrag !== null && event.pointerId === panelDrag.pointerId) {
            panelDragRef.current = null
            if (panelDrag.dragged) savePanelPosition({ x: panelDrag.x, y: panelDrag.y })
            if (panelDrag.node && panelDrag.node.releasePointerCapture) {
              try { panelDrag.node.releasePointerCapture(panelDrag.pointerId) } catch (e) { /* ignore */ }
            }
            return
          }
          var d = dragRef.current
          if (d === null || event.pointerId !== d.pointerId) return
          dragRef.current = null
          if (d.dot && didDragRef.current === true) {
            var settled = settleDotPosition(d, d.w, d.h, window.innerWidth, window.innerHeight)
            d.x = settled.x
            d.y = settled.y
            floatPosRef.current = { x: d.x, y: d.y }
            setFloatPos(floatPosRef.current)
          }
          try { compatibility.storage.setItem('dshw-float-pos', d.x + ',' + d.y) } catch (e) { /* ignore */ }
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
          var saved = panelPosRef.current
          if (saved) {
            var fitted = clampPosition(saved, panelRect.width, panelRect.height, window.innerWidth, window.innerHeight)
            if (fitted.x !== saved.x || fitted.y !== saved.y) savePanelPosition(fitted)
            setPanelStyle({ left: fitted.x, top: fitted.y, visibility: 'visible' })
          } else {
            setPanelStyle(computePanelPosition(chipRect, panelRect, window.innerWidth, window.innerHeight))
          }
        }
        placePanel()
        window.addEventListener('resize', placePanel)
        window.addEventListener('scroll', placePanel, true)
        return function () {
          window.removeEventListener('resize', placePanel)
          window.removeEventListener('scroll', placePanel, true)
        }
      }, [open, floated, data, chipScale, showOfficial, showThird])

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
          var raw = compatibility.storage.getItem('dshw-float-pos')
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
          grabXRatio: rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5,
          grabYRatio: rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5,
          node: node,
          dot: minimized
        }
        didDragRef.current = false
        if (node.setPointerCapture) {
          try { node.setPointerCapture(event.pointerId) } catch (e) { /* ignore */ }
        }
        event.preventDefault()
      }

      function onChipDown(event) {
        if (event.pointerType !== 'touch' && event.button !== 0) return
        var node = chipRef.current
        if (node === null) return
        var rect = node.getBoundingClientRect()
        var startSize = { width: rect.width, height: rect.height, scale: chipScaleRef.current }
        if (node.classList && node.classList.contains('dshw_chipVertical')) chipSizeRef.current.vertical = startSize
        else chipSizeRef.current.horizontal = startSize
        chipDragRef.current = {
          pointerId: event.pointerId,
          dx: event.clientX - rect.left,
          dy: event.clientY - rect.top,
          startX: event.clientX,
          startY: event.clientY,
          x: rect.left,
          y: rect.top,
          w: rect.width,
          h: rect.height,
          grabXRatio: rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5,
          grabYRatio: rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5,
          node: node,
          dragged: false
        }
        chipDidDragRef.current = false
      }

      function onPanelDown(event) {
        if (event.pointerType !== 'touch' && event.button !== 0) return
        var target = event.target
        var node = panelRef.current
        if (node === null) return
        if (target && target.closest && target.closest('button,input,a')) return
        var rect = node.getBoundingClientRect()
        panelDragRef.current = {
          pointerId: event.pointerId,
          dx: event.clientX - rect.left,
          dy: event.clientY - rect.top,
          startX: event.clientX,
          startY: event.clientY,
          x: rect.left,
          y: rect.top,
          w: rect.width,
          h: rect.height,
          node: node,
          dragged: false
        }
        if (node.setPointerCapture) {
          try { node.setPointerCapture(event.pointerId) } catch (e) { /* ignore */ }
        }
        if (event.preventDefault) event.preventDefault()
      }

      // A docked chip is position:fixed, but it still renders inside the host
      // composer subtree; hosts commonly wrap that subtree in a low stacking
      // context (dsh uses z-index:1), which caps the chip under neighbouring
      // top-level panels. The node must stay in place so React's delegated
      // events keep working, so instead lift the outermost trapping ancestor
      // context while any dock mode is active.
      useLayoutEffect(function () {
        if (chipLayout.dock === 'home') return
        var node = chipAnchorRef.current
        if (node === null || typeof window === 'undefined' || !window.getComputedStyle) return
        var outermost = null
        while (node && node !== document.body) {
          if (isStackingContext(window.getComputedStyle(node))) outermost = node
          node = node.parentElement
        }
        chipLiftHostRef.current = outermost
        if (outermost && outermost.classList) outermost.classList.add('dshw_chipLift')
        return function () {
          if (outermost && outermost.classList) outermost.classList.remove('dshw_chipLift')
          if (chipLiftHostRef.current === outermost) chipLiftHostRef.current = null
        }
      }, [chipLayout.dock])

      // A stored 125% from a floating/side dock must come back down when the
      // chip returns to the space-constrained home row.
      React.useEffect(function () {
        if (chipLayout.dock === 'home' && chipScaleRef.current > 1.05) saveChipScale(1.05)
      }, [chipLayout.dock])

      useLayoutEffect(function () {
        var node = chipRef.current
        if (node === null) return
        var rect = node.getBoundingClientRect()
        var measured = { width: rect.width, height: rect.height, scale: chipScaleRef.current }
        if (node.classList && node.classList.contains('dshw_chipVertical')) chipSizeRef.current.vertical = measured
        else chipSizeRef.current.horizontal = measured
      }, [chipLayout.dock, chipScale, data, showOfficial, showThird, homeMode])

      useLayoutEffect(function () {
        if (chipLayout.dock !== 'home') return
        var anchor = chipAnchorRef.current
        var chip = chipRef.current
        if (!anchor || !chip) return

        function measureHomeMode() {
          var current = chipAnchorRef.current
          var chipNode = chipRef.current
          if (!current || !chipNode) return null
          // Try each tier in place and let the composer row's own flex pressure
          // accept or squeeze it: a tier fits when the chip's allocated width
          // matches its content width. All readings come from the chip itself
          // so the scale slider's zoom factor cancels out; the anchor's
          // parent slot wrapper can be display:contents, so measuring
          // ancestors is not reliable.
          var compact = current.classList.contains('dshw_compact')
          current.classList.remove('dshw_compact')
          current.classList.remove('dshw_fit')
          var mode
          if (chipNode.clientWidth >= chipNode.scrollWidth - 1) {
            mode = 'full'
          } else {
            current.classList.add('dshw_fit')
            mode = chipNode.clientWidth >= chipNode.scrollWidth - 1 ? 'fit' : 'compact'
            current.classList.remove('dshw_fit')
          }
          if (compact) current.classList.add('dshw_compact')
          return mode
        }

        function evaluateHomeSpace() {
          var next = measureHomeMode()
          if (next) setHomeMode(next)
        }

        evaluateHomeSpace()
        window.addEventListener('resize', evaluateHomeSpace)
        var observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(evaluateHomeSpace) : null
        if (observer) {
          observer.observe(anchor)
          observer.observe(chip)
        }
        return function () {
          window.removeEventListener('resize', evaluateHomeSpace)
          if (observer) observer.disconnect()
        }
      }, [chipLayout.dock, chipScale, data, showOfficial, showThird])

      useLayoutEffect(function () {
        var previous = bottomDockHostRef.current
        if (previous && previous.classList) previous.classList.remove('dshw_bottomDockHost')
        bottomDockHostRef.current = null
        if (chipLayout.dock !== 'bottom') return
        var host = findBottomDockHost(chipAnchorRef.current, window.innerWidth, window.innerHeight)
        if (!host || !host.classList) return
        host.classList.add('dshw_bottomDockHost')
        bottomDockHostRef.current = host
        return function () {
          if (host.classList) host.classList.remove('dshw_bottomDockHost')
          if (bottomDockHostRef.current === host) bottomDockHostRef.current = null
        }
      }, [chipLayout.dock])

      useLayoutEffect(function () {
        if (chipLayout.dock === 'home' || chipRef.current === null) return
        var node = chipRef.current
        function fitDockedChip() {
          var rect = node.getBoundingClientRect()
          var current = chipLayoutRef.current
          var next = current
          var composerRect = findComposerRect(chipAnchorRef.current, window.innerWidth, window.innerHeight)
          if (current.dock === 'free') {
            var fitted = clampPosition(current, rect.width, rect.height, window.innerWidth, window.innerHeight)
            next = { dock: 'free', x: fitted.x, y: fitted.y }
          } else if (current.dock === 'left' || current.dock === 'right' || current.dock === 'content-left') {
            var sideContentRect = null
            if (current.dock === 'content-left') {
              var contentHost = findBottomDockHost(chipAnchorRef.current, window.innerWidth, window.innerHeight)
              sideContentRect = contentHost && typeof contentHost.getBoundingClientRect === 'function' ? contentHost.getBoundingClientRect() : null
            }
            var sideX = computeSideDockX(current.dock, rect.width, window.innerWidth, sideContentRect)
            var sideY = Math.max(CHIP_EDGE_MARGIN, Math.min(window.innerHeight - rect.height - CHIP_EDGE_MARGIN, current.y))
            next = { dock: current.dock, x: sideX, y: sideY }
          } else if (current.dock === 'bottom') {
            var bottomX = (window.innerWidth - rect.width) / 2
            var bottomY = window.innerHeight - rect.height - CHIP_EDGE_MARGIN
            if (composerRect && composerRect.width >= 150) {
              bottomX = composerRect.left + (composerRect.width - rect.width) / 2
            }
            next = { dock: 'bottom', x: bottomX, y: bottomY }
          }
          if (next.x !== current.x || next.y !== current.y) applyChipLayout(next)
        }
        fitDockedChip()
        window.addEventListener('resize', fitDockedChip)
        window.addEventListener('scroll', fitDockedChip, true)
        return function () {
          window.removeEventListener('resize', fitDockedChip)
          window.removeEventListener('scroll', fitDockedChip, true)
        }
      }, [chipLayout.dock, chipScale, data, showOfficial, showThird])

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
      }, [floated, minimized, showOfficial, showThird])

      React.useEffect(function () {
        try {
          var mode = 'chip'
          if (floated) mode = minimized ? 'dot' : 'float'
          compatibility.storage.setItem('dshw-float-mode', mode)
        } catch (e) { /* ignore */ }
      }, [floated, minimized])

      function requestNotify() {
        compatibility.requestNotificationPermission().then(function () {
          compatibility.dispatch(NOTIFY_CONFIG_EVENT)
        }).catch(function () { /* page reminders remain available */ })
      }

      function saveThreshold(valueArg) {
        var value = Number.parseFloat(valueArg !== undefined ? valueArg : thresholdDraft)
        if (!Number.isFinite(value)) return
        value = Math.min(100000, Math.max(0, Math.round(value * 100) / 100))
        fetch('/api/wallet/threshold', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ threshold: value, currency: (dataRef.current && dataRef.current.balance && dataRef.current.balance.currency) || 'CNY' })
        }).then(function (resp) { return resp.json() }).then(function (json) {
          if (json && json.ok) {
            setThresholdDraft(json.threshold.toFixed(2))
            if (dataRef.current) { dataRef.current.threshold = json.threshold; setData(Object.assign({}, dataRef.current)) }
          }
        }).catch(function () { /* ignore */ })
      }

      var thresholdSaveTimerRef = React.useRef(null)
      function queueThresholdSave(value) {
        if (thresholdSaveTimerRef.current) clearTimeout(thresholdSaveTimerRef.current)
        thresholdSaveTimerRef.current = setTimeout(function () { saveThreshold(value) }, 600)
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
            try {
              if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('dshw-refresh'))
              }
            } catch (e) { /* ignore */ }
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
        if (!window.confirm('\u5207\u6362\u5230\u8d26\u6237\u300c' + name + '\u300d\uff1f\r\n\u5207\u6362\u540e\uff0c\u540e\u7eed LLM \u8bf7\u6c42\u5c06\u4f7f\u7528\u8be5\u8d26\u6237\u7684 Key \u8ba1\u8d39\u3002')) return
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
            try {
              if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('dshw-refresh'))
              }
            } catch (e) { /* ignore */ }
            // 切换账号: 解锁 + 激活响应自带阈值, 输入框零等待跳转
            thresholdInitializedRef.current = false
            if (json.threshold !== undefined && json.threshold !== null) setThresholdDraft(json.threshold.toFixed(2))
          } else {
            setAccountNotice((json && json.error) || '\u5207\u6362\u5931\u8d25')
          }
        }).catch(function () {
          setSwitchingId(null)
          setAccountNotice('\u5207\u6362\u5931\u8d25')
        })
      }

      function removeAccount(id, name) {
        if (!window.confirm('\u5220\u9664\u8d26\u6237\u300c' + name + '\u300d\uff1f\r\n\u4ec5\u5220\u9664\u672c\u63d2\u4ef6\u7684\u8d26\u6237\u8bb0\u5f55\uff0c\u4e0d\u5f71\u54cd .credentials.yaml \u4e2d\u5df2\u6709\u7684 Key\u3002')) return
        fetch('/api/wallet/accounts/remove', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: id })
        }).then(function (resp) { return resp.json() }).then(function (json) {
          if (json && json.ok) {
            setAccountNotice('\u5df2\u5220\u9664')
            loadAccounts()
            refreshBalance()
            try {
              if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('dshw-refresh'))
              }
            } catch (e) { /* ignore */ }
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
          var acctRows = []
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
            acctRows.push(React.createElement('div', { key: acc.id, className: 'dshw_row', style: { margin: 0 } }, rowChildren))
          })
          if (acctRows.length > 0) {
            children.push(React.createElement('div', { key: 'scroll', className: 'dshw_acctScroll' }, acctRows))
            if (acctRows.length > 2) children.push(React.createElement('div', { key: 'more', className: 'dshw_acctMore' }, '共 ' + acctRows.length + ' 个账户，滑动查看更多'))
          }
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
        try { compatibility.storage.setItem(CONFIRM_KEY, '1') } catch (e) { /* ignore */ }
        var url = data && data.rechargeUrl ? data.rechargeUrl : 'https://platform.deepseek.com/top_up'
        compatibility.openExternal(url)
      }

      function onRechargeClick(event) {
        if (event && event.stopPropagation) event.stopPropagation()
        if (event && event.preventDefault) event.preventDefault()
        if (chipDidDragRef.current === true) return
        var confirmed = false
        try { confirmed = compatibility.storage.getItem(CONFIRM_KEY) === '1' } catch (e) { /* ignore */ }
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
      var low = showOfficial && snapshot.lowBalance === true
      var chipDock = chipLayout.dock
      // The home toolbar row cannot fit the widest scale on narrow windows, so
      // cap the slider there; floating and side docks keep the full range.
      var scaleMaxPercent = chipDock === 'home' ? 105 : 125
      var chipVertical = chipDock === 'left' || chipDock === 'right' || chipDock === 'content-left'
      var lowBlinkOff = false
      try { lowBlinkOff = compatibility.storage.getItem(LOW_BLINK_KEY) === 'false' } catch (e) { /* ignore */ }
      var lowBlinkOn = !lowBlinkOff
      var chipClass = low ? (lowBlinkOff ? 'dshw_chip dshw_chipLow dshw_noBlink' : 'dshw_chip dshw_chipLow') : 'dshw_chip'
      var cssZoom = compatibility.supportsCssZoom()
      var chipStyle = cssZoom
        ? { zoom: chipScale }
        : { transform: 'scale(' + chipScale + ')', transformOrigin: 'top left' }
      var chipPositionScale = cssZoom ? chipScale : 1
      if (chipDock !== 'home') chipClass += ' dshw_chipDocked'
      if (chipVertical) chipClass += ' dshw_chipVertical'
      if (!showOfficial) chipClass += ' dshw_chipNoRecharge'
      if (chipDragRef.current && chipDragRef.current.dragged) chipClass += ' dshw_chipDragging'
      if (chipDock === 'free') { chipStyle.left = chipLayout.x / chipPositionScale; chipStyle.top = chipLayout.y / chipPositionScale }
      if (chipDock === 'left' || chipDock === 'right' || chipDock === 'content-left' || chipDock === 'bottom') { chipStyle.left = chipLayout.x / chipPositionScale; chipStyle.top = chipLayout.y / chipPositionScale }

      var chipTextParts = []
      var balanceText = bal.total === null || bal.total === undefined ? '--' : fmtCurrency(bal.total, bal.currency)
      function verticalMetric(key, label, value) {
        return React.createElement('span', { key: key, className: 'dshw_metric' },
          React.createElement('span', { className: 'dshw_metricLabel' }, label),
          React.createElement('span', { className: 'dshw_metricValue' }, value))
      }
      // The session cost stays on the chip even at ¥0.00. Three states:
      // no session record yet → show ¥0.00 (a fresh chat must not lose the
      // segment), priced → show the value, unpriced (priced === false) →
      // hide, because no honest number exists.
      var chipCostHidden = official.priced === false
      var chipCostValue = (official.cost === null || official.cost === undefined) ? 0 : official.cost
      if (chipVertical) {
        if (showOfficial) {
          chipTextParts.push(verticalMetric('bal', '余额', balanceText))
          if (!chipCostHidden) chipTextParts.push(verticalMetric('cost', sessionCostLabel(bal.currency), sessionCostText(chipCostValue, bal.currency)))
          chipTextParts.push(verticalMetric('off', '\u5b98', fmtTokens(officialTokens)))
        }
        if (showThird) chipTextParts.push(verticalMetric('third', '\u4e09\u65b9', fmtTokens(thirdTokens)))
      } else {
        if (showOfficial) {
          chipTextParts.push(React.createElement('span', { key: 'bal', className: 'dshw_balanceText dshw_homePrimary' },
            React.createElement('span', { className: 'dshw_homePrimaryLabel' }, '余额 '),
            React.createElement('span', { className: 'dshw_homePrimaryValue' }, balanceText)))
          if (!chipCostHidden) chipTextParts.push(React.createElement('span', { key: 'cost' }, sessionCostLabel(bal.currency) + ' ' + sessionCostText(chipCostValue, bal.currency)))
          chipTextParts.push(React.createElement('span', { key: 'off' }, '\u5b98 ' + fmtTokens(officialTokens)))
        }
        if (showOfficial && showThird) chipTextParts.push(React.createElement('span', { key: 'sep', className: 'dshw_sep' }, '|'))
        if (showThird) chipTextParts.push(React.createElement('span', { key: 'third', className: showOfficial ? 'dshw_thirdText' : 'dshw_thirdText dshw_homePrimary' },
          React.createElement('span', { className: 'dshw_homePrimaryLabel' }, '\u4e09\u65b9 '),
          React.createElement('span', { className: 'dshw_homePrimaryValue' }, fmtTokens(thirdTokens))))
      }

      var chip = React.createElement('span', {
        ref: chipRef,
        className: chipClass,
        style: chipStyle,
        role: 'group',
        'aria-label': 'DeepSeek \u94b1\u5305',
        onPointerDown: onChipDown
      },
        React.createElement('button', {
          ref: chipButtonRef,
          type: 'button',
          className: 'dshw_chipMain',
          title: 'DeepSeek Harness Control Center \u00b7 \u70b9\u51fb\u67e5\u770b\u660e\u7ec6 \u00b7 \u62d6\u52a8\u53ef\u5438\u9644',
          'aria-expanded': open,
          'aria-haspopup': 'dialog',
          onClick: function () {
          if (chipDidDragRef.current === true) return
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
        showOfficial ? React.createElement('button', {
          type: 'button',
          className: 'dshw_recharge',
          title: 'DeepSeek \u5f00\u653e\u5e73\u53f0 \u00b7 \u5b98\u65b9\u5145\u503c\u9875',
          'aria-label': '\u6253\u5f00 DeepSeek \u5b98\u65b9\u5145\u503c\u9875',
          onClick: onRechargeClick
        }, '\u2197\u5145') : null)

      var chipHost = React.createElement('span', { ref: chipAnchorRef, className: chipDock === 'home' ? 'dshw_anchor dshw_anchorHome' + (homeMode === 'compact' ? ' dshw_compact' : homeMode === 'fit' ? ' dshw_fit' : '') : 'dshw_anchor' }, chip)
      var snapPreviewElement = snapPreview ? React.createElement('div', {
        className: snapPreview.vertical ? 'dshw_snapPreview dshw_snapPreviewVertical' : 'dshw_snapPreview',
        style: { left: snapPreview.x, top: snapPreview.y, width: snapPreview.width, height: snapPreview.height },
        'data-dock': snapPreview.dock,
        'aria-hidden': 'true'
      }) : null

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

      if (!open && !floated) return React.createElement(React.Fragment, null, chipHost, snapPreviewElement, confirmOverlay)

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
        React.createElement('span', null, official.cost === null ? '\u672a\u5b9a\u4ef7\u6a21\u578b' : sessionCostText(official.cost, bal.currency))))

      var thirdRows = []
      thirdRows.push(React.createElement('div', { key: 't-t', className: 'dshw_row' },
        React.createElement('span', { className: 'dshw_muted' }, '\u7b2c\u4e09\u65b9 token'),
        React.createElement('span', null, '\u8f93\u5165 ' + fmtTokens(third.tokens && third.tokens.input) + ' \u00b7 \u7f13\u5b58\u8bfb ' + fmtTokens(third.tokens && third.tokens.cacheRead) + ' \u00b7 \u8f93\u51fa ' + fmtTokens(third.tokens && third.tokens.output))))

      var thresholdInput = React.createElement('input', {
        className: 'dshw_input',
        type: 'number',
        min: '0',
        step: 'any',
        'aria-label': '余额提醒阈值（' + (bal.currency || 'CNY') + '）',
        value: thresholdDraft === null ? '' : thresholdDraft,
        onChange: function (event) {
          thresholdInitializedRef.current = 'editing'
          if (thresholdEditTimerRef.current) clearTimeout(thresholdEditTimerRef.current)
          thresholdEditTimerRef.current = setTimeout(function () { thresholdInitializedRef.current = false }, 15000)
          setThresholdDraft(event.target.value)
        }
      })

      var scaleControl = React.createElement('div', { className: 'dshw_row' },
        React.createElement('span', { className: 'dshw_muted' }, '芯片比例'),
        React.createElement('span', { className: 'dshw_scaleControl' },
          React.createElement('input', {
            className: 'dshw_scaleInput',
            type: 'range',
            min: '75',
            max: String(scaleMaxPercent),
            step: '5',
            value: String(Math.round(chipScale * 100)),
            'aria-label': '钱包芯片比例',
            onInput: function (event) { saveChipScale(Number.parseFloat(event.target.value) / 100) },
            onChange: function (event) { saveChipScale(Number.parseFloat(event.target.value) / 100) }
          }),
          React.createElement('span', { className: 'dshw_scaleValue' }, Math.round(chipScale * 100) + '%')))

      var visibilityControl = React.createElement('div', { className: 'dshw_row' },
        React.createElement('span', { className: 'dshw_muted' }, '显示内容'),
        React.createElement('span', { className: 'dshw_visibilityControl' },
          React.createElement('label', { className: 'dshw_check' },
            React.createElement('input', {
              type: 'checkbox',
              checked: showOfficial,
              disabled: showOfficial && !showThird,
              'aria-label': '显示官方数据',
              onChange: function (event) { saveDataVisibility({ official: event.target.checked, third: showThird }) }
            }),
            React.createElement('span', null, '官方数据')),
          React.createElement('label', { className: 'dshw_check' },
            React.createElement('input', {
              type: 'checkbox',
              checked: showThird,
              disabled: showThird && !showOfficial,
              'aria-label': '显示第三方 token',
              onChange: function (event) { saveDataVisibility({ official: showOfficial, third: event.target.checked }) }
            }),
            React.createElement('span', null, '第三方 token'))))

      var notifyControl = React.createElement('div', { className: 'dshw_row dshw_notifyControl' },
        React.createElement('span', { className: 'dshw_muted' }, '完成提醒'),
        React.createElement('span', { className: 'dshw_visibilityControl' },
          React.createElement('label', { className: 'dshw_check' },
            React.createElement('input', {
              type: 'checkbox',
              checked: notifyConfig.enabled,
              'aria-label': '开启对话完成后提醒',
              onChange: function (event) {
                var enabled = event.target.checked
                saveNotifyConfig({ enabled: enabled, timeout: notifyConfig.timeout })
                if (enabled) requestNotify()
              }
            }),
            React.createElement('span', null, '开启')),
          React.createElement('select', {
            className: 'dshw_select',
            value: String(notifyConfig.timeout),
            disabled: !notifyConfig.enabled,
            'aria-label': '提醒自动关闭时间',
            onChange: function (event) {
              saveNotifyConfig({ enabled: notifyConfig.enabled, timeout: Number.parseInt(event.target.value, 10) })
            }
          },
            React.createElement('option', { value: '0' }, '一直保留，手动关闭'),
            React.createElement('option', { value: '5' }, '5 秒'),
            React.createElement('option', { value: '10' }, '10 秒'),
            React.createElement('option', { value: '30' }, '30 秒'),
            React.createElement('option', { value: '60' }, '60 秒'))))

      var permanentDeleteControl = React.createElement('div', { className: 'dshw_setCell', style: { border: 'none', padding: '0 9px', minHeight: '30px' } },
        React.createElement('span', { className: 'dshw_muted' }, '永久删除会话'),
        React.createElement('label', { className: 'dshw_check' },
          React.createElement('input', {
            type: 'checkbox',
            checked: permanentDeleteSupported && permanentDeleteEnabled,
            disabled: !permanentDeleteSupported,
            'aria-label': '开启永久删除会话',
            title: permanentDeleteSupported ? '在会话菜单中显示永久删除' : '当前宿主未提供永久删除能力',
            onChange: function (event) {
              if (!permanentDeleteSupported) return
              var enabled = event.target.checked
              setPermanentDeleteEnabled(enabled)
              try { compatibility.storage.setItem(PERMANENT_DELETE_KEY, String(enabled)) } catch (e) { /* ignore */ }
              compatibility.dispatch(PERMANENT_DELETE_EVENT)
            }
          }),
          React.createElement('span', null, permanentDeleteSupported ? '开启' : '宿主不支持')))
      var floatBtnRow = React.createElement('div', {
        className: 'dshw_row dshw_panelHeader',
        style: { justifyContent: 'flex-end', marginTop: '2px' },
        title: '拖动控制面板',
        onPointerDown: onPanelDown
      },
        React.createElement('button', {
          type: 'button',
          className: 'dshw_btn',
          style: { height: '22px', fontSize: '11px', padding: '0 10px' },
          title: '恢复到输入框工具栏',
          onClick: function () { applyChipLayout({ dock: 'home', x: 0, y: 0 }) }
        }, '↩ 归位'),
        React.createElement('button', {
          type: 'button',
          className: 'dshw_btn',
          style: { height: '22px', fontSize: '11px', padding: '0 10px' },
          title: '最小化为可自由拖动的圆形钱包',
          onClick: function () {
            var rect = chipRef.current ? chipRef.current.getBoundingClientRect() : null
            if (rect) {
              var initialDotPos = clampPos({
                x: rect.left + (rect.width - 36) / 2,
                y: rect.top + (rect.height - 36) / 2
              }, 36, 36)
              floatPosRef.current = initialDotPos
              setFloatPos(initialDotPos)
            }
            setFloated(true)
            setMinimized(true)
            setOpen(false)
          }
        }, '－ 最小化'))

      // Balance summary as one compact horizontal card: hero figure, optional
      // low-balance pill, inline session cost; breakdown on a quiet sub-line.
      function balanceCard() {
        if (!bal.available || !bal.balances || bal.balances.length === 0) {
          return React.createElement('div', { className: 'dshw_balanceCard' },
            React.createElement('div', { className: 'dshw_muted' }, bal.error ? balanceErrorText(bal.error) : '余额查询中…'))
        }
        var first = selectBalanceInfo(bal)
        var others = bal.balances.filter(function (info) { return info !== first })
        var subParts = [
          React.createElement('span', { key: 'top' }, '\u5145\u503c ' + fmtCurrency(first.topped_up_balance, first.currency)),
          React.createElement('span', { key: 'd1', className: 'dshw_balDot' }, '\u00b7'),
          React.createElement('span', { key: 'grt' }, '\u8d60\u9001 ' + fmtCurrency(first.granted_balance, first.currency))
        ]
        others.forEach(function (info, i) {
          subParts.push(React.createElement('span', { key: 'd' + i, className: 'dshw_balDot' }, '\u00b7'))
          subParts.push(React.createElement('span', { key: 'x' + i }, info.currency + ' ' + fmtCurrency(info.total_balance, info.currency)))
        })
        return React.createElement('div', {
          className: low ? 'dshw_balanceCard dshw_low' : 'dshw_balanceCard'
        },
          React.createElement('div', { className: 'dshw_balLine' },
            React.createElement('span', { className: 'dshw_muted' }, '\u4f59\u989d'),
            React.createElement('span', { className: 'dshw_balNum' }, fmtCurrency(first.total_balance, first.currency)),
            low ? React.createElement('span', { className: 'dshw_balWarn', title: '低于提醒阈值 ' + fmtCurrency(snapshot.threshold !== undefined ? snapshot.threshold : 0, bal.currency || 'CNY') }, '余额偏低') : null),
          React.createElement('div', { className: 'dshw_balSub' },
            sessionCostLabel(bal.currency) + ' ' + (official.cost === null ? '--' : sessionCostText(official.cost, bal.currency)),
            React.createElement('span', { className: 'dshw_balDot' }, '\u00b7'),
            subParts))
      }

      // All controls in one bordered card with compact rows; the threshold
      // input carries its own save button so the action row stays two items.
      function settingsCard() {
        var cells = []
        cells.push(React.createElement('div', { key: 'vis', className: 'dshw_setCell' },
          React.createElement('span', { className: 'dshw_muted' }, '\u663e\u793a\u5185\u5bb9'),
          React.createElement('span', { className: 'dshw_balFill' }),
          React.createElement('label', { className: 'dshw_chipToggle' },
            React.createElement('input', {
              type: 'checkbox',
              checked: showOfficial,
              disabled: showOfficial && !showThird,
              'aria-label': '显示官方数据',
              onChange: function (event) { saveDataVisibility({ official: event.target.checked, third: showThird }) }
            }),
            React.createElement('span', null, '\u5b98\u65b9')),
          React.createElement('label', { className: 'dshw_chipToggle' },
            React.createElement('input', {
              type: 'checkbox',
              checked: showThird,
              disabled: showThird && !showOfficial,
              'aria-label': '显示第三方 token',
              onChange: function (event) { saveDataVisibility({ official: showOfficial, third: event.target.checked }) }
            }),
            React.createElement('span', null, '\u7b2c\u4e09\u65b9'))))
        cells.push(React.createElement('div', { key: 'sc', className: 'dshw_setCell' }, scaleControl))
        // 完成提醒 + 低额阈值 同行(无保存按钮后 276px 放得下)
        cells.push(React.createElement('div', { key: 'nfth', className: 'dshw_setCell', style: { gap: '5px' } },
          React.createElement('span', { className: 'dshw_muted', style: { flex: 'none' } }, '\u63d0\u9192'),
          React.createElement('select', {
            className: 'dshw_select',
            style: { flex: '0 0 auto' },
            value: notifyConfig.enabled ? (notifyConfig.timeout === 0 ? 'keep' : String(notifyConfig.timeout)) : 'off',
            'aria-label': '\u5b8c\u6210\u63d0\u9192',
            onChange: function (event) {
              var v = event.target.value
              if (v === 'off') { saveNotifyConfig({ enabled: false, timeout: notifyConfig.timeout }); return }
              saveNotifyConfig({ enabled: true, timeout: v === 'keep' ? 0 : Number.parseInt(v, 10) })
              requestNotify()
            }
          },
            React.createElement('option', { value: 'off' }, '\u5173\u95ed'),
            React.createElement('option', { value: '5' }, '5 \u79d2'),
            React.createElement('option', { value: '10' }, '10 \u79d2'),
            React.createElement('option', { value: '30' }, '30 \u79d2'),
            React.createElement('option', { value: '60' }, '60 \u79d2'),
            React.createElement('option', { value: 'keep' }, '\u4e00\u76f4\u4fdd\u7559')),
          React.createElement('span', { className: 'dshw_balFill' }),
          React.createElement('span', { className: 'dshw_muted', style: { flex: 'none' } }, '\u9608\u503c'),
          React.createElement('input', {
            className: 'dshw_input', type: 'number', min: '0', step: '0.01',
            style: { width: '64px', flex: 'none' },
            value: thresholdDraft,
            title: '\u4f4e\u4e8e\u6b64\u4f59\u989d\u65f6\u63d0\u9192\uff080 \u5173\u95ed\uff09\uff1b\u8f93\u5165\u540e\u81ea\u52a8\u4fdd\u5b58',
            'aria-label': '\u4f4e\u989d\u9608\u503c (' + (bal.currency === 'USD' ? 'USD' : 'CNY') + ')',
            onInput: function (event) { setThresholdDraft(event.target.value); queueThresholdSave(event.target.value) },
            onChange: function (event) { setThresholdDraft(event.target.value); queueThresholdSave(event.target.value) }
          })))
        // 低额闪烁 + 永久删除 同行
        cells.push(React.createElement('div', { key: 'blinkpd', className: 'dshw_setCell', style: { gap: '5px' } },
          React.createElement('span', { className: 'dshw_muted', style: { flex: 'none' } }, '\u4f4e\u989d\u95ea\u70c1'),
          React.createElement('label', { className: 'dshw_switch' },
            React.createElement('input', {
              type: 'checkbox',
              checked: lowBlinkOn,
              'aria-label': '\u4f4e\u989d\u65f6\u7ea2\u8272\u95ea\u70c1',
              onChange: function (event) {
                try { compatibility.storage.setItem(LOW_BLINK_KEY, String(event.target.checked)) } catch (e) { /* ignore */ }
                compatibility.dispatch(SETTINGS_EVENT)
              }
            }),
            React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
            React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' })),
          React.createElement('span', { className: 'dshw_balFill' }),
          React.createElement('span', { className: 'dshw_muted', style: { flex: 'none' } }, permanentDeleteSupported ? '\u6c38\u4e45\u5220\u9664' : '\u6c38\u4e45\u5220\u9664(\u4e0d\u652f\u6301)'),
          React.createElement('label', { className: 'dshw_switch' },
            React.createElement('input', {
              type: 'checkbox',
              checked: permanentDeleteSupported && permanentDeleteEnabled,
              disabled: !permanentDeleteSupported,
              'aria-label': '\u5f00\u542f\u6c38\u4e45\u5220\u9664\u4f1a\u8bdd',
              title: permanentDeleteSupported ? '\u5728\u4f1a\u8bdd\u83dc\u5355\u4e2d\u663e\u793a\u6c38\u4e45\u5220\u9664' : '\u5f53\u524d\u5bbf\u4e3b\u672a\u63d0\u4f9b\u6c38\u4e45\u5220\u9664\u80fd\u529b',
              onChange: function (event) {
                if (!permanentDeleteSupported) return
                var enabled = event.target.checked
                setPermanentDeleteEnabled(enabled)
                try { compatibility.storage.setItem(PERMANENT_DELETE_KEY, String(enabled)) } catch (e) { /* ignore */ }
                compatibility.dispatch(PERMANENT_DELETE_EVENT)
              }
            }),
            React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
            React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' }))))
        return React.createElement('div', { className: 'dshw_setCard' }, cells)
      }

      var panel = React.createElement('div', {
        ref: panelRef,
        className: 'dshw_panel',
        style: panelStyle,
        role: 'dialog',
        'aria-label': 'DeepSeek \u94b1\u5305\u660e\u7ec6',
        onClick: function (e) { e.stopPropagation() }
      },
        floatBtnRow,
        showOfficial ? React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dshw_title' }, (snapshot.accounts && snapshot.accounts.activeName) ? '官方 DeepSeek · ' + snapshot.accounts.activeName : '官方 DeepSeek'),
          balanceCard(),
          official.tokens ? React.createElement('div', { key: 'o-t', className: 'dshw_row' },
            React.createElement('span', { className: 'dshw_muted' }, '\u5b98\u65b9 token'),
            React.createElement('span', null, '\u8f93\u5165 ' + fmtTokens(official.tokens.input) + ' \u00b7 \u7f13\u5b58\u8bfb ' + fmtTokens(official.tokens.cacheRead) + ' \u00b7 \u8f93\u51fa ' + fmtTokens(official.tokens.output))) : null,
          React.createElement('div', { className: 'dshw_divider' })) : null,
        showThird ? React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dshw_title' }, '\u7b2c\u4e09\u65b9\u5408\u8ba1'),
          thirdRows,
          React.createElement('div', { className: 'dshw_divider' })) : null,
        settingsCard(),
        showOfficial ? React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dshw_actionRow', style: { gridTemplateColumns: '1fr 1fr 1fr' } },
            React.createElement('button', {
              type: 'button',
              className: 'dshw_btn dshw_btnPrimary',
              onClick: onRechargeClick
            }, '\u2197 \u5145\u503c'),
            React.createElement('button', { type: 'button', className: 'dshw_btn', onClick: refreshBalance }, '刷新余额'),
            React.createElement('button', {
              type: 'button',
              className: 'dshw_btn',
              style: { color: 'var(--dsw-alias-state-error-primary,#e5534b)' },
              title: '\u6e05\u9664\u672c\u4f1a\u8bdd\u7684\u4f59\u989d\u4e0e token \u6570\u636e\uff0c\u4e0d\u53ef\u6062\u590d',
              onClick: function () {
                if (window.confirm('确认清除本会话的余额与 token 数据？不可恢复。')) clearSession()
              }
            }, '清除')),
          React.createElement('div', { className: 'dshw_divider' })) : null,
        accountsSection(),
        React.createElement('div', { style: { marginTop: '8px', textAlign: 'right', fontSize: '10px', color: 'var(--dsw-alias-label-quaternary,rgba(31,35,40,.45))', userSelect: 'none' } }, 'DeepSeek Harness Control Center v' + WALLET_VERSION)
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
          }, showOfficial ? (bal.total === null || bal.total === undefined ? '--' : fmtCurrency(bal.total, bal.currency)) : fmtTokens(thirdTokens))
          return React.createElement(React.Fragment, null, dot, confirmOverlay)
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
                onClick: function (e) { e.stopPropagation(); setFloated(false); setMinimized(false); setOpen(false) }
              }, '×'))),
          showOfficial ? React.createElement(React.Fragment, null,
            balanceRows,
            officialRows,
            React.createElement('div', { className: 'dshw_divider' })) : null,
          showThird ? React.createElement(React.Fragment, null,
            thirdRows,
            React.createElement('div', { className: 'dshw_divider' })) : null,
          visibilityControl,
          scaleControl,
          notifyControl,
          permanentDeleteControl,
          showOfficial ? React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'dshw_row' },
              React.createElement('span', { className: 'dshw_muted' }, '阈值(' + (bal.currency || 'CNY') + ',0=关)'),
              thresholdInput),
            React.createElement('div', { className: 'dshw_row' },
              React.createElement('button', { type: 'button', className: 'dshw_btn', onClick: refreshBalance }, '刷新'),
              React.createElement('button', { type: 'button', className: 'dshw_btn dshw_btnPrimary', onClick: saveThreshold }, '保存')),
            React.createElement('button', {
              type: 'button',
              className: 'dshw_btn dshw_btnPrimary',
              style: { textAlign: 'center' },
              onClick: onRechargeClick
            }, '↗ 充值')) : null,
          React.createElement('button', {
            type: 'button',
            className: 'dshw_btn', style: { width: '100%' },
            onClick: function () {
              if (window.confirm('确认清除本会话的余额与 token 数据？不可恢复。')) clearSession()
            }
          }, '清除余额与 token'),
          React.createElement('div', { className: 'dshw_divider' }),
          accountsSection(),
          React.createElement('div', { style: { marginTop: '8px', textAlign: 'right', fontSize: '10px', color: 'var(--dsw-alias-label-quaternary,rgba(31,35,40,.45))', userSelect: 'none' } }, 'DeepSeek Harness Control Center v' + WALLET_VERSION)
        )
        return React.createElement(React.Fragment, null, floatPanel, confirmOverlay)
      }
      return React.createElement(React.Fragment, null, chipHost, snapPreviewElement, panel, confirmOverlay)
    }

    var inject = ['slots', 'sessions']

    function apply(ctx) {
      ctx.inject(['sessions'], function (scope) {
        scope.effect(function () { return installCompletionNotifier(scope) }, 'dsh-wallet: completion notifications')
      })
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
      // Host settings panel section (dsh rc.7 settings cards): order 40 sits
      // right below the vision-toolkit section (order 30) contributed by
      // another plugin. Registered only when the host exposes the slots API
      // root, so older hosts without settings cards keep loading the wallet.
      if (ctx.slots && typeof ctx.slots.inject === 'function') {
        ctx.slots.inject('settings.section', function () {
          return ctx.slots.register({
            name: 'settings.section',
            id: 'wallet',
            order: 40,
            label: function () { return '\u94b1\u5305' },
            inject: function () { return {} }
          }, WalletSettingsSection)
        })
        try {
          ctx.slots.inject('sidebar.footer.action', function () {
            return ctx.slots.register({
              name: 'sidebar.footer.action',
              id: 'wallet-peak-ring',
              order: 50,
              inject: function () { return {} }
            }, PeakRingFooter)
          })
        } catch (e) { /* host without the sidebar footer slot */ }
      }
    }

    exports.apply = apply
    exports.inject = inject
    exports.__testing = {
      chooseChipDock: chooseChipDock,
      clampFreeDrop: clampFreeDrop,
      clampPosition: clampPosition,
      computeSnapPreview: computeSnapPreview,
      computeSideDockX: computeSideDockX,
      computePanelPosition: computePanelPosition,
      createCompatibilityAdapter: createCompatibilityAdapter,
      fmtCurrency: fmtCurrency,
      selectBalanceInfo: selectBalanceInfo,
      balanceErrorText: balanceErrorText,
      installCompletionNotifier: installCompletionNotifier,
      normalizeDataVisibility: normalizeDataVisibility,
      normalizeNotifyConfig: normalizeNotifyConfig,
      normalizeChipLayout: normalizeChipLayout,
      normalizeChipScale: normalizeChipScale,
      peakClockState: peakClockState,
      wallHourIn: wallHourIn,
      peakRingSVG: peakRingSVG,
      PeakRingFooter: PeakRingFooter,
      WalletSettingsSection: WalletSettingsSection,
      settleDotPosition: settleDotPosition
    }
    return module.exports
  }
})
