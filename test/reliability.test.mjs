import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'

const drain = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function client(fetch) {
  let definition
  const values = new Map()
  const timers = new Map()
  let nextTimer = 0
  const window = {
    __ModuleLoader__: { load(value) { definition = value } },
    localStorage: {
      getItem(key) { return values.get(key) ?? null },
      setItem(key, value) { values.set(key, String(value)) },
      removeItem(key) { values.delete(key) },
    },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id },
    clearTimeout(id) { timers.delete(id) },
  }
  runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), { window, fetch })
  const factory = () => definition.factory(id => {
    if (id !== 'react') throw new Error('optional module unavailable')
    return { useEffect() {} }
  })
  return { window, factory, timers }
}

test('client initializes and hydrates preferences when the localStorage getter is denied', async () => {
  const entries = { 'dshw-peakring-v1': 'false' }
  const runtime = client(async () => ({ ok: true, async json() { return { ok: true, entries } } }))
  Object.defineProperty(runtime.window, 'localStorage', {
    get() { const error = new Error('synthetic storage denial'); error.name = 'SecurityError'; throw error },
  })
  const api = runtime.factory().__testing
  const merged = await api.hydratePersistentPreferences()
  assert.equal(merged['dshw-peakring-v1'], 'false')
  const adapter = api.createCompatibilityAdapter(runtime.window)
  adapter.storage.setItem('synthetic-setting', 'value')
  assert.equal(adapter.storage.getItem('synthetic-setting'), 'value')
  adapter.storage.removeItem('synthetic-setting')
  assert.equal(adapter.storage.getItem('synthetic-setting'), null)
})

test('desktop storage bridge takes precedence over a denied browser storage getter', () => {
  const runtime = client()
  runtime.window.__DSH_WALLET_ADAPTER__ = { storage: runtime.window.localStorage }
  Object.defineProperty(runtime.window, 'localStorage', { get() { throw new Error('must not read browser storage') } })
  const adapter = runtime.factory().__testing.createCompatibilityAdapter(runtime.window)
  adapter.storage.setItem('synthetic-setting', 'bridge-value')
  assert.equal(adapter.storage.getItem('synthetic-setting'), 'bridge-value')
})

for (const outcome of ['success', 'failure']) {
  test(`preference backups serialize a delayed ${outcome} and retain the newest queued value`, async () => {
    const requests = []
    const persisted = {}
    const runtime = client((url, options) => {
      const pending = deferred()
      const entries = JSON.parse(options.body).entries
      requests.push({ ...pending, entries })
      return pending.promise.then(response => { Object.assign(persisted, entries); return response })
    })
    const api = runtime.factory().__testing
    const adapter = api.createCompatibilityAdapter(runtime.window)
    const key = 'dshw-peakring-v1'
    const other = 'dshw-low-blink-v1'
    adapter.storage.setItem(key, 'false')
    adapter.storage.setItem(other, 'false')
    const first = api.flushPersistentPreferences()
    await drain()
    adapter.storage.setItem(key, 'true')
    const second = api.flushPersistentPreferences()
    await drain()
    assert.equal(requests.length, 1, 'a second request must wait for the first to settle')
    const response = { ok: true, async json() { return { ok: true } } }
    if (outcome === 'failure') requests[0].reject(new Error('synthetic delayed failure'))
    else requests[0].resolve(response)
    await drain()
    const remaining = api.flushPersistentPreferences()
    await drain()
    assert.equal(requests.length, 2)
    assert.equal(requests[1].entries[key], 'true', 'retry must carry the latest local intent')
    requests[1].resolve(response)
    await Promise.all([first, second, remaining])
    assert.deepEqual(persisted, { [key]: 'true', [other]: 'false' })
    await api.flushPersistentPreferences()
    assert.equal(requests.length, 2, 'no stale retry remains after the latest save')
  })
}

test('preference failures remain bounded and a new edit resumes saving', async () => {
  let requests = 0
  const runtime = client(async () => { requests++; throw new Error('synthetic offline') })
  const api = runtime.factory().__testing
  const adapter = api.createCompatibilityAdapter(runtime.window)
  adapter.storage.setItem('dshw-peakring-v1', 'false')
  await api.flushPersistentPreferences()
  for (let attempt = 0; attempt < 3; attempt++) {
    const [id, callback] = runtime.timers.entries().next().value
    runtime.timers.delete(id)
    await callback()
  }
  assert.equal(requests, 4)
  assert.equal(runtime.timers.size, 0, 'do not retry indefinitely')
  adapter.storage.setItem('dshw-peakring-v1', 'true')
  await api.flushPersistentPreferences()
  assert.equal(requests, 5)
  assert.equal(runtime.timers.size, 1, 'a fresh edit resets the bounded retry budget')
})

