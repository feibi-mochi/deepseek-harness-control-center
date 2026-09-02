/**
 * dsh-wallet host half.
 *
 * What it owns (all host-plane, shared by every session):
 *  - per-session, per-provider token accounting harvested from the 'llm/stream'
 *    waterfall (DeepSeek official bucket vs. every other provider bucket);
 *  - a global DeepSeek account balance cache (official Get User Balance
 *    endpoint, refreshed every 60s);
 *  - a global low-balance threshold, persisted under DSH_HOME storages;
 *  - a local 365-day usage ledger with stable-identity deduplication and locked historical cost;
 *  - multi-account management (accounts.json): list / add / remove accounts and
 *    hot-switch the active one. Activating an account writes its key into the
 *    credentials seam via `credentials.set('DEEPSEEK_API_KEY', ...)`, and the
 *    llm-deepseek provider route resolves that reference per request, so the
 *    next LLM call is billed with the new account — no restart needed. Balance
 *    lookups prefer the active account's key and fall back to the credentials
 *    seam when no account is active;
 *  - the /api/wallet routes the browser chip polls.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { PLAN_ADAPTERS, normalizePlanPayload, normalizePlanSnapshotCache, planAdapterById } from './lib/plans.js'

export const name = 'wallet'
export const inject = ['webServer', 'credentials']

const OFFICIAL_PROVIDER = 'deepseek-official'
// Subscription-plan routes are independent providers. They may contribute to
// the generic third-party token ledger, but they must never be promoted into
// DeepSeek's official paid-API bucket by the wrapper-provider alias control.
const PLAN_PROVIDER_IDS = new Set(PLAN_ADAPTERS.map((adapter) => adapter.provider))
const RECHARGE_URL = 'https://platform.deepseek.com/top_up'
const PLUGIN_VERSION = '0.3.8'
const PRICING_SOURCE_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'
const PRICING_SYNC_INTERVAL_MS = 6 * 60 * 60_000
const PRICING_SYNC_TIMEOUT_MS = 8_000
const MIN_HOST_VERSION = '0.1.0-rc.8'
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const STORE_PATH = join(DSH_HOME, 'storages', 'wallet.json')
const STORE_BACKUP_PATH = STORE_PATH + '.bak'
const ACCOUNTS_PATH = join(DSH_HOME, 'storages', 'accounts.json')
const ACCOUNTS_KEY_PATH = ACCOUNTS_PATH + '.key'
const ACCOUNTS_BACKUP_PATH = ACCOUNTS_PATH + '.bak'
const ACCOUNTS_VERSION = 2
const ACCOUNTS_CRYPTO_VERSION = 1
const CREDENTIAL_REF = 'DEEPSEEK_API_KEY'
const DEFAULT_THRESHOLD = 5
const BALANCE_REFRESH_MS = 60_000
const STORE_VERSION = 6
const HISTORY_VERSION = 1
const HISTORY_RETENTION_DAYS = 365
const HISTORY_MAX_EVENTS = 20_000
const CUSTOM_PRICE_MAX_RULES = 100
const CUSTOM_PRICE_MAX_RATE = 1_000_000
const HISTORY_TIMEZONE = 'Asia/Shanghai'
const DAY_MS = 86_400_000
const PLAN_REFRESH_MS = 5 * 60_000
const PLAN_STALE_MS = 15 * 60_000
const PLAN_REFRESH_TIMEOUT_MS = 12_000
const PLAN_RESPONSE_MAX_BYTES = 1_000_000
const UI_PREFERENCE_KEYS = new Set([
  'dshw-chip-style-v1',
  'dshw-chip-balance-only-v1',
  'dshw-data-visibility-v1',
  'dshw-chip-scale-v1',
  'dshw-completion-notify-v1',
  'dshw-low-blink-v1',
  'dshw-peakring-v1',
  'dshw-peak-orient-v1',
  'dshw-peak-background-v1',
  'dshw-peak-recharge-v1',
  'dshw-peak-scale-v1',
  'dshw-peak-dock-v1',
  'dshw-peaknotify-v1',
  'dshw-permanent-delete-v1',
])
const UI_PREFERENCE_VALUE_MAX = 500

// Beijing (UTC+8, no DST) weekday peak windows: 09:00-12:00 and 14:00-18:00.
// From 2026-08-23 00:00 Beijing, Saturday and Sunday are off-peak all day.
// Exposed to clients via snapshot.pricingWindows so the ring clock renders
// from the active policy instead of hard-coding hours in the bundle.
const DEFAULT_PEAK_WINDOWS = [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }]
const OFF_PEAK_RATE = 0.5
const BEIJING_OFFSET_MS = 8 * 3600_000
const WEEKEND_OFF_PEAK_SINCE = Date.UTC(2026, 7, 22, 16)
let peakWindows = DEFAULT_PEAK_WINDOWS.map((window) => ({ ...window }))
let weekendOffPeakSince = WEEKEND_OFF_PEAK_SINCE

function isBeijingWeekend(atMs) {
  if (!Number.isFinite(atMs)) return false
  const beijingDate = new Date(atMs + BEIJING_OFFSET_MS)
  const day = beijingDate.getUTCDay()
  return day === 0 || day === 6
}

function padDayPart(value) {
  return String(value).padStart(2, '0')
}

/** Return the local calendar date used by the official pricing timezone. */
export function historyDayKey(atMs) {
  if (!Number.isFinite(atMs)) return null
  const date = new Date(atMs + BEIJING_OFFSET_MS)
  if (!Number.isFinite(date.getTime())) return null
  return date.getUTCFullYear() + '-' + padDayPart(date.getUTCMonth() + 1) + '-' + padDayPart(date.getUTCDate())
}

function historyDayStartMs(day) {
  if (typeof day !== 'string') return null
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const date = Number(match[3])
  const utc = Date.UTC(year, month - 1, date)
  if (!Number.isFinite(utc)) return null
  const normalized = new Date(utc)
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== date) return null
  return utc - BEIJING_OFFSET_MS
}

function shiftHistoryDay(day, amount) {
  const start = historyDayStartMs(day)
  if (start === null || !Number.isInteger(amount)) return null
  return historyDayKey(start + amount * DAY_MS)
}

function historyWindow(atMs = Date.now(), days = HISTORY_RETENTION_DAYS) {
  const end = historyDayKey(atMs) || historyDayKey(Date.now())
  const count = Math.min(HISTORY_RETENTION_DAYS, Math.max(1, Number.isInteger(days) ? days : HISTORY_RETENTION_DAYS))
  return { from: shiftHistoryDay(end, -(count - 1)), to: end, days: count }
}

export function isBeijingPeak(atMs) {
  if (atMs >= weekendOffPeakSince && isBeijingWeekend(atMs)) return false
  const hours = ((atMs + BEIJING_OFFSET_MS) % 86_400_000) / 3_600_000
  return peakWindows.some((window) => hours >= window.startHour && hours < window.endHour)
}

export function pricingWindowSnapshot(atMs = Date.now()) {
  const weekendOffPeak = atMs >= weekendOffPeakSince && isBeijingWeekend(atMs)
  return {
    timezone: 'Asia/Shanghai',
    offsetMinutes: 480,
    // Current clients use weekendOffPeak for a full green ring. Empty windows
    // also make stale pre-weekend clients fail neutral instead of falsely
    // claiming Sunday is a peak period until the browser is hard-refreshed.
    windows: weekendOffPeak ? [] : peakWindows.map((window) => ({ ...window })),
    offPeakRate: OFF_PEAK_RATE,
    isPeak: isBeijingPeak(atMs),
    weekendOffPeak,
    weekendOffPeakSince,
  }
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
  {
    // Vision Exp was released on 2026-08-21 and uses the V4 Flash table.
    since: Date.UTC(2026, 7, 20, 16),
    peakOffPeak: true,
    models: {
      'deepseek-v4-flash-vision-exp': { cacheHit: [0.05, 0.1], input: [1.5, 3], output: [4.5, 9] },
    },
  },
]

let activePricePolicies = PRICE_POLICIES
let pricingSync = {
  status: 'built-in',
  source: PRICING_SOURCE_URL,
  checkedAt: 0,
  etag: null,
  lastModified: null,
  ruleVersion: 'built-in-2026-08-23',
  modelCount: 3,
  message: '尚未检查官方价格页',
}

