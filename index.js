/**
 * dsh-wallet host half.
 *
 * What it owns (all host-plane, shared by every session):
 *  - per-session, per-provider token accounting harvested from the 'llm/stream'
 *    waterfall (DeepSeek official bucket vs. every other provider bucket);
 *  - a global DeepSeek account balance cache (official Get User Balance
 *    endpoint, refreshed every 60s);
 *  - a global low-balance threshold, persisted under DSH_HOME storages;
 *  - multi-account management (accounts.json): list / add / remove accounts and
 *    hot-switch the active one. Activating an account writes its key into the
 *    credentials seam via `credentials.set('DEEPSEEK_API_KEY', ...)`, and the
 *    llm-deepseek provider route resolves that reference per request, so the
 *    next LLM call is billed with the new account — no restart needed. Balance
 *    lookups prefer the active account's key and fall back to the credentials
 *    seam when no account is active;
 *  - the /api/wallet routes the browser chip polls.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'wallet'
export const inject = ['webServer']

const OFFICIAL_PROVIDER = 'deepseek-official'
const RECHARGE_URL = 'https://platform.deepseek.com/top_up'
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const STORE_PATH = join(DSH_HOME, 'storages', 'wallet.json')
const ACCOUNTS_PATH = join(DSH_HOME, 'storages', 'accounts.json')
const ACCOUNTS_VERSION = 1
const CREDENTIAL_REF = 'DEEPSEEK_API_KEY'
const DEFAULT_THRESHOLD = 5
const BALANCE_REFRESH_MS = 60_000
const STORE_VERSION = 2

// Beijing (UTC+8, no DST) peak windows: 09:00-12:00 and 14:00-18:00.
// Exposed to clients via snapshot.pricingWindows so the ring clock renders
// from the active policy instead of hard-coding hours in the bundle.
const PEAK_WINDOWS = [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }]
const OFF_PEAK_RATE = 0.5
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

// Low-balance thresholds are per-currency: a USD account warns against its
// own $ threshold, a CNY account against its own ¥ one; they never compare
// across currencies. The legacy single-value store migrates into CNY.
// Per-ACCOUNT thresholds: two accounts in the same currency may keep
// different warning lines ("one account is 1, another is 2"). Keyed by
// account id; the per-currency map stays as the fallback for the
// no-active-account (system key) case and as the migration source.
export function normalizeAccountThresholds(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const out = {}
  for (const [id, raw] of Object.entries(source)) {
    if (typeof id !== 'string' || id === '' || id.length > 100) continue
    if (id === '__proto__' || id === 'prototype' || id === 'constructor') continue
    const parsed = Number.parseFloat(raw)
    if (!Number.isFinite(parsed)) continue
    out[id] = Math.min(100000, Math.max(0, Math.round(parsed * 100) / 100))
    if (Object.keys(out).length >= 50) break
  }
  return out
}

export function normalizeThresholds(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const out = {}
  for (const [code, raw] of Object.entries(source)) {
    if (!/^[A-Z]{3}$/.test(code)) continue
    if (code === '__proto__' || code === 'prototype' || code === 'constructor') continue
    const parsed = Number.parseFloat(raw)
    if (!Number.isFinite(parsed)) continue
    out[code] = Math.min(100000, Math.max(0, Math.round(parsed * 100) / 100))
    if (Object.keys(out).length >= 20) break
  }
  return out
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

// Provider-route aliasing: wrapper plugins (e.g. vision proxies) sit in front
// of the official API under their own provider id, so the bucket check must be
// a configured set rather than one hard-coded name.
export function normalizeProviderList(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  for (const item of value) {
    if (typeof item !== 'string' || item === '' || item.length > 100) continue
    if (item === '__proto__' || item === 'prototype' || item === 'constructor') continue
    if (item === OFFICIAL_PROVIDER) continue
    seen.add(item)
    if (seen.size >= 20) break
  }
  return [...seen]
}

export function isOfficialProvider(provider, extraProviders) {
  if (provider === OFFICIAL_PROVIDER) return true
  return Array.isArray(extraProviders) && extraProviders.includes(provider)
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
  const normalized = {
    version: STORE_VERSION,
    thresholds: normalizeThresholds(source.thresholds && Object.keys(source.thresholds).length > 0 ? source.thresholds : { CNY: normalizeThreshold(source.threshold) }),
    accountThresholds: normalizeAccountThresholds(source.accountThresholds),
    sessions,
    officialProviders: normalizeProviderList(source.officialProviders),
    knownProviders: normalizeProviderList(source.knownProviders),
  }
  return { store: normalized, migrated: JSON.stringify(source) !== JSON.stringify(normalized) }
}

function loadStore() {
  try {
    return normalizeStoreData(JSON.parse(readFileSync(STORE_PATH, 'utf8')))
  } catch {
    return {
      store: { version: STORE_VERSION, thresholds: { CNY: DEFAULT_THRESHOLD }, accountThresholds: {}, sessions: {}, officialProviders: [], knownProviders: [] },
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

// ---------------------------------------------------------------------------
// Multi-account store (accounts.json): list, add, remove, hot-switch.
// Keys are stored plaintext next to .credentials.yaml, matching the harness's
// own credential storage; the API surface only ever exposes masked keys.
// ---------------------------------------------------------------------------

function emptyAccounts() {
  return { version: ACCOUNTS_VERSION, accounts: [], activeId: null }
}

export function normalizeAccountsData(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const rawAccounts = Array.isArray(source.accounts) ? source.accounts : []
  const accounts = []
  for (const raw of rawAccounts) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : null
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey : ''
    if (id === null || name === '' || apiKey === '') continue
    accounts.push({
      id,
      name,
      apiKey,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    })
  }
  const activeId =
    typeof source.activeId === 'string' && accounts.some((account) => account.id === source.activeId)
      ? source.activeId
      : null
  return { version: ACCOUNTS_VERSION, accounts, activeId }
}

function loadAccounts() {
  try {
    return normalizeAccountsData(JSON.parse(readFileSync(ACCOUNTS_PATH, 'utf8')))
  } catch {
    return emptyAccounts()
  }
}

let accountsSaveTimer = null
let accounts = loadAccounts()

function persistAccounts(logger) {
  if (accountsSaveTimer !== null) {
    clearTimeout(accountsSaveTimer)
    accountsSaveTimer = null
  }
  try {
    mkdirSync(dirname(ACCOUNTS_PATH), { recursive: true })
    const tmp = ACCOUNTS_PATH + '.tmp'
    writeFileSync(tmp, JSON.stringify(accounts))
    renameSync(tmp, ACCOUNTS_PATH)
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('dsh-wallet: failed to persist accounts: ' + String(error))
    }
  }
}

function scheduleAccountsSave(logger) {
  if (accountsSaveTimer !== null) return
  accountsSaveTimer = setTimeout(() => persistAccounts(logger), 500)
}

export function findAccount(id) {
  return accounts.accounts.find((account) => account.id === id) ?? null
}

export function activeAccount() {
  if (accounts.activeId === null) return null
  return findAccount(accounts.activeId)
}

export function maskKey(key) {
  if (typeof key !== 'string' || key === '') return ''
  if (key.length <= 8) return '***'
  return key.slice(0, 4) + '***' + key.slice(-4)
}

export function validateApiKey(key) {
  if (typeof key !== 'string') return 'API key must be a string'
  const trimmed = key.trim()
  if (trimmed === '') return 'API key must not be empty'
  if (trimmed.length < 8) return 'API key looks too short'
  if (/\s/.test(trimmed)) return 'API key must not contain whitespace'
  return null
}

export function addAccount(name, apiKey) {
  if (typeof name !== 'string' || name.trim() === '') return { ok: false, error: 'Account name must not be empty' }
  const keyError = validateApiKey(apiKey)
  if (keyError !== null) return { ok: false, error: keyError }
  const account = {
    id: 'acc_' + randomUUID(),
    name: name.trim(),
    apiKey: apiKey.trim(),
    createdAt: Date.now(),
  }
  accounts.accounts.push(account)
  // The first account becomes the active one automatically; the caller is
  // responsible for syncing it into the credentials seam via activateAccount.
  if (accounts.activeId === null) accounts.activeId = account.id
  return { ok: true, account }
}

export function removeAccount(id) {
  const index = accounts.accounts.findIndex((account) => account.id === id)
  if (index < 0) return { ok: false, error: 'account not found' }
  accounts.accounts.splice(index, 1)
  // Drop the account's own threshold line along with it. The caller persists
  // wallet.json separately from accounts.json when this flag is true.
  let thresholdRemoved = false
  if (store.accountThresholds && Object.hasOwn(store.accountThresholds, id)) {
    delete store.accountThresholds[id]
    thresholdRemoved = true
  }
  // Deliberately NOT unsetting the credentials seam: the key currently in
  // .credentials.yaml keeps working for LLM billing; the UI just reports
  // "no active account" and balance falls back to the seam key.
  if (accounts.activeId === id) accounts.activeId = null
  return { ok: true, thresholdRemoved }
}

export function accountListView() {
  return {
    accounts: accounts.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      maskedKey: maskKey(account.apiKey),
      createdAt: account.createdAt,
      active: account.id === accounts.activeId,
    })),
    activeId: accounts.activeId,
  }
}

/**
 * The key used for balance lookups: the active account's key when one is
 * active, otherwise whatever the credentials seam resolves (backwards
 * compatible with the original plugin's single-key behavior).
 */