async function host(t) {
  const previousHome = process.env.DSH_HOME
  const previousFetch = globalThis.fetch
  const home = mkdtempSync(join(tmpdir(), 'dshw-reliability-'))
  process.env.DSH_HOME = home
  const mod = await import('../index.js?reliability-' + encodeURIComponent(home))
  const keys = ['A', 'B'].map(() => 'sk-' + randomBytes(20).toString('hex'))
  const a = mod.addAccount('Synthetic A', keys[0]).account
  const b = mod.addAccount('Synthetic B', keys[1]).account
  let seamKey = keys[0]
  const credentials = { async set(ref, value) { seamKey = value }, async resolve() { return { value: seamKey } } }
  const requests = []
  globalThis.fetch = (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/user/balance', 'tests never access the network')
    const pending = deferred()
    requests.push({ ...pending, account: options.headers.authorization === 'Bearer ' + keys[0] ? 'A' : 'B', signal: options.signal })
    return pending.promise // Deliberately ignores abort to exercise stale-result guards.
  }
  const routes = new Map()
  const cleanups = []
  const ctx = {
    logger: { warn() {} },
    get(name) { return name === 'credentials' ? credentials : undefined },
    on() {},
    effect(run) { const cleanup = run(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
    webServer: { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } },
  }
  t.after(async () => {
    for (const request of requests) request.reject(new Error('synthetic cleanup'))
    await drain()
    for (const cleanup of cleanups.reverse()) cleanup()
    globalThis.fetch = previousFetch
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  })
  mod.apply(ctx, { pricingSync: false, planSync: false })
  await drain()
  async function call(path, method = 'GET', body) {
    const req = new EventEmitter()
    req.method = method
    req.url = path
    const done = deferred()
    const res = { writeHead() {}, end(value) { done.resolve(JSON.parse(value)) } }
    const handler = routes.get(path)(req, res)
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
    await handler
    return done.promise
  }
  function respond(index, total) {
    requests[index].resolve({ ok: true, async json() {
      return { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: String(total), granted_balance: '0', topped_up_balance: String(total) }] }
    } })
  }
  return { mod, a, b, ctx, credentials, requests, call, respond }
}

for (const outcome of ['success', 'failure']) {
  test(`account switch discards a stale balance ${outcome} after the new balance arrives`, async t => {
    const h = await host(t)
    h.respond(0, 11)
    await drain()
    assert.equal((await h.call('/api/wallet/snapshot')).balance.total, 11)
    const old = h.call('/api/wallet/refresh', 'POST')
    await drain()
    await h.call('/api/wallet/accounts/activate', 'POST', { id: h.b.id })
    await drain()
    const pending = await h.call('/api/wallet/snapshot')
    assert.equal(pending.accounts.activeName, 'Synthetic B')
    assert.equal(pending.balance.total, null, 'old cached balance disappears immediately on switching')
    assert.equal(h.requests.length, 3, 'B gets a fresh request without waiting for A')
    assert.equal(h.requests[1].signal.aborted, true)
    assert.equal(h.requests[2].account, 'B')
    h.respond(2, 22)
    await drain()
    if (outcome === 'success') h.respond(1, 11)
    else h.requests[1].reject(new Error('synthetic old-account failure'))
    await old
    assert.equal((await h.call('/api/wallet/snapshot')).balance.total, 22)
  })
}

test('stale refresh completion cannot unlock a newer in-flight balance request', async t => {
  const h = await host(t)
  await h.mod.activateAccount(h.ctx, h.b.id)
  await drain()
  assert.equal(h.requests.length, 2)
  h.respond(0, 11)
  await drain()
  const refresh = h.call('/api/wallet/refresh', 'POST')
  await drain()
  assert.equal(h.requests.length, 2, 'current-account refresh stays deduplicated')
  h.respond(1, 22)
  await refresh
  assert.equal((await h.call('/api/wallet/snapshot')).balance.total, 22)
})

test('a refused account switch retains the current balance and request', async t => {
  const h = await host(t)
  h.respond(0, 11)
  await drain()
  h.credentials.set = async () => { throw new Error('synthetic refused write') }
  const result = await h.mod.activateAccount(h.ctx, h.b.id)
  assert.equal(result.ok, false)
  const snapshot = await h.call('/api/wallet/snapshot')
  assert.equal(snapshot.accounts.activeName, 'Synthetic A')
  assert.equal(snapshot.balance.total, 11)
  assert.equal(h.requests.length, 1)
})

test('removing the active account refreshes the host-key balance and ignores the removed-account request', async t => {
  const h = await host(t)
  const response = await h.call('/api/wallet/accounts/remove', 'POST', { id: h.a.id })
  await drain()
  assert.equal(response.activeId, null)
  assert.equal(h.requests.length, 2)
  assert.equal(h.requests[0].signal.aborted, true)
  h.respond(1, 12)
  await drain()
  h.respond(0, 11)
  await drain()
  const snapshot = await h.call('/api/wallet/snapshot')
  assert.equal(snapshot.accounts.activeName, null)
  assert.equal(snapshot.balance.total, 12)
})