function decodeHtmlText(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function numericCells(row, count) {
  const values = row.slice(Math.max(0, row.length - count)).map((cell) => {
    const match = decodeHtmlText(cell).match(/\d+(?:\.\d+)?/)
    return match === null ? null : Number(match[0])
  })
  return values.length === count && values.every((value) => Number.isFinite(value)) ? values : null
}

/**
 * Parse the stable, server-rendered pricing table from DeepSeek's official
 * documentation. A failed parse is deliberately treated as review-required;
 * the wallet never silently bills from a partially understood page.
 */
export function parseOfficialPricingHtml(html) {
  if (typeof html !== 'string' || html.length < 500) throw new Error('official pricing page is empty')
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
    [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => decodeHtmlText(cell[1])),
  ).filter((row) => row.length > 0)
  const header = rows.find((row) => row.some((cell) => cell === 'deepseek-v4-flash'))
  const models = header ? header.filter((cell) => /^deepseek-v4-[a-z0-9-]+$/i.test(cell)) : []
  const requiredModels = ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp']
  if (models.length < requiredModels.length || requiredModels.some((model) => !models.includes(model))) {
    throw new Error('official pricing model table changed')
  }

  function findPair(label) {
    const index = rows.findIndex((row) => row.some((cell) => cell.includes(label)) && row.some((cell) => cell.includes('空闲时段')))
    if (index < 0 || !rows[index + 1]?.some((cell) => cell.includes('高峰时段'))) throw new Error('official pricing rate rows changed')
    const offPeak = numericCells(rows[index], models.length)
    const peak = numericCells(rows[index + 1], models.length)
    if (offPeak === null || peak === null) throw new Error('official pricing values changed')
    return { offPeak, peak }
  }

  const cacheHit = findPair('缓存命中')
  const input = findPair('缓存未命中')
  const output = findPair('百万tokens输出')
  for (const pair of [cacheHit, input, output]) {
    for (let index = 0; index < models.length; index += 1) {
      const offPeak = pair.offPeak[index]
      const peak = pair.peak[index]
      if (!(offPeak > 0 && peak > 0 && peak >= offPeak) || Math.abs(peak - offPeak * 2) > 1e-9) {
        throw new Error('official pricing relationship changed')
      }
    }
  }
  const modelsWithRates = {}
  for (const model of requiredModels) {
    const index = models.indexOf(model)
    modelsWithRates[model] = {
      cacheHit: [cacheHit.offPeak[index], cacheHit.peak[index]],
      input: [input.offPeak[index], input.peak[index]],
      output: [output.offPeak[index], output.peak[index]],
    }
  }
  const text = decodeHtmlText(html)
  const windowMatch = text.match(/高峰时段为北京时间(?:周一至周五)?\s*(\d{1,2}):00\s*-\s*(\d{1,2}):00、\s*(\d{1,2}):00\s*-\s*(\d{1,2}):00/)
  if (windowMatch === null) throw new Error('official peak window changed')
  const parsedWindows = [
    { startHour: Number(windowMatch[1]), endHour: Number(windowMatch[2]) },
    { startHour: Number(windowMatch[3]), endHour: Number(windowMatch[4]) },
  ]
  if (parsedWindows.some((window) => !Number.isInteger(window.startHour) || !Number.isInteger(window.endHour)
    || window.startHour < 0 || window.endHour > 24 || window.startHour >= window.endHour)
    || parsedWindows[0].endHour > parsedWindows[1].startHour) {
    throw new Error('official peak window is invalid')
  }
  const weekdayOnly = /高峰时段为北京时间周一至周五/.test(text)
  const weekendMatch = text.match(/北京时间\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日[^。]*?00:00起[^。]*?周末[^。]*?低谷/)
  if (!weekdayOnly && weekendMatch === null) throw new Error('official weekend rule changed')
  const weekendSince = weekdayOnly
    ? WEEKEND_OFF_PEAK_SINCE
    : Date.UTC(
      Number(weekendMatch[1]), Number(weekendMatch[2]) - 1, Number(weekendMatch[3]), 0, 0, 0, 0,
    ) - BEIJING_OFFSET_MS
  return {
    models: modelsWithRates,
    peakWindows: parsedWindows,
    weekendOffPeakSince: weekendSince,
    ruleVersion: 'official-' + createHash('sha256').update(JSON.stringify({ modelsWithRates, parsedWindows, weekendSince })).digest('hex').slice(0, 12),
  }
}

function applyOfficialPricing(parsed, response) {
  activePricePolicies = PRICE_POLICIES.map((policy) => {
    const models = {}
    for (const model of Object.keys(policy.models)) {
      // The live page describes the current peak/off-peak table. Historical
      // flat-rate policies must remain immutable or old migrations would receive
      // array rates and could produce NaN costs after a successful sync.
      models[model] = policy.peakOffPeak === true && parsed.models[model]
        ? parsed.models[model]
        : policy.models[model]
    }
    return { ...policy, models }
  })
  peakWindows = parsed.peakWindows.map((window) => ({ ...window }))
  weekendOffPeakSince = parsed.weekendOffPeakSince
  pricingSync = {
    status: 'synced',
    source: PRICING_SOURCE_URL,
    checkedAt: Date.now(),
    etag: response?.headers?.get?.('etag') ?? pricingSync.etag,
    lastModified: response?.headers?.get?.('last-modified') ?? pricingSync.lastModified,
    ruleVersion: parsed.ruleVersion,
    modelCount: Object.keys(parsed.models).length,
    message: '已同步官方价格页',
  }
}

async function syncOfficialPricing(logger) {
  if (typeof fetch !== 'function') return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PRICING_SYNC_TIMEOUT_MS)
  let stage = 'network'
  try {
    const headers = {}
    if (pricingSync.etag) headers['if-none-match'] = pricingSync.etag
    if (pricingSync.lastModified) headers['if-modified-since'] = pricingSync.lastModified
    const response = await fetch(PRICING_SOURCE_URL, { headers, signal: controller.signal })
    if (response.status === 304) {
      pricingSync = { ...pricingSync, status: 'synced', checkedAt: Date.now(), message: '官方价格页未变化' }
      return
    }
    if (!response.ok) throw new Error('official pricing page returned ' + response.status)
    stage = 'parse'
    const parsed = parseOfficialPricingHtml(await response.text())
    applyOfficialPricing(parsed, response)
  } catch (error) {
    const hasValidatedOfficialRule = typeof pricingSync.ruleVersion === 'string' && pricingSync.ruleVersion.startsWith('official-')
    pricingSync = {
      ...pricingSync,
      status: stage === 'parse' ? 'review-required' : 'offline',
      checkedAt: Date.now(),
      message: stage === 'parse'
        ? '官方价格页结构有变化，需要复核'
        : hasValidatedOfficialRule ? '官方价格页暂时不可用，沿用上次已验证规则' : '官方价格页暂时不可用，使用内置规则',
    }
    if (logger && typeof logger.warn === 'function') logger.warn('dsh-wallet: official pricing sync unavailable')
  } finally {
    clearTimeout(timeout)
  }
}

export function pricingSnapshot() {
  return {
    status: pricingSync.status,
    source: pricingSync.source,
    checkedAt: pricingSync.checkedAt,
    ruleVersion: pricingSync.ruleVersion,
    message: pricingSync.message,
    modelCount: pricingSync.modelCount,
    peakWindows: peakWindows.map((window) => ({ ...window })),
    weekendOffPeakSince,
  }
}

function readPackageManifest(path) {
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    return manifest !== null && typeof manifest === 'object' ? manifest : null
  } catch {
    return null
  }
}

function detectHostManifest() {
  const starts = [
    typeof process.cwd === 'function' ? process.cwd() : null,
    typeof process.argv?.[1] === 'string' ? dirname(process.argv[1]) : null,
  ].filter(Boolean)
  const seen = new Set()
  for (const start of starts) {
    let current = start
    for (let depth = 0; depth < 10 && current !== dirname(current); depth += 1) {
      if (seen.has(current)) break
      seen.add(current)
      const manifest = readPackageManifest(join(current, 'package.json'))
      if (manifest && ['@deepseek-ai/dsh-root', '@deepseek-ai/dsh'].includes(manifest.name)) {
        return { name: manifest.name, version: typeof manifest.version === 'string' ? manifest.version : null }
      }
      current = dirname(current)
    }
  }
  return { name: null, version: null }
}

function compareVersions(left, right) {
  const parse = (value) => {
    const match = typeof value === 'string' && value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
    if (match === null) return null
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] || '' }
  }
  const a = parse(left)
  const b = parse(right)
  if (a === null || b === null) return null
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1
  }
  if (a.pre === b.pre) return 0
  if (a.pre === '') return 1
  if (b.pre === '') return -1
  return a.pre.localeCompare(b.pre, 'en', { numeric: true })
}

const HOST_MANIFEST = detectHostManifest()

export function hostHealthSnapshot() {
  const hostVersion = HOST_MANIFEST.version
  const comparison = compareVersions(hostVersion, MIN_HOST_VERSION)
  const compatibility = comparison === null
    ? { status: 'unknown', minimumVersion: MIN_HOST_VERSION, message: '无法读取 Harness 版本' }
    : comparison >= 0
      ? { status: 'compatible', minimumVersion: MIN_HOST_VERSION, message: '满足插件最低版本要求' }
      : { status: 'upgrade-recommended', minimumVersion: MIN_HOST_VERSION, message: 'Harness 版本低于插件建议版本' }
  return {
    name: HOST_MANIFEST.name,
    version: hostVersion,
    detected: hostVersion !== null,
    compatibility,
  }
}

export function healthSnapshot() {
  return {
    ok: true,
    plugin: { name: 'deepseek-harness-wallet', version: PLUGIN_VERSION },
    host: hostHealthSnapshot(),
    pricing: pricingSnapshot(),
    accounts: accountStorageSnapshot(),
    usage: usageStorageSnapshot(),
    plans: planHealthSnapshot(),
    runtime: { node: process.version, platform: process.platform },
  }
}

export function ratesFor(model, atMs) {
  let entry
  for (const policy of activePricePolicies) {
    // Own-property check: a model named `__proto__`/`toString` would otherwise
    // resolve to an Object.prototype member and produce NaN costs.
    if (atMs >= policy.since && Object.hasOwn(policy.models, model)) entry = policy
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
  if (priced === true) return { models: {}, cost: 0, priced: true, unpriced: 0 }
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
  let modelCount = 0
  for (const [model, counters] of Object.entries(source)) {
    if (boundedString(model, 160) === null || model === '__proto__' || model === 'prototype' || model === 'constructor') continue
    models[model] = normalizeCounters(counters)
    modelCount += 1
    if (modelCount >= 500) break
  }
  return models
}

function migratedOfficialBucket(value, atMs) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const models = normalizeModels(source.models)
  if (typeof source.cost === 'number' && Number.isFinite(source.cost) && source.cost >= 0 && typeof source.priced === 'boolean') {
    const storedUnpriced = Number.isInteger(source.unpriced) && source.unpriced >= 0 ? source.unpriced : 0
    const unpriced = source.priced === false ? Math.max(1, storedUnpriced) : storedUnpriced
    return { models, cost: source.cost, priced: unpriced === 0, unpriced }
  }
  let cost = 0
  let unpriced = 0
  for (const [model, counters] of Object.entries(models)) {
    const valueAtMigration = costOf(model, counters, atMs)
    if (valueAtMigration === null) unpriced = 1
    else cost += valueAtMigration
  }
  return { models, cost, priced: unpriced === 0, unpriced }
}

