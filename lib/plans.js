/**
 * Subscription-plan adapters and response normalization.
 *
 * Each adapter is deliberately bound to one official origin and one DSH
 * credential reference. The browser never receives a credential reference,
 * endpoint path, raw response body, or upstream error text.
 */

export const PLAN_CACHE_VERSION = 2

const TOKEN_LIMIT = Object.freeze({ id: 'tokens-5h', kind: 'tokens', window: '5h', amounts: false, reset: false })
const CREDIT_LIMIT = Object.freeze({ id: 'tokens-5h', kind: 'tokens', window: '5h', amounts: true, reset: true })

const ZAI_LIMITS = Object.freeze({
  // BigModel renamed this response type to CREDIT_LIMIT without changing
  // the 5-hour model-credit semantics. Keep both names for old snapshots and
  // new China-region responses.
  TOKENS_LIMIT: TOKEN_LIMIT,
  CREDIT_LIMIT,
  TIME_LIMIT: Object.freeze({ id: 'tools-month', kind: 'tools', window: 'month' }),
})

export const PLAN_ADAPTERS = Object.freeze([
  Object.freeze({
    id: 'zai-global',
    provider: 'zai',
    name: 'Z.ai Coding Plan',
    region: 'global',
    kind: 'subscription',
    credentialRef: 'ZAI_API_KEY',
    endpoint: 'https://api.z.ai/api/monitor/usage/quota/limit',
    sourceDomain: 'api.z.ai',
    limitTypes: ZAI_LIMITS,
  }),
  Object.freeze({
    id: 'zai-cn',
    provider: 'zai-coding-cn',
    name: 'Z.ai Coding Plan 中国区',
    region: 'cn',
    kind: 'subscription',
    credentialRef: 'ZAI_CODING_CN_API_KEY',
    endpoint: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
    sourceDomain: 'open.bigmodel.cn',
    limitTypes: ZAI_LIMITS,
  }),
])

const ADAPTER_BY_ID = new Map(PLAN_ADAPTERS.map((adapter) => [adapter.id, adapter]))

export function planAdapterById(id) {
  return typeof id === 'string' ? ADAPTER_BY_ID.get(id) ?? null : null
}

function boundedText(value, maxLength) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '' || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) return null
  return text
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function usedPercentage(value, used, total) {
  let result = typeof value === 'number' && Number.isFinite(value) ? value : null
  if (result === null && used !== null && total !== null && total > 0) result = used / total * 100
  return result === null ? null : Math.min(100, Math.max(0, Math.round(result * 100) / 100))
}

function percentagePair(value, used, total) {
  const usedValue = usedPercentage(value, used, total)
  return {
    usedPercentage: usedValue,
    remainingPercentage: usedValue === null ? null : Math.round((100 - usedValue) * 100) / 100,
  }
}

function resetTimestamp(value, atMs) {
  if (!Number.isFinite(value)) return null
  const parsed = Math.trunc(value)
  const lower = atMs - 366 * 86_400_000
  const upper = atMs + 5 * 366 * 86_400_000
  return parsed >= lower && parsed <= upper ? parsed : null
}

function normalizedLimit(adapter, value, atMs) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const descriptor = adapter.limitTypes[value.type]
  if (descriptor === undefined) return null
  const used = descriptor.amounts ? finiteNonNegative(value.currentValue) : descriptor.kind === 'tools' ? finiteNonNegative(value.currentValue) : null
  const total = descriptor.amounts ? finiteNonNegative(value.usage) : descriptor.kind === 'tools' ? finiteNonNegative(value.usage) : null
  const remaining = descriptor.amounts ? finiteNonNegative(value.remaining) : descriptor.kind === 'tools' ? finiteNonNegative(value.remaining) : null
  const percentages = percentagePair(value.percentage, used, total)
  return {
    id: descriptor.id,
    kind: descriptor.kind,
    window: descriptor.window,
    ...percentages,
    used,
    total,
    remaining,
    resetAt: descriptor.reset || descriptor.kind === 'tools' ? resetTimestamp(value.nextResetTime, atMs) : null,
  }
}

function preferRicherLimit(next, current) {
  if (current === undefined) return true
  if (current.used === null && next.used !== null) return true
  if (current.total === null && next.total !== null) return true
  if (current.remaining === null && next.remaining !== null) return true
  return current.resetAt === null && next.resetAt !== null
}

function normalizeCachedLimit(value, atMs) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  if (!['tokens-5h', 'tools-month'].includes(value.id)) return null
  const kind = value.id === 'tokens-5h' ? 'tokens' : 'tools'
  const window = value.id === 'tokens-5h' ? '5h' : 'month'
  const used = finiteNonNegative(value.used)
  const total = finiteNonNegative(value.total)
  const remaining = finiteNonNegative(value.remaining)
  const legacyUsedPercentage = value.usedPercentage ?? value.percentage
  const percentages = percentagePair(legacyUsedPercentage, used, total)
  return {
    id: value.id,
    kind,
    window,
    ...percentages,
    used,
    total,
    remaining,
    resetAt: resetTimestamp(value.resetAt, atMs),
  }
}

export function normalizePlanPayload(adapter, payload, atMs = Date.now()) {
  if (adapter === null || typeof adapter !== 'object') throw new Error('unknown-plan-adapter')
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid-plan-response')
  if (payload.success === false || (typeof payload.code === 'number' && payload.code !== 200 && payload.code !== 0)) {
    throw new Error('plan-response-rejected')
  }
  const data = payload.data !== null && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : null
  if (data === null || !Array.isArray(data.limits)) throw new Error('invalid-plan-response')
  const limitsById = new Map()
  for (const item of data.limits) {
    const limit = normalizedLimit(adapter, item, atMs)
    if (limit !== null && preferRicherLimit(limit, limitsById.get(limit.id))) limitsById.set(limit.id, limit)
  }
  const limits = [...limitsById.values()]
  limits.sort((left, right) => left.id === 'tokens-5h' ? -1 : right.id === 'tokens-5h' ? 1 : left.id.localeCompare(right.id))
  if (limits.length === 0) throw new Error('invalid-plan-response')
  return {
    version: PLAN_CACHE_VERSION,
    id: adapter.id,
    fetchedAt: atMs,
    level: boundedText(data.level, 80),
    limits,
  }
}

export function normalizePlanSnapshotCache(value, atMs = Date.now()) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const out = {}
  for (const adapter of PLAN_ADAPTERS) {
    const raw = source[adapter.id]
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const fetchedAt = Number.isFinite(raw.fetchedAt) && raw.fetchedAt > 0 && raw.fetchedAt <= atMs + 86_400_000
      ? Math.trunc(raw.fetchedAt)
      : null
    if (fetchedAt === null || !Array.isArray(raw.limits)) continue
    const limitsById = new Map()
    for (const item of raw.limits) {
      const limit = normalizeCachedLimit(item, atMs)
      if (limit !== null && preferRicherLimit(limit, limitsById.get(limit.id))) limitsById.set(limit.id, limit)
    }
    const limits = [...limitsById.values()]
    if (limits.length === 0) continue
    limits.sort((left, right) => left.id === 'tokens-5h' ? -1 : right.id === 'tokens-5h' ? 1 : left.id.localeCompare(right.id))
    out[adapter.id] = {
      version: PLAN_CACHE_VERSION,
      id: adapter.id,
      fetchedAt,
      level: boundedText(raw.level, 80),
      limits,
    }
  }
  return out
}
