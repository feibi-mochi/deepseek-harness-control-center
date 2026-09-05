var module = { exports: {} }
var exports = module.exports
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
var React = require('react')
var ReactDOM = (function () {
  try {
    if (typeof require === 'function') {
      try { return require('react-dom') } catch (e) { /* ignore */ }
    }
    if (typeof window !== 'undefined' && window.ReactDOM) return window.ReactDOM
  } catch (e) { /* ignore */ }
  return null
})()
var useLayoutEffect = React.useLayoutEffect || React.useEffect

var POLL_MS = 15000
// Keep in lockstep with package.json; a test enforces the sync.
var WALLET_VERSION = '0.3.10'
var CUSTOM_PRICE_WEEKDAYS = [
  { value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' },
  { value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' }, { value: 0, label: '日' }
]
var CONFIRM_KEY = 'dsh-wallet-recharge-confirmed'
var CHIP_LAYOUT_KEY = 'dshw-chip-layout-v4'
var PANEL_POS_KEY = 'dshw-panel-pos-v1'
var CHIP_SCALE_KEY = 'dshw-chip-scale-v1'
var CHIP_STYLE_KEY = 'dshw-chip-style-v1'
var CHIP_BALANCE_ONLY_KEY = 'dshw-chip-balance-only-v1'
var DATA_VISIBILITY_KEY = 'dshw-data-visibility-v1'
var NOTIFY_CONFIG_KEY = 'dshw-completion-notify-v1'
var NOTIFY_CONFIG_EVENT = 'dshw-completion-notify-change'
var SETTINGS_EVENT = 'dshw-settings-change'
var LOW_BLINK_KEY = 'dshw-low-blink-v1'
var PEAK_RING_KEY = 'dshw-peakring-v1'
var PEAK_ORIENT_KEY = 'dshw-peak-orient-v1'
var PEAK_BACKGROUND_KEY = 'dshw-peak-background-v1'
var PEAK_RECHARGE_KEY = 'dshw-peak-recharge-v1'
var PEAK_SCALE_KEY = 'dshw-peak-scale-v1'
var PEAK_DOCK_KEY = 'dshw-peak-dock-v1'
var PEAK_POS_KEY = 'dshw-peak-pos-v1'
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
var BACKED_PREFERENCE_KEYS = new Set([
  CHIP_STYLE_KEY, CHIP_BALANCE_ONLY_KEY, DATA_VISIBILITY_KEY, CHIP_SCALE_KEY,
  NOTIFY_CONFIG_KEY, LOW_BLINK_KEY, PEAK_RING_KEY, PEAK_ORIENT_KEY, PEAK_BACKGROUND_KEY,
  PEAK_RECHARGE_KEY, PEAK_SCALE_KEY, PEAK_DOCK_KEY, PEAK_NOTIFY_KEY,
  PERMANENT_DELETE_KEY
])

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
  // Keys whose native write was refused (quota, private mode, sandboxed
  // WebView). Reads for those keys must come from memory, otherwise the
  // fallback write is invisible and the UI keeps reading a stale value.
  var memoryOnly = Object.create(null)
  var nativeStorage = extension.storage || root.localStorage || null
  var pageNotices = new Map()

  var storage = {
    getItem: function (key) {
      if (memoryOnly[key] === true) {
        return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null
      }
      if (nativeStorage && typeof nativeStorage.getItem === 'function') {
        try { return nativeStorage.getItem(key) } catch (e) { /* storage may be disabled */ }
      }
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null
    },
    setItem: function (key, value) {
      value = String(value)
      memory[key] = value
      if (nativeStorage && typeof nativeStorage.setItem === 'function') {
        try {
          nativeStorage.setItem(key, value)
          delete memoryOnly[key]
          queuePersistentPreference(key, value)
          return
        } catch (e) { /* fall through to the memory-only marker */ }
      }
      memoryOnly[key] = true
      queuePersistentPreference(key, value)
    },
    removeItem: function (key) {
      delete memory[key]
      delete memoryOnly[key]
      if (nativeStorage && typeof nativeStorage.removeItem === 'function') {
        try { nativeStorage.removeItem(key); return } catch (e) { /* memory copy is already gone */ }
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
          } else if (bridged && typeof bridged === 'object') {
            // Always return the wrapper whose onclick/onclose fields the
            // wallet sets. Desktop bridges are asked to call payload
            // callbacks; returning the raw native handle here disconnected
            // those callbacks for synchronous Electron/Tauri adapters.
            bridgeHandle.delegate = bridged
            try { bridged.onclick = payload.onClick } catch (e) { /* optional callback */ }
            try { bridged.onclose = payload.onClose } catch (e) { /* optional callback */ }
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
var preferenceBackupQueue = Object.create(null)
var preferenceBackupTimer = null
var preferenceBackupRetries = 0
var preferenceHydrationPromise = null
var preferenceTouchedKeys = new Set()

function queuePersistentPreference(key, value) {
  if (!BACKED_PREFERENCE_KEYS.has(key) || typeof value !== 'string') return
  preferenceTouchedKeys.add(key)
  preferenceBackupQueue[key] = value
  preferenceBackupRetries = 0
  if (preferenceBackupTimer === null) {
    if (typeof window.setTimeout === 'function') preferenceBackupTimer = window.setTimeout(flushPersistentPreferences, 80)
    else void flushPersistentPreferences()
  }
}

function flushPersistentPreferences() {
  if (preferenceBackupTimer !== null) {
    if (typeof window.clearTimeout === 'function') window.clearTimeout(preferenceBackupTimer)
    preferenceBackupTimer = null
  }
  var entries = preferenceBackupQueue
  preferenceBackupQueue = Object.create(null)
  if (Object.keys(entries).length === 0 || typeof fetch !== 'function') return Promise.resolve(null)
  return fetch('/api/wallet/preferences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entries: entries }),
    keepalive: true
  }).then(function (response) {
    if (!response || response.ok === false) throw new Error('preference-backup-failed')
    preferenceBackupRetries = 0
    return typeof response.json === 'function' ? response.json() : null
  }).catch(function () {
    Object.keys(entries).forEach(function (key) {
      if (!Object.hasOwn(preferenceBackupQueue, key)) preferenceBackupQueue[key] = entries[key]
    })
    if (preferenceBackupRetries < 3 && preferenceBackupTimer === null && typeof window.setTimeout === 'function') {
      preferenceBackupRetries += 1
      preferenceBackupTimer = window.setTimeout(flushPersistentPreferences, preferenceBackupRetries * 750)
    }
    return null
  })
}

function localPreferenceEntries() {
  var entries = {}
  BACKED_PREFERENCE_KEYS.forEach(function (key) {
    var value = compatibility.storage.getItem(key)
    if (typeof value === 'string') entries[key] = value
  })
  return entries
}

function canonicalPreferenceEntries(value) {
  var entries = Object.assign({}, value || {})
  if (entries[CHIP_STYLE_KEY] === 'text') {
    entries[CHIP_STYLE_KEY] = 'standard'
    if (!Object.hasOwn(entries, CHIP_BALANCE_ONLY_KEY)) entries[CHIP_BALANCE_ONLY_KEY] = 'true'
  }
  return entries
}

function hydratePersistentPreferences() {
  if (preferenceHydrationPromise !== null) return preferenceHydrationPromise
  if (typeof fetch !== 'function') return Promise.resolve(null)
  preferenceHydrationPromise = fetch('/api/wallet/preferences').then(function (response) {
    if (!response || response.ok === false || typeof response.json !== 'function') throw new Error('preference-read-failed')
    return response.json()
  }).then(function (payload) {
    var serverEntries = canonicalPreferenceEntries(payload && payload.ok && payload.entries && typeof payload.entries === 'object' ? payload.entries : {})
    var rawLocalEntries = localPreferenceEntries()
    var localEntries = canonicalPreferenceEntries(rawLocalEntries)
    var merged = {}
    Object.keys(serverEntries).forEach(function (key) {
      if (BACKED_PREFERENCE_KEYS.has(key) && typeof serverEntries[key] === 'string') merged[key] = serverEntries[key]
    })
    Object.keys(localEntries).forEach(function (key) {
      if (!Object.hasOwn(merged, key) || preferenceTouchedKeys.has(key)) merged[key] = localEntries[key]
    })
    Object.keys(merged).forEach(function (key) {
      if (!Object.hasOwn(rawLocalEntries, key) || rawLocalEntries[key] !== merged[key]) compatibility.storage.setItem(key, merged[key])
      else queuePersistentPreference(key, merged[key])
    })
    compatibility.dispatch(SETTINGS_EVENT)
    compatibility.dispatch(NOTIFY_CONFIG_EVENT)
    compatibility.dispatch(PEAK_RING_EVENT)
    compatibility.dispatch(PERMANENT_DELETE_EVENT)
    return merged
  }).catch(function () {
    preferenceHydrationPromise = null
    return null
  })
  return preferenceHydrationPromise
}

function installPersistentPreferenceSync() {
  hydratePersistentPreferences()
  var retries = typeof window.setTimeout === 'function' ? [1000, 4000].map(function (delay) {
    return window.setTimeout(function () { if (preferenceHydrationPromise === null) hydratePersistentPreferences() }, delay)
  }) : []
  function flushOnHide() { void flushPersistentPreferences() }
  if (typeof window.addEventListener === 'function') window.addEventListener('pagehide', flushOnHide)
  return function () {
    if (typeof window.clearTimeout === 'function') retries.forEach(function (timer) { window.clearTimeout(timer) })
    if (typeof window.removeEventListener === 'function') window.removeEventListener('pagehide', flushOnHide)
    void flushPersistentPreferences()
  }
}

function openOfficialRecharge() {
  var url = 'https://platform.deepseek.com/top_up'
  var confirmed = false
  try { confirmed = compatibility.storage.getItem(CONFIRM_KEY) === '1' } catch (e) { /* ignore */ }
  if (!confirmed) {
    if (typeof window.confirm !== 'function') return false
    if (!window.confirm('将打开 DeepSeek 官方充值页：\nplatform.deepseek.com\n\n确认继续？')) return false
    try { compatibility.storage.setItem(CONFIRM_KEY, '1') } catch (e) { /* ignore */ }
  }
  return compatibility.openExternal(url)
}
