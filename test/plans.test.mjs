import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PLAN_ADAPTERS,
  normalizePlanPayload,
  normalizePlanSnapshotCache,
  planAdapterById,
} from '../lib/plans.js'

function routeRequest(method, body, url) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  const completion = new Promise((resolve) => {
    req.response = {
      status: null,
      headers: null,
      body: '',
      writeHead(status, headers) { this.status = status; this.headers = headers },
      end(value) { this.body = value === undefined ? '' : String(value); resolve(this) },
    }
  })
  req.send = () => {
    queueMicrotask(() => {
      if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
      req.emit('end')
    })
    return completion
  }
  return req
}

test('plan adapters are pinned to official Z.ai origins and distinct credential references', () => {
  assert.equal(PLAN_ADAPTERS.length, 2)
  assert.deepEqual(PLAN_ADAPTERS.map((adapter) => adapter.id), ['zai-global', 'zai-cn'])
  for (const adapter of PLAN_ADAPTERS) {
    const url = new URL(adapter.endpoint)
    assert.equal(url.protocol, 'https:')
    assert.equal(url.hostname, adapter.sourceDomain)
    assert.equal(url.pathname, '/api/monitor/usage/quota/limit')
    assert.match(adapter.credentialRef, /^ZAI(?:_CODING_CN)?_API_KEY$/)
    assert.equal(planAdapterById(adapter.id), adapter)
  }
  assert.equal(planAdapterById('unknown'), null)
})

test('host plugin declares the credentials seam required by plan adapters', async () => {
  const mod = await import('../index.js')
  assert.deepEqual(mod.inject, ['webServer', 'credentials'])
})

test('Z.ai quota payload normalizes 5-hour tokens and monthly tool usage', () => {
  const atMs = Date.UTC(2026, 7, 23, 12)
  const snapshot = normalizePlanPayload(planAdapterById('zai-cn'), {
    code: 200,
    success: true,
    data: {
      level: 'pro',
      limits: [
        { type: 'TIME_LIMIT', usage: 1000, currentValue: 250, remaining: 750, percentage: 25, nextResetTime: atMs + 86_400_000 },
        { type: 'TOKENS_LIMIT', percentage: 112 },
        { type: 'UNKNOWN_LIMIT', percentage: 50 },
      ],
    },
  }, atMs)
  assert.equal(snapshot.id, 'zai-cn')
  assert.equal(snapshot.level, 'pro')
  assert.deepEqual(snapshot.limits, [
    { id: 'tokens-5h', kind: 'tokens', window: '5h', usedPercentage: 100, remainingPercentage: 0, used: null, total: null, remaining: null, resetAt: null },
    { id: 'tools-month', kind: 'tools', window: 'month', usedPercentage: 25, remainingPercentage: 75, used: 250, total: 1000, remaining: 750, resetAt: atMs + 86_400_000 },
  ])
  assert.throws(() => normalizePlanPayload(planAdapterById('zai-cn'), { success: true, data: { limits: [] } }, atMs), /invalid-plan-response/)
})

test('Z.ai China quota accepts the renamed CREDIT_LIMIT and credit-only responses', () => {
  const atMs = Date.UTC(2026, 7, 26, 12)
  const snapshot = normalizePlanPayload(planAdapterById('zai-cn'), {
    code: 200,
    success: true,
    data: {
      level: 'pro',
      limits: [
        { type: 'CREDIT_LIMIT', usage: 1000, currentValue: 370, remaining: 630, nextResetTime: atMs + 5 * 3_600_000 },
      ],
    },
  }, atMs)

  assert.deepEqual(snapshot.limits, [
    { id: 'tokens-5h', kind: 'tokens', window: '5h', usedPercentage: 37, remainingPercentage: 63, used: 370, total: 1000, remaining: 630, resetAt: atMs + 5 * 3_600_000 },
  ])
})

test('Z.ai quota keeps old token type support alongside CREDIT_LIMIT', () => {
  const atMs = Date.UTC(2026, 7, 26, 12)
  const snapshot = normalizePlanPayload(planAdapterById('zai-cn'), {
    code: 200,
    success: true,
    data: {
      limits: [
        { type: 'CREDIT_LIMIT', percentage: 12 },
        { type: 'TOKENS_LIMIT', percentage: 25 },
        { type: 'TIME_LIMIT', usage: 100, currentValue: 10, remaining: 90, percentage: 10 },
      ],
    },
  }, atMs)

  assert.equal(snapshot.limits.length, 2)
  assert.equal(snapshot.limits[0].id, 'tokens-5h')
  assert.equal(snapshot.limits[0].usedPercentage, 12)
  assert.equal(snapshot.limits[1].id, 'tools-month')
})

