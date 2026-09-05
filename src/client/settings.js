function WalletSettingsSection(props) {
  props = props || {}
  var close = typeof props.close === 'function' ? props.close : null
  var settingsSectionRef = React.useRef(null)
  var [snapshot, setSnapshot] = React.useState(null)
  var [health, setHealth] = React.useState(null)
  var [healthNotice, setHealthNotice] = React.useState(null)
  var [thresholdDraft, setThresholdDraft] = React.useState('')
  var [thresholdNotice, setThresholdNotice] = React.useState(null)
  var [accounts, setAccounts] = React.useState(null)
  var [accountsError, setAccountsError] = React.useState(null)
  var [accountNotice, setAccountNotice] = React.useState(null)
  var [nameDraft, setNameDraft] = React.useState('')
  var [keyDraft, setKeyDraft] = React.useState('')
  var [switchingId, setSwitchingId] = React.useState(null)
  var [priceRules, setPriceRules] = React.useState([])
  var [knownPriceRoutes, setKnownPriceRoutes] = React.useState([])
  var [priceNotice, setPriceNotice] = React.useState(null)
  var [priceDraft, setPriceDraft] = React.useState({
    provider: '', model: '', currency: 'CNY', input: '', cacheRead: '', cacheWrite: '', output: '',
    timezone: 'Asia/Shanghai', windows: []
  })
  var [visibility, setVisibility] = React.useState(function () {
    try {
      var saved = compatibility.storage.getItem(DATA_VISIBILITY_KEY)
      return saved === null ? normalizeDataVisibility(null) : normalizeDataVisibility(JSON.parse(saved))
    } catch (e) { return normalizeDataVisibility(null) }
  })
  var [chipStyle, setChipStyle] = React.useState(function () {
    try { return normalizeChipStyle(compatibility.storage.getItem(CHIP_STYLE_KEY)) } catch (e) { return 'standard' }
  })
  var [balanceOnly, setBalanceOnly] = React.useState(readBalanceOnly)
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
  var [peakOrient, setPeakOrient] = React.useState(function () {
    try { return compatibility.storage.getItem(PEAK_ORIENT_KEY) || 'horizontal' } catch (e) { return 'horizontal' }
  })
  var [peakBackground, setPeakBackground] = React.useState(function () {
    try { return normalizePeakBackground(compatibility.storage.getItem(PEAK_BACKGROUND_KEY)) } catch (e) { return 'transparent' }
  })
  var [peakRecharge, setPeakRecharge] = React.useState(function () {
    try { return compatibility.storage.getItem(PEAK_RECHARGE_KEY) !== 'false' } catch (e) { return true }
  })
  var [peakScale, setPeakScale] = React.useState(function () {
    try {
      var val = Number.parseFloat(compatibility.storage.getItem(PEAK_SCALE_KEY))
      return Number.isFinite(val) ? Math.min(1.2, Math.max(1.0, val)) : 1.0
    } catch (e) { return 1.0 }
  })
  var [peakDock, setPeakDock] = React.useState(function () {
    try { return compatibility.storage.getItem(PEAK_DOCK_KEY) || 'sidebar' } catch (e) { return 'sidebar' }
  })
  var settingsModelSelection = useCurrentModelSelection(props.sessionsService, props.modelDirectories, props.modelAware === true)
  React.useEffect(function () {
    if (typeof window.addEventListener !== 'function') return
    function syncPreferencesFromStorage() {
      try {
        var savedVisibility = compatibility.storage.getItem(DATA_VISIBILITY_KEY)
        setVisibility(savedVisibility === null ? normalizeDataVisibility(null) : normalizeDataVisibility(JSON.parse(savedVisibility)))
      } catch (e) { /* ignore */ }
      try { setChipStyle(normalizeChipStyle(compatibility.storage.getItem(CHIP_STYLE_KEY))) } catch (e) { /* ignore */ }
      try { setBalanceOnly(readBalanceOnly()) } catch (e) { /* ignore */ }
      try { setScale(normalizeChipScale(compatibility.storage.getItem(CHIP_SCALE_KEY))) } catch (e) { /* ignore */ }
      try {
        var notify = readNotifyConfig()
        setNotifyEnabled(notify.enabled)
        setNotifyTimeout(notify.timeout === 0 ? 'keep' : String(notify.timeout))
      } catch (e) { /* ignore */ }
      try { setLowBlinkEnabled(compatibility.storage.getItem(LOW_BLINK_KEY) !== 'false') } catch (e) { /* ignore */ }
      try { setPdEnabled(compatibility.storage.getItem(PERMANENT_DELETE_KEY) === 'true') } catch (e) { /* ignore */ }
      try { setRingEnabled(compatibility.storage.getItem(PEAK_RING_KEY) !== 'false') } catch (e) { /* ignore */ }
      try { setPeakNotifyEnabled(compatibility.storage.getItem(PEAK_NOTIFY_KEY) === 'true') } catch (e) { /* ignore */ }
      try { setPeakOrient(compatibility.storage.getItem(PEAK_ORIENT_KEY) || 'horizontal') } catch (e) { /* ignore */ }
      try { setPeakBackground(normalizePeakBackground(compatibility.storage.getItem(PEAK_BACKGROUND_KEY))) } catch (e) { /* ignore */ }
      try { setPeakRecharge(compatibility.storage.getItem(PEAK_RECHARGE_KEY) !== 'false') } catch (e) { /* ignore */ }
      try {
        var savedPeakScale = Number.parseFloat(compatibility.storage.getItem(PEAK_SCALE_KEY))
        setPeakScale(Number.isFinite(savedPeakScale) ? Math.min(1.2, Math.max(1, savedPeakScale)) : 1)
      } catch (e) { /* ignore */ }
      try { setPeakDock(compatibility.storage.getItem(PEAK_DOCK_KEY) || 'sidebar') } catch (e) { /* ignore */ }
    }
    window.addEventListener(SETTINGS_EVENT, syncPreferencesFromStorage)
    return function () { window.removeEventListener(SETTINGS_EVENT, syncPreferencesFromStorage) }
  }, [])
  useLayoutEffect(function () {
    var node = settingsSectionRef.current
    var dialog = node && typeof node.closest === 'function' ? node.closest('[role="dialog"]') : null
    if (!dialog || !dialog.classList) return
    dialog.classList.add('dshw_settingsHostDialog')
    return function () { dialog.classList.remove('dshw_settingsHostDialog') }
  }, [])
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
          var providerState = json.providers || {}
          setPriceRules(Array.isArray(providerState.customPrices) ? providerState.customPrices : [])
          setKnownPriceRoutes(Array.isArray(providerState.knownRoutes) ? providerState.knownRoutes : [])
          setThresholdDraft(json.threshold !== undefined && json.threshold !== null ? json.threshold.toFixed(2) : '')
        }
      }).catch(function () { /* ignore */ })
    }
    refresh()
    fetch('/api/wallet/accounts').then(function (resp) { return resp.json() }).then(function (json) {
      if (!stopped && json && json.ok) {
        setAccounts(json)
        setAccountsError(json.storage && json.storage.locked ? '账户加密文件无法解密，已锁定写入以保护原数据' : null)
      }
    }).catch(function () { if (!stopped) setAccountsError('\u8d26\u6237\u63a5\u53e3\u4e0d\u53ef\u7528') })
    fetch('/api/wallet/health').then(function (resp) { return resp.json() }).then(function (json) {
      if (!stopped && json && json.ok) setHealth(json)
    }).catch(function () { if (!stopped) setHealthNotice('健康检查不可用') })
    try {
      var savedLayout = compatibility.storage.getItem(CHIP_LAYOUT_KEY)
      var dock = savedLayout === null ? 'home' : normalizeChipLayout(JSON.parse(savedLayout)).dock
      setScaleMax(dock === 'home' ? 105 : 125)
    } catch (e) { /* ignore */ }
    return function () { stopped = true }
  }, [])

  function refreshHealth() {
    setHealthNotice('正在检测…')
    fetch('/api/wallet/health').then(function (resp) { return resp.json() }).then(function (json) {
      if (json && json.ok) { setHealth(json); setHealthNotice('检测完成') }
      else setHealthNotice('检测失败')
    }).catch(function () { setHealthNotice('检测失败') })
  }

  function refreshPricing() {
    setHealthNotice('正在同步官方价格…')
    fetch('/api/wallet/pricing/refresh', { method: 'POST' }).then(function (resp) { return resp.json() }).then(function (json) {
      if (json && json.ok) {
        setHealth(function (current) { return current ? Object.assign({}, current, { pricing: json.pricing }) : current })
        setHealthNotice(json.pricing && json.pricing.status === 'synced' ? '官方价格已同步' : '已保留内置价格，等待复核')
      } else setHealthNotice('价格同步失败')
    }).catch(function () { setHealthNotice('价格同步失败') })
  }

  function copyDiagnostics() {
    if (!health) return
    var safe = {
      plugin: health.plugin,
      host: health.host,
      pricing: health.pricing && {
        status: health.pricing.status,
        ruleVersion: health.pricing.ruleVersion,
        checkedAt: health.pricing.checkedAt,
        modelCount: health.pricing.modelCount,
      },
      accounts: health.accounts && {
        encryptedAtRest: health.accounts.encryptedAtRest,
        scheme: health.accounts.scheme,
        status: health.accounts.status,
      },
      usage: health.usage && {
        status: health.usage.status,
        locked: health.usage.locked,
        recovered: health.usage.recovered,
        backup: health.usage.backup,
        retentionDays: health.usage.retentionDays,
      },
      runtime: health.runtime && { node: health.runtime.node, platform: health.runtime.platform },
    }
    var text = JSON.stringify(safe, null, 2)
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(function () { setHealthNotice('诊断信息已复制') }).catch(function () { setHealthNotice('复制失败') })
        return
      }
    } catch (e) { /* fall through to the message */ }
    setHealthNotice('当前环境不支持自动复制')
  }

  function persistVisibility(next) {
    next = normalizeDataVisibility(next)
    setVisibility(next)
    try { compatibility.storage.setItem(DATA_VISIBILITY_KEY, JSON.stringify(next)) } catch (e) { /* ignore */ }
    compatibility.dispatch(SETTINGS_EVENT)
  }

  function persistChipStyle(next) {
    next = normalizeChipStyle(next)
    setChipStyle(next)
    try { compatibility.storage.setItem(CHIP_STYLE_KEY, next) } catch (e) { /* ignore */ }
    compatibility.dispatch(SETTINGS_EVENT)
  }

  function persistBalanceOnly(next) {
    next = next === true
    setBalanceOnly(next)
    try { compatibility.storage.setItem(CHIP_BALANCE_ONLY_KEY, String(next)) } catch (e) { /* ignore */ }
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

  function persistPeakOrient(next) {
    setPeakOrient(next)
    try { compatibility.storage.setItem(PEAK_ORIENT_KEY, next) } catch (e) { /* ignore */ }
    compatibility.dispatch(SETTINGS_EVENT)
    compatibility.dispatch(PEAK_RING_EVENT)
  }

  function persistPeakBackground(next) {
    next = normalizePeakBackground(next)
    setPeakBackground(next)
    try { compatibility.storage.setItem(PEAK_BACKGROUND_KEY, next) } catch (e) { /* ignore */ }
    compatibility.dispatch(SETTINGS_EVENT)
    compatibility.dispatch(PEAK_RING_EVENT)
  }

  function persistPeakRecharge(next) {
    setPeakRecharge(next)
    try { compatibility.storage.setItem(PEAK_RECHARGE_KEY, String(next)) } catch (e) { /* ignore */ }
    compatibility.dispatch(SETTINGS_EVENT)
    compatibility.dispatch(PEAK_RING_EVENT)
  }

  function persistPeakScale(next) {
    var num = Math.min(1.2, Math.max(1.0, next))
    setPeakScale(num)
    try { compatibility.storage.setItem(PEAK_SCALE_KEY, String(num)) } catch (e) { /* ignore */ }
    compatibility.dispatch(SETTINGS_EVENT)
    compatibility.dispatch(PEAK_RING_EVENT)
  }

  function resetPeakDock() {
    setPeakDock('sidebar')
    try {
      compatibility.storage.setItem(PEAK_DOCK_KEY, 'sidebar')
      compatibility.storage.removeItem(PEAK_POS_KEY)
    } catch (e) { /* ignore */ }
    compatibility.dispatch(SETTINGS_EVENT)
    compatibility.dispatch(PEAK_RING_EVENT)
  }

  function saveThreshold(valueArg) {
    if (usageLocked) { setThresholdNotice('用量账本已锁定，无法保存'); return }
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

  function applyCustomPriceResponse(json) {
    if (!json || json.ok !== true) return false
    setPriceRules(Array.isArray(json.rules) ? json.rules : [])
    setKnownPriceRoutes(Array.isArray(json.knownRoutes) ? json.knownRoutes : [])
    return true
  }

  function saveCustomPrice() {
    if (usageLocked) { setPriceNotice('用量账本已锁定，无法保存'); return }
    var numeric = ['input', 'cacheRead', 'cacheWrite', 'output'].reduce(function (out, key) {
      var value = Number.parseFloat(priceDraft[key])
      out[key] = Number.isFinite(value) && value >= 0 ? value : null
      return out
    }, {})
    if (!priceDraft.provider.trim() || !priceDraft.model.trim() || Object.values(numeric).some(function (value) { return value === null })) {
      setPriceNotice('请填写 Provider、模型及四项非负价格')
      return
    }
    var windows = (Array.isArray(priceDraft.windows) ? priceDraft.windows : []).map(function (window) {
      var rates = ['input', 'cacheRead', 'cacheWrite', 'output'].reduce(function (out, key) {
        var value = Number.parseFloat(window[key])
        out[key] = Number.isFinite(value) && value >= 0 ? value : null
        return out
      }, {})
      return {
        label: String(window.label || '').trim(),
        days: Array.isArray(window.days) ? window.days.slice() : [],
        start: window.start,
        end: window.end,
        input: rates.input,
        cacheRead: rates.cacheRead,
        cacheWrite: rates.cacheWrite,
        output: rates.output
      }
    })
    if (windows.some(function (window) {
      return !window.label || window.days.length === 0 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.start || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.end || '') || window.start === window.end || ['input', 'cacheRead', 'cacheWrite', 'output'].some(function (key) { return window[key] === null })
    })) {
      setPriceNotice('请完整填写分时段名称、星期、起止时间及四项价格')
      return
    }
    setPriceNotice('正在保存…')
    fetch('/api/wallet/custom-prices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rule: {
        provider: priceDraft.provider.trim(),
        model: priceDraft.model.trim(),
        currency: priceDraft.currency,
        input: numeric.input,
        cacheRead: numeric.cacheRead,
        cacheWrite: numeric.cacheWrite,
        output: numeric.output,
        timezone: String(priceDraft.timezone || '').trim(),
        windows: windows
      } })
    }).then(function (resp) { return resp.json().then(function (json) { return { ok: resp.ok, json: json } }) }).then(function (result) {
      if (!result.ok || !applyCustomPriceResponse(result.json)) throw new Error(result.json && result.json.error ? result.json.error : 'save-failed')
      setPriceNotice('已保存；本会话与历史账本按当前自定义规则重新估算')
    }).catch(function (error) {
      setPriceNotice(error && error.message === 'official-provider-not-allowed' ? '官方计费 Provider 不能设置第三方价格' : '保存失败，请检查时区、时段是否有效或重叠')
    })
  }

  function removeCustomPrice(rule) {
    if (usageLocked) return
    setPriceNotice('正在删除…')
    fetch('/api/wallet/custom-prices', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: rule.provider, model: rule.model })
    }).then(function (resp) { return resp.json().then(function (json) { return { ok: resp.ok, json: json } }) }).then(function (result) {
      if (!result.ok || !applyCustomPriceResponse(result.json)) throw new Error('delete-failed')
      setPriceNotice('已删除价格规则')
    }).catch(function () { setPriceNotice('删除失败') })
  }

  function editCustomPrice(rule) {
    setPriceDraft({
      provider: rule.provider,
      model: rule.model,
      currency: rule.currency,
      input: String(rule.input),
      cacheRead: String(rule.cacheRead),
      cacheWrite: String(rule.cacheWrite),
      output: String(rule.output),
      timezone: rule.timezone || 'Asia/Shanghai',
      windows: (Array.isArray(rule.windows) ? rule.windows : []).map(function (window) {
        return {
          label: window.label,
          days: Array.isArray(window.days) ? window.days.slice() : [],
          start: window.start,
          end: window.end,
          input: String(window.input),
          cacheRead: String(window.cacheRead),
          cacheWrite: String(window.cacheWrite),
          output: String(window.output)
        }
      })
    })
    setPriceNotice('已载入，可修改后保存')
  }

  function addCustomPriceWindow() {
    setPriceDraft(function (current) {
      var windows = Array.isArray(current.windows) ? current.windows.slice() : []
      var fallback = function (key) { return current[key] === '' ? '' : String(current[key]) }
      windows.push({
        label: '分时段 ' + (windows.length + 1),
        days: [1, 2, 3, 4, 5],
        start: '00:00',
        end: '09:00',
        input: fallback('input'),
        cacheRead: fallback('cacheRead'),
        cacheWrite: fallback('cacheWrite'),
        output: fallback('output')
      })
      return Object.assign({}, current, { windows: windows })
    })
  }

  function updateCustomPriceWindow(index, key, value) {
    setPriceDraft(function (current) {
      var windows = (Array.isArray(current.windows) ? current.windows : []).map(function (window, candidate) {
        return candidate === index ? Object.assign({}, window, (function () { var patch = {}; patch[key] = value; return patch })()) : window
      })
      return Object.assign({}, current, { windows: windows })
    })
  }

  function toggleCustomPriceDay(index, day) {
    setPriceDraft(function (current) {
      var windows = (Array.isArray(current.windows) ? current.windows : []).map(function (window, candidate) {
        if (candidate !== index) return window
        var days = Array.isArray(window.days) ? window.days.slice() : []
        days = days.includes(day) ? days.filter(function (value) { return value !== day }) : days.concat([day])
        return Object.assign({}, window, { days: days })
      })
      return Object.assign({}, current, { windows: windows })
    })
  }

  function removeCustomPriceWindow(index) {
    setPriceDraft(function (current) {
      return Object.assign({}, current, { windows: (Array.isArray(current.windows) ? current.windows : []).filter(function (_, candidate) { return candidate !== index }) })
    })
  }

  function useCurrentRouteForPrice() {
    if (!settingsModelSelection || typeof settingsModelSelection.provider !== 'string' || typeof settingsModelSelection.model !== 'string') {
      setPriceNotice('当前会话尚未选择可识别的模型')
      return
    }
    setPriceDraft(function (current) {
      return Object.assign({}, current, {
        provider: settingsModelSelection.provider,
        model: settingsModelSelection.model
      })
    })
    setPriceNotice('已填入当前会话的 Provider 与模型')
  }

  function reloadAccounts() {
    fetch('/api/wallet/accounts').then(function (resp) { return resp.json() }).then(function (json) {
      if (json && json.ok) {
        setAccounts(json)
        setAccountsError(json.storage && json.storage.locked ? '账户加密文件无法解密，已锁定写入以保护原数据' : null)
      }
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
  var settingsProviderMode = providerModeFor(settingsModelSelection, snapshot || {}, props.modelAware === true)
  var peakClockApplicable = settingsProviderMode.kind === 'deepseek' && /^deepseek-v4-/.test(settingsProviderMode.model || '')
  var peakClockHint = !ringEnabled
    ? '已关闭；仅 DeepSeek V4 使用'
    : peakClockApplicable
      ? '当前 DeepSeek V4，侧边栏底部显示'
      : settingsProviderMode.kind === 'zai'
        ? '当前 Z.ai，已自动隐藏；切回 DeepSeek V4 恢复'
        : settingsProviderMode.kind === 'third'
          ? '当前第三方模型，已自动隐藏；切回 DeepSeek V4 恢复'
          : settingsProviderMode.kind === 'deepseek'
            ? '当前模型不适用；仅 DeepSeek V4 显示'
            : '仅当前模型为 DeepSeek V4 时显示'

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

  // —— 健康检查 ——
  var hostHealth = health && health.host ? health.host : null
  var hostCompatibility = hostHealth && hostHealth.compatibility ? hostHealth.compatibility : null
  var pricing = health && health.pricing ? health.pricing : null
  var accountStorage = health && health.accounts ? health.accounts : null
  var usageStorage = health && health.usage ? health.usage : null
  var usageLocked = !!((snapshot && snapshot.usageStorage && snapshot.usageStorage.locked) || (usageStorage && usageStorage.locked))
  var compatibilityText = hostCompatibility
    ? (hostCompatibility.status === 'compatible' ? '兼容' : hostCompatibility.status === 'upgrade-recommended' ? '建议升级' : '待检测')
    : '检测中'
  var pricingText = pricing
    ? (pricing.status === 'synced'
      ? '已同步'
      : pricing.status === 'review-required'
        ? '待复核'
        : pricing.status === 'offline'
          ? (String(pricing.ruleVersion || '').indexOf('official-') === 0 ? '离线，沿用已验证规则' : '离线，使用内置规则')
          : '内置规则')
    : '检测中'
  var storageText = accountStorage
    ? (accountStorage.status === 'locked'
      ? '无法解密（已锁定写入）'
      : accountStorage.status === 'recovered'
        ? '已从加密备份恢复'
        : accountStorage.status === 'error'
          ? '加密存储异常'
          : accountStorage.scheme === 'windows-dpapi' ? 'Windows DPAPI 加密' : 'AES-GCM 加密')
    : '检测中'
  var usageStorageText = usageStorage
    ? (usageStorage.status === 'locked'
      ? '损坏，已锁定写入'
      : usageStorage.status === 'recovered'
        ? '已从备份恢复'
        : usageStorage.status === 'error'
          ? '写入失败，请检查磁盘权限'
          : usageStorage.backup ? '正常（含备份）' : '正常')
    : '检测中'
  rows.push(React.createElement('div', { key: 'health', className: 'dshw_setCard', style: { display: 'block' } },
    React.createElement('div', { className: 'dshw_settingsGroupHeader' },
      React.createElement('div', { className: 'dshw_settingsGroupTitle' }, 'Harness 健康检查'),
      React.createElement('div', { className: 'dshw_settingsGroupHint' }, healthNotice || '不包含 API Key 或本地路径')),
    React.createElement('div', { className: 'dshw_settingsHeroMeta' },
      React.createElement('span', null, 'Harness v' + (hostHealth && hostHealth.version ? hostHealth.version : '未识别')),
      React.createElement('span', { className: 'dshw_balDot' }, '·'),
      React.createElement('span', null, '插件 v' + WALLET_VERSION),
      React.createElement('span', { className: 'dshw_balDot' }, '·'),
      React.createElement('span', null, '兼容：' + compatibilityText)),
    React.createElement('div', { className: 'dshw_settingsHeroMeta' },
      React.createElement('span', null, '价格规则：' + pricingText),
      React.createElement('span', { className: 'dshw_balDot' }, '·'),
      React.createElement('span', null, '账户存储：' + storageText),
      React.createElement('span', { className: 'dshw_balDot' }, '·'),
      React.createElement('span', null, '用量账本：' + usageStorageText)),
    React.createElement('div', { className: 'dshw_settingsFooterActions', style: { marginTop: '8px' } },
      React.createElement('button', { type: 'button', className: 'dshw_btn', onClick: refreshHealth }, '重新检测'),
      React.createElement('button', { type: 'button', className: 'dshw_btn', onClick: refreshPricing }, '同步官方价格'),
      React.createElement('button', { type: 'button', className: 'dshw_btn', disabled: !health, onClick: copyDiagnostics }, '复制诊断信息'))))

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
  cells.push(React.createElement('div', { key: 'chip-style', className: 'dshw_setCell' },
    React.createElement('span', { className: 'dshw_settingsFieldLabel' },
      React.createElement('strong', null, '输入框标签'),
      React.createElement('span', null, chipStyle === 'hidden' ? '已隐藏；提醒与设置仍运行' : '显示在输入框工具栏中')),
    React.createElement('span', { className: 'dshw_balFill' }),
    React.createElement('label', { className: 'dshw_switch', title: '关闭只隐藏输入框标签，不停止提醒、设置、套餐或账本' },
      React.createElement('input', {
        type: 'checkbox',
        checked: chipStyle !== 'hidden',
        'aria-label': '显示输入框标签',
        onChange: function (event) { persistChipStyle(event.target.checked ? 'standard' : 'hidden') }
      }),
      React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
      React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' }))))
  cells.push(React.createElement('div', { key: 'balance-only', className: 'dshw_setCell' },
    React.createElement('span', { className: 'dshw_settingsFieldLabel' },
      React.createElement('strong', null, '仅显示余额'),
      React.createElement('span', null, '隐藏本场、Token 与充值；Z.ai 仅保留 5h 剩余')),
    React.createElement('span', { className: 'dshw_balFill' }),
    React.createElement('label', { className: 'dshw_switch', title: '精简输入框标签为当前 Provider 的首要剩余额度' },
      React.createElement('input', {
        type: 'checkbox',
        checked: balanceOnly,
        disabled: chipStyle === 'hidden',
        'aria-label': '输入框标签仅显示余额',
        onChange: function (event) { persistBalanceOnly(event.target.checked) }
      }),
      React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
      React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' }))))
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
          React.createElement('span', null, thresholdNotice || (usageLocked ? '用量账本已锁定，无法保存' : currencyCode + ' · 输入后自动保存'))),
        React.createElement('span', { className: 'dshw_settingsInline' },
          React.createElement('span', { style: { fontWeight: 700, color: 'var(--dsw-alias-label-primary,inherit)' } }, currencyCode === 'USD' ? '$' : '¥'),
          React.createElement('input', {
            className: 'dshw_input', type: 'number', min: '0', step: '0.01',
            style: { width: '64px' },
            value: thresholdDraft,
            disabled: usageLocked,
            title: usageLocked ? '用量账本存储已锁定，无法保存阈值' : '低于此余额时提醒；0 表示关闭',
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
          React.createElement('span', null, peakClockHint)),
        React.createElement('label', { className: 'dshw_switch', title: peakClockHint },
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
          React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' }))),
      React.createElement('div', { className: 'dshw_settingChoice' },
        React.createElement('span', { className: 'dshw_settingChoiceCopy' },
          React.createElement('strong', null, '时钟布局'),
          React.createElement('span', null, '横向或纵向排布')),
        React.createElement('select', {
          className: 'dshw_select',
          'aria-label': '峰谷时钟布局',
          value: peakOrient,
          onChange: function (event) { persistPeakOrient(event.target.value) }
        },
          React.createElement('option', { value: 'horizontal' }, '横向排列'),
          React.createElement('option', { value: 'vertical' }, '纵向排列'))),
      React.createElement('div', { className: 'dshw_settingChoice' },
        React.createElement('span', { className: 'dshw_settingChoiceCopy' },
          React.createElement('strong', null, '时钟背景'),
          React.createElement('span', null, peakBackground === 'solid' ? '侧边栏常态保持实色' : '侧边栏透明，悬停实色；悬浮保持实色')),
        React.createElement('select', {
          className: 'dshw_select',
          'aria-label': '峰谷时钟背景',
          value: peakBackground,
          onChange: function (event) { persistPeakBackground(event.target.value) }
        },
          React.createElement('option', { value: 'transparent' }, '透明（悬停实色）'),
          React.createElement('option', { value: 'solid' }, '实色'))),
      React.createElement('div', { className: 'dshw_settingChoice' },
        React.createElement('span', { className: 'dshw_settingChoiceCopy' },
          React.createElement('strong', null, '时钟大小'),
          React.createElement('span', null, '100% ~ 120% 缩放')),
        React.createElement('span', { className: 'dshw_scaleControl' },
          React.createElement('input', {
            className: 'dshw_scaleInput', type: 'range', min: '100', max: '120', step: '5',
            value: String(Math.round(peakScale * 100)),
            'aria-label': '峰谷时钟卡片比例',
            onInput: function (event) { persistPeakScale(Number.parseFloat(event.target.value) / 100) },
            onChange: function (event) { persistPeakScale(Number.parseFloat(event.target.value) / 100) }
          }),
          React.createElement('span', { className: 'dshw_scaleValue' }, Math.round(peakScale * 100) + '%'))),
      React.createElement('div', { className: 'dshw_settingChoice' },
        React.createElement('span', { className: 'dshw_settingChoiceCopy' },
          React.createElement('strong', null, '时钟充值按钮'),
          React.createElement('span', null, '关闭可缩小卡片')),
        React.createElement('label', { className: 'dshw_switch', title: '关闭充值按钮可进一步收缩时钟卡片' },
          React.createElement('input', {
            type: 'checkbox', checked: peakRecharge,
            'aria-label': '显示时钟充值按钮',
            onChange: function (event) { persistPeakRecharge(event.target.checked) }
          }),
          React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
          React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' }))),
      React.createElement('div', { className: 'dshw_settingChoice' },
        React.createElement('span', { className: 'dshw_settingChoiceCopy' },
          React.createElement('strong', null, '时钟位置'),
          React.createElement('span', null, peakDock === 'free' ? '自由浮动中' : '侧边栏底部（可拖动）')),
        peakDock === 'free' ? React.createElement('button', {
          type: 'button', className: 'dshw_btn',
          title: '点击归位至侧边栏底部',
          onClick: function () { resetPeakDock() }
        }, '↩ 归位') : React.createElement('span', { className: 'dshw_muted', style: { fontSize: '11px' } }, '固定'))))
  )
  rows.push(React.createElement('div', { key: 'setcard', className: 'dshw_setCard' }, cells))

  // —— Provider 分桶（Issue #21：包装官方的路由勾选计入官方计费） ——
  var knownProviders = snapshot && snapshot.providers && Array.isArray(snapshot.providers.known) ? snapshot.providers.known.filter(function (provider) { return !isPlanProviderId(provider) }) : []
  var officialProviders = snapshot && snapshot.providers && Array.isArray(snapshot.providers.official) ? snapshot.providers.official.filter(function (provider) { return !isPlanProviderId(provider) }) : []
  if (knownProviders.length > 0 || officialProviders.length > 0) {
    rows.push(React.createElement('div', { key: 'pr-t', className: 'dshw_title', style: { marginTop: '8px' } }, 'Provider \u5206\u6876'))
    rows.push(React.createElement('div', { key: 'pr-h', className: 'dshw_muted' }, '仅影响勾选后的后续调用；已记录的历史用量不重新计价'))
    var providerRows = officialProviders.map(function (p) {
      return React.createElement('div', { key: 'op-' + p, className: 'dshw_setCell' },
        React.createElement('label', { className: 'dshw_check', style: { margin: 0 } },
          React.createElement('input', {
            type: 'checkbox', checked: true, disabled: usageLocked,
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
            type: 'checkbox', checked: false, disabled: usageLocked,
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

  // —— 第三方 API 自定义价格（Issue #36） ——
  rows.push(React.createElement('div', { key: 'cp-head', className: 'dshw_accountHeader', style: { marginTop: '8px' } },
    React.createElement('span', null,
      React.createElement('span', { className: 'dshw_title' }, '第三方 API 自定义价格'),
      React.createElement('span', { className: 'dshw_muted', style: { display: 'block', marginTop: '2px', fontSize: '10px' } }, '每 100 万 Token；仅作本机估算，不代表第三方账单')),
    React.createElement('button', {
      type: 'button', className: 'dshw_btn',
      disabled: settingsProviderMode.kind !== 'third',
      title: settingsProviderMode.kind === 'third' ? '填入当前会话选择的 Provider 与模型' : '请先切换到第三方模型',
      onClick: useCurrentRouteForPrice
    }, '使用当前模型')))
  var providerOptions = Array.from(new Set(knownPriceRoutes.map(function (route) { return route && route.provider }).filter(Boolean)))
  var modelOptions = Array.from(new Set(knownPriceRoutes.filter(function (route) {
    return route && (!priceDraft.provider || route.provider === priceDraft.provider)
  }).map(function (route) { return route.model }).filter(Boolean)))
  function updatePriceDraft(key, value) {
    setPriceDraft(function (current) { var next = Object.assign({}, current); next[key] = key === 'currency' ? String(value).toUpperCase().slice(0, 3) : value; return next })
  }
  function priceField(key, label, type, options) {
    return React.createElement('label', { key: key, className: 'dshw_priceField' },
      React.createElement('span', null, label),
      type === 'select'
        ? React.createElement('select', { className: 'dshw_select', value: priceDraft[key], 'aria-label': label, onChange: function (event) { updatePriceDraft(key, event.target.value) } },
            options.map(function (option) { return React.createElement('option', { key: option, value: option }, option) }))
        : React.createElement('input', {
            className: 'dshw_input', type: type, min: type === 'number' ? '0' : undefined,
            max: type === 'number' ? '1000000' : undefined, step: type === 'number' ? '0.000001' : undefined,
            list: key === 'provider' ? 'dshw-price-providers' : key === 'model' ? 'dshw-price-models' : undefined,
            value: priceDraft[key], 'aria-label': label,
            onChange: function (event) { updatePriceDraft(key, event.target.value) }
          }))
  }
  var priceForm = React.createElement('div', { className: 'dshw_priceForm' },
    priceField('provider', 'Provider ID', 'text'),
    priceField('model', '模型 ID', 'text'),
    priceField('currency', '币种', 'text'),
    priceField('input', '输入', 'number'),
    priceField('cacheRead', '缓存读', 'number'),
    priceField('cacheWrite', '缓存写', 'number'),
    priceField('output', '输出', 'number'),
    React.createElement('button', { type: 'button', className: 'dshw_btn dshw_btnPrimary', disabled: usageLocked, onClick: saveCustomPrice }, '保存'),
    React.createElement('datalist', { id: 'dshw-price-providers' }, providerOptions.map(function (provider) { return React.createElement('option', { key: provider, value: provider }) })),
    React.createElement('datalist', { id: 'dshw-price-models' }, modelOptions.map(function (model) { return React.createElement('option', { key: model, value: model }) })))
  function customWindowField(window, index, key, label, type) {
    return React.createElement('label', { key: key, className: 'dshw_priceField' },
      React.createElement('span', null, label),
      React.createElement('input', {
        className: 'dshw_input',
        type: type,
        min: type === 'number' ? '0' : undefined,
        max: type === 'number' ? '1000000' : undefined,
        step: type === 'number' ? '0.000001' : undefined,
        value: window[key],
        'aria-label': '分时段 ' + (index + 1) + ' ' + label,
        onChange: function (event) { updateCustomPriceWindow(index, key, event.target.value) }
      }))
  }
  var draftPriceWindows = Array.isArray(priceDraft.windows) ? priceDraft.windows : []
  var priceWindowRows = draftPriceWindows.map(function (window, index) {
    return React.createElement('div', { key: index, className: 'dshw_priceWindow' },
      React.createElement('div', { className: 'dshw_priceWindowHead' },
        customWindowField(window, index, 'label', '时段名称', 'text'),
        React.createElement('button', { type: 'button', className: 'dshw_btn', disabled: usageLocked, 'aria-label': '删除分时段 ' + (index + 1), onClick: function () { removeCustomPriceWindow(index) } }, '删除时段')),
      React.createElement('div', { className: 'dshw_priceDays', role: 'group', 'aria-label': '分时段 ' + (index + 1) + ' 适用星期' },
        React.createElement('span', null, '星期'),
        CUSTOM_PRICE_WEEKDAYS.map(function (day) {
          var selected = Array.isArray(window.days) && window.days.includes(day.value)
          return React.createElement('button', {
            key: day.value,
            type: 'button',
            className: 'dshw_priceDay',
            'aria-label': '星期' + day.label,
            'aria-pressed': selected,
            onClick: function () { toggleCustomPriceDay(index, day.value) }
          }, day.label)
        })),
      React.createElement('div', { className: 'dshw_priceWindowRates' },
        customWindowField(window, index, 'start', '开始', 'time'),
        customWindowField(window, index, 'end', '结束', 'time'),
        customWindowField(window, index, 'input', '输入', 'number'),
        customWindowField(window, index, 'cacheRead', '缓存读', 'number'),
        customWindowField(window, index, 'cacheWrite', '缓存写', 'number'),
        customWindowField(window, index, 'output', '输出', 'number')))
  })
  var priceWindowEditor = React.createElement('div', { className: 'dshw_priceWindowEditor' },
    React.createElement('div', { className: 'dshw_priceWindowToolbar' },
      React.createElement('label', { className: 'dshw_priceField' },
        React.createElement('span', null, '计价时区（IANA）'),
        React.createElement('input', {
          className: 'dshw_input', type: 'text', list: 'dshw-price-timezones', value: priceDraft.timezone,
          'aria-label': '第三方计价时区', onChange: function (event) { updatePriceDraft('timezone', event.target.value) }
        }),
        React.createElement('datalist', { id: 'dshw-price-timezones' }, ['Asia/Shanghai', 'UTC', 'America/New_York', 'Europe/London'].map(function (timezone) {
          return React.createElement('option', { key: timezone, value: timezone }, timezone)
        }))),
      React.createElement('button', { type: 'button', className: 'dshw_btn', disabled: usageLocked || draftPriceWindows.length >= 24, onClick: addCustomPriceWindow }, '+ 添加分时段')),
    priceWindowRows.length > 0
      ? React.createElement('div', { className: 'dshw_priceWindowList' }, priceWindowRows)
      : React.createElement('div', { className: 'dshw_muted' }, '未添加分时段时始终使用上方基础价格。'),
    React.createElement('div', { className: 'dshw_muted' }, '分时段可跨午夜；同一规则的时段不能重叠。'))
  var priceRuleRows = priceRules.map(function (rule) {
    var windows = Array.isArray(rule.windows) ? rule.windows : []
    var active = rule.active && windows.length > 0 ? rule.active : null
    return React.createElement('div', { key: rule.provider + ':' + rule.model, className: 'dshw_priceRule' },
      React.createElement('span', null,
        React.createElement('strong', { title: rule.provider + ' · ' + rule.model }, rule.provider + ' · ' + rule.model),
        React.createElement('span', null, rule.currency + '/1M · 基础：入 ' + rule.input + ' · 缓读 ' + rule.cacheRead + ' · 缓写 ' + rule.cacheWrite + ' · 出 ' + rule.output),
        windows.length > 0 ? React.createElement('span', null, '分时 ' + windows.length + ' 段 · ' + (rule.timezone || 'Asia/Shanghai') + ' · 当前：' + (active ? active.label : '基础价')) : null),
      React.createElement('span', { className: 'dshw_settingsInline' },
        React.createElement('button', { type: 'button', className: 'dshw_btn', onClick: function () { editCustomPrice(rule) } }, '编辑'),
        React.createElement('button', { type: 'button', className: 'dshw_btn', disabled: usageLocked, onClick: function () { removeCustomPrice(rule) } }, '删除')))
  })
  rows.push(React.createElement('div', { key: 'cp-card', className: 'dshw_setCard wide', style: { display: 'block' } },
    priceForm,
    priceWindowEditor,
    priceNotice ? React.createElement('div', { className: 'dshw_muted', role: 'status', style: { padding: '0 12px 8px' } }, priceNotice) : null,
    priceRuleRows.length > 0
      ? React.createElement('div', { className: 'dshw_priceRules' }, priceRuleRows)
      : React.createElement('div', { className: 'dshw_muted', style: { padding: '0 12px 11px' } }, '暂无规则；填写后即可看到第三方费用估算')))

  rows.push(React.createElement(PlanUsagePanel, { key: 'plans', compact: false }))
  rows.push(React.createElement(UsageHistoryPanel, { key: 'history', sessionId: null, alwaysOpen: true }))

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

  // Account switching and usage history are the primary account-center
  // tasks, so keep both directly under the balance overview. Health and
  // appearance/reminder preferences follow below them.
  function rowKey(row) {
    if (!row) return ''
    if (row.key !== null && row.key !== undefined) return String(row.key)
    return row.props && row.props.key !== undefined ? String(row.props.key) : ''
  }
  var accountRows = rows.filter(function (row) { return rowKey(row).indexOf('acc-') === 0 })
  var planRows = rows.filter(function (row) { return rowKey(row) === 'plans' })
  var historyRows = rows.filter(function (row) { return rowKey(row) === 'history' })
  rows = rows.filter(function (row) {
    var key = rowKey(row)
    return key !== 'plans' && key !== 'history' && key.indexOf('acc-') !== 0
  })
  var balanceRowIndex = rows.findIndex(function (row) { return rowKey(row) === 'balcard' })
  rows.splice.apply(rows, [balanceRowIndex + 1, 0].concat(accountRows, planRows, historyRows))

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
      onClick: function () { if (close) close(); openOfficialRecharge() }
    }, '↗ 去官方充值'))))
  return React.createElement('div', { ref: settingsSectionRef, className: 'dshw_settingsSection', style: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--dsw-alias-label-primary,inherit)' } }, rows)
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
  var weekendOffPeak = policy && policy.weekendOffPeak === true
  if (weekendOffPeak) {
    var offsetMinutes = policy && Number.isFinite(policy.offsetMinutes) ? policy.offsetMinutes : 480
    var beijingNow = Number.isFinite(nowMs) ? new Date(nowMs + offsetMinutes * 60000) : null
    var day = beijingNow && Number.isFinite(beijingNow.getTime()) ? beijingNow.getUTCDay() : 6
    // Friday after 18:00, Saturday, Sunday and Monday before 09:00 are
    // one continuous off-peak period. Anchor it to Friday so unchanged
    // pricing does not emit duplicate notifications at each midnight.
    var weekendAnchor = beijingNow && Number.isFinite(beijingNow.getTime())
      ? new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate() - (day === 6 ? 1 : 2)))
      : null
    var weekendDateKey = weekendAnchor
      ? [weekendAnchor.getUTCFullYear(), String(weekendAnchor.getUTCMonth() + 1).padStart(2, '0'), String(weekendAnchor.getUTCDate()).padStart(2, '0')].join('-')
      : 'weekend'
    var weekendTzName = policy.timezone || 'Asia/Shanghai'
    var weekendDayLabel = day === 6 ? '周六' : '周日'
    return {
      configured: true, windows: [], weekendOffPeak: true, inPeak: false,
      nextHour: 9,
      ariaText: '当前为' + weekendDayLabel + '低谷时段，全天按半价计费，周一 09:00 恢复标准价',
      tip: '峰谷时钟 · 当前' + weekendDayLabel + '低谷 · ' + weekendDayLabel + '全天半价 · 周一 09:00 恢复工作日规则 · ' + weekendTzName,
      periodName: '周末低谷', rateBadge: '半价',
      countdownSummary: weekendDayLabel + '全天低谷',
      windowSummary: weekendDayLabel + '全天低谷 · 工作日高峰 09:00–12:00 / 14:00–18:00',
      periodId: 'weekend-chain-' + weekendDateKey,
      switchBody: '已进入周末低谷，全天按半价计费',
    }
  }
  if (windows.length === 0) {
    return { configured: false, windows: [], weekendOffPeak: false, ariaText: '峰谷计费时段未配置', tip: '峰谷时钟 · 计费时段未配置', periodId: null }
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
  var offsetMinutesForDay = policy && Number.isFinite(policy.offsetMinutes) ? policy.offsetMinutes : 480
  var localWallDate = Number.isFinite(nowMs) ? new Date(nowMs + offsetMinutesForDay * 60000) : null
  var localDay = localWallDate ? localWallDate.getUTCDay() : -1
  var weekendRuleSince = policy && Number.isFinite(policy.weekendOffPeakSince) ? policy.weekendOffPeakSince : -Infinity
  var nextLocalMidnightMs = localWallDate
    ? Date.UTC(localWallDate.getUTCFullYear(), localWallDate.getUTCMonth(), localWallDate.getUTCDate() + 1) - offsetMinutesForDay * 60000
    : Infinity
  var currentLocalMidnightMs = localWallDate
    ? Date.UTC(localWallDate.getUTCFullYear(), localWallDate.getUTCMonth(), localWallDate.getUTCDate()) - offsetMinutesForDay * 60000
    : Infinity
  var fridayAfterLastPeak = !inPeak && localDay === 5 && nowHour >= windows[windows.length - 1].endHour && nextLocalMidnightMs >= weekendRuleSince
  var mondayBeforeFirstPeak = !inPeak && localDay === 1 && nowHour < windows[0].startHour && currentLocalMidnightMs >= weekendRuleSince
  var countdownSummary = fridayAfterLastPeak
    ? '周末全天低谷'
    : mondayBeforeFirstPeak ? ('剩 ' + leftShort + ' 进入高峰') : (hh(nextHour) + ' 切换 · 剩 ' + leftShort)
  var windowSummary = fridayAfterLastPeak
    ? '周五 18:00 起低谷 · 周六/周日全天低谷'
    : '高峰 ' + winText
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
  var tip = fridayAfterLastPeak
    ? '峰谷时钟 · 当前低谷半价 · 下次高峰：周一 09:00 · ' + tzName + localNote
    : '峰谷时钟 · 当前' + period + ' · ' + switchText + ' · 还有 ' + leftText
      + ' · 高峰 ' + winText + '（' + tzName + '）' + localNote
  var periodId = (inPeak ? 'p' : 'o') + Math.round(segStart * 100)
  if ((fridayAfterLastPeak || mondayBeforeFirstPeak) && localWallDate) {
    var chainAnchorDays = mondayBeforeFirstPeak ? 3 : 0
    var chainAnchor = new Date(Date.UTC(localWallDate.getUTCFullYear(), localWallDate.getUTCMonth(), localWallDate.getUTCDate() - chainAnchorDays))
    var chainKey = [chainAnchor.getUTCFullYear(), String(chainAnchor.getUTCMonth() + 1).padStart(2, '0'), String(chainAnchor.getUTCDate()).padStart(2, '0')].join('-')
    periodId = 'weekend-chain-' + chainKey
  }
  return {
    configured: true, windows: windows, weekendOffPeak: false, inPeak: inPeak,
    nextHour: nextHour, ariaText: ariaText, tip: tip,
    periodName: periodName, rateBadge: rateBadge,
    countdownSummary: countdownSummary, windowSummary: windowSummary,
    // Reminder dedup id: entering this period at this boundary fires once.
    periodId: periodId,
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
  var modelAware = props.modelAware === true
  var modelSelection = useCurrentModelSelection(props.sessionsService, props.modelDirectories, modelAware)
  var [shown, setShown] = React.useState(function () {
    try { return compatibility.storage.getItem(PEAK_RING_KEY) !== 'false' } catch (e) { return true }
  })
  var [orient, setOrient] = React.useState(function () {
    try { return compatibility.storage.getItem(PEAK_ORIENT_KEY) || 'horizontal' } catch (e) { return 'horizontal' }
  })
  var [peakBackground, setPeakBackground] = React.useState(function () {
    try { return normalizePeakBackground(compatibility.storage.getItem(PEAK_BACKGROUND_KEY)) } catch (e) { return 'transparent' }
  })
  var [showRecharge, setShowRecharge] = React.useState(function () {
    try { return compatibility.storage.getItem(PEAK_RECHARGE_KEY) !== 'false' } catch (e) { return true }
  })
  var [peakScale, setPeakScale] = React.useState(function () {
    try {
      var val = Number.parseFloat(compatibility.storage.getItem(PEAK_SCALE_KEY))
      return Number.isFinite(val) ? Math.min(1.2, Math.max(1.0, val)) : 1.0
    } catch (e) { return 1.0 }
  })
  var [dock, setDock] = React.useState(function () {
    try { return compatibility.storage.getItem(PEAK_DOCK_KEY) || 'sidebar' } catch (e) { return 'sidebar' }
  })
  var [pos, setPos] = React.useState(function () {
    try {
      var raw = compatibility.storage.getItem(PEAK_POS_KEY)
      if (raw) {
        var parsed = JSON.parse(raw)
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed
      }
      return null
    } catch (e) { return null }
  })
  var latestPosRef = React.useRef(pos)
  latestPosRef.current = pos
  var [dragging, setDragging] = React.useState(false)
  var [narrowCard, setNarrowCard] = React.useState(false)
  var [snapshot, setSnapshot] = React.useState(undefined) // undefined = loading
  var [nowMs, setNowMs] = React.useState(function () { return Date.now() })
  var dragRef = React.useRef(null)
  var didDragRef = React.useRef(false)
  // Guards the self-echo: every preference write dispatches the shared
  // change events so OTHER surfaces resync, but this component must not
  // re-read storage from its own dispatch — the listener would setState a
  // second time from a different call stack and race the update already
  // queued, which can drop the write that started it.
  var suppressSelfSyncRef = React.useRef(false)
  var [panelOpen, setPanelOpen] = React.useState(false)
  var [panelPos, setPanelPos] = React.useState({ left: 16, top: 16 })
  var cardNodeRef = React.useRef(null)
  var panelNodeRef = React.useRef(null)

  var [peakNotify, setPeakNotify] = React.useState(function () {
    try { return compatibility.storage.getItem(PEAK_NOTIFY_KEY) === 'true' } catch (e) { return false }
  })

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
      // Skip our own echo (see suppressSelfSyncRef).
      if (suppressSelfSyncRef.current) return
      try {
        setShown(compatibility.storage.getItem(PEAK_RING_KEY) !== 'false')
        setOrient(compatibility.storage.getItem(PEAK_ORIENT_KEY) || 'horizontal')
        setPeakBackground(normalizePeakBackground(compatibility.storage.getItem(PEAK_BACKGROUND_KEY)))
        setShowRecharge(compatibility.storage.getItem(PEAK_RECHARGE_KEY) !== 'false')
        var val = Number.parseFloat(compatibility.storage.getItem(PEAK_SCALE_KEY))
        setPeakScale(Number.isFinite(val) ? Math.min(1.2, Math.max(1.0, val)) : 1.0)
        var currentDock = compatibility.storage.getItem(PEAK_DOCK_KEY) || 'sidebar'
        setDock(currentDock)
        setPeakNotify(compatibility.storage.getItem(PEAK_NOTIFY_KEY) === 'true')
        var raw = compatibility.storage.getItem(PEAK_POS_KEY)
        if (raw) {
          try {
            var parsed = JSON.parse(raw)
            if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
              setPos(parsed)
              latestPosRef.current = parsed
            }
          } catch (e) { /* ignore */ }
        } else if (currentDock === 'sidebar') {
          setPos(null)
          latestPosRef.current = null
        }
      } catch (e) { /* ignore */ }
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

  React.useEffect(function () {
    if (!panelOpen) return
    function updatePosition() {
      var cardEl = cardNodeRef.current
      var panelEl = panelNodeRef.current
      if (!cardEl || !panelEl) return
      var cRect = cardEl.getBoundingClientRect()
      var pRect = panelEl.getBoundingClientRect()
      var winW = window.innerWidth || 1024
      var winH = window.innerHeight || 768
      var targetLeft = 16
      var targetTop = 16

      if (dock === 'sidebar') {
        targetLeft = Math.min(winW - pRect.width - 12, cRect.right + 12)
        targetTop = Math.max(12, Math.min(winH - pRect.height - 12, cRect.bottom - pRect.height))
      } else {
        targetLeft = Math.max(12, Math.min(winW - pRect.width - 12, cRect.left))
        if (cRect.bottom + pRect.height + 12 <= winH) {
          targetTop = cRect.bottom + 8
        } else {
          targetTop = Math.max(12, cRect.top - pRect.height - 8)
        }
      }
      setPanelPos({ left: Math.round(targetLeft), top: Math.round(targetTop) })
    }
    updatePosition()
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', updatePosition)
      return function () {
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [panelOpen, dock, pos, peakScale, orient])

  React.useEffect(function () {
    if (!panelOpen) return
    function onDocDown(event) {
      var target = event.target
      if (panelNodeRef.current && panelNodeRef.current.contains(target)) return
      if (cardNodeRef.current && cardNodeRef.current.contains(target)) return
      setPanelOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setPanelOpen(false)
    }
    document.addEventListener('pointerdown', onDocDown)
    document.addEventListener('keydown', onKeyDown)
    return function () {
      document.removeEventListener('pointerdown', onDocDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [panelOpen])

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

  var isFreeFloating = dock === 'free'
  var isVertical = orient === 'vertical' && (wide || isFreeFloating)
  var isRail = !wide && !isFreeFloating

  // Some skins reserve more inner sidebar padding and enlarge typography.
  // Detect actual text overflow instead of keying behavior to a skin name
  // or a fixed card width. Measurement is read-only: mutating the observed
  // card inside ResizeObserver can create a skin/layout feedback loop while
  // the host is switching model menus.
  useLayoutEffect(function () {
    var node = cardNodeRef.current
    if (isRail || isVertical || !node || typeof node.getBoundingClientRect !== 'function') {
      setNarrowCard(false)
      return
    }
    var measureCanvas = typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('canvas')
      : null
    var measureContext = measureCanvas && typeof measureCanvas.getContext === 'function' ? measureCanvas.getContext('2d') : null
    function textWidth(element) {
      if (!element) return 0
      if (!measureContext || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return element.scrollWidth || 0
      var style = window.getComputedStyle(element)
      measureContext.font = style.font || (style.fontSize + ' ' + style.fontFamily)
      var text = element.textContent || ''
      var width = measureContext.measureText(text).width
      var spacing = Number.parseFloat(style.letterSpacing)
      if (Number.isFinite(spacing) && text.length > 1) width += spacing * (text.length - 1)
      return width
    }
    function measure() {
      var money = node.querySelector && node.querySelector('.dshw_footRingMoney')
      var countdown = node.querySelector && node.querySelector('.dshw_footRingCountdown')
      var bottom = node.querySelector && node.querySelector('.dshw_footRingBottom')
      var recharge = node.querySelector && node.querySelector('.dshw_footRingBtnRechargeInline')
      var groups = money && money.querySelectorAll ? [...money.querySelectorAll('.dshw_footRingMoneyGroup')] : []
      var requiredMoney = groups.reduce(function (total, group) { return total + group.getBoundingClientRect().width }, 0)
        + (groups.length > 1 ? 10 : 0)
      var countdownRoom = bottom ? bottom.clientWidth - (recharge ? recharge.getBoundingClientRect().width + 6 : 0) : 0
      var overflowed = !!((money && requiredMoney > money.clientWidth + 1)
        || (countdown && textWidth(countdown) > countdownRoom + 1))
      setNarrowCard(overflowed)
    }
    measure()
    if (typeof ResizeObserver === 'function') {
      var observer = new ResizeObserver(measure)
      observer.observe(node)
      return function () { observer.disconnect() }
    }
    window.addEventListener('resize', measure)
    return function () { window.removeEventListener('resize', measure) }
  }, [snapshot, isRail, isVertical, isFreeFloating, peakScale, showRecharge, modelSelection && modelSelection.provider, modelSelection && modelSelection.model])

  // A saved floating coordinate is not trustworthy after a window resize
  // or scale change. Re-measure the rendered card (including transform)
  // and persist the corrected coordinate before it can disappear outside
  // the viewport. This hook must run even while the card is still loading,
  // otherwise React sees a changing hook count when the snapshot arrives.
  useLayoutEffect(function () {
    if (!isFreeFloating || !cardNodeRef.current) return
    var node = cardNodeRef.current
    function fitFloatingPeakCard() {
      if (!node || typeof node.getBoundingClientRect !== 'function') return
      var rect = node.getBoundingClientRect()
      var current = latestPosRef.current || pos || { x: rect.left, y: rect.top }
      var fitted = clampPeakPosition(current, rect.width, rect.height, window.innerWidth, window.innerHeight, 8)
      if (fitted.x === current.x && fitted.y === current.y && pos !== null) return
      latestPosRef.current = fitted
      setPos(fitted)
      try { compatibility.storage.setItem(PEAK_POS_KEY, JSON.stringify(fitted)) } catch (e) { /* ignore */ }
    }
    fitFloatingPeakCard()
    window.addEventListener('resize', fitFloatingPeakCard)
    return function () { window.removeEventListener('resize', fitFloatingPeakCard) }
  }, [isFreeFloating, pos, peakScale, orient, showRecharge])

  if (!shown || snapshot === undefined) return null
  var providerMode = providerModeFor(modelSelection, snapshot, modelAware)
  if (providerMode.kind !== 'deepseek') return null
  if (modelAware && !/^deepseek-v4-/.test(providerMode.model || '')) return null
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

  // Announce a preference change to the other surfaces (settings page, a
  // second window) while suppressing our own listener, so this component's
  // queued setState is the single writer for this interaction.
  function announcePrefs(includeRingEvent) {
    suppressSelfSyncRef.current = true
    try {
      try { compatibility.dispatch(SETTINGS_EVENT) } catch (e) { /* ignore */ }
      if (includeRingEvent !== false) {
        try { compatibility.dispatch(PEAK_RING_EVENT) } catch (e) { /* ignore */ }
      }
    } finally {
      suppressSelfSyncRef.current = false
    }
  }

  function updateOrient(val) {
    setOrient(val)
    try { compatibility.storage.setItem(PEAK_ORIENT_KEY, val) } catch (e) { /* ignore */ }
    announcePrefs()
  }
  function updateBackground(val) {
    val = normalizePeakBackground(val)
    setPeakBackground(val)
    try { compatibility.storage.setItem(PEAK_BACKGROUND_KEY, val) } catch (e) { /* ignore */ }
    announcePrefs()
  }
  function updateScale(val) {
    val = Math.min(1.2, Math.max(1.0, Math.round(val * 20) / 20))
    setPeakScale(val)
    try { compatibility.storage.setItem(PEAK_SCALE_KEY, String(val)) } catch (e) { /* ignore */ }
    announcePrefs()
  }
  function updateRecharge(val) {
    setShowRecharge(val)
    try { compatibility.storage.setItem(PEAK_RECHARGE_KEY, String(val)) } catch (e) { /* ignore */ }
    announcePrefs()
  }
  function updateNotify(val) {
    setPeakNotify(val)
    try { compatibility.storage.setItem(PEAK_NOTIFY_KEY, String(val)) } catch (e) { /* ignore */ }
    announcePrefs(false)
  }

  function handlePointerDown(e) {
    if (isRail) return
    var targetEl = e.target && e.target.nodeType === 3 ? e.target.parentElement : e.target
    if (targetEl && typeof targetEl.closest === 'function' && (targetEl.closest('button') || targetEl.closest('a') || targetEl.closest('input') || targetEl.closest('select'))) return
    if (e.button !== undefined && e.button !== 0) return
    var targetNode = e.currentTarget
    var rect = targetNode.getBoundingClientRect()
    var curX = (isFreeFloating && pos && typeof pos.x === 'number') ? pos.x : rect.left
    var curY = (isFreeFloating && pos && typeof pos.y === 'number') ? pos.y : rect.top
    var grabOffsetX = e.clientX - curX
    var grabOffsetY = e.clientY - curY
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      grabOffsetX: grabOffsetX,
      grabOffsetY: grabOffsetY,
      rectWidth: rect.width,
      rectHeight: rect.height,
      dragged: false,
      pointerId: e.pointerId
    }
    didDragRef.current = false
    latestPosRef.current = { x: curX, y: curY }

    function onMove(moveEvent) {
      if (!dragRef.current) return
      var dx = moveEvent.clientX - dragRef.current.startX
      var dy = moveEvent.clientY - dragRef.current.startY
      if (!dragRef.current.dragged && Math.hypot(dx, dy) > 3) {
        dragRef.current.dragged = true
        didDragRef.current = true
        setDragging(true)
        setDock('free')
      }
      if (dragRef.current.dragged) {
        var w = dragRef.current.rectWidth || (isVertical ? 140 : 180)
        var h = dragRef.current.rectHeight || (isVertical ? 120 : 60)
        var nextPos = clampPeakPosition({
          x: moveEvent.clientX - dragRef.current.grabOffsetX,
          y: moveEvent.clientY - dragRef.current.grabOffsetY,
        }, w, h, window.innerWidth, window.innerHeight, 8)
        latestPosRef.current = nextPos
        setPos(nextPos)
      }
    }
    function onUp() {
      if (dragRef.current && dragRef.current.dragged) {
        var finalPos = latestPosRef.current || { x: curX, y: curY }
        try {
          compatibility.storage.setItem(PEAK_DOCK_KEY, 'free')
          if (finalPos) compatibility.storage.setItem(PEAK_POS_KEY, JSON.stringify(finalPos))
        } catch (err) { /* ignore */ }
        setDragging(false)
        setDock('free')
        setPos(finalPos)
        announcePrefs(false)
      }
      dragRef.current = null
      // Release the "this was a drag, swallow the click" latch after the
      // click that follows pointerup. Without this the flag stays true
      // whenever the next pointerdown never arrives (pointer released
      // outside the window, a cancelled gesture), and every later click on
      // the card is swallowed — the control panel then refuses to open
      // until the page is reloaded.
      if (typeof window.setTimeout === 'function') {
        window.setTimeout(function () { didDragRef.current = false }, 0)
      } else {
        didDragRef.current = false
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function handleResetDock(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
    setDock('sidebar')
    setPos(null)
    latestPosRef.current = null
    try {
      compatibility.storage.setItem(PEAK_DOCK_KEY, 'sidebar')
      compatibility.storage.removeItem(PEAK_POS_KEY)
    } catch (err) { /* ignore */ }
    announcePrefs()
  }


  var cardStyle = {}
  if (isFreeFloating) {
    cardStyle.position = 'fixed'
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      cardStyle.left = pos.x + 'px'
      cardStyle.top = pos.y + 'px'
    } else {
      cardStyle.left = '20px'
      cardStyle.top = '100px'
    }
    cardStyle.zIndex = 90
    if (peakScale && peakScale !== 1) {
      cardStyle.transform = 'scale(' + peakScale + ')'
      cardStyle.transformOrigin = 'top left'
    }
  } else {
    if (!isVertical) {
      cardStyle.width = '100%'
    } else {
      cardStyle.width = 'fit-content'
      cardStyle.maxWidth = Math.round(148 * peakScale) + 'px'
      cardStyle.marginLeft = 'auto'
      cardStyle.marginRight = 'auto'
    }
    cardStyle.boxSizing = 'border-box'
    cardStyle.marginBottom = Math.round(8 * peakScale) + 'px'
  }

  var containerClasses = ['dshw_footRing']
  if (isRail) containerClasses.push('dshw_footRingRail')
  if (isVertical) containerClasses.push('dshw_footRingVertical')
  if (!isVertical && !showRecharge) containerClasses.push('dshw_footRingNoRecharge')
  if (isFreeFloating) containerClasses.push('dshw_footRingFloating')
  if (narrowCard) containerClasses.push('dshw_footRingNarrow')
  if (dragging) containerClasses.push('dshw_footRingDragging')
  if (low) containerClasses.push('dshw_low')

  var clockSize = isRail
    ? 36
    : (isFreeFloating ? (isVertical ? 42 : 50) : Math.round((isVertical ? 42 : 50) * peakScale))

  var cardElement = React.createElement('div', {
    ref: cardNodeRef,
    className: containerClasses.join(' '),
    'data-dshw-peak-background': peakBackground,
    style: Object.keys(cardStyle).length > 0 ? cardStyle : undefined,
    title: state.tip + ' · 余额 ' + balText + ' · ' + costLabel + ' ' + costText + (isRail ? ' · 点击前往官方充值' : ' · 点击展开专属控制面板 / 按住拖拽'),
    'aria-label': state.ariaText + '，余额 ' + balText + '，' + costLabel + ' ' + costText,
    role: 'button',
    tabIndex: 0,
    onPointerDown: isRail ? undefined : handlePointerDown,
    onClick: function (e) {
      if (isRail) {
        openOfficialRecharge()
        return
      }
      if (didDragRef.current !== true) {
        setPanelOpen(function (prev) { return !prev })
      }
    },
    onKeyDown: function (e) {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        setPanelOpen(function (prev) { return !prev })
      }
    }
  },
    isFreeFloating ? React.createElement('button', {
      type: 'button',
      className: 'dshw_footRingResetBtn',
      title: '归位至侧边栏底部',
      'aria-label': '归位至侧边栏底部',
      onClick: handleResetDock
    }, '↩ 归位') : null,
    React.createElement('div', { style: { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      peakRingSVG(state.configured ? state.windows : null, wallHourIn(tzName, offsetMinutes, new Date(nowMs)), clockSize, state.ariaText, state.weekendOffPeak)
    ),
    !isRail ? React.createElement('div', { className: 'dshw_footRingLabel' },
      React.createElement('div', { className: 'dshw_footRingHeader' },
        React.createElement('span', {
          className: 'dshw_footRingTitle',
          style: {
            color: state.configured ? (state.inPeak ? 'var(--dsw-alias-state-error-primary,#e5534b)' : 'var(--dsw-alias-state-success-primary,#1a7f37)') : 'inherit',
            fontSize: isFreeFloating ? undefined : (Math.round((isVertical ? 12 : 13.5) * peakScale) + 'px')
          }
        }, state.configured ? state.periodName : '峰谷时钟')
      ),
      React.createElement('div', {
        className: 'dshw_footRingMoney' + (low ? ' dshw_low' : ''),
        style: isFreeFloating ? undefined : { fontSize: (Math.round((isVertical ? 11 : 12.5) * peakScale) + 'px') }
      },
        React.createElement('span', { className: 'dshw_footRingMoneyGroup' },
          React.createElement('span', { className: 'dshw_muted' }, '余额 '),
          React.createElement('span', { className: 'dshw_footBalNum', style: { fontWeight: '600' } }, balText)),
        React.createElement('span', { className: 'dshw_balDot', style: { margin: '0 3px' } }, '·'),
        React.createElement('span', { className: 'dshw_footRingMoneyGroup' },
          React.createElement('span', { className: 'dshw_muted' }, costLabel + ' '),
          React.createElement('span', { style: { fontWeight: '600' } }, costText))
      ),
      React.createElement('div', { className: 'dshw_footRingBottom' },
        React.createElement('span', {
          className: 'dshw_footRingCountdown',
          style: isFreeFloating ? undefined : { fontSize: (Math.round((isVertical ? 10 : 11) * peakScale) + 'px') }
        }, state.configured ? state.countdownSummary : '计费时段未配置'),
        showRecharge ? React.createElement('button', {
          type: 'button',
          className: 'dshw_footRingBtnRechargeInline',
          title: 'DeepSeek 开放平台 · 前往官方充值',
          'aria-label': '前往官方充值',
          onClick: function (e) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
            openOfficialRecharge()
          }
        }, '充值') : null
      )
    ) : null
  )

  var panelElement = panelOpen ? React.createElement('div', {
    ref: panelNodeRef,
    className: 'dshw_peakPanel',
    style: { left: panelPos.left + 'px', top: panelPos.top + 'px' },
    role: 'dialog',
    'aria-label': '峰谷时钟专属控制面板'
  },
    React.createElement('div', { className: 'dshw_peakPanelHeader' },
      React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
        React.createElement('span', { style: { color: 'var(--dsw-alias-brand-primary,#4aa3ff)' } }, '⚡'),
        React.createElement('strong', null, '峰谷时钟控制面板')),
      React.createElement('button', {
        type: 'button',
        className: 'dshw_peakPanelClose',
        title: '关闭面板 (Esc)',
        'aria-label': '关闭面板',
        onClick: function (e) { e.stopPropagation(); setPanelOpen(false) }
      }, '×')),
    React.createElement('div', { className: 'dshw_peakStatusCard' },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        React.createElement('span', {
          style: {
            fontWeight: '700',
            fontSize: '13px',
            color: state.configured ? (state.inPeak ? 'var(--dsw-alias-state-error-primary,#e5534b)' : 'var(--dsw-alias-state-success-primary,#1a7f37)') : 'inherit'
          }
        }, state.configured ? (state.periodName + (state.inPeak ? '（标准价）' : '（半价优惠）')) : '计费时段未配置'),
        React.createElement('span', { className: 'dshw_muted', style: { fontSize: '11px' } }, state.countdownSummary)),
      React.createElement('div', { className: 'dshw_muted', style: { fontSize: '11px', marginTop: '2px' } }, state.windowSummary),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '5px', paddingTop: '5px', borderTop: '1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.12))' } },
        React.createElement('span', { style: { fontSize: '11.5px' } }, '余额 ' + balText + ' · ' + costLabel + ' ' + costText),
        React.createElement('button', {
          type: 'button',
          className: 'dshw_btn dshw_btnPrimary',
          style: { height: '22px', fontSize: '11px', padding: '0 8px' },
          onClick: function () { openOfficialRecharge() }
        }, '↗ 充值'))),
    React.createElement('div', { className: 'dshw_divider' }),
    React.createElement('div', { className: 'dshw_peakRow' },
      React.createElement('span', { className: 'dshw_muted' }, '时钟排版'),
      React.createElement('select', {
        className: 'dshw_select',
        style: { height: '24px', fontSize: '11px' },
        'aria-label': '控制面板时钟排版',
        value: orient,
        onChange: function (e) { updateOrient(e.target.value) }
      },
        React.createElement('option', { value: 'horizontal' }, '横向排列'),
        React.createElement('option', { value: 'vertical' }, '纵向排列'))),
    React.createElement('div', { className: 'dshw_peakRow' },
      React.createElement('span', { className: 'dshw_muted' }, '时钟背景'),
      React.createElement('select', {
        className: 'dshw_select',
        style: { height: '24px', fontSize: '11px' },
        'aria-label': '控制面板时钟背景',
        value: peakBackground,
        onChange: function (e) { updateBackground(e.target.value) }
      },
        React.createElement('option', { value: 'transparent' }, '透明（悬停实色）'),
        React.createElement('option', { value: 'solid' }, '实色'))),
    React.createElement('div', { className: 'dshw_peakRow' },
      React.createElement('span', { className: 'dshw_muted' }, '时钟大小 (' + Math.round(peakScale * 100) + '%)'),
      React.createElement('span', { className: 'dshw_scaleControl' },
        React.createElement('input', {
          className: 'dshw_scaleInput', type: 'range', min: '100', max: '120', step: '5',
          value: String(Math.round(peakScale * 100)),
          'aria-label': '控制面板时钟卡片比例',
          onInput: function (e) { updateScale(Number.parseFloat(e.target.value) / 100) },
          onChange: function (e) { updateScale(Number.parseFloat(e.target.value) / 100) }
        }))),
    React.createElement('div', { className: 'dshw_peakRow' },
      React.createElement('span', { className: 'dshw_muted' }, '时钟充值按钮'),
      React.createElement('label', { className: 'dshw_switch' },
        React.createElement('input', {
          type: 'checkbox', checked: showRecharge,
          'aria-label': '控制面板时钟充值按钮',
          onChange: function (e) { updateRecharge(e.target.checked) }
        }),
        React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
        React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' }))),
    React.createElement('div', { className: 'dshw_peakRow' },
      React.createElement('span', { className: 'dshw_muted' }, '峰谷切换提醒'),
      React.createElement('label', { className: 'dshw_switch' },
        React.createElement('input', {
          type: 'checkbox', checked: peakNotify,
          'aria-label': '控制面板开启峰谷切换提醒',
          onChange: function (e) { updateNotify(e.target.checked) }
        }),
        React.createElement('span', { className: 'dshw_track', 'aria-hidden': 'true' }),
        React.createElement('span', { className: 'dshw_knob', 'aria-hidden': 'true' }))),
    React.createElement('div', { className: 'dshw_peakRow' },
      React.createElement('span', { className: 'dshw_muted' }, '时钟位置'),
      isFreeFloating ? React.createElement('button', {
        type: 'button',
        className: 'dshw_btn',
        style: { height: '24px', fontSize: '11px' },
        onClick: handleResetDock
      }, '↩ 归位至侧边栏') : React.createElement('span', { className: 'dshw_muted', style: { fontSize: '11px' } }, '侧边栏底部（可拖拽）')),
    React.createElement('div', { style: { marginTop: '4px', textAlign: 'right', fontSize: '10px', color: 'var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary,#667085))' } },
      'DeepSeek Harness Control Center v' + WALLET_VERSION)
  ) : null

  function renderWithPortal(elem) {
    if (ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined' && document.body) {
      return ReactDOM.createPortal(elem, document.body)
    }
    return elem
  }

  if (panelOpen) {
    var renderedCard = isFreeFloating ? renderWithPortal(cardElement) : cardElement
    var renderedPanel = renderWithPortal(panelElement)
    return React.createElement(React.Fragment, null, renderedCard, renderedPanel)
  }
  return isFreeFloating ? renderWithPortal(cardElement) : cardElement
}