async function resolveBalanceKey(ctx) {
  const active = activeAccount()
  if (active !== null && active.apiKey !== '') return active.apiKey
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return undefined
  const resolved = await credentials.resolve(CREDENTIAL_REF)
  return resolved ? resolved.value : undefined
}

/**
 * Hot-switch the active account: persist the choice AND write the account key
 * into the credentials seam so the llm-deepseek route (which resolves the key
 * per request) bills the next LLM call with this account.
 * @returns `{ ok: true, account }` or `{ ok: false, error }`. On failure the
 * stored activeId is left untouched.
 */
export async function activateAccount(ctx, id) {
  const account = findAccount(id)
  if (account === null) return { ok: false, error: 'account not found' }
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return { ok: false, error: 'credentials service unavailable' }
  try {
    await credentials.set(CREDENTIAL_REF, account.apiKey)
  } catch (error) {
    // e.g. the launching environment supplies DEEPSEEK_API_KEY read-only, so
    // the write is shadowed and refused by the credentials provider.
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  accounts.activeId = account.id
  scheduleAccountsSave(ctx.logger)
  void refreshBalance(ctx)
  return { ok: true, account: { id: account.id, name: account.name, maskedKey: maskKey(account.apiKey) } }
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
  // Remember every non-builtin route observed by the stream tap. The settings
  // page can then promote wrapper routes into the official billing bucket.
  if (provider !== OFFICIAL_PROVIDER && !store.knownProviders.includes(provider)) {
    store.knownProviders = normalizeProviderList([...store.knownProviders, provider])
  }
  if (!Object.hasOwn(store.sessions, sessionId)) {
    store.sessions[sessionId] = { official: emptyBucket(true), third: emptyBucket(false) }
  }
  const session = store.sessions[sessionId]
  const official = isOfficialProvider(provider, store.officialProviders)
  const bucket = official ? session.official : session.third
  if (official) addOfficialUsage(bucket, model, usage, atMs)
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
    balance = { fetchedAt: Date.now(), available: false, balances: [], error: 'no-credentials' }
    return
  }
  try {
    const key = await resolveBalanceKey(ctx)
    if (key === undefined || key === '') {
      balance = { fetchedAt: Date.now(), available: false, balances: [], error: 'no-api-key' }
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
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403
          ? 'unauthorized'
          : response.status === 429 ? 'rate-limited' : 'upstream-unavailable'
        const error = new Error(code)
        error.code = code
        throw error
      }
      const data = await response.json()
      const available = data !== null && typeof data === 'object' && data.is_available === true
      balance = {
        fetchedAt: Date.now(),
        available,
        balances: available && Array.isArray(data.balance_infos) ? data.balance_infos : [],
        error: available ? null : 'balance-unavailable',
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    const code = error && typeof error === 'object' && typeof error.code === 'string'
      ? error.code
      : error && typeof error === 'object' && error.name === 'AbortError'
        ? 'timeout'
        : error instanceof SyntaxError ? 'invalid-response' : 'upstream-unavailable'
    balance = {
      fetchedAt: Date.now(),
      available: false,
      balances: [],
      error: code,
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
      priced: session.official.priced === true,
      models: session.official.models,
    },
    third: { tokens: third, models: session.third.models },
  }
}

function snapshotView(sessionId) {
  const currency = balanceCurrency(balance.balances)
  const active = activeAccount()
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
    // Thresholds are per-ACCOUNT first (each account keeps its own line even
    // in the same currency); the per-currency map only serves the
    // no-active-account case and inherits into accounts without one yet.
    threshold: active !== null
      ? (store.accountThresholds[active.id] ?? store.thresholds[currency || 'CNY'] ?? 0)
      : (store.thresholds[currency || 'CNY'] ?? 0),
    lowBalance: balance.available && currency !== null
      && (function () {
        const line = active !== null
          ? (store.accountThresholds[active.id] ?? store.thresholds[currency] ?? 0)
          : (store.thresholds[currency] ?? 0)
        return line > 0 && balanceTotal() < line
      })(),
    rechargeUrl: RECHARGE_URL,
    // Peak/off-peak policy for the ring clock; billed in Asia/Shanghai.
    pricingWindows: {
      timezone: 'Asia/Shanghai',
      offsetMinutes: 480,
      windows: PEAK_WINDOWS.map(w => ({ startHour: w.startHour, endHour: w.endHour })),
      offPeakRate: OFF_PEAK_RATE,
      isPeak: isBeijingPeak(Date.now()),
    },
    accounts: {
      activeId: accounts.activeId,
      activeName: active !== null ? active.name : null,
      count: accounts.accounts.length,
    },
    // Wrapper provider routes (vision proxies etc.) the user has marked as
    // official, plus the ones observed so far that are not official yet —
    // the settings page turns these into checkboxes. Issue #21.
    providers: {
      builtinOfficial: OFFICIAL_PROVIDER,
      official: [...store.officialProviders],
      known: store.knownProviders.filter((p) => p !== OFFICIAL_PROVIDER && !store.officialProviders.includes(p)),
    },
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
  // Thresholds live ONLY in the persisted store; an explicit row config may
  // still override the CNY line for power users, but the bundle patch sets none.
  if (Number.isFinite(config.threshold)) {
    store.thresholds = normalizeThresholds({ ...store.thresholds, CNY: normalizeThreshold(config.threshold) })
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
        return json(res, 200, snapshotView(sessionParam(req)))
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
        const currency = typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency) ? body.currency : (balanceCurrency(balance.balances) || 'CNY')
        if (currency === '__proto__' || currency === 'prototype' || currency === 'constructor') return json(res, 400, { ok: false, error: 'bad currency' })
        const clamped = Math.min(100000, Math.max(0, Math.round(body.threshold * 100) / 100))
        // An active account keeps its own threshold line; only the system-key
        // mode writes the shared per-currency map.
        const active = activeAccount()
        if (active !== null) {
          store.accountThresholds = normalizeAccountThresholds({ ...store.accountThresholds, [active.id]: clamped })
        } else {
          store.thresholds = normalizeThresholds({ ...store.thresholds, [currency]: clamped })
        }
        scheduleSave(ctx.logger)
        return json(res, 200, { ok: true, threshold: clamped, currency, accountId: active !== null ? active.id : null })
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
        if (typeof sid !== 'string' || !/^session-[A-Za-z0-9-]+$/.test(sid)) {
          return json(res, 400, { ok: false, error: 'session must be a valid session id' })
        }
        if (store.sessions[sid]) {
          delete store.sessions[sid]
          scheduleSave(ctx.logger)
        }
        return json(res, 200, { ok: true })
      },
    })
    // -- multi-account routes -------------------------------------------------
    // Configure which wrapper provider routes (vision proxies and the like)
    // bill into the official bucket. Issue #21.
    const disposeProviders = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/official-providers',
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        const body = await readBody(req)
        if (body === null || !Array.isArray(body.providers)) return json(res, 400, { ok: false, error: 'providers array is required' })
        store.officialProviders = normalizeProviderList(body.providers)
        scheduleSave(ctx.logger)
        return json(res, 200, {
          ok: true,
          official: [...store.officialProviders],
          known: store.knownProviders.filter((p) => p !== OFFICIAL_PROVIDER && !store.officialProviders.includes(p)),
        })
      },
    })
    const disposeAccounts = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/accounts',
      handler: async (req, res) => {
        if (req.method === 'GET') return json(res, 200, { ok: true, ...accountListView() })
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        const body = await readBody(req)
        if (body === null || typeof body.name !== 'string' || typeof body.apiKey !== 'string') {
          return json(res, 400, { ok: false, error: 'name and apiKey are required' })
        }
        const previousActiveId = accounts.activeId
        const needSync = previousActiveId === null
        const result = addAccount(body.name, body.apiKey)
        if (!result.ok) return json(res, 400, { ok: false, error: result.error })
        scheduleAccountsSave(ctx.logger)
        let sync = null
        if (needSync) {
          // First account: activate it so the LLM seam follows the new key.
          sync = await activateAccount(ctx, result.account.id)
          // addAccount marks the first row active optimistically. If the host
          // refuses the credential write, roll it back so UI/balance state does
          // not claim a billing account that the LLM route is not using.
          if (!sync.ok && accounts.activeId === result.account.id) {
            accounts.activeId = previousActiveId
            scheduleAccountsSave(ctx.logger)
          }
        }
        return json(res, 200, {
          ok: true,
          account: {
            id: result.account.id,
            name: result.account.name,
            maskedKey: maskKey(result.account.apiKey),
            active: result.account.id === accounts.activeId,
          },
          synced: sync === null ? false : sync.ok,
          syncError: sync !== null && !sync.ok ? sync.error : undefined,
        })
      },
    })
    const disposeActivate = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/accounts/activate',
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        const body = await readBody(req)
        if (body === null || typeof body.id !== 'string') return json(res, 400, { ok: false, error: 'id is required' })
        const result = await activateAccount(ctx, body.id)
        if (!result.ok) return json(res, 400, { ok: false, error: result.error })
        // Carry the account's own threshold so the input can jump instantly,
        // before the balance refresh lands.
        const currency = balanceCurrency(balance.balances) || 'CNY'
        const threshold = store.accountThresholds[result.account.id] ?? store.thresholds[currency] ?? 0
        return json(res, 200, { ok: true, account: result.account, threshold })
      },
    })
    const disposeRemove = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/accounts/remove',
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        const body = await readBody(req)
        if (body === null || typeof body.id !== 'string') return json(res, 400, { ok: false, error: 'id is required' })
        const result = removeAccount(body.id)
        if (!result.ok) return json(res, 400, { ok: false, error: result.error })
        scheduleAccountsSave(ctx.logger)
        if (result.thresholdRemoved) scheduleSave(ctx.logger)
        return json(res, 200, { ok: true, ...accountListView() })
      },
    })
    return () => {
      disposeSnapshot()
      disposeThreshold()
      disposeRefresh()
      disposeClear()
      disposeAccounts()
      disposeProviders()
      disposeActivate()
      disposeRemove()
      clearInterval(balanceTimer)
      if (saveTimer !== null) persistStore(ctx.logger)
      if (accountsSaveTimer !== null) persistAccounts(ctx.logger)
    }
  }, 'dsh-wallet: routes')
}
