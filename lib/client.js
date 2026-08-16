/* deepseek-harness-wallet client half: the composer input wallet chip.
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
    var CHIP_LAYOUT_KEY = 'dshw-chip-layout-v4'
    var PANEL_POS_KEY = 'dshw-panel-pos-v1'
    var CHIP_SCALE_KEY = 'dshw-chip-scale-v1'
    var DATA_VISIBILITY_KEY = 'dshw-data-visibility-v1'
    var NOTIFY_CONFIG_KEY = 'dshw-completion-notify-v1'
    var NOTIFY_CONFIG_EVENT = 'dshw-completion-notify-change'
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
      '.dshw_anchorHome{container-name:dshw-home;container-type:inline-size;overflow:hidden;min-width:44px}',
      '.dshw_anchorHome>.dshw_chip{box-sizing:border-box;max-width:100%;min-width:0;overflow:hidden}',
      '.dshw_chip{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:transparent;height:22px;color:var(--dsw-alias-label-primary,#1f2328);white-space:nowrap;border-radius:999px;align-items:stretch;font-size:12px;line-height:1;display:inline-flex;position:relative;touch-action:none;user-select:none;cursor:grab}',
      '.dshw_chip:hover,.dshw_chip:focus-within{border-color:var(--dsw-alias-brand-primary,#4aa3ff)}',
      '.dshw_chipLow{border-color:var(--dsw-alias-state-error-primary,#e5534b);color:var(--dsw-alias-state-error-primary,#e5534b);animation:dshwPulse 1.8s infinite}',
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
      '@container dshw-home (max-width:90px){.dshw_anchorHome .dshw_chip{width:100%}.dshw_anchorHome .dshw_chipMain{box-sizing:border-box;width:100%;min-width:0;overflow:hidden;justify-content:center;padding:0 3px}.dshw_anchorHome .dshw_chipMain>span{display:none}.dshw_anchorHome .dshw_chipMain>.dshw_homePrimary{display:inline;min-width:0;overflow:hidden;text-overflow:ellipsis}.dshw_anchorHome .dshw_homePrimaryLabel{display:none}.dshw_anchorHome .dshw_recharge{display:none}}',
      '@supports not (container-type:inline-size){@media (max-width:640px){.dshw_anchorHome .dshw_chip{width:100%}.dshw_anchorHome .dshw_chipMain{box-sizing:border-box;width:100%;min-width:0;overflow:hidden;justify-content:center;padding:0 3px}.dshw_anchorHome .dshw_chipMain>span{display:none}.dshw_anchorHome .dshw_chipMain>.dshw_homePrimary{display:inline;min-width:0;overflow:hidden;text-overflow:ellipsis}.dshw_anchorHome .dshw_homePrimaryLabel{display:none}.dshw_anchorHome .dshw_recharge{display:none}}}',
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
        var body = item.title + (remaining > 0 ? '\n另有 ' + remaining + ' 个对话等待提醒' : '\n点击打开该对话')
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
      var [dataVisibility, setDataVisibility] = React.useState(function () {
        try {
          var savedVisibility = compatibility.storage.getItem(DATA_VISIBILITY_KEY)
          return normalizeDataVisibility(savedVisibility === null ? null : JSON.parse(savedVisibility))
        } catch (e) { return normalizeDataVisibility(null) }
      })
      var [notifyConfig, setNotifyConfig] = React.useState(readNotifyConfig)
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
            if (!thresholdInitializedRef.current && json.threshold !== undefined && json.threshold !== null) {
              thresholdInitializedRef.current = true
              setThresholdDraft(json.threshold.toFixed(2))
            }
            if (showOfficial && json.lowBalance) {
              if (!notifiedRef.current) {
                try {
                  var lowNotice = compatibility.notify('DeepSeek \u4f59\u989d\u4e0d\u8db3', { body: '\u4f59\u989d\u5df2\u4f4e\u4e8e\u63d0\u9192\u7ebf ' + json.threshold + ' \u5143', tag: 'dsh-wallet-low' })
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

      useLayoutEffect(function () {
        var node = chipRef.current
        if (node === null) return
        var rect = node.getBoundingClientRect()
        var measured = { width: rect.width, height: rect.height, scale: chipScaleRef.current }
        if (node.classList && node.classList.contains('dshw_chipVertical')) chipSizeRef.current.vertical = measured
        else chipSizeRef.current.horizontal = measured
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
      var chipVertical = chipDock === 'left' || chipDock === 'right' || chipDock === 'content-left'
      var chipClass = low ? 'dshw_chip dshw_chipLow' : 'dshw_chip'
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
      if (chipVertical) {
        if (showOfficial) {
          chipTextParts.push(verticalMetric('bal', '余额', balanceText))
          if (official.cost !== undefined && official.cost !== null) chipTextParts.push(verticalMetric('cost', '\u672c\u573a', fmtCurrency(official.cost, 'CNY')))
          chipTextParts.push(verticalMetric('off', '\u5b98', fmtTokens(officialTokens)))
        }
        if (showThird) chipTextParts.push(verticalMetric('third', '\u4e09\u65b9', fmtTokens(thirdTokens)))
      } else {
        if (showOfficial) {
          chipTextParts.push(React.createElement('span', { key: 'bal', className: 'dshw_balanceText dshw_homePrimary' },
            React.createElement('span', { className: 'dshw_homePrimaryLabel' }, '余额 '),
            React.createElement('span', { className: 'dshw_homePrimaryValue' }, balanceText)))
          if (official.cost !== undefined && official.cost !== null) chipTextParts.push(React.createElement('span', { key: 'cost' }, '\u672c\u573a ' + fmtCurrency(official.cost, 'CNY')))
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

      var chipHost = React.createElement('span', { ref: chipAnchorRef, className: chipDock === 'home' ? 'dshw_anchor dshw_anchorHome' : 'dshw_anchor' }, chip)
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

      var scaleControl = React.createElement('div', { className: 'dshw_row' },
        React.createElement('span', { className: 'dshw_muted' }, '芯片比例'),
        React.createElement('span', { className: 'dshw_scaleControl' },
          React.createElement('input', {
            className: 'dshw_scaleInput',
            type: 'range',
            min: '75',
            max: '125',
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

      var permanentDeleteControl = React.createElement('div', { className: 'dshw_row' },
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
          React.createElement('div', { className: 'dshw_title' }, '\u5b98\u65b9 DeepSeek'),
          balanceRows,
          officialRows,
          React.createElement('div', { className: 'dshw_divider' })) : null,
        showThird ? React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dshw_title' }, '\u7b2c\u4e09\u65b9\u5408\u8ba1'),
          thirdRows,
          React.createElement('div', { className: 'dshw_divider' })) : null,
        visibilityControl,
        scaleControl,
        notifyControl,
        permanentDeleteControl,
        showOfficial ? React.createElement(React.Fragment, null,
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
          React.createElement('div', { className: 'dshw_divider' })) : null,
        React.createElement('button', {
          type: 'button',
          className: 'dshw_btn',
          style: { width: '100%' },
          onClick: function () {
            if (window.confirm('确认清除本会话的余额与 token 数据？不可恢复。')) clearSession()
          }
        }, '清除余额与 token')
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
            }, '↗ 充值')) : null,
          React.createElement('button', {
            type: 'button',
            className: 'dshw_btn', style: { width: '100%' },
            onClick: function () {
              if (window.confirm('确认清除本会话的余额与 token 数据？不可恢复。')) clearSession()
            }
          }, '清除余额与 token')
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
      installCompletionNotifier: installCompletionNotifier,
      normalizeDataVisibility: normalizeDataVisibility,
      normalizeNotifyConfig: normalizeNotifyConfig,
      normalizeChipLayout: normalizeChipLayout,
      normalizeChipScale: normalizeChipScale,
      settleDotPosition: settleDotPosition
    }
    return module.exports
  }
})
