/**
 * dsh-wallet host half.
 *
 * What it owns (all host-plane, shared by every session):
 *  - per-session, per-provider token accounting harvested from the 'llm/stream'
 *    waterfall (DeepSeek official bucket vs. every other provider bucket);
 *  - a global DeepSeek account balance cache (official Get User Balance
 *    endpoint, refreshed every 60s);
 *  - a global low-balance threshold, persisted under DSH_HOME storages;
 *  - the /api/wallet routes the browser chip polls.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'wallet'
export const inject = ['webServer']

const OFFICIAL_PROVIDER = 'deepseek-official'
const RECHARGE_URL = 'https://platform.deepseek.com/top_up'
const STORE_PATH = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'storages', 'wallet.json')
const DEFAULT_THRESHOLD = 5
const BALANCE_REFRESH_MS = 60_000
const STORE_VERSION = 2

// Beijing (UTC+8, no DST) peak windows: 09:00-12:00 and 14:00-18:00.
const BEIJING_OFFSET_MS = 8 * 3600_000

export function isBeijingPeak(atMs) {
  const hours = ((atMs + BEIJING_OFFSET_MS) % 86_400_000) / 3_600_000
  return (hours >= 9 && hours < 12) || (hours >= 14 && hours < 18)
}

// Pricing timeline (CNY per 1M tokens; cacheWrite is not billed by DeepSeek).
// Curated from the official announcements; later policies win per model.
export const PRICE_POLICIES = [
  {
    since: Date.UTC(2025, 1, 9),
    models: {
      'deepseek-chat': { cacheHit: 0.5, input: 2, output: 8 },
      'deepseek-reasoner': { cacheHit: 1, input: 4, output: 16 },
    },
  },
  {
    since: Date.UTC(2026, 3, 24),
    models: {
      'deepseek-v4-flash': { cacheHit: 0.02, input: 1, output: 2 },
      'deepseek-v4-pro': { cacheHit: 0.025, input: 3, output: 6 },
    },
  },
  {
    // 2026-08-17 00:00 Beijing = 2026-08-16T16:00Z; off-peak is half the peak rate.
    since: Date.UTC(2026, 7, 16, 16),
    peakOffPeak: true,
    models: {
      'deepseek-v4-flash': { cacheHit: [0.05, 0.1], input: [1.5, 3], output: [4.5, 9] },
      'deepseek-v4-pro': { cacheHit: [0.15, 0.3], input: [4.5, 9], output: [13.5, 27] },
    },
  },
]

export function ratesFor(model, atMs) {
  let entry
  for (const policy of PRICE_POLICIES) {
    if (atMs >= policy.since && policy.models[model] !== undefined) entry = policy
  }
  if (entry === undefined) return null
  const rates = entry.models[model]
  if (entry.peakOffPeak === true) {
    const peak = isBeijingPeak(atMs) ? 1 : 0
    return { cacheHit: rates.cacheHit[peak], input: rates.input[peak], output: rates.output[peak] }
  }
  return rates
}

export function costOf(model, usage, atMs) {
  const rates = ratesFor(model, atMs)
  if (rates === null) return null
  usage = usage !== null && typeof usage === 'object' ? usage : {}
  const input = finiteCounter(usage.inputTokens ?? usage.input) * rates.input
  const cacheRead = finiteCounter(usage.cacheReadTokens ?? usage.cacheRead) * rates.cacheHit
  const output = finiteCounter(usage.outputTokens ?? usage.output) * rates.output
  return (input + cacheRead + output) / 1e6
}

function emptyCounters() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
}

function emptyBucket(priced) {
  if (priced === true) return { models: {}, cost: 0, priced: true }
  return { models: {} }
}

export function normalizeThreshold(value) {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return DEFAULT_THRESHOLD
  return Math.min(100000, Math.max(0, Math.round(parsed * 100) / 100))
}

function finiteCounter(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function normalizeCounters(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    input: finiteCounter(source.input),
    output: finiteCounter(source.output),
    cacheRead: finiteCounter(source.cacheRead),
    cacheWrite: finiteCounter(source.cacheWrite),
    reasoning: finiteCounter(source.reasoning),
  }
}

function normalizeModels(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const models = {}
  for (const [model, counters] of Object.entries(source)) {
    if (model === '__proto__' || model === 'prototype' || model === 'constructor') continue
    models[model] = normalizeCounters(counters)
  }
  return models
}

function migratedOfficialBucket(value, atMs) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const models = normalizeModels(source.models)
  if (typeof source.cost === 'number' && Number.isFinite(source.cost) && source.cost >= 0 && typeof source.priced === 'boolean') {
    return { models, cost: source.cost, priced: source.priced }
  }
  let cost = 0
  let priced = true
  for (const [model, counters] of Object.entries(models)) {
    const valueAtMigration = costOf(model, counters, atMs)
    if (valueAtMigration === null) priced = false
    else cost += valueAtMigration
  }
  return { models, cost, priced }
}

export function normalizeStoreData(value, atMs = Date.now()) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const rawSessions = source.sessions !== null && typeof source.sessions === 'object' && !Array.isArray(source.sessions)
    ? source.sessions
    : {}
  const sessions = {}
  for (const [sessionId, value] of Object.entries(rawSessions)) {
    if (sessionId === '__proto__' || sessionId === 'prototype' || sessionId === 'constructor') continue
    const rawSession = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
    sessions[sessionId] = {
      official: migratedOfficialBucket(rawSession.official, atMs),
      third: { models: normalizeModels(rawSession.third && rawSession.third.models) },
    }
  }
  const normalized = { version: STORE_VERSION, threshold: normalizeThreshold(source.threshold), sessions }
  return { store: normalized, migrated: JSON.stringify(source) !== JSON.stringify(normalized) }
}

function loadStore() {
  try {
    return normalizeStoreData(JSON.parse(readFileSync(STORE_PATH, 'utf8')))
  } catch {
    return {
      store: { version: STORE_VERSION, threshold: DEFAULT_THRESHOLD, sessions: {} },
      migrated: false,
    }
  }
}

let saveTimer = null
const loadedStore = loadStore()
let store = loadedStore.store
let storeNeedsSave = loadedStore.migrated

function persistStore(logger) {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true })
    const tmp = STORE_PATH + '.tmp'
    writeFileSync(tmp, JSON.stringify(store))
    renameSync(tmp, STORE_PATH)
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('dsh-wallet: failed to persist store: ' + String(error))
    }
  }
}

function scheduleSave(logger) {
  if (saveTimer !== null) return
  saveTimer = setTimeout(() => persistStore(logger), 500)
}

function addUsage(counters, usage) {
  counters.input += finiteCounter(usage.inputTokens)
  counters.output += finiteCounter(usage.outputTokens)
  counters.cacheRead += finiteCounter(usage.cacheReadTokens)
  counters.cacheWrite += finiteCounter(usage.cacheWriteTokens)
  counters.reasoning += finiteCounter(usage.reasoningTokens)
}

function bucketTotals(bucket) {
  const totals = emptyCounters()
  for (const counters of Object.values(bucket.models)) {
    totals.input += counters.input
    totals.output += counters.output
    totals.cacheRead += counters.cacheRead
    totals.cacheWrite += counters.cacheWrite
    totals.reasoning += counters.reasoning
  }
  return totals
}

export function addOfficialUsage(bucket, model, usage, atMs) {
  if (!Object.hasOwn(bucket.models, model)) bucket.models[model] = emptyCounters()
  addUsage(bucket.models[model], usage)
  const cost = costOf(model, usage, atMs)
  if (cost === null) bucket.priced = false
  else bucket.cost += cost
}

function recordUsage(options, usage, atMs = Date.now()) {
  const sessionId = options.sessionId
  const provider = options.provider
  const model = options.model ?? options.modelName ?? ''
  if (typeof sessionId !== 'string' || sessionId === '' || typeof provider !== 'string' || provider === '') return
  if (typeof model !== 'string' || model === '__proto__' || model === 'prototype' || model === 'constructor') return
  if (sessionId === '__proto__' || sessionId === 'prototype' || sessionId === 'constructor') return
  if (!Object.hasOwn(store.sessions, sessionId)) {
    store.sessions[sessionId] = { official: emptyBucket(true), third: emptyBucket(false) }
  }
  const session = store.sessions[sessionId]
  const bucket = provider === OFFICIAL_PROVIDER ? session.official : session.third
  if (provider === OFFICIAL_PROVIDER) addOfficialUsage(bucket, model, usage, atMs)
  else {
    if (!Object.hasOwn(bucket.models, model)) bucket.models[model] = emptyCounters()
    addUsage(bucket.models[model], usage)
  }
}

let balance = { fetchedAt: 0, available: false, balances: [], error: null }
let balanceRefresh = null

async function performBalanceRefresh(ctx) {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) {
    balance = { fetchedAt: Date.now(), available: false, balances: [], error: 'no credentials service' }
    return
  }
  try {
    const resolved = await credentials.resolve('DEEPSEEK_API_KEY')
    const key = resolved ? resolved.value : undefined
    if (key === undefined || key === '') {
      balance = { fetchedAt: Date.now(), available: false, balances: [], error: 'no API key' }
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch('https://api.deepseek.com/user/balance', {
        method: 'GET',
        headers: { authorization: 'Bearer ' + key },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('status ' + response.status)
      const data = await response.json()
      balance = {
        fetchedAt: Date.now(),
        available: data.is_available === true,
        balances: Array.isArray(data.balance_infos) ? data.balance_infos : [],
        error: null,
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    balance = {
      fetchedAt: Date.now(),
      available: false,
      balances: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function refreshBalance(ctx) {
  if (balanceRefresh !== null) return balanceRefresh
  balanceRefresh = performBalanceRefresh(ctx).finally(() => {
    balanceRefresh = null
  })
  return balanceRefresh
}

export function sumBalances(infos) {
  if (!Array.isArray(infos) || infos.length === 0) return 0
  // The chip and the threshold are denominated in CNY: prefer the CNY record
  // instead of mixing it with e.g. a USD record for international accounts.
  const cny = infos.find((info) => info.currency === 'CNY')
  if (cny !== undefined) {
    const value = Number.parseFloat(cny.total_balance)
    if (Number.isFinite(value)) return value
  }
  // No (finite) CNY record: sum only when every record shares one currency.
  if (!infos.every((info) => info.currency === infos[0].currency)) {
    for (const info of infos) {
      const value = Number.parseFloat(info.total_balance)
      if (Number.isFinite(value)) return value
    }
    return 0
  }
  let total = 0
  for (const info of infos) {
    const value = Number.parseFloat(info.total_balance)
    if (Number.isFinite(value)) total += value
  }
  return total
}

export function balanceCurrency(infos) {
  if (!Array.isArray(infos)) return null
  const cny = infos.find((info) => info.currency === 'CNY' && Number.isFinite(Number.parseFloat(info.total_balance)))
  if (cny !== undefined) return 'CNY'
  const firstFinite = infos.find((info) => Number.isFinite(Number.parseFloat(info.total_balance)))
  return firstFinite && typeof firstFinite.currency === 'string' ? firstFinite.currency.toUpperCase() : null
}

function balanceTotal() {
  return sumBalances(balance.balances)
}

function sessionView(sessionId) {
  if (sessionId === undefined || sessionId === '') return { official: null, third: null }
  const session = store.sessions[sessionId]
  if (session === undefined) return { official: null, third: null }
  const official = bucketTotals(session.official)
  const third = bucketTotals(session.third)
  return {
    official: {
      tokens: official,
      cost: session.official.priced === true ? session.official.cost : null,
      models: session.official.models,
    },
    third: { tokens: third, models: session.third.models },
  }
}

function snapshotView(sessionId, threshold) {
  const currency = balanceCurrency(balance.balances)
  return {
    ok: true,
    balance: {
      available: balance.available,
      fetchedAt: balance.fetchedAt,
      balances: balance.balances,
      total: balance.available ? balanceTotal() : null,
      currency,
      error: balance.available ? null : balance.error,
    },
    session: sessionView(sessionId),
    threshold,
    // The configured threshold is CNY-denominated; do not compare unlike
    // currencies for international accounts that do not expose a CNY row.
    lowBalance: balance.available && currency === 'CNY' && threshold > 0 && balanceTotal() < threshold,
    rechargeUrl: RECHARGE_URL,
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function readBody(req, cap) {
  cap = cap || 4096
  return new Promise((resolve) => {
    let size = 0
    let tooLarge = false
    const parts = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= cap) parts.push(chunk)
      else tooLarge = true
    })
    req.on('end', () => {
      if (tooLarge) return resolve(null)
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

function sessionParam(req) {
  const raw = req.url || ''
  const query = raw.indexOf('?')
  if (query < 0) return undefined
  const value = new URLSearchParams(raw.slice(query + 1)).get('session')
  return value === null || value === '' ? undefined : value
}

export function apply(ctx, config) {
  config = config || {}
  if (storeNeedsSave) {
    storeNeedsSave = false
    scheduleSave(ctx.logger)
  }
  // Threshold lives ONLY in the persisted store; an explicit row config may
  // still override it for power users, but the bundle patch sets none.
  let threshold = store.threshold
  if (Number.isFinite(config.threshold)) {
    threshold = normalizeThreshold(config.threshold)
    store.threshold = threshold
    scheduleSave(ctx.logger)
  }

  const usageTap = (options, next) => {
    const downstream = next()
    return (async function* () {
      let usage = null
      let usageAt = 0
      try {
        for await (const chunk of downstream) {
          if (chunk !== null && chunk !== undefined && chunk.type === 'usage' && chunk.usage !== undefined) {
            usage = chunk.usage
            usageAt = Date.now()
          }
          yield chunk
        }
      } finally {
        if (usage !== null) {
          recordUsage(options, usage, usageAt)
          scheduleSave(ctx.logger)
        }
      }
    })()
  }
  ctx.on('llm/stream', usageTap, { global: true })

  void refreshBalance(ctx)
  // Staggered boot retries: the credentials seam or network may not be ready
  // at first mount; retry a few times so the chip shows a value without
  // waiting for the 60s cadence (or for the user to send a message).
  ctx.effect(() => {
    const retries = [2000, 6000, 15000, 30000].map((delay) => {
      const retry = setTimeout(() => {
        if (!balance.available) void refreshBalance(ctx)
      }, delay)
      if (typeof retry.unref === 'function') retry.unref()
      return retry
    })
    return () => {
      for (const retry of retries) clearTimeout(retry)
    }
  }, 'dsh-wallet: boot balance retries')
  const balanceTimer = setInterval(() => void refreshBalance(ctx), BALANCE_REFRESH_MS)
  if (typeof balanceTimer.unref === 'function') balanceTimer.unref()

  ctx.effect(() => {
    const disposeSnapshot = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/snapshot',
      handler: (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        return json(res, 200, snapshotView(sessionParam(req), threshold))
      },
    })
    const disposeThreshold = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/threshold',
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        const body = await readBody(req)
        if (body === null || typeof body.threshold !== 'number' || !Number.isFinite(body.threshold)) {
          return json(res, 400, { ok: false, error: 'threshold must be a number' })
        }
        threshold = Math.min(100000, Math.max(0, Math.round(body.threshold * 100) / 100))
        store.threshold = threshold
        scheduleSave(ctx.logger)
        return json(res, 200, { ok: true, threshold: threshold })
      },
    })
    const disposeRefresh = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/refresh',
      handler: (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        void refreshBalance(ctx).then(() => json(res, 200, { ok: true, fetchedAt: balance.fetchedAt }))
      },
    })
    const disposeClear = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/clear-session',
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        const body = await readBody(req)
        const sid = body && body.session
        if (sid && store.sessions[sid]) {
          delete store.sessions[sid]
          scheduleSave(ctx.logger)
        }
        return json(res, 200, { ok: true })
      },
    })
    return () => {
      disposeSnapshot()
      disposeThreshold()
      disposeRefresh()
      disposeClear()
      clearInterval(balanceTimer)
      if (saveTimer !== null) persistStore(ctx.logger)
    }
  }, 'dsh-wallet: routes')
}
