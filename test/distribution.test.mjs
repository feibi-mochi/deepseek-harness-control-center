import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { buildClient, clientSources } from '../scripts/build-client.mjs'

test('committed client reproduces from readable sources and all files fit the store review bound', () => {
  const compiled = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  assert.equal(compiled, buildClient(), 'run npm run build:client after changing client sources')
  for (const file of ['lib/client.js', 'index.js', 'lib/plans.js', ...clientSources.map(name => 'src/client/' + name)]) {
    assert.ok(statSync(new URL('../' + file, import.meta.url)).size <= 262144, file + ' exceeds 256 KiB')
  }
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0)
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(pkg.scripts[name], undefined)
})
