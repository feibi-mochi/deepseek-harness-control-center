import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

test('composer model resolution declares remote.session in its calling scope', () => {
  let definition
  runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { definition = value } } },
  })
  const plugin = definition.factory(() => ({ useEffect() {} }))
  let resolved = false
  plugin.apply({
    inject(dependencies, callback) {
      if (!dependencies.includes('conversation')) return
      const allowed = new Set([...plugin.inject, ...dependencies])
      const scope = {
        modelDirectories: {
          directoryFor(sessionId) {
            assert.ok(allowed.has('remote'), 'remote namespace must be declared')
            assert.ok(allowed.has('remote.session'), 'Cordis rejects undeclared caller dependencies')
            assert.equal(sessionId, 'synthetic-session')
            resolved = true
            return { store: {} }
          },
        },
        effect(run) { return run() },
        slots: { register(descriptor) { assert.ok(descriptor.inject('synthetic-session').modelDirectory) } },
      }
      callback(scope)
    },
  })
  assert.ok(resolved)
  assert.ok(plugin.inject.includes('remote.session'), 'settings and footer calls also need the root dependency')
})