const HISTORY_KEY_RE = /^[a-f0-9]{64}$/

function emptyHistory() {
  return { version: HISTORY_VERSION, timezone: HISTORY_TIMEZONE, retentionDays: HISTORY_RETENTION_DAYS, events: {} }
}

function historyUsageCounters(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return normalizeCounters({
    input: source.input ?? source.inputTokens,
    output: source.output ?? source.outputTokens,
    cacheRead: source.cacheRead ?? source.cacheReadTokens,
    cacheWrite: source.cacheWrite ?? source.cacheWriteTokens,
    reasoning: source.reasoning ?? source.reasoningTokens,
  })
}

function boundedString(value, max = 120) {
  return typeof value === 'string' && value !== '' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : null
}

function finiteInteger(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function historyIdentity(options, usage, sessionId, provider, model) {
  const request = options !== null && typeof options === 'object' ? options : {}
  const report = usage !== null && typeof usage === 'object' ? usage : {}
  const meta = request.meta !== null && typeof request.meta === 'object' ? request.meta : {}
  const turn = finiteInteger(request.turn ?? meta.turn ?? report.turn)
  const step = finiteInteger(request.step ?? meta.step ?? report.step)
  const purpose = boundedString(request.purpose, 40) || ''
  if (turn !== null && step !== null) {
    return { kind: 'turn-step', turn, step, raw: 'turn-step|' + sessionId + '|' + provider + '|' + model + '|' + turn + '|' + step + '|' + purpose }
  }
  const requestId = boundedString(request.usageId ?? request.requestId ?? request.id ?? report.usageId ?? report.requestId, 160)
  if (requestId !== null) return { kind: 'request-id', requestId, raw: 'request-id|' + sessionId + '|' + provider + '|' + model + '|' + requestId }
  return { kind: 'generated', raw: 'generated|' + randomUUID() }
}

function historyEventId(identity) {
  return createHash('sha256').update(identity.raw).digest('hex')
}

function normalizeHistoryEvent(value, eventId, nowMs = Date.now()) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const occurredAt = typeof source.occurredAt === 'number' && Number.isFinite(source.occurredAt)
    ? source.occurredAt
    : typeof source.atMs === 'number' && Number.isFinite(source.atMs) ? source.atMs : NaN
  const day = historyDayKey(occurredAt)
  const sessionId = boundedString(source.sessionId, 160)
  const provider = boundedString(source.provider, 100)
  const model = boundedString(source.model, 160)
  if (day === null || sessionId === null || provider === null || model === null) return null
  const usage = historyUsageCounters(source.usage ?? source.counters)
  // Repair the brief v0.3.3 state where a Z.ai route could be checked as a
  // DeepSeek official alias. Historical token counts remain intact, while the
  // provider is moved back to the non-priced third-party side.
  const official = !isPlanProvider(provider) && source.official === true
  const rawCost = Number(source.cost)
  const cost = official && source.priced === true && Number.isFinite(rawCost) && rawCost >= 0 ? rawCost : null
  const identity = source.identity !== null && typeof source.identity === 'object' ? source.identity : null
  return {
    occurredAt,
    day,
    sessionId,
    provider,
    model,
    official,
    usage,
    cost,
    priced: official && cost !== null,
    identity: identity && (identity.kind === 'turn-step' || identity.kind === 'request-id')
      ? { kind: identity.kind, turn: finiteInteger(identity.turn), step: finiteInteger(identity.step), requestId: boundedString(identity.requestId, 160) }
      : null,
    schema: HISTORY_VERSION,
    observedAt: Number.isFinite(nowMs) ? nowMs : Date.now(),
    eventId: HISTORY_KEY_RE.test(eventId) ? eventId : createHash('sha256').update(JSON.stringify({ occurredAt, sessionId, provider, model, usage })).digest('hex'),
  }
}

export function normalizeHistory(value, atMs = Date.now()) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const rawEvents = source.events !== null && typeof source.events === 'object' && !Array.isArray(source.events) ? source.events : {}
  const window = historyWindow(atMs)
  const byId = new Map()
  for (const [rawId, rawEvent] of Object.entries(rawEvents)) {
    const event = normalizeHistoryEvent(rawEvent, rawId, atMs)
    if (event === null || event.day < window.from || event.day > window.to) continue
    const id = event.eventId
    const previous = byId.get(id)
    if (previous === undefined || event.occurredAt >= previous.occurredAt) byId.set(id, event)
  }
  const events = {}
  const sorted = [...byId.entries()].sort((left, right) => right[1].occurredAt - left[1].occurredAt).slice(0, HISTORY_MAX_EVENTS)
  for (const [id, event] of sorted.reverse()) events[id] = event
  return { version: HISTORY_VERSION, timezone: HISTORY_TIMEZONE, retentionDays: HISTORY_RETENTION_DAYS, events }
}

function createHistoryEvent(options, usage, atMs, officialProviders) {
  const request = options !== null && typeof options === 'object' ? options : {}
  const sessionId = boundedString(request.sessionId, 160)
  const provider = boundedString(request.provider, 100)
  const model = boundedString(request.model ?? request.modelName, 160)
  const day = historyDayKey(atMs)
  if (sessionId === null || provider === null || model === null || day === null) return null
  const identity = historyIdentity(request, usage, sessionId, provider, model)
  const official = isOfficialProvider(provider, officialProviders)
  const counters = historyUsageCounters(usage)
  const cost = official ? costOf(model, counters, atMs) : null
  return {
    occurredAt: atMs,
    day,
    sessionId,
    provider,
    model,
    official,
    usage: counters,
    cost: official && cost !== null ? cost : null,
    priced: official && cost !== null,
    identity: identity.kind === 'generated'
      ? null
      : { kind: identity.kind, turn: identity.turn, step: identity.step, requestId: identity.requestId },
    schema: HISTORY_VERSION,
    observedAt: Date.now(),
    eventId: historyEventId(identity),
  }
}

function subtractUsage(counters, usage) {
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning']) {
    counters[key] = Math.max(0, finiteCounter(counters[key]) - finiteCounter(usage[key]))
  }
}

function removeSessionContribution(event) {
  const session = store.sessions[event.sessionId]
  if (session === null || typeof session !== 'object') return
  const bucket = event.official ? session.official : session.third
  if (bucket === null || typeof bucket !== 'object' || bucket.models === null || typeof bucket.models !== 'object') return
  const modelCounters = bucket.models[event.model]
  if (modelCounters !== null && typeof modelCounters === 'object') {
    subtractUsage(modelCounters, event.usage)
    if (Object.values(modelCounters).every((value) => finiteCounter(value) === 0)) delete bucket.models[event.model]
  }
  if (event.official) {
    if (event.priced === true && typeof bucket.cost === 'number') {
      bucket.cost = Math.max(0, bucket.cost - (event.cost || 0))
    } else {
      const currentUnpriced = Number.isInteger(bucket.unpriced) && bucket.unpriced >= 0
        ? bucket.unpriced
        : bucket.priced === false ? 1 : 0
      bucket.unpriced = Math.max(0, currentUnpriced - 1)
      bucket.priced = bucket.unpriced === 0
    }
  } else if (bucket.routes && bucket.routes[event.provider] && bucket.routes[event.provider].models) {
    const routeCounters = bucket.routes[event.provider].models[event.model]
    if (routeCounters !== null && typeof routeCounters === 'object') {
      subtractUsage(routeCounters, event.usage)
      if (Object.values(routeCounters).every((value) => finiteCounter(value) === 0)) {
        delete bucket.routes[event.provider].models[event.model]
      }
      if (Object.keys(bucket.routes[event.provider].models).length === 0) delete bucket.routes[event.provider]
    }
  }
}

let historyPrunedDay = null
let historyEventCount = 0

function recordHistoryEvent(event) {
  if (event === null) return
  if (store.history === null || typeof store.history !== 'object' || store.history.events === null || typeof store.history.events !== 'object' || Array.isArray(store.history.events)) {
    store.history = emptyHistory()
    historyEventCount = 0
  }
  if (!Object.hasOwn(store.history.events, event.eventId)) historyEventCount += 1
  store.history.events[event.eventId] = event
  const currentDay = historyDayKey(Date.now())
  const pruneDay = historyPrunedDay !== null && currentDay !== null && currentDay < historyPrunedDay ? historyPrunedDay : currentDay
  if (historyPrunedDay !== pruneDay || historyEventCount > HISTORY_MAX_EVENTS) {
    const pruneAt = pruneDay === currentDay ? Date.now() : (historyDayStartMs(pruneDay) ?? Date.now()) + 12 * 3_600_000
    store.history = normalizeHistory(store.history, pruneAt)
    historyEventCount = Object.keys(store.history.events).length
    historyPrunedDay = pruneDay
  }
}

function historyTokenTotal(counters) {
  if (counters === null || typeof counters !== 'object') return 0
  return finiteCounter(counters.input) + finiteCounter(counters.output) + finiteCounter(counters.cacheRead) + finiteCounter(counters.cacheWrite)
}

function emptyHistoryAggregate() {
  return { tokens: emptyCounters(), calls: 0, cost: 0, priced: true }
}

function addHistoryAggregate(target, event) {
  addUsage(target.tokens, event.usage)
  target.calls += 1
  if (event.official) {
    if (event.priced && event.cost !== null) target.cost += event.cost
    else target.priced = false
  }
}

function publicHistoryAggregate(aggregate, hasOfficial = true) {
  const hasCalls = aggregate.calls > 0
  return {
    tokens: aggregate.tokens,
    totalTokens: historyTokenTotal(aggregate.tokens),
    calls: aggregate.calls,
    cost: hasOfficial && hasCalls && aggregate.priced ? aggregate.cost : null,
    priced: hasOfficial && hasCalls && aggregate.priced,
  }
}

