import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

export const clientSources = ['core.js', 'styles.js', 'views.js', 'settings.js', 'wallet.js']

export function clientSource() {
  const body = clientSources.map(name => readFileSync(new URL('../src/client/' + name, import.meta.url), 'utf8').replaceAll('\r\n', '\n')).join('\n')
  return "window.__ModuleLoader__.load({\n  id: 'deepseek-harness-wallet',\n  factory: (require) => {\n" + body + '\nreturn module.exports\n}\n})\n'
}

export function buildClient() {
  // Keep identifiers and expressions intact. Only whitespace and non-license
  // comments are removed; the five source files remain reviewable in Git.
  return transformSync(clientSource(), { loader: 'js', target: 'es2022', minifyWhitespace: true, legalComments: 'inline', charset: 'utf8' }).code
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = new URL('../lib/client.js', import.meta.url)
  const code = buildClient()
  if (Buffer.byteLength(code) > 262144) throw Error('Client artifact exceeds the 256 KiB review bound')
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== code) throw Error('Client artifact is stale; run npm run build:client')
  } else writeFileSync(target, code)
  process.stdout.write(`Client artifact verified: ${Buffer.byteLength(code)} bytes.\n`)
}