test('Z.ai quota prefers richer CREDIT_LIMIT data when old and new names coexist', () => {
  const atMs = Date.UTC(2026, 7, 26, 12)
  const snapshot = normalizePlanPayload(planAdapterById('zai-cn'), {
    code: 200,
    success: true,
    data: {
      limits: [
        { type: 'TOKENS_LIMIT', percentage: 25 },
        { type: 'CREDIT_LIMIT', usage: 1000, currentValue: 370, remaining: 630, nextResetTime: atMs + 5 * 3_600_000 },
      ],
    },
  }, atMs)

  assert.equal(snapshot.limits.length, 1)
  assert.equal(snapshot.limits[0].used, 370)
  assert.equal(snapshot.limits[0].total, 1000)
  assert.equal(snapshot.limits[0].remaining, 630)
})

test('persisted plan snapshots are bounded and unknown adapters are discarded', () => {
  const atMs = Date.UTC(2026, 7, 23, 12)
  const cache = normalizePlanSnapshotCache({
    'zai-cn': {
      id: 'wrong-id',
      fetchedAt: atMs,
      level: 'team',
      secret: 'must-not-survive',
      limits: [
        { id: 'tokens-5h', percentage: -5, credential: 'hidden' },
        { id: 'tools-month', percentage: 50, used: 5, total: 10, remaining: 5, resetAt: atMs + 1000 },
      ],
    },
    attacker: { fetchedAt: atMs, limits: [{ id: 'tokens-5h', percentage: 1 }] },
  }, atMs)
  assert.deepEqual(Object.keys(cache), ['zai-cn'])
  assert.equal(cache['zai-cn'].limits[0].usedPercentage, 0)
  assert.equal(cache['zai-cn'].limits[0].remainingPercentage, 100)
  assert.equal(JSON.stringify(cache).includes('must-not-survive'), false)
  assert.equal(JSON.stringify(cache).includes('hidden'), false)
})

test('plan HTTP route queries only the configured official source and keeps stale success on failure', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-wallet-plans-'))
  const previousHome = process.env.DSH_HOME
  const previousFetch = globalThis.fetch
  process.env.DSH_HOME = home
  const calls = []
  let fail = false
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), authorizationSet: typeof options.headers?.authorization === 'string' })
    if (fail) return { ok: false, status: 503, text: async () => '{"error":"private upstream text"}' }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        code: 200,
        success: true,
        data: {
          level: 'pro',
          limits: [
            { type: 'TOKENS_LIMIT', percentage: 12.5 },
            { type: 'TIME_LIMIT', usage: 100, currentValue: 10, remaining: 90, percentage: 10, nextResetTime: Date.now() + 86_400_000 },
          ],
        },
      }),
    }
  }
  const routes = new Map()
  const disposers = []
  try {
    const mod = await import(`../index.js?plan-route=${Date.now()}`)
    const credentials = {
      async resolve(ref) {
        return ref === 'ZAI_CODING_CN_API_KEY' ? { value: 'test-plan-token' } : undefined
      },
    }
    mod.apply({
      logger: { warn() {} },
      get(key) { return key === 'credentials' ? credentials : undefined },
      on() {},
      effect(run) { const dispose = run(); if (typeof dispose === 'function') disposers.push(dispose); return dispose },
      webServer: { register(definition) { routes.set(definition.path, definition.handler); return () => routes.delete(definition.path) } },
    }, { pricingSync: false })

    async function call(method, body) {
      const req = routeRequest(method, body, '/api/wallet/plans')
      const handled = Promise.resolve(routes.get('/api/wallet/plans')(req, req.response))
      const response = await req.send()
      await handled
      return { status: response.status, json: JSON.parse(response.body) }
    }

    const first = await call('GET')
    assert.equal(first.status, 200)
    assert.equal(first.json.configuredCount, 1)
    const china = first.json.sources.find((source) => source.id === 'zai-cn')
    const global = first.json.sources.find((source) => source.id === 'zai-global')
    assert.equal(china.available, true)
    assert.equal(global.configured, false)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://open.bigmodel.cn/api/monitor/usage/quota/limit')
    assert.equal(calls[0].authorizationSet, true)
    assert.equal(JSON.stringify(first.json).includes('test-plan-token'), false)

    fail = true
    const second = await call('POST', { id: 'zai-cn' })
    assert.equal(second.status, 200)
    const stale = second.json.sources.find((source) => source.id === 'zai-cn')
    assert.equal(stale.available, true)
    assert.equal(stale.error, 'upstream-unavailable')
    assert.equal(JSON.stringify(second.json).includes('private upstream text'), false)

    const missing = await call('POST', { id: 'not-supported' })
    assert.equal(missing.status, 404)
    assert.equal(missing.json.error, 'plan-not-found')
  } finally {
    for (const dispose of disposers.reverse()) { try { dispose() } catch {} }
    globalThis.fetch = previousFetch
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
})
