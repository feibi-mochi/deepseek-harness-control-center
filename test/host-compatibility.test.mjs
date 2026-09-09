import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hostCompatibility } from '../index.js'

test('health compatibility follows exact manifest declarations and rejects unverified newer hosts', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  for (const [version, status] of Object.entries(manifest.dsh.compatibility.dshReleases)) {
    if (status === 'compatible') assert.equal(hostCompatibility(version).status, 'compatible')
  }
  for (const version of [null, undefined, '', 'invalid', '0.1.3-alpha.2', '0.1.5-alpha.2', '1.0.0']) {
    assert.equal(hostCompatibility(version).status, 'unknown')
  }
  assert.equal(hostCompatibility('0.1.2-alpha.2').status, 'upgrade-recommended')
})
