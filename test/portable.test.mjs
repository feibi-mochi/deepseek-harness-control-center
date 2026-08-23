import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function createRequest(method, body, url) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  let status = 0
  let responseBody = ''
  let resolve
  const done = new Promise((doneResolve) => { resolve = doneResolve })
  req.response = {
    writeHead(value) { status = value },
    end(value) {
      responseBody = String(value || '')
      resolve({ status, json: JSON.parse(responseBody) })
    },
  }
  queueMicrotask(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
  return { req, done }
}

function install(mod) {
  const routes = new Map()
  const cleanups = []
  mod.apply({
    logger: { warn() {} },
    get(key) {
      return key === 'credentials'
        ? { async set() {}, async resolve() { return undefined } }
        : undefined
    },
    on() {},
    effect(run) {
      const cleanup = run()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return cleanup
    },
    webServer: {
      register(definition) {
        routes.set(definition.path, definition.handler)
        return () => routes.delete(definition.path)
      },
    },
  }, { pricingSync: false })
  return {
    async call(path, method = 'GET', body) {
      const { req, done } = createRequest(method, body, path)
      const handled = Promise.resolve(routes.get(path)(req, req.response))
      const response = await done
      await handled
      return response
    },
    close() {
      for (const cleanup of cleanups.reverse()) cleanup()
    },
  }
}

test('non-Windows AES-GCM account storage persists and reloads without plaintext', async () => {
  const originalHome = process.env.DSH_HOME
  const originalPlatform = process.platform
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  const dir = mkdtempSync(join(tmpdir(), 'dshw-portable-account-'))
  process.env.DSH_HOME = dir
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  let firstHarness
  let secondHarness
  try {
    const first = await import('../index.js?portable-account-a-' + Date.now())
    firstHarness = install(first)
    const added = await firstHarness.call('/api/wallet/accounts', 'POST', {
      name: 'Portable', apiKey: 'sk-portable-platform-1234567890',
    })
    assert.equal(added.json.ok, true)
    const threshold = await firstHarness.call('/api/wallet/threshold', 'POST', { threshold: 3.25, currency: 'CNY' })
    assert.equal(threshold.json.ok, true)
    await new Promise((resolve) => setTimeout(resolve, 750))

    const keyPath = join(dir, 'storages', 'accounts.json.key')
    const accountPath = join(dir, 'storages', 'accounts.json')
    const walletPath = join(dir, 'storages', 'wallet.json')
    const walletBackupPath = walletPath + '.bak'
    assert.equal(existsSync(keyPath), true)
    assert.equal(readFileSync(keyPath).length, 32)
    if (originalPlatform !== 'win32') {
      assert.equal(statSync(keyPath).mode & 0o777, 0o600)
      assert.equal(statSync(accountPath).mode & 0o777, 0o600)
      assert.equal(statSync(walletPath).mode & 0o777, 0o600)
      assert.equal(statSync(walletBackupPath).mode & 0o777, 0o600)
    }
    assert.equal(existsSync(walletBackupPath), true)
    assert.doesNotMatch(readFileSync(accountPath, 'utf8'), /sk-portable-platform/)
    const health = await firstHarness.call('/api/wallet/health')
    assert.equal(health.json.accounts.scheme, 'aes-gcm-file-key')

    const second = await import('../index.js?portable-account-b-' + Date.now())
    secondHarness = install(second)
    const listed = await secondHarness.call('/api/wallet/accounts')
    assert.equal(listed.json.accounts.length, 1)
    assert.equal(listed.json.accounts[0].name, 'Portable')
    const snapshot = await secondHarness.call('/api/wallet/snapshot')
    assert.equal(snapshot.json.threshold, 3.25)
    const secondHealth = await secondHarness.call('/api/wallet/health')
    assert.equal(secondHealth.json.usage.status, 'ready')
    assert.equal(secondHealth.json.accounts.scheme, 'aes-gcm-file-key')
  } finally {
    if (secondHarness) secondHarness.close()
    if (firstHarness) firstHarness.close()
    if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor)
    else Object.defineProperty(process, 'platform', { value: originalPlatform })
    process.env.DSH_HOME = originalHome
    await new Promise((resolve) => setTimeout(resolve, 100))
    rmSync(dir, { recursive: true, force: true })
  }
})