function historyAggregate(events) {
  const official = emptyHistoryAggregate()
  const third = emptyHistoryAggregate()
  const models = new Map()
  let cacheInput = 0
  let cacheRead = 0
  for (const event of events) {
    const target = event.official ? official : third
    addHistoryAggregate(target, event)
    cacheInput += finiteCounter(event.usage.input)
    cacheRead += finiteCounter(event.usage.cacheRead)
    const key = event.provider + '\u0000' + event.model
    let model = models.get(key)
    if (model === undefined) {
      model = { provider: event.provider, model: event.model, official: event.official, ...emptyHistoryAggregate() }
      models.set(key, model)
    }
    addHistoryAggregate(model, event)
  }
  const total = emptyHistoryAggregate()
  for (const source of [official, third]) {
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning']) total.tokens[key] += source.tokens[key]
    total.calls += source.calls
  }
  total.cost = official.cost
  total.priced = official.priced
  const publicModels = [...models.values()].map((model) => {
    const aggregate = publicHistoryAggregate(model, model.official)
    const priced = model.official ? null : customCostOf(model.provider, model.model, model.tokens, store.customPrices)
    return {
      provider: model.provider,
      model: model.model,
      official: model.official,
      ...aggregate,
      customCost: priced === null ? null : { cost: priced.cost, currency: priced.currency },
    }
  })
  const customCosts = customCostTotals(publicModels)
  return {
    official: publicHistoryAggregate(official, true),
    third: { ...publicHistoryAggregate(third, false), customCosts },
    total: { ...publicHistoryAggregate(total, official.calls > 0), customCosts },
    cacheHitRate: cacheInput + cacheRead > 0 ? Math.round(cacheRead / (cacheInput + cacheRead) * 1000) / 10 : null,
    models: publicModels,
  }
}

export function historyView({ days = HISTORY_RETENTION_DAYS, date = null, sessionId = null, atMs = Date.now() } = {}) {
  const window = historyWindow(atMs, days)
  const sourceEvents = store.history && store.history.events ? Object.values(store.history.events) : []
  const filtered = sourceEvents.filter((event) => event.day >= window.from && event.day <= window.to && (sessionId === null || event.sessionId === sessionId))
  const byDay = new Map()
  for (const event of filtered) {
    if (!byDay.has(event.day)) byDay.set(event.day, [])
    byDay.get(event.day).push(event)
  }
  const daysOut = []
  for (let index = 0; index < window.days; index += 1) {
    const day = shiftHistoryDay(window.from, index)
    const events = byDay.get(day) || []
    const aggregate = historyAggregate(events)
    const dayStart = historyDayStartMs(day)
    daysOut.push({
      date: day,
      weekday: dayStart === null ? null : new Date(dayStart + BEIJING_OFFSET_MS).getUTCDay(),
      ...aggregate.total,
      official: aggregate.official,
      third: aggregate.third,
      cacheHitRate: aggregate.cacheHitRate,
    })
  }
  const total = historyAggregate(filtered)
  const todayEvents = byDay.get(window.to) || []
  const monthPrefix = window.to.slice(0, 7)
  const monthEvents = filtered.filter((event) => event.day.startsWith(monthPrefix))
  const selectedEvents = typeof date === 'string' ? (byDay.get(date) || []) : []
  const selectedAggregate = typeof date === 'string' && date >= window.from && date <= window.to ? historyAggregate(selectedEvents) : null
  return {
    ok: true,
    timezone: HISTORY_TIMEZONE,
    retentionDays: HISTORY_RETENTION_DAYS,
    storage: usageStorageSnapshot(),
    window,
    summary: {
      total: total.total,
      today: historyAggregate(todayEvents).total,
      month: historyAggregate(monthEvents).total,
      cacheHitRate: total.cacheHitRate,
    },
    days: daysOut,
    selected: selectedAggregate === null ? null : {
      date,
      ...selectedAggregate,
      breakdown: selectedAggregate.models,
    },
  }
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
    if (isPlanProvider(item)) continue
    seen.add(item)
    if (seen.size >= 20) break
  }
  return [...seen]
}

export function isPlanProvider(provider) {
  return typeof provider === 'string' && PLAN_PROVIDER_IDS.has(provider)
}

export function isOfficialProvider(provider, extraProviders) {
  if (isPlanProvider(provider)) return false
  if (provider === OFFICIAL_PROVIDER) return true
  return Array.isArray(extraProviders) && extraProviders.includes(provider)
}

function customPriceRate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > CUSTOM_PRICE_MAX_RATE) return null
  return Math.round(value * 1_000_000) / 1_000_000
}

/** Normalize one exact third-party provider/model price rule (rates are per 1M tokens). */
export function normalizeCustomPriceRule(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const provider = boundedString(source.provider, 100)
  const model = boundedString(source.model, 160)
  const currency = typeof source.currency === 'string' ? source.currency.toUpperCase() : ''
  const input = customPriceRate(source.input)
  const cacheRead = customPriceRate(source.cacheRead)
  const cacheWrite = customPriceRate(source.cacheWrite)
  const output = customPriceRate(source.output)
  if (provider === null || model === null || !/^[A-Z]{3}$/.test(currency)) return null
  if (provider === OFFICIAL_PROVIDER || isPlanProvider(provider)) return null
  if (provider === '__proto__' || provider === 'prototype' || provider === 'constructor') return null
  if (model === '__proto__' || model === 'prototype' || model === 'constructor') return null
  if ([input, cacheRead, cacheWrite, output].some((rate) => rate === null)) return null
  return { provider, model, currency, input, cacheRead, cacheWrite, output }
}

/** Normalize, deduplicate, and bound persisted custom third-party price rules. */
export function normalizeCustomPrices(value) {
  if (!Array.isArray(value)) return []
  const rules = new Map()
  for (const candidate of value) {
    const rule = normalizeCustomPriceRule(candidate)
    if (rule === null) continue
    const key = rule.provider + '\u0000' + rule.model
    if (rules.has(key)) rules.delete(key)
    rules.set(key, rule)
    if (rules.size > CUSTOM_PRICE_MAX_RULES) rules.delete(rules.keys().next().value)
  }
  return [...rules.values()]
}

/** Price one exact third-party route from user-entered per-million-token rates. */
export function customCostOf(provider, model, usage, rules) {
  if (typeof provider !== 'string' || typeof model !== 'string') return null
  const rule = normalizeCustomPrices(rules).find((entry) => entry.provider === provider && entry.model === model)
  if (rule === undefined) return null
  const counters = historyUsageCounters(usage)
  const cost = (
    counters.input * rule.input
    + counters.cacheRead * rule.cacheRead
    + counters.cacheWrite * rule.cacheWrite
    + counters.output * rule.output
  ) / 1e6
  return { cost, currency: rule.currency, rule }
}

function normalizeThirdPartyRoutes(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const routes = {}
  let providers = 0
  let models = 0
  for (const [provider, rawProvider] of Object.entries(source)) {
    if (boundedString(provider, 100) === null || provider === OFFICIAL_PROVIDER || isPlanProvider(provider)) continue
    if (provider === '__proto__' || provider === 'prototype' || provider === 'constructor') continue
    const rawModels = rawProvider !== null && typeof rawProvider === 'object' && !Array.isArray(rawProvider)
      ? rawProvider.models
      : null
    const normalizedModels = normalizeModels(rawModels)
    if (Object.keys(normalizedModels).length === 0) continue
    routes[provider] = { models: normalizedModels }
    providers += 1
    models += Object.keys(normalizedModels).length
    if (providers >= 100 || models >= 1_000) break
  }
  return routes
}

function customCostTotals(rows) {
  const totals = {}
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || !row.customCost) continue
    const currency = row.customCost.currency
    totals[currency] = (totals[currency] || 0) + row.customCost.cost
  }
  return totals
}

export function normalizeUiPreferences(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const normalized = {}
  for (const [key, entry] of Object.entries(source)) {
    if (!UI_PREFERENCE_KEYS.has(key)) continue
    if (typeof entry !== 'string' || entry.length > UI_PREFERENCE_VALUE_MAX || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(entry)) continue
    normalized[key] = entry
  }
  return normalized
}

function repairPlanProviderSessionUsage(sessions, historySource, atMs) {
  const rawEvents = historySource !== null && typeof historySource === 'object' && !Array.isArray(historySource)
    && historySource.events !== null && typeof historySource.events === 'object' && !Array.isArray(historySource.events)
    ? historySource.events
    : {}
  let repaired = 0
  for (const [eventId, rawEvent] of Object.entries(rawEvents)) {
    if (rawEvent === null || typeof rawEvent !== 'object' || Array.isArray(rawEvent) || rawEvent.official !== true) continue
    const event = normalizeHistoryEvent(rawEvent, eventId, atMs)
    if (event === null || !isPlanProvider(event.provider)) continue
    const session = sessions[event.sessionId]
    const official = session && session.official
    const sourceCounters = official && official.models && official.models[event.model]
    if (sourceCounters === null || typeof sourceCounters !== 'object') continue
    const keys = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning']
    // A cleared or partially rebuilt session must never be resurrected from
    // history. Only move an event when its complete contribution is still
    // present in the official aggregate.
    if (!keys.every((key) => finiteCounter(sourceCounters[key]) >= finiteCounter(event.usage[key]))) continue
    if (!keys.some((key) => finiteCounter(event.usage[key]) > 0)) continue
    subtractUsage(sourceCounters, event.usage)
    if (Object.values(sourceCounters).every((value) => finiteCounter(value) === 0)) delete official.models[event.model]
    if (!Object.hasOwn(session.third.models, event.model)) session.third.models[event.model] = emptyCounters()
    addUsage(session.third.models[event.model], event.usage)
    const rawCost = Number(rawEvent.cost)
    if (rawEvent.priced === true && Number.isFinite(rawCost) && rawCost >= 0) {
      const currentCost = typeof official.cost === 'number' && Number.isFinite(official.cost) && official.cost >= 0 ? official.cost : 0
      official.cost = Math.max(0, currentCost - rawCost)
    } else {
      const currentUnpriced = Number.isInteger(official.unpriced) && official.unpriced >= 0 ? official.unpriced : 0
      official.unpriced = Math.max(0, currentUnpriced - 1)
      official.priced = official.unpriced === 0
    }
    repaired += 1
  }
  return repaired
}

