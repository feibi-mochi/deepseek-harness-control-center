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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'wallet'
export const inject = ['webServer']

const OFFICIAL_PROVIDER = 'deepseek-official'
const RECHARGE_URL = 'https://platform.deepseek.com/top_up'
const STORE_PATH = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'storages', 'wallet.json')
const DEFAULT_THRESHOLD = 5
const BALANCE_REFRESH_MS = 60_000

// Pricing timeline (CNY per 1M tokens; cacheWrite is not billed by DeepSeek).
// Curated from the official announcements; later policies win per model.
const PRICE_POLICIES = [
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
]

function ratesFor(model, atMs) {
  let entry
  for (const policy of PRICE_POLICIES) {
    if (atMs >= policy.since && policy.models[model] !== undefined) {
      entry = policy.models[model]
    }
  }
  if (entry === undefined) return null
  return entry
}

function costOf(model, usage, atMs) {
  const rates = ratesFor(model, atMs)
  if (rates === null) return null
  const input = (usage.inputTokens ?? usage.input ?? 0) * rates.input
  const cacheRead = (usage.cacheReadTokens ?? usage.cacheRead ?? 0) * rates.cacheHit
  const output = (usage.outputTokens ?? usage.output ?? 0) * rates.output
  return (input + cacheRead + output) / 1e6
}

function emptyCounters() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
}

function emptyBucket() {
  return { models: {} }
}

function loadStore() {
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8'))
  } catch {
    return { threshold: DEFAULT_THRESHOLD, sessions: {} }
  }
}

let saveTimer = null
let store = loadStore()

function scheduleSave(logger) {
  if (saveTimer !== null) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      mkdirSync(dirname(STORE_PATH), { recursive: true })
      writeFileSync(STORE_PATH, JSON.stringify(store))
    } catch (error) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn('dsh-wallet: failed to persist store: ' + String(error))
      }
    }
  }, 500)
}

function addUsage(counters, usage) {
  counters.input += usage.inputTokens ?? 0
  counters.output += usage.outputTokens ?? 0
  counters.cacheRead += usage.cacheReadTokens ?? 0
  counters.cacheWrite += usage.cacheWriteTokens ?? 0
  counters.reasoning += usage.reasoningTokens ?? 0
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

function recordUsage(options, usage) {
  const sessionId = options.sessionId
  const provider = options.provider
  const model = options.model ?? options.modelName ?? ''
  if (sessionId === undefined || provider === undefined || provider === '') return
  if (store.sessions[sessionId] === undefined) {
    store.sessions[sessionId] = { official: emptyBucket(), third: emptyBucket() }
  }
  const session = store.sessions[sessionId]
  const bucket = provider === OFFICIAL_PROVIDER ? session.official : session.third
  if (bucket.models[model] === undefined) {
    bucket.models[model] = emptyCounters()
  }
  addUsage(bucket.models[model], usage)
}

let balance = { fetchedAt: 0, available: false, balances: [], error: null }

async function refreshBalance(ctx) {
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

function balanceTotal() {
  let total = 0
  for (const info of balance.balances) {
    const value = Number.parseFloat(info.total_balance)
    if (Number.isFinite(value)) total += value
  }
  return total
}

function sessionView(sessionId) {
  if (sessionId === undefined || sessionId === '') return { official: null, third: null }
  const session = store.sessions[sessionId]
  if (session === undefined) return { official: null, third: null }
  const official = bucketTotals(session.official)
  const third = bucketTotals(session.third)
  const now = Date.now()
  let cost = 0
  let priced = true
  for (const model of Object.keys(session.official.models)) {
    const value = costOf(model, session.official.models[model], now)
    if (value === null) priced = false
    else cost += value
  }
  return {
    official: { tokens: official, cost: priced ? cost : null, models: session.official.models },
    third: { tokens: third, models: session.third.models },
  }
}

function snapshotView(sessionId, threshold) {
  return {
    ok: true,
    balance: {
      available: balance.available,
      fetchedAt: balance.fetchedAt,
      balances: balance.balances,
      total: balance.available ? balanceTotal() : null,
      error: balance.available ? null : balance.error,
    },
    session: sessionView(sessionId),
    threshold,
    lowBalance: balance.available && threshold > 0 && balanceTotal() < threshold,
    rechargeUrl: RECHARGE_URL,
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req, cap) {
  cap = cap || 4096
  return new Promise((resolve) => {
    let size = 0
    const parts = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= cap) parts.push(chunk)
    })
    req.on('end', () => {
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
  // Threshold lives ONLY in the persisted store; an explicit row config may
  // still override it for power users, but the bundle patch sets none.
  let threshold = store.threshold ?? DEFAULT_THRESHOLD
  if (Number.isFinite(config.threshold)) {
    threshold = config.threshold
    store.threshold = threshold
    scheduleSave(ctx.logger)
  }

  const usageTap = (options, next) => {
    const downstream = next()
    return (async function* () {
      let usage = null
      try {
        for await (const chunk of downstream) {
          if (chunk !== null && chunk !== undefined && chunk.type === 'usage' && chunk.usage !== undefined) {
            usage = chunk.usage
          }
          yield chunk
        }
      } finally {
        if (usage !== null) {
          recordUsage(options, usage)
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
  for (const delay of [2000, 6000, 15000, 30000]) {
    const retry = setTimeout(() => {
      if (!balance.available) void refreshBalance(ctx)
    }, delay)
    if (typeof retry.unref === 'function') retry.unref()
  }
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
    }
  }, 'dsh-wallet: routes')
}
