#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EXPECTED_COMMIT = '47f943859bef60e4160492346772ded9b24f765a'
const EXPECTED_VERSION = '0.1.0-rc.5'
const requiredPaths = [
  'packages/host/apiproxy/src/api-proxy.ts',
  'packages/session/session-persistence/src/index.ts',
  'packages/session/session-persistence-jsonl/src/index.ts',
  'packages/session/session-persistence-sqlite/src/index.ts',
  'packages/workspace/workspace/src/index.ts',
  'packages/client/runtime/src/client/sessions/service.ts',
  'packages/client/ui-workspace/src/client/WorkspaceBrowser.tsx',
]

function fail(message) {
  process.stderr.write(`PRECHECK FAILED: ${message}\n`)
  process.exitCode = 1
}

const root = resolve(process.argv[2] || process.cwd())
let commit
let version
try {
  commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  version = pkg.version
} catch (error) {
  fail(`not a readable DSH source checkout: ${error instanceof Error ? error.message : String(error)}`)
  process.exit()
}

for (const path of requiredPaths) {
  try { readFileSync(resolve(root, path)) } catch { fail(`missing required seam: ${path}`) }
}

process.stdout.write(`DSH source: ${root}\ncommit: ${commit}\nroot version: ${version}\n`)
if (commit !== EXPECTED_COMMIT || version !== EXPECTED_VERSION) {
  fail(`the reference patch is pinned to ${EXPECTED_COMMIT} (${EXPECTED_VERSION}). Do not force-apply it. Read the current source and port the behavior described in AGENT_PROMPT.md by semantics.`)
} else {
  process.stdout.write('Exact reference baseline detected. A separate clean checkout may run git apply --check on the bundled patch.\n')
}