export function normalizeStoreData(value, atMs = Date.now()) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const rawSessions = source.sessions !== null && typeof source.sessions === 'object' && !Array.isArray(source.sessions)
    ? source.sessions
    : {}
  const sessions = {}
  let sessionCount = 0
  for (const [sessionId, value] of Object.entries(rawSessions)) {
    if (boundedString(sessionId, 160) === null || sessionId === '__proto__' || sessionId === 'prototype' || sessionId === 'constructor') continue
    const rawSession = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
    sessions[sessionId] = {
      official: migratedOfficialBucket(rawSession.official, atMs),
      third: {
        models: normalizeModels(rawSession.third && rawSession.third.models),
        routes: normalizeThirdPartyRoutes(rawSession.third && rawSession.third.routes),
      },
    }
    sessionCount += 1
    if (sessionCount >= 5_000) break
  }
  const normalized = {
    version: STORE_VERSION,
    thresholds: normalizeThresholds(source.thresholds && Object.keys(source.thresholds).length > 0 ? source.thresholds : { CNY: normalizeThreshold(source.threshold) }),
    accountThresholds: normalizeAccountThresholds(source.accountThresholds),
    sessions,
    officialProviders: normalizeProviderList(source.officialProviders),
    knownProviders: normalizeProviderList(source.knownProviders),
    customPrices: normalizeCustomPrices(source.customPrices),
    plans: normalizePlanSnapshotCache(source.plans, atMs),
    preferences: normalizeUiPreferences(source.preferences),
  }
  if (Object.hasOwn(source, 'history')) {
    normalized.history = normalizeHistory(source.history, atMs)
    repairPlanProviderSessionUsage(normalized.sessions, source.history, atMs)
  }
  return { store: normalized, migrated: JSON.stringify(source) !== JSON.stringify(normalized) }
}

let usageStorageStatus = 'ready'
let usageStorageError = null
let usageStorageLocked = false
let usageStorageRecovered = false
let usageStoreSkipBackupOnce = false

function emptyStoreData() {
  return { version: STORE_VERSION, thresholds: { CNY: DEFAULT_THRESHOLD }, accountThresholds: {}, sessions: {}, officialProviders: [], knownProviders: [], customPrices: [], plans: {}, preferences: {}, history: emptyHistory() }
}

function readStoreFile(path) {
  const result = normalizeStoreData(JSON.parse(readFileSync(path, 'utf8')))
  result.store.history = normalizeHistory(result.store.history)
  return result
}

function loadStore() {
  const primaryExists = existsSync(STORE_PATH)
  const backupExists = existsSync(STORE_BACKUP_PATH)
  try {
    return { ...readStoreFile(STORE_PATH), recovered: false }
  } catch {
    try {
      const recovered = readStoreFile(STORE_BACKUP_PATH)
      usageStorageStatus = 'recovered'
      usageStorageRecovered = true
      usageStoreSkipBackupOnce = true
      return { ...recovered, migrated: true, recovered: true }
    } catch {
      if (primaryExists || backupExists) {
        usageStorageStatus = 'locked'
        usageStorageError = 'usage-store-unreadable'
        usageStorageLocked = true
      }
      return { store: emptyStoreData(), migrated: false, recovered: false }
    }
  }
}

export function usageStorageSnapshot() {
  return {
    status: usageStorageStatus,
    error: usageStorageError,
    locked: usageStorageLocked,
    recovered: usageStorageRecovered,
    backup: existsSync(STORE_BACKUP_PATH),
    retentionDays: HISTORY_RETENTION_DAYS,
  }
}

let saveTimer = null
const loadedStore = loadStore()
let store = loadedStore.store
let storeNeedsSave = loadedStore.migrated || loadedStore.recovered
historyPrunedDay = historyDayKey(Date.now())
historyEventCount = store.history && store.history.events ? Object.keys(store.history.events).length : 0

function persistStore(logger) {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (usageStorageLocked) {
    if (logger && typeof logger.warn === 'function') logger.warn('dsh-wallet: usage store is locked; refusing to overwrite unreadable data')
    return
  }
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true, mode: 0o700 })
    const tmp = STORE_PATH + '.tmp'
    // Owner-only: the store carries usage accounting next to credential files.
    writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 })
    chmodSync(tmp, 0o600)
    if (existsSync(STORE_PATH) && !usageStoreSkipBackupOnce) {
      copyFileSync(STORE_PATH, STORE_BACKUP_PATH)
      chmodSync(STORE_BACKUP_PATH, 0o600)
    }
    renameSync(tmp, STORE_PATH)
    chmodSync(STORE_PATH, 0o600)
    if (!existsSync(STORE_BACKUP_PATH)) {
      copyFileSync(STORE_PATH, STORE_BACKUP_PATH)
      chmodSync(STORE_BACKUP_PATH, 0o600)
    }
    usageStoreSkipBackupOnce = false
    usageStorageError = null
    usageStorageStatus = usageStorageRecovered ? 'recovered' : 'ready'
  } catch (error) {
    usageStorageStatus = 'error'
    usageStorageError = 'usage-store-persist-failed'
    if (logger && typeof logger.warn === 'function') {
      logger.warn('dsh-wallet: failed to persist usage store')
    }
  }
}

function scheduleSave(logger) {
  if (usageStorageLocked || saveTimer !== null) return
  saveTimer = setTimeout(() => persistStore(logger), 500)
}

// ---------------------------------------------------------------------------
// Subscription-plan adapters. Each source is pinned to an official origin and
// a DSH credential reference. Raw responses and credentials never reach the
// browser; only normalized quota windows and bounded error enums are exposed.
// ---------------------------------------------------------------------------

const planRuntime = new Map(PLAN_ADAPTERS.map((adapter) => [adapter.id, {
  configured: null,
  checkedAt: 0,
  refreshing: false,
  error: null,
  snapshot: store.plans[adapter.id] ?? null,
}]))
const planRefreshes = new Map()

function planRuntimeFor(adapter) {
  return planRuntime.get(adapter.id)
}

function planHttpError(status) {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 429) return 'rate-limited'
  return 'upstream-unavailable'
}

function boundedPlanError(error) {
  if (error && typeof error === 'object' && typeof error.code === 'string') return error.code
  if (error && typeof error === 'object' && error.name === 'AbortError') return 'timeout'
  if (error instanceof SyntaxError) return 'invalid-response'
  if (error instanceof Error && ['invalid-plan-response', 'plan-response-rejected'].includes(error.message)) return 'invalid-response'
  return 'upstream-unavailable'
}

async function resolvePlanCredential(ctx, adapter) {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return { configured: null, key: null, error: 'credentials-unavailable' }
  try {
    const resolved = await credentials.resolve(adapter.credentialRef)
    const value = resolved && typeof resolved.value === 'string' ? resolved.value.trim() : ''
    if (value === '') return { configured: false, key: null, error: 'missing-credential' }
    if (/[\r\n\u0000]/.test(value) || value.length > 16_384) return { configured: true, key: null, error: 'invalid-credential' }
    return { configured: true, key: value, error: null }
  } catch {
    return { configured: null, key: null, error: 'credentials-unavailable' }
  }
}

