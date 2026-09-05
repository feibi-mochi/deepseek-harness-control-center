function installMaidModelMenuGuard() {
  if (typeof document === 'undefined' || !document.body || typeof document.addEventListener !== 'function') return function () {}
  var timer = null
  var frame = null
  function sync() {
    timer = null
    var cards = document.querySelectorAll('[data-composer-card]')
    cards.forEach(function (card) {
      var menu = card.querySelector('[role="menu"]')
      var open = !!(menu && menu.querySelector('[role="menuitemradio"]'))
      card.classList.toggle('dshw_modelMenuOpen', open)
    })
  }
  function schedule() {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(function () {
      sync()
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        frame = window.requestAnimationFrame(sync)
      }
    }, 0)
  }
  document.addEventListener('click', schedule, true)
  document.addEventListener('keydown', schedule, true)
  document.addEventListener('focusin', schedule, true)
  schedule()
  return function () {
    document.removeEventListener('click', schedule, true)
    document.removeEventListener('keydown', schedule, true)
    document.removeEventListener('focusin', schedule, true)
    if (timer !== null) clearTimeout(timer)
    if (frame !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
    document.querySelectorAll('[data-composer-card].dshw_modelMenuOpen').forEach(function (card) { card.classList.remove('dshw_modelMenuOpen') })
  }
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
function peakRingSVG(windows, nowHour, size, ariaText, allOffPeak) {
  var sizePx = typeof size === 'number' && size > 0 ? size : 76
  var R = 28
  var CX = 38
  var CY = 38
  var CIRC = 2 * Math.PI * R
  // No pricing policy resolved: one neutral full ring, no arcs, no pointer
  // — the clock shows an unconfigured state and claims no price.
  if (!Array.isArray(windows) || windows.length === 0) {
    if (allOffPeak === true) {
      return React.createElement('svg', {
        width: sizePx, height: sizePx, viewBox: '0 0 76 76',
        role: 'img', className: 'dshw_peakRing',
        'aria-label': ariaText || '当前为周末低谷时段，全天半价'
      },
        React.createElement('circle', {
          key: 'weekend-off', cx: CX, cy: CY, r: R, fill: 'none',
          className: 'dshw_ringOff dshw_ringNow', strokeWidth: 6.5,
          strokeDasharray: CIRC.toFixed(2) + ' 0', strokeDashoffset: '0'
        }))
    }
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

function customCostsText(costs) {
  if (!costs || typeof costs !== 'object') return ''
  return Object.keys(costs).sort().filter(function (currency) {
    return Number.isFinite(costs[currency])
  }).map(function (currency) {
    return fmtCurrency(costs[currency], currency)
  }).join(' + ')
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

function normalizeChipStyle(value) {
  return value === 'hidden' ? 'hidden' : 'standard'
}

function normalizePeakBackground(value) {
  return value === 'solid' ? 'solid' : 'transparent'
}

function readBalanceOnly() {
  try {
    var saved = compatibility.storage.getItem(CHIP_BALANCE_ONLY_KEY)
    if (saved !== null) return saved === 'true'
    // Migrate the short-lived borderless-text preference to the intended
    // compact primary-value view.
    return compatibility.storage.getItem(CHIP_STYLE_KEY) === 'text'
  } catch (e) { return false }
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

// Keep the floating peak card reachable after a viewport resize, a
// persisted position from another screen size, or a scale change. `width`
// and `height` are the rendered dimensions from getBoundingClientRect(),
// so transformed 120% cards are clamped using their actual footprint.
function clampPeakPosition(pos, width, height, viewportWidth, viewportHeight, margin) {
  margin = Number.isFinite(margin) ? Math.max(0, margin) : 8
  viewportWidth = Number.isFinite(viewportWidth) ? viewportWidth : 1024
  viewportHeight = Number.isFinite(viewportHeight) ? viewportHeight : 768
  width = Number.isFinite(width) && width > 0 ? width : 180
  height = Number.isFinite(height) && height > 0 ? height : 60
  var x = pos && Number.isFinite(pos.x) ? pos.x : margin
  var y = pos && Number.isFinite(pos.y) ? pos.y : margin
  var maxX = Math.max(margin, viewportWidth - width - margin)
  var maxY = Math.max(margin, viewportHeight - height - margin)
  return {
    x: Math.round(Math.min(maxX, Math.max(margin, x))),
    y: Math.round(Math.min(maxY, Math.max(margin, y))),
  }
}

function historyHeatValue(day, metric) {
  if (!day) return 0
  if (metric === 'cost') return (Number.isFinite(day.cost) ? day.cost : 0)
    + (day.customCosts && Number.isFinite(day.customCosts.CNY) ? day.customCosts.CNY : 0)
  return Number.isFinite(day.totalTokens) ? day.totalTokens : 0
}

function historyHeatLevel(day, maximum, metric) {
  var value = historyHeatValue(day, metric)
  if (value <= 0 || maximum <= 0) return 0
  var ratio = value / maximum
  if (ratio >= 0.75) return 4
  if (ratio >= 0.5) return 3
  if (ratio >= 0.25) return 2
  return 1
}

function historyMoney(value) {
  return value === null || value === undefined ? '未定价' : fmtCurrency(value, 'CNY')
}

function UsageHistoryPanel(props) {
  props = props || {}
  var sessionId = typeof props.sessionId === 'string' ? props.sessionId : null
  var alwaysOpen = props.alwaysOpen === true
  var [open, setOpen] = React.useState(alwaysOpen)
  var effectiveOpen = alwaysOpen || open
  var [history, setHistory] = React.useState(null)
  var [loading, setLoading] = React.useState(alwaysOpen)
  var [notice, setNotice] = React.useState(null)
  var [selectedDate, setSelectedDate] = React.useState(null)
  var [metric, setMetric] = React.useState('tokens')
  var historyRequestRef = React.useRef(0)
  var historyGridRef = React.useRef(null)
  var historyFollowLatestRef = React.useRef(true)

  function loadHistory(date) {
    var requestId = ++historyRequestRef.current
    setLoading(true)
    setNotice(null)
    var params = ['days=365']
    if (sessionId) params.push('session=' + encodeURIComponent(sessionId))
    if (date) params.push('date=' + encodeURIComponent(date))
    fetch('/api/wallet/history?' + params.join('&')).then(function (resp) {
      return resp.json().then(function (json) { return { ok: resp.ok, json: json } })
    }).then(function (result) {
      if (requestId !== historyRequestRef.current) return
      if (!result.ok || !result.json || result.json.ok !== true) throw new Error(result.json && result.json.error ? result.json.error : 'history-unavailable')
      setHistory(result.json)
      setSelectedDate(date || null)
    }).catch(function () {
      if (requestId === historyRequestRef.current) setNotice('历史账本暂时不可用')
    }).then(function () {
      if (requestId === historyRequestRef.current) setLoading(false)
    })
  }

  React.useEffect(function () {
    if (effectiveOpen) loadHistory(null)
    // Settings keeps the ledger visible; compact wallet surfaces fetch it
    // only after the user expands the history card.
    return function () { historyRequestRef.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOpen, sessionId])

  useLayoutEffect(function () {
    var node = historyGridRef.current
    if (!effectiveOpen || !history || selectedDate !== null || !node) return
    node.scrollLeft = Math.max(0, node.scrollWidth - node.clientWidth)
    historyFollowLatestRef.current = true
  }, [effectiveOpen, history, selectedDate])

  React.useEffect(function () {
    var node = historyGridRef.current
    if (!effectiveOpen || !history || !node) return
    function updateFollowState() {
      var max = Math.max(0, node.scrollWidth - node.clientWidth)
      historyFollowLatestRef.current = max - node.scrollLeft <= 4
    }
    function keepLatestVisible() {
      if (!historyFollowLatestRef.current || selectedDate !== null) return
      node.scrollLeft = Math.max(0, node.scrollWidth - node.clientWidth)
    }
    node.addEventListener('scroll', updateFollowState, { passive: true })
    if (typeof window.addEventListener === 'function') window.addEventListener('resize', keepLatestVisible)
    var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(keepLatestVisible) : null
    if (observer) observer.observe(node)
    return function () {
      node.removeEventListener('scroll', updateFollowState)
      if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', keepLatestVisible)
      if (observer) observer.disconnect()
    }
  }, [effectiveOpen, history, selectedDate])
  function clearHistory() {
    if (history && history.storage && history.storage.locked) return
    if (!window.confirm('确认清除全部历史 Token 账本？当前会话余额与 token 数据不受影响，且不可恢复。')) return
    var requestId = ++historyRequestRef.current
    setLoading(true)
    fetch('/api/wallet/clear-history', { method: 'POST' }).then(function (resp) {
      return resp.json().then(function (json) { return { ok: resp.ok, json: json } })
    }).then(function (result) {
      if (requestId !== historyRequestRef.current) return
      if (!result.ok || !result.json || result.json.ok !== true) throw new Error('clear-failed')
      setHistory(null)
      setSelectedDate(null)
      setNotice('历史账本已清除')
      loadHistory(null)
    }).catch(function () {
      if (requestId === historyRequestRef.current) {
        setNotice('清除历史账本失败')
        setLoading(false)
      }
    })
  }

  var historyStorage = history && history.storage ? history.storage : null
  var historyHint = historyStorage && historyStorage.locked
    ? '本地账本无法读取，已锁定写入以保护原数据'
    : historyStorage && historyStorage.recovered
      ? '已从本地备份恢复，最多保留 365 天'
      : sessionId ? '只显示当前会话，按北京时间保留 365 天' : '仅保存在本机，按北京时间保留 365 天'
  var header = React.createElement('div', { className: 'dshw_historyHeader' },
    React.createElement('div', { className: 'dshw_historyTitleCopy' },
      React.createElement('strong', null, sessionId ? '本会话历史用量' : '历史用量账本'),
      React.createElement('span', null, historyHint)),
    alwaysOpen ? null : React.createElement('button', {
      type: 'button',
      className: 'dshw_btn',
      'aria-expanded': open,
      'aria-label': open ? '收起历史用量' : '查看历史用量',
      onClick: function () { setOpen(function (value) { return !value }) }
    }, open ? '收起' : '查看'))

  var body = null
  if (effectiveOpen) {
    if (loading && history === null) {
      body = React.createElement('div', { className: 'dshw_historyEmpty' }, '正在读取本地账本…')
    } else if (notice && history === null) {
      body = React.createElement('div', { className: 'dshw_historyEmpty' }, notice)
    } else if (history) {
      var days = Array.isArray(history.days) ? history.days : []
      var maximum = days.reduce(function (max, day) { return Math.max(max, historyHeatValue(day, metric)) }, 0)
      var firstWeekday = days.length > 0 && Number.isInteger(days[0].weekday) ? days[0].weekday : 0
      var cells = days.map(function (day, index) {
        var weekday = Number.isInteger(day.weekday) ? day.weekday : ((firstWeekday + index) % 7)
        var level = historyHeatLevel(day, maximum, metric)
        var isSelected = selectedDate === day.date
        var isToday = history.window && history.window.to === day.date
        return React.createElement('button', {
          key: day.date,
          type: 'button',
          role: 'gridcell',
          tabIndex: day.calls > 0 || isSelected || isToday ? 0 : -1,
          className: 'dshw_historyCell dshw_historyCell' + level + (isToday ? ' dshw_historyCellToday' : '') + (isSelected ? ' dshw_historyCellSelected' : ''),
          style: { gridColumn: String(Math.floor((index + firstWeekday) / 7) + 1), gridRow: String(weekday + 1) },
          title: day.date + ' · ' + fmtTokens(day.totalTokens) + ' token · 官方 ' + (day.cost === null ? '未定价' : historyMoney(day.cost)) + (customCostsText(day.customCosts) ? ' · 三方估 ' + customCostsText(day.customCosts) : '') + ' · ' + day.calls + ' 次调用',
          'aria-label': day.date + '，' + (metric === 'cost' ? ((day.cost === null ? '官方未定价' : historyMoney(day.cost)) + (customCostsText(day.customCosts) ? '，第三方估算 ' + customCostsText(day.customCosts) : '')) : fmtTokens(day.totalTokens) + ' token') + '，' + day.calls + ' 次调用',
          'aria-selected': isSelected,
          'aria-current': isToday ? 'date' : undefined,
          onClick: function () { loadHistory(day.date) }
        })
      })
      var summary = history.summary || {}
      var total = summary.total || {}
      var today = summary.today || {}
      var month = summary.month || {}
      var selected = history.selected
      var breakdown = selected && Array.isArray(selected.breakdown) ? selected.breakdown : []
      var detailRows = breakdown.length === 0
        ? (selected ? [React.createElement('div', { key: 'none', className: 'dshw_historyEmpty' }, '这一天没有可显示的明细')] : [])
        : breakdown.map(function (row) {
          return React.createElement('div', { key: row.provider + ':' + row.model, className: 'dshw_historyDetailRow' },
            React.createElement('span', { className: 'dshw_historyDetailName', title: row.provider + ' · ' + row.model }, row.model),
            React.createElement('span', null, fmtTokens(row.totalTokens) + ' · ' + row.calls + ' 次' + (row.cost === null ? '' : ' · ' + historyMoney(row.cost)) + (row.customCost ? ' · 估 ' + fmtCurrency(row.customCost.cost, row.customCost.currency) : '')))
        })
      body = React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'dshw_historySummary' },
          React.createElement('div', null, React.createElement('span', null, '累计'), React.createElement('strong', null, fmtTokens(total.totalTokens))),
          React.createElement('div', null, React.createElement('span', null, '今天'), React.createElement('strong', null, fmtTokens(today.totalTokens))),
          React.createElement('div', null, React.createElement('span', null, '本月'), React.createElement('strong', null, fmtTokens(month.totalTokens))),
          React.createElement('div', null, React.createElement('span', null, '缓存命中'), React.createElement('strong', null, history.summary.cacheHitRate === null || history.summary.cacheHitRate === undefined ? '--' : history.summary.cacheHitRate + '%'))),
        customCostsText(total.customCosts) ? React.createElement('div', { className: 'dshw_historyLegend' }, '第三方按当前自定义规则估算：' + customCostsText(total.customCosts)) : null,
        React.createElement('div', { className: 'dshw_historyMetricToggle', role: 'group', 'aria-label': '历史热力图指标' },
           React.createElement('button', { type: 'button', className: metric === 'tokens' ? 'dshw_historyMetricActive' : '', 'aria-pressed': metric === 'tokens', onClick: function () { setMetric('tokens') } }, 'Token'),
           React.createElement('button', { type: 'button', className: metric === 'cost' ? 'dshw_historyMetricActive' : '', 'aria-pressed': metric === 'cost', onClick: function () { setMetric('cost') } }, '费用')),
         React.createElement('div', { className: 'dshw_historyLegend' },
          React.createElement('span', null, metric === 'cost' ? '低' : '少'),
          React.createElement('i', { className: 'dshw_historySwatch dshw_historyCell0' }),
          React.createElement('i', { className: 'dshw_historySwatch dshw_historyCell1' }),
          React.createElement('i', { className: 'dshw_historySwatch dshw_historyCell2' }),
          React.createElement('i', { className: 'dshw_historySwatch dshw_historyCell3' }),
          React.createElement('i', { className: 'dshw_historySwatch dshw_historyCell4' }),
          React.createElement('span', null, metric === 'cost' ? '高' : '多')),
        React.createElement('div', { className: 'dshw_historyChart' },
        React.createElement('div', { className: 'dshw_historyWeekLabels', 'aria-hidden': 'true' },
          React.createElement('span', null, '日'), React.createElement('span', null, '一'), React.createElement('span', null, '二'), React.createElement('span', null, '三'), React.createElement('span', null, '四'), React.createElement('span', null, '五'), React.createElement('span', null, '六')),
        React.createElement('div', { ref: historyGridRef, className: 'dshw_historyHeatmap', role: 'grid', 'aria-label': '365 天 Token 用量热力图' }, cells)),
        selected ? React.createElement('div', { className: 'dshw_historyDetail' },
          React.createElement('div', { className: 'dshw_historyDetailHeader' },
            React.createElement('strong', null, selected.date),
            React.createElement('span', null, fmtTokens(selected.total.totalTokens) + ' token · ' + selected.total.calls + ' 次 · ' + historyMoney(selected.total.cost))),
          detailRows) : null,
        React.createElement('div', { className: 'dshw_historyActions' },
          React.createElement('span', { className: 'dshw_muted' }, notice || '费用按用量发生时的价格锁定；未知价格只显示 Token'),
          React.createElement('button', { type: 'button', className: 'dshw_btn', onClick: function () { loadHistory(selectedDate) } }, '刷新'),
          React.createElement('button', { type: 'button', className: 'dshw_btn', disabled: !!(historyStorage && historyStorage.locked), title: historyStorage && historyStorage.locked ? '账本存储已锁定，不能覆盖原文件' : '清除全部历史账本', style: { color: 'var(--dsw-alias-state-error-primary,#e5534b)' }, onClick: clearHistory }, '清除历史账本')))
    }
  }
  return React.createElement('div', { className: 'dshw_historyCard' }, header, body)
}
function selectionFromStore(store) {
  if (!store || typeof store.getSnapshot !== 'function') return null
  var snapshot = store.getSnapshot()
  return snapshot && snapshot.current && typeof snapshot.current.provider === 'string'
    ? snapshot.current
    : null
}

function useModelSelectionStore(directory, modelAware) {
  var store = directory && directory.store
  var [selection, setSelection] = React.useState(function () {
    return modelAware ? selectionFromStore(store) : null
  })
  React.useEffect(function () {
    if (!modelAware || !store || typeof store.subscribe !== 'function') {
      setSelection(null)
      return
    }
    function sync() { setSelection(selectionFromStore(store)) }
    sync()
    var stop = store.subscribe(sync)
    if (directory && typeof directory.load === 'function' && store.getSnapshot().status === 'idle') {
      directory.load().catch(function () { /* surfaced by the model picker */ })
    }
    return function () { if (typeof stop === 'function') stop() }
  }, [directory, store, modelAware])
  return selection
}

function useCurrentModelSelection(sessionsService, modelDirectories, modelAware) {
  var [selection, setSelection] = React.useState(null)
  React.useEffect(function () {
    if (!modelAware || !sessionsService || !sessionsService.list || !modelDirectories) {
      setSelection(null)
      return
    }
    var currentId
    var stopDirectory = null
    var retryTimer = null
    var retryCount = 0
    function bindCurrent() {
      var listSnapshot = sessionsService.list.getSnapshot()
      var nextId = listSnapshot && typeof listSnapshot.current === 'string' ? listSnapshot.current : null
      if (nextId === currentId) return
      if (typeof stopDirectory === 'function') stopDirectory()
      stopDirectory = null
      if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null }
      if (nextId === null) { currentId = null; setSelection(null); return }
      try {
        var directory = modelDirectories.directoryFor(nextId)
        var store = directory && directory.store
        if (!store || typeof store.subscribe !== 'function') { setSelection(null); return }
        currentId = nextId
        retryCount = 0
        function sync() { setSelection(selectionFromStore(store)) }
        sync()
        stopDirectory = store.subscribe(sync)
        if (store.getSnapshot().status === 'idle') directory.load().catch(function () { /* surfaced by the model picker */ })
      } catch (e) {
        currentId = undefined
        setSelection(null)
        if (retryCount < 4) {
          retryCount += 1
          retryTimer = setTimeout(bindCurrent, 250)
        }
      }
    }
    bindCurrent()
    var stopList = sessionsService.list.subscribe(bindCurrent)
    return function () {
      if (typeof stopList === 'function') stopList()
      if (typeof stopDirectory === 'function') stopDirectory()
      if (retryTimer !== null) clearTimeout(retryTimer)
    }
  }, [sessionsService, modelDirectories, modelAware])
  return selection
}

function providerModeFor(selection, snapshot, modelAware) {
  if (!modelAware) return { kind: 'deepseek', provider: 'deepseek-official', model: null }
  if (!selection || typeof selection.provider !== 'string') return { kind: 'loading', provider: null, model: null }
  var provider = selection.provider
  var model = typeof selection.model === 'string' ? selection.model : null
  var planProvider = provider.indexOf('vision-toolkit-') === 0 ? provider.slice('vision-toolkit-'.length) : provider
  if (planProvider === 'zai' || planProvider === 'zai-coding-cn') return { kind: 'zai', provider: planProvider, routeProvider: provider, model: model }
  var providers = snapshot && snapshot.providers ? snapshot.providers : {}
  var aliases = Array.isArray(providers.official) ? providers.official : []
  if (provider === (providers.builtinOfficial || 'deepseek-official') || aliases.indexOf(provider) >= 0) {
    return { kind: 'deepseek', provider: provider, model: model }
  }
  return { kind: 'third', provider: provider, model: model }
}

function isPlanProviderId(provider) {
  return provider === 'zai' || provider === 'zai-coding-cn'
}

function preferredPlanProvider(snapshot, currentMode) {
  if (currentMode && currentMode.kind === 'zai') return currentMode.provider
  var sources = snapshot && snapshot.plans && Array.isArray(snapshot.plans.sources) ? snapshot.plans.sources : []
  var source = sources.find(function (item) { return item && (item.available || item.configured === true) })
    || sources.find(function (item) { return item && isPlanProviderId(item.provider) })
  return source && typeof source.provider === 'string' ? source.provider : null
}

function planSourceForProvider(snapshot, provider) {
  var sources = snapshot && snapshot.plans && Array.isArray(snapshot.plans.sources) ? snapshot.plans.sources : []
  return sources.find(function (source) { return source && source.provider === provider }) || null
}

function planRemainingPercent(source, id) {
  var limits = source && Array.isArray(source.limits) ? source.limits : []
  var limit = limits.find(function (candidate) { return candidate && candidate.id === id })
  return limit && Number.isFinite(limit.remainingPercentage) ? Math.round(limit.remainingPercentage) + '%' : '--'
}

function providerDisplayName(mode) {
  if (!mode || !mode.provider) return '模型'
  if (mode.kind === 'zai') return 'Z.ai'
  return mode.provider.length > 18 ? mode.provider.slice(0, 16) + '…' : mode.provider
}

function planErrorText(code) {
  switch (code) {
    case 'missing-credential': return '未配置对应 API Key'
    case 'credentials-unavailable': return '宿主凭据服务暂不可用'
    case 'invalid-credential': return '凭据格式不可用'
    case 'unauthorized': return 'API Key 无效或套餐接口未授权'
    case 'rate-limited': return '查询过于频繁，请稍后重试'
    case 'timeout': return '套餐接口响应超时'
    case 'invalid-response': return '套餐接口返回格式已变化'
    case 'upstream-unavailable': return '套餐接口暂不可用'
    default: return '套餐状态暂不可用'
  }
}

function planLimitLabel(limit) {
  return limit && limit.kind === 'tools' ? 'MCP 工具额度' : '模型 Token 额度'
}

function planWindowLabel(limit) {
  return limit && limit.window === 'month' ? '1 个月窗口' : '5 小时窗口'
}

function planNumber(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(value).toLocaleString('zh-CN')
}

function planResetLabel(value) {
  if (!Number.isFinite(value)) return null
  try { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch (e) { return null }
}

function PlanUsagePanel(props) {
  props = props || {}
  var compact = props.compact === true
  var provider = typeof props.provider === 'string' ? props.provider : null
  var [open, setOpen] = React.useState(!compact)
  var [data, setData] = React.useState(null)
  var [notice, setNotice] = React.useState(null)
  var requestRef = React.useRef(0)

  function load(force) {
    var requestId = ++requestRef.current
    setNotice(force ? '正在刷新套餐额度…' : null)
    var options = force ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' } : undefined
    fetch('/api/wallet/plans', options).then(function (resp) { return resp.json() }).then(function (json) {
      if (requestId !== requestRef.current) return
      if (json && json.ok) { setData(json); setNotice(force ? '套餐额度已刷新' : null) }
      else setNotice(json && json.error ? planErrorText(json.error) : '套餐查询失败')
    }).catch(function () { if (requestId === requestRef.current) setNotice('套餐查询失败') })
  }

  React.useEffect(function () {
    load(false)
    return function () { requestRef.current += 1 }
  }, [])

  var sources = data && Array.isArray(data.sources) ? data.sources : []
  var shown = compact
    ? sources.filter(function (source) {
        return provider !== null ? source.provider === provider : source.configured === true || source.available
      })
    : sources
  var available = shown.filter(function (source) { return source.available })
  var firstLimit = available.length > 0 && available[0].limits && available[0].limits.length > 0 ? available[0].limits[0] : null
  var summary = data === null ? '正在读取套餐…'
    : data.configuredCount > 0
      ? data.availableCount + '/' + data.configuredCount + ' 个套餐可用' + (firstLimit && Number.isFinite(firstLimit.remainingPercentage) ? ' · 剩余 ' + Math.round(firstLimit.remainingPercentage) + '%' : '')
      : '未检测到已配置套餐'
  var headerCopy = React.createElement('span', { className: 'dshw_planHeaderCopy' },
    React.createElement('span', { className: 'dshw_planTitle' }, '套餐额度'),
    React.createElement('span', { className: 'dshw_planHint' }, notice || summary))
  var refreshButton = React.createElement('button', { type: 'button', className: 'dshw_btn', disabled: !!(data && data.refreshing), onClick: function () { load(true) } }, data && data.refreshing ? '刷新中…' : '刷新')
  var header = compact
    ? React.createElement('div', { className: 'dshw_planHeader' },
        React.createElement('button', { type: 'button', className: 'dshw_planHeaderButton', style: { display: 'flex', flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: 0, border: 0, background: 'transparent', color: 'inherit', textAlign: 'left' }, 'aria-label': open ? '收起套餐额度' : '查看套餐额度', 'aria-expanded': open, onClick: function () { setOpen(!open) } }, headerCopy, React.createElement('span', { className: 'dshw_muted', 'aria-hidden': 'true' }, open ? '▴' : '▾')),
        refreshButton)
    : React.createElement('div', { className: 'dshw_planHeader' }, headerCopy, refreshButton)
  if (!open) return React.createElement('div', { className: 'dshw_planCard' }, header)

  var sourceRows = shown.map(function (source) {
    var status = source.configured === false ? '未配置'
      : source.refreshing ? '刷新中'
        : source.available ? (source.stale || source.error ? '缓存' : '正常') : '异常'
    var badgeClass = 'dshw_planBadge' + (status === '正常' ? ' ok' : status === '缓存' || status === '异常' ? ' warn' : '')
    var limits = Array.isArray(source.limits) ? source.limits.map(function (limit) {
      var remainingPct = Number.isFinite(limit.remainingPercentage) ? Math.min(100, Math.max(0, limit.remainingPercentage)) : null
      var usedPct = Number.isFinite(limit.usedPercentage) ? Math.min(100, Math.max(0, limit.usedPercentage)) : null
      var fillClass = 'dshw_planBarFill' + (remainingPct !== null && remainingPct <= 20 ? ' critical' : remainingPct !== null && remainingPct <= 50 ? ' warn' : '')
      var used = planNumber(limit.used)
      var total = planNumber(limit.total)
      var reset = planResetLabel(limit.resetAt)
      var usageMeta = planWindowLabel(limit) + (usedPct === null ? '' : ' · 已用 ' + Math.round(usedPct) + '%')
        + (used !== null && total !== null ? ' · ' + used + ' / ' + total : '')
      return React.createElement('div', { key: limit.id, className: 'dshw_planLimit' },
        React.createElement('div', { className: 'dshw_planLimitTop' },
          React.createElement('span', null, planLimitLabel(limit)),
          React.createElement('span', null, remainingPct === null ? '—' : '剩余 ' + Math.round(remainingPct) + '%')),
        React.createElement('div', { className: 'dshw_planBar', role: 'progressbar', 'aria-label': source.name + ' ' + planLimitLabel(limit) + '剩余额度', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': remainingPct === null ? undefined : Math.round(remainingPct) },
          React.createElement('div', { className: fillClass, style: { width: (remainingPct === null ? 0 : remainingPct) + '%' } })),
        React.createElement('div', { className: 'dshw_planLimitMeta' },
          React.createElement('span', null, usageMeta),
          React.createElement('span', null, reset ? '重置 ' + reset : '按官方额度统计')))
    }) : []
    var message = source.configured === false ? '在 DSH 模型设置中配置后自动读取'
      : source.error ? planErrorText(source.error) + (source.available ? '，显示上次成功数据' : '')
        : source.available ? null : '等待首次查询'
    return React.createElement('div', { key: source.id, className: 'dshw_planSource' },
      React.createElement('div', { className: 'dshw_planSourceHead' },
        React.createElement('span', null,
          React.createElement('div', { className: 'dshw_planSourceName' }, source.name),
          React.createElement('div', { className: 'dshw_planSourceMeta' }, source.sourceDomain + (source.level ? ' · ' + source.level : '') + (source.fetchedAt ? ' · ' + new Date(source.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''))),
        React.createElement('span', { className: badgeClass }, status)),
      message ? React.createElement('div', { className: 'dshw_muted', style: { marginTop: '6px' } }, message) : null,
      limits.length > 0 ? React.createElement('div', { className: 'dshw_planLimits' }, limits) : null)
  })
  if (sourceRows.length === 0) sourceRows = [React.createElement('div', { key: 'none', className: 'dshw_muted' }, compact ? '暂无已配置套餐' : '尚未检测到支持的套餐凭据')]
  return React.createElement('div', { className: 'dshw_planCard' }, header, React.createElement('div', { className: 'dshw_planSources' }, sourceRows))
}

/**
 * Host settings-panel section: the same wallet controls as the chip panel,
 * as an independent card. Shares state with the chip through the same
 * storage keys plus the SETTINGS_EVENT notification, so both surfaces stay
 * in sync without lifting the chip's internal state.
 */
