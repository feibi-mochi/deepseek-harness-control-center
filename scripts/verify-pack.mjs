#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

const expected = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'cordis.patch.yml',
  'index.js',
  'integrations/dsh-session-delete/AGENT_PROMPT.md',
  'integrations/dsh-session-delete/README.md',
  'integrations/dsh-session-delete/README.zh-CN.md',
  'integrations/dsh-session-delete/UPSTREAM-NOTICE.md',
  'integrations/dsh-session-delete/compatibility.json',
  'integrations/dsh-session-delete/preflight.mjs',
  'integrations/dsh-session-delete/reference/dsh-47f9438-session-delete.patch',
  'lib/client.js',
  'lib/plans.js',
  'package.json',
].sort()

const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('run this verifier through npm run check:pack')
const output = execFileSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json'], { encoding: 'utf8' })
const result = JSON.parse(output)
if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0].files)) {
  throw new Error('npm pack returned an unexpected JSON shape')
}
const actual = result[0].files.map(file => file.path.replaceAll('\\', '/')).sort()
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  const missing = expected.filter(path => !actual.includes(path))
  const unexpected = actual.filter(path => !expected.includes(path))
  throw new Error(`npm archive inventory mismatch\nmissing: ${missing.join(', ') || '(none)'}\nunexpected: ${unexpected.join(', ') || '(none)'}`)
}
process.stdout.write(`Verified ${actual.length} publishable files.\n`)