async function performPlanRefresh(ctx, adapter, force) {
  const runtime = planRuntimeFor(adapter)
  const auth = await resolvePlanCredential(ctx, adapter)
  runtime.checkedAt = Date.now()
  runtime.configured = auth.configured
  if (auth.key === null) {
    runtime.error = auth.error
    return
  }
  if (!force && runtime.snapshot !== null && Date.now() - runtime.snapshot.fetchedAt < PLAN_REFRESH_MS) {
    runtime.error = null
    return
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PLAN_REFRESH_TIMEOUT_MS)
  try {
    const response = await fetch(adapter.endpoint, {
      method: 'GET',
      headers: {
        authorization: auth.key,
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'content-type': 'application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = new Error(planHttpError(response.status))
      error.code = planHttpError(response.status)
      throw error
    }
    const body = await response.text()
    if (Buffer.byteLength(body, 'utf8') > PLAN_RESPONSE_MAX_BYTES) {
      const error = new Error('invalid-response')
      error.code = 'invalid-response'
      throw error
    }
    const snapshot = normalizePlanPayload(adapter, JSON.parse(body), Date.now())
    runtime.snapshot = snapshot
    runtime.error = null
    store.plans[adapter.id] = snapshot
    scheduleSave(ctx.logger)
  } catch (error) {
    runtime.error = boundedPlanError(error)
    if (ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn('dsh-wallet: subscription plan refresh failed for ' + adapter.id)
  } finally {
    clearTimeout(timer)
  }
}

function refreshPlan(ctx, adapter, force = false) {
  const active = planRefreshes.get(adapter.id)
  if (active !== undefined) return active
  const runtime = planRuntimeFor(adapter)
  runtime.refreshing = true
  const promise = performPlanRefresh(ctx, adapter, force).finally(() => {
    runtime.refreshing = false
    planRefreshes.delete(adapter.id)
  })
  planRefreshes.set(adapter.id, promise)
  return promise
}

async function refreshPlans(ctx, options = {}) {
  const force = options.force === true
  const adapter = options.id === undefined || options.id === null ? null : planAdapterById(options.id)
  if (options.id !== undefined && options.id !== null && adapter === null) return { ok: false, error: 'plan-not-found' }
  const targets = adapter === null ? PLAN_ADAPTERS : [adapter]
  await Promise.all(targets.map((item) => refreshPlan(ctx, item, force)))
  return { ok: true, ...planView() }
}

export function planView(atMs = Date.now()) {
  const sources = PLAN_ADAPTERS.map((adapter) => {
    const runtime = planRuntimeFor(adapter)
    const snapshot = runtime.snapshot
    return {
      id: adapter.id,
      provider: adapter.provider,
      name: adapter.name,
      region: adapter.region,
      kind: adapter.kind,
      sourceDomain: adapter.sourceDomain,
      configured: runtime.configured,
      available: snapshot !== null,
      refreshing: runtime.refreshing,
      checkedAt: runtime.checkedAt || null,
      fetchedAt: snapshot === null ? null : snapshot.fetchedAt,
      stale: snapshot !== null && atMs - snapshot.fetchedAt > PLAN_STALE_MS,
      error: runtime.error,
      level: snapshot === null ? null : snapshot.level,
      limits: snapshot === null ? [] : snapshot.limits,
    }
  })
  return {
    sources,
    configuredCount: sources.filter((source) => source.configured === true).length,
    availableCount: sources.filter((source) => source.available).length,
    refreshing: sources.some((source) => source.refreshing),
  }
}

function planHealthSnapshot() {
  const view = planView()
  return {
    status: view.sources.some((source) => source.configured === true && source.available) ? 'ready'
      : view.sources.some((source) => source.configured === true) ? 'error'
        : view.sources.some((source) => source.configured === null) ? 'unknown' : 'unconfigured',
    configuredCount: view.configuredCount,
    availableCount: view.availableCount,
    refreshing: view.refreshing,
    sources: view.sources.map((source) => ({ id: source.id, configured: source.configured, available: source.available, stale: source.stale, error: source.error, fetchedAt: source.fetchedAt, sourceDomain: source.sourceDomain })),
  }
}

// ---------------------------------------------------------------------------
// Multi-account store (accounts.json): list, add, remove, hot-switch.
// Keys remain available in memory for the active LLM/balance request, but are
// encrypted at rest. Windows uses the current user's DPAPI; other platforms
// use an owner-only AES-GCM key file as a best-effort local fallback.
// ---------------------------------------------------------------------------

const WINDOWS_DPAPI_PROTECT = [
  '$ErrorActionPreference = "Stop"',
  'Add-Type -AssemblyName System.Security',
  '$encoded = [Console]::In.ReadToEnd().Trim()',
  '$bytes = [Convert]::FromBase64String($encoded)',
  '$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
  '[Console]::Out.Write([Convert]::ToBase64String($protected))',
].join(';')
const WINDOWS_DPAPI_UNPROTECT = [
  '$ErrorActionPreference = "Stop"',
  'Add-Type -AssemblyName System.Security',
  '$encoded = [Console]::In.ReadToEnd().Trim()',
  '$protected = [Convert]::FromBase64String($encoded)',
  '$bytes = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
  '[Console]::Out.Write([Convert]::ToBase64String($bytes))',
].join(';')
let fallbackEncryptionKey = null
let accountStorageScheme = process.platform === 'win32' ? 'windows-dpapi' : 'aes-gcm-file-key'
let accountStorageError = null
let accountStorageLocked = false
let accountStorageRecovered = false
let accountStoreSkipBackupOnce = false

function runWindowsDpapi(operation, value) {
  if (process.platform !== 'win32') return null
  // Protect expects base64-encoded UTF-8 plaintext. Unprotect expects the
  // DPAPI ciphertext's own base64 representation, so encoding it a second
  // time makes every persisted account undecryptable after restart.
  const input = operation === 'protect'
    ? Buffer.from(value, 'utf8').toString('base64')
    : value
  const result = spawnSync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', operation === 'protect' ? WINDOWS_DPAPI_PROTECT : WINDOWS_DPAPI_UNPROTECT],
    {
      input,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  )
  if (result.error || result.status !== 0) return null
  const output = String(result.stdout || '').trim()
  return output === '' ? null : output
}

function getFallbackEncryptionKey(createIfMissing = true) {
  if (fallbackEncryptionKey !== null) return fallbackEncryptionKey
  try {
    mkdirSync(dirname(ACCOUNTS_KEY_PATH), { recursive: true, mode: 0o700 })
    if (existsSync(ACCOUNTS_KEY_PATH)) {
      const existing = readFileSync(ACCOUNTS_KEY_PATH)
      if (existing.length !== 32) throw new Error('account encryption key has an invalid length')
      fallbackEncryptionKey = existing
    } else {
      if (!createIfMissing) {
        accountStorageError = 'account-encryption-key-missing'
        accountStorageLocked = true
        return null
      }
      fallbackEncryptionKey = randomBytes(32)
      writeFileSync(ACCOUNTS_KEY_PATH, fallbackEncryptionKey, { mode: 0o600 })
      chmodSync(ACCOUNTS_KEY_PATH, 0o600)
    }
    return fallbackEncryptionKey
  } catch {
    accountStorageError = 'account-encryption-key-unavailable'
    accountStorageLocked = true
    return null
  }
}

function encryptApiKeyAes(apiKey, key, iv = randomBytes(12)) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('AES account key must contain 32 bytes')
  if (!Buffer.isBuffer(iv) || iv.length !== 12) throw new Error('AES-GCM IV must contain 12 bytes')
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  return {
    version: ACCOUNTS_CRYPTO_VERSION,
    scheme: 'aes-gcm-file-key',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    payload: ciphertext.toString('base64'),
  }
}

function decryptApiKeyAes(value, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('AES account key must contain 32 bytes')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(value.payload, 'base64')), decipher.final()]).toString('utf8')
}

export const __testing = { encryptApiKeyAes, decryptApiKeyAes, compareVersions, applyOfficialPricing }

function protectApiKey(apiKey) {
  const dpapi = runWindowsDpapi('protect', apiKey)
  if (dpapi !== null) {
    accountStorageScheme = 'windows-dpapi'
    accountStorageError = null
    return { version: ACCOUNTS_CRYPTO_VERSION, scheme: 'windows-dpapi', payload: dpapi }
  }
  const key = getFallbackEncryptionKey()
  if (key === null) return null
  try {
    const encrypted = encryptApiKeyAes(apiKey, key)
    accountStorageScheme = 'aes-gcm-file-key'
    return encrypted
  } catch {
    accountStorageError = 'account-encryption-failed'
    return null
  }
}

function unprotectApiKey(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    accountStorageError = 'account-encrypted-record-invalid'
    accountStorageLocked = true
    return ''
  }
  if (value.version !== ACCOUNTS_CRYPTO_VERSION || typeof value.scheme !== 'string' || typeof value.payload !== 'string') {
    accountStorageError = 'account-encrypted-record-invalid'
    accountStorageLocked = true
    return ''
  }
  if (value.scheme === 'windows-dpapi') {
    const decoded = runWindowsDpapi('unprotect', value.payload)
    if (decoded === null) {
      accountStorageError = 'account-decryption-failed'
      accountStorageLocked = true
    }
    else {
      accountStorageScheme = 'windows-dpapi'
      try { return Buffer.from(decoded, 'base64').toString('utf8') } catch { /* fall through */ }
      accountStorageError = 'account-decryption-failed'
      accountStorageLocked = true
    }
    return ''
  }
  if (value.scheme !== 'aes-gcm-file-key' || typeof value.iv !== 'string' || typeof value.tag !== 'string') {
    accountStorageError = 'account-encrypted-record-invalid'
    accountStorageLocked = true
    return ''
  }
  accountStorageScheme = 'aes-gcm-file-key'
  const key = getFallbackEncryptionKey(false)
  if (key === null) return ''
  try {
    return decryptApiKeyAes(value, key)
  } catch {
    accountStorageError = 'account-decryption-failed'
    accountStorageLocked = true
    return ''
  }
}

export function accountStorageSnapshot() {
  return {
    encryptedAtRest: true,
    scheme: accountStorageScheme,
    status: accountStorageLocked ? 'locked' : accountStorageRecovered ? 'recovered' : accountStorageError === null ? 'ready' : 'error',
    error: accountStorageError,
    locked: accountStorageLocked,
  }
}

function emptyAccounts() {
  return { version: ACCOUNTS_VERSION, accounts: [], activeId: null }
}

export function normalizeAccountsData(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const rawAccounts = Array.isArray(source.accounts) ? source.accounts : []
  const accounts = []
  for (const raw of rawAccounts) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const id = boundedString(raw.id, 100)
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    // Accept the v1 plaintext shape once so an existing installation can be
    // migrated on its next save; new writes use apiKeyEncrypted only.
    const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey : unprotectApiKey(raw.apiKeyEncrypted)
    if (id === null || name === '' || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name) || validateApiKey(apiKey) !== null) continue
    accounts.push({
      id,
      name,
      apiKey,
      createdAt: Number.isFinite(raw.createdAt) && raw.createdAt >= 0 ? raw.createdAt : Date.now(),
    })
    if (accounts.length >= 50) break
  }
  const activeId =
    typeof source.activeId === 'string' && accounts.some((account) => account.id === source.activeId)
      ? source.activeId
      : null
  return { version: ACCOUNTS_VERSION, accounts, activeId }
}

function readAccountsFile(path) {
  accountStorageError = null
  accountStorageLocked = false
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const normalized = normalizeAccountsData(raw)
  if (accountStorageLocked) throw new Error('account file contains an unreadable encrypted record')
  const legacyPlaintext = Array.isArray(raw?.accounts)
    && raw.accounts.some((account) => account && typeof account.apiKey === 'string')
  return { accounts: normalized, migrated: legacyPlaintext || raw?.version !== ACCOUNTS_VERSION }
}

function loadAccounts() {
  const primaryExists = existsSync(ACCOUNTS_PATH)
  const backupExists = existsSync(ACCOUNTS_BACKUP_PATH)
  try {
    return readAccountsFile(ACCOUNTS_PATH)
  } catch {
    try {
      const recovered = readAccountsFile(ACCOUNTS_BACKUP_PATH)
      accountStorageRecovered = true
      accountStorageError = 'account-store-restored-from-backup'
      accountStoreSkipBackupOnce = true
      return { accounts: recovered.accounts, migrated: true }
    } catch {
      if (primaryExists || backupExists) {
        accountStorageError = backupExists ? 'account-primary-and-backup-invalid' : 'account-store-invalid'
        accountStorageLocked = true
      }
      return { accounts: emptyAccounts(), migrated: false }
    }
  }
}

let accountsSaveTimer = null
const loadedAccounts = loadAccounts()
let accounts = loadedAccounts.accounts
let accountsNeedsSave = loadedAccounts.migrated

function persistAccounts(logger) {
  if (accountsSaveTimer !== null) {
    clearTimeout(accountsSaveTimer)
    accountsSaveTimer = null
  }
  try {
    if (accountStorageLocked) throw new Error('encrypted account store is locked')
    mkdirSync(dirname(ACCOUNTS_PATH), { recursive: true, mode: 0o700 })
    const tmp = ACCOUNTS_PATH + '.tmp'
    const encryptedAccounts = accounts.accounts.map((account) => {
      const apiKeyEncrypted = protectApiKey(account.apiKey)
      if (apiKeyEncrypted === null) throw new Error('account encryption unavailable')
      return {
        id: account.id,
        name: account.name,
        apiKeyEncrypted,
        createdAt: account.createdAt,
      }
    })
    writeFileSync(tmp, JSON.stringify({ version: ACCOUNTS_VERSION, accounts: encryptedAccounts, activeId: accounts.activeId }), { mode: 0o600 })
    chmodSync(tmp, 0o600)
    if (existsSync(ACCOUNTS_PATH) && !accountStoreSkipBackupOnce) {
      copyFileSync(ACCOUNTS_PATH, ACCOUNTS_BACKUP_PATH)
      chmodSync(ACCOUNTS_BACKUP_PATH, 0o600)
    }
    renameSync(tmp, ACCOUNTS_PATH)
    chmodSync(ACCOUNTS_PATH, 0o600)
    if (!existsSync(ACCOUNTS_BACKUP_PATH)) {
      copyFileSync(ACCOUNTS_PATH, ACCOUNTS_BACKUP_PATH)
      chmodSync(ACCOUNTS_BACKUP_PATH, 0o600)
    }
    accountStoreSkipBackupOnce = false
    accountsNeedsSave = false
    accountStorageRecovered = false
    accountStorageError = null
  } catch (error) {
    accountStorageError = accountStorageError || 'account-encryption-failed'
    accountStorageLocked = true
    if (logger && typeof logger.warn === 'function') {
      logger.warn('dsh-wallet: failed to persist encrypted accounts')
    }
  }
}

function scheduleAccountsSave(logger) {
  if (accountStorageLocked || accountsSaveTimer !== null) return
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
  if (trimmed.length > 512) return 'API key is too long'
  if (/\s/.test(trimmed)) return 'API key must not contain whitespace'
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return 'API key must not contain control characters'
  return null
}

export function addAccount(name, apiKey) {
  if (accounts.accounts.length >= 50) return { ok: false, error: 'account limit reached' }
  if (typeof name !== 'string' || name.trim() === '') return { ok: false, error: 'Account name must not be empty' }
  if (name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(name.trim())) return { ok: false, error: 'Account name is invalid' }
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
    storage: accountStorageSnapshot(),
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
  if (account === null) return { ok: false, error: 'account-not-found' }
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return { ok: false, error: 'credentials-unavailable' }
  try {
    await credentials.set(CREDENTIAL_REF, account.apiKey)
  } catch (error) {
    // e.g. the launching environment supplies DEEPSEEK_API_KEY read-only, so
    // the write is shadowed and refused by the credentials provider. Keep the
    // browser error bounded and do not log provider text that might contain
    // paths, environment details, or key fragments.
    if (ctx.logger && typeof ctx.logger.warn === 'function') {
      ctx.logger.warn('dsh-wallet: credential write refused')
    }
    return { ok: false, error: 'credential-write-refused' }
  }
  accounts.activeId = account.id
  scheduleAccountsSave(ctx.logger)
  void refreshBalance(ctx)
  return { ok: true, account: { id: account.id, name: account.name, maskedKey: maskKey(account.apiKey) } }
}

function addUsage(counters, usage) {
  usage = usage !== null && typeof usage === 'object' ? usage : {}
  counters.input += finiteCounter(usage.inputTokens ?? usage.input)
  counters.output += finiteCounter(usage.outputTokens ?? usage.output)
  counters.cacheRead += finiteCounter(usage.cacheReadTokens ?? usage.cacheRead)
  counters.cacheWrite += finiteCounter(usage.cacheWriteTokens ?? usage.cacheWrite)
  counters.reasoning += finiteCounter(usage.reasoningTokens ?? usage.reasoning)
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
  if (!Number.isInteger(bucket.unpriced) || bucket.unpriced < 0) bucket.unpriced = bucket.priced === false ? 1 : 0
  const cost = costOf(model, usage, atMs)
  if (cost === null) bucket.unpriced += 1
  else bucket.cost += cost
  bucket.priced = bucket.unpriced === 0
}

function recordUsage(options, usage, atMs = Date.now()) {
  const request = options !== null && typeof options === 'object' ? options : {}
  const sessionId = boundedString(request.sessionId, 160)
  const provider = boundedString(request.provider, 100)
  const model = boundedString(request.model ?? request.modelName, 160)
  if (sessionId === null || provider === null || model === null) return
  if (model === '__proto__' || model === 'prototype' || model === 'constructor') return
  if (sessionId === '__proto__' || sessionId === 'prototype' || sessionId === 'constructor') return
  // Remember every non-builtin route observed by the stream tap. The settings
  // page can then promote wrapper routes into the official billing bucket.
  if (provider !== OFFICIAL_PROVIDER && !isPlanProvider(provider) && !store.knownProviders.includes(provider)) {
    store.knownProviders = normalizeProviderList([...store.knownProviders, provider])
  }
  if (!Object.hasOwn(store.sessions, sessionId)) {
    store.sessions[sessionId] = { official: emptyBucket(true), third: { models: {}, routes: {} } }
  }
  const event = createHistoryEvent(request, usage, atMs, store.officialProviders)
  const previousEvent = event !== null && store.history && store.history.events ? store.history.events[event.eventId] : undefined
  if (previousEvent !== undefined) removeSessionContribution(previousEvent)

  const session = store.sessions[sessionId]
  const official = isOfficialProvider(provider, store.officialProviders)
  const bucket = official ? session.official : session.third
  if (official) addOfficialUsage(bucket, model, usage, atMs)
  else {
    if (!Object.hasOwn(bucket.models, model)) bucket.models[model] = emptyCounters()
    addUsage(bucket.models[model], usage)
    if (bucket.routes === null || typeof bucket.routes !== 'object' || Array.isArray(bucket.routes)) bucket.routes = {}
    if (!Object.hasOwn(bucket.routes, provider)) bucket.routes[provider] = { models: {} }
    if (!Object.hasOwn(bucket.routes[provider].models, model)) bucket.routes[provider].models[model] = emptyCounters()
    addUsage(bucket.routes[provider].models[model], usage)
  }
  recordHistoryEvent(event)
}

let balance = { fetchedAt: 0, available: false, balances: [], error: null }
let balanceRefresh = null

async function performBalanceRefresh(ctx) {
  try {
    const credentials = ctx.get('credentials')
    if (credentials === undefined) {
      balance = { fetchedAt: Date.now(), available: false, balances: [], error: 'no-credentials' }
      return
    }
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
  // Never let a refresh escape as an unhandled rejection: every caller uses
  // `void refreshBalance(ctx)`, so a throw here would take the host process
  // down (Node exits on unhandled rejections). Absorb it into the error state.
  balanceRefresh = performBalanceRefresh(ctx)
    .catch((error) => {
      balance = {
        fetchedAt: Date.now(),
        available: false,
        balances: [],
        error: 'balance-unavailable',
      }
      if (ctx && ctx.logger && typeof ctx.logger.warn === 'function') {
        ctx.logger.warn('dsh-wallet: balance refresh failed')
      }
    })
    .finally(() => {
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

function thirdPartyRouteView(bucket) {
  const routes = []
  const source = normalizeThirdPartyRoutes(bucket && bucket.routes)
  for (const [provider, providerState] of Object.entries(source)) {
    if (isPlanProvider(provider) || isOfficialProvider(provider, store.officialProviders)) continue
    for (const [model, counters] of Object.entries(providerState.models)) {
      const priced = customCostOf(provider, model, counters, store.customPrices)
      routes.push({
        provider,
        model,
        tokens: counters,
        totalTokens: historyTokenTotal(counters),
        customCost: priced === null ? null : { cost: priced.cost, currency: priced.currency },
      })
    }
  }
  return routes
}

function knownThirdPartyRoutes() {
  const found = new Map()
  for (const session of Object.values(store.sessions)) {
    for (const route of thirdPartyRouteView(session && session.third)) {
      found.set(route.provider + '\u0000' + route.model, { provider: route.provider, model: route.model })
    }
  }
  for (const event of Object.values(store.history && store.history.events ? store.history.events : {})) {
    if (!event || event.official || isPlanProvider(event.provider) || isOfficialProvider(event.provider, store.officialProviders)) continue
    const provider = boundedString(event.provider, 100)
    const model = boundedString(event.model, 160)
    if (provider !== null && model !== null) found.set(provider + '\u0000' + model, { provider, model })
    if (found.size >= 500) break
  }
  return [...found.values()].slice(0, 500)
}

function sessionView(sessionId) {
  if (sessionId === undefined || sessionId === '') return { official: null, third: null }
  // Own-property lookup only: session ids like `__proto__`, `constructor` or
  // `toString` otherwise resolve to an Object.prototype member, slip past the
  // undefined guard, and throw inside bucketTotals.
  if (!Object.prototype.hasOwnProperty.call(store.sessions, sessionId)) {
    return { official: null, third: null }
  }
  const session = store.sessions[sessionId]
  if (session === null || typeof session !== 'object'
    || session.official === null || typeof session.official !== 'object'
    || session.third === null || typeof session.third !== 'object') {
    return { official: null, third: null }
  }
  const official = bucketTotals(session.official)
  const third = bucketTotals(session.third)
  const thirdRoutes = thirdPartyRouteView(session.third)
  return {
    official: {
      tokens: official,
      cost: session.official.priced === true ? session.official.cost : null,
      priced: session.official.priced === true,
      models: session.official.models,
    },
    third: {
      tokens: third,
      models: session.third.models,
      routes: thirdRoutes,
      customCosts: customCostTotals(thirdRoutes),
    },
  }
}

function snapshotView(sessionId) {
  const currency = balanceCurrency(balance.balances)
  const active = activeAccount()
  const now = Date.now()
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
    usageStorage: usageStorageSnapshot(),
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
    pricingWindows: pricingWindowSnapshot(now),
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
      customPrices: [...store.customPrices],
      knownRoutes: knownThirdPartyRoutes(),
    },
    plans: planView(now),
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
  if (accountsNeedsSave) scheduleAccountsSave(ctx.logger)
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

  let planTimer = null
  if (config.planSync !== false) {
    void refreshPlans(ctx)
    planTimer = setInterval(() => void refreshPlans(ctx, { force: true }), PLAN_REFRESH_MS)
    if (typeof planTimer.unref === 'function') planTimer.unref()
  }

  if (config.pricingSync !== false) {
    ctx.effect(() => {
      const first = setTimeout(() => void syncOfficialPricing(ctx.logger), 1000)
      const timer = setInterval(() => void syncOfficialPricing(ctx.logger), PRICING_SYNC_INTERVAL_MS)
      if (typeof first.unref === 'function') first.unref()
      if (typeof timer.unref === 'function') timer.unref()
      return () => {
        clearTimeout(first)
        clearInterval(timer)
      }
    }, 'dsh-wallet: official pricing sync')
  }

  ctx.effect(() => {
    const disposeSnapshot = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/snapshot',
      handler: (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        return json(res, 200, snapshotView(sessionParam(req)))
      },
    })
    const disposeHealth = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/health',
      handler: (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        return json(res, 200, healthSnapshot())
      },
    })
    const disposePricingRefresh = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/pricing/refresh',
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        await syncOfficialPricing(ctx.logger)
        return json(res, 200, { ok: true, pricing: pricingSnapshot() })
      },
    })
    const disposePreferences = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/preferences',
      handler: async (req, res) => {
        if (req.method === 'GET') return json(res, 200, { ok: true, entries: { ...store.preferences } })
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        if (usageStorageLocked) return json(res, 423, { ok: false, error: 'usage-storage-locked' })
        const body = await readBody(req)
        const entries = body && body.entries
        if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) {
          return json(res, 400, { ok: false, error: 'entries object is required' })
        }
        const keys = Object.keys(entries)
        if (keys.length > UI_PREFERENCE_KEYS.size) return json(res, 400, { ok: false, error: 'invalid-preferences' })
        const patch = normalizeUiPreferences(entries)
        if (Object.keys(patch).length !== keys.length) return json(res, 400, { ok: false, error: 'invalid-preferences' })
        store.preferences = normalizeUiPreferences({ ...store.preferences, ...patch })
        scheduleSave(ctx.logger)
        return json(res, 200, { ok: true, entries: { ...store.preferences } })
      },
    })
    const disposeThreshold = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/threshold',
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        if (usageStorageLocked) return json(res, 423, { ok: false, error: 'usage-storage-locked' })
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
        if (usageStorageLocked) return json(res, 423, { ok: false, error: 'usage-storage-locked' })
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
    const disposeHistory = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/history',
      handler: (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        const raw = req.url || ''
        const query = raw.indexOf('?') >= 0 ? new URLSearchParams(raw.slice(raw.indexOf('?') + 1)) : new URLSearchParams()
        const rawDays = query.get('days')
        if (rawDays !== null && rawDays !== '' && !/^\d+$/.test(rawDays)) return json(res, 400, { ok: false, error: 'days must be an integer between 7 and 365' })
        const days = rawDays === null || rawDays === '' ? HISTORY_RETENTION_DAYS : Number(rawDays)
        if (!Number.isInteger(days) || days < 7 || days > HISTORY_RETENTION_DAYS) {
          return json(res, 400, { ok: false, error: 'days must be an integer between 7 and 365' })
        }
        const date = query.get('date')
        if (date !== null && historyDayStartMs(date) === null) return json(res, 400, { ok: false, error: 'date must be YYYY-MM-DD' })
        const session = query.get('session')
        if (session !== null && !/^session-[A-Za-z0-9-]+$/.test(session)) return json(res, 400, { ok: false, error: 'session must be a valid session id' })
        return json(res, 200, historyView({ days, date, sessionId: session, atMs: Date.now() }))
      },
    })
    const disposeClearHistory = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/clear-history',
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        if (usageStorageLocked) return json(res, 423, { ok: false, error: 'usage-storage-locked' })
        const previous = store.history && store.history.events ? Object.keys(store.history.events).length : 0
        store.history = emptyHistory()
        historyPrunedDay = historyDayKey(Date.now())
        historyEventCount = 0
historyEventCount = store.history && store.history.events ? Object.keys(store.history.events).length : 0
        scheduleSave(ctx.logger)
        return json(res, 200, { ok: true, removed: previous })
      },
    })
    const disposePlans = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/plans',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          if (PLAN_ADAPTERS.some((adapter) => planRuntimeFor(adapter).checkedAt === 0)) await refreshPlans(ctx)
          return json(res, 200, { ok: true, ...planView() })
        }
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        const body = await readBody(req)
        if (body === null) return json(res, 400, { ok: false, error: 'invalid-body' })
        const id = body.id === undefined || body.id === null || body.id === '' ? null : body.id
        if (id !== null && typeof id !== 'string') return json(res, 400, { ok: false, error: 'id must be a string' })
        const result = await refreshPlans(ctx, { force: true, id })
        if (!result.ok) return json(res, 404, result)
        return json(res, 200, result)
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
        if (usageStorageLocked) return json(res, 423, { ok: false, error: 'usage-storage-locked' })
        const body = await readBody(req)
        if (body === null || !Array.isArray(body.providers)) return json(res, 400, { ok: false, error: 'providers array is required' })
        store.officialProviders = normalizeProviderList(body.providers)
        store.customPrices = store.customPrices.filter((rule) => !store.officialProviders.includes(rule.provider))
        scheduleSave(ctx.logger)
        return json(res, 200, {
          ok: true,
          official: [...store.officialProviders],
          known: store.knownProviders.filter((p) => p !== OFFICIAL_PROVIDER && !store.officialProviders.includes(p)),
        })
      },
    })
    const disposeCustomPrices = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/custom-prices',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          return json(res, 200, { ok: true, rules: [...store.customPrices], knownRoutes: knownThirdPartyRoutes() })
        }
        if (usageStorageLocked) return json(res, 423, { ok: false, error: 'usage-storage-locked' })
        if (req.method !== 'POST' && req.method !== 'DELETE') {
          return json(res, 405, { ok: false, error: 'method-not-allowed' })
        }
        const body = await readBody(req, 16_384)
        if (body === null) return json(res, 400, { ok: false, error: 'invalid-body' })
        if (req.method === 'POST') {
          const rule = normalizeCustomPriceRule(body.rule)
          if (rule === null) return json(res, 400, { ok: false, error: 'invalid-custom-price' })
          if (isOfficialProvider(rule.provider, store.officialProviders)) {
            return json(res, 400, { ok: false, error: 'official-provider-not-allowed' })
          }
          store.customPrices = normalizeCustomPrices([
            ...store.customPrices.filter((entry) => entry.provider !== rule.provider || entry.model !== rule.model),
            rule,
          ])
          scheduleSave(ctx.logger)
          return json(res, 200, { ok: true, rules: [...store.customPrices], knownRoutes: knownThirdPartyRoutes() })
        }
        const provider = boundedString(body.provider, 100)
        const model = boundedString(body.model, 160)
        if (provider === null || model === null) return json(res, 400, { ok: false, error: 'provider-and-model-required' })
        store.customPrices = store.customPrices.filter((entry) => entry.provider !== provider || entry.model !== model)
        scheduleSave(ctx.logger)
        return json(res, 200, { ok: true, rules: [...store.customPrices], knownRoutes: knownThirdPartyRoutes() })
      },
    })
    const disposeAccounts = ctx.webServer.register({
      kind: 'exact',
      path: '/api/wallet/accounts',
      handler: async (req, res) => {
        if (req.method === 'GET') return json(res, 200, { ok: true, ...accountListView() })
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' })
        if (accountStorageLocked) return json(res, 423, { ok: false, error: 'account-storage-locked' })
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
        if (accountStorageLocked) return json(res, 423, { ok: false, error: 'account-storage-locked' })
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
        if (accountStorageLocked) return json(res, 423, { ok: false, error: 'account-storage-locked' })
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
      disposeHealth()
      disposePricingRefresh()
      disposePreferences()
      disposeThreshold()
      disposeRefresh()
      disposeClear()
      disposeHistory()
      disposeClearHistory()
      disposePlans()
      disposeAccounts()
      disposeProviders()
      disposeCustomPrices()
      disposeActivate()
      disposeRemove()
      clearInterval(balanceTimer)
      if (planTimer !== null) clearInterval(planTimer)
      if (saveTimer !== null) persistStore(ctx.logger)
      if (accountsSaveTimer !== null) persistAccounts(ctx.logger)
    }
  }, 'dsh-wallet: routes')
}
