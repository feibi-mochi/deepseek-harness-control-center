// Reproducible install/start/remove/rollback acceptance in a disposable DSH home.
// Usage: node scripts/verify-dsh-profile.mjs <pinned-cli-root> <wallet.tgz> <old-wallet.tgz> <port>
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const [runtimeArg, archiveArg, oldArchiveArg, portArg] = process.argv.slice(2)
const runtime = resolve(runtimeArg)
const cli = join(runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
const home = mkdtempSync(join(tmpdir(), 'wallet-dsh-compat-'))
const env = { ...process.env, DSH_HOME: home, NO_COLOR: '1' }
for (const key of Object.keys(env)) {
  if (/API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL/i.test(key)) delete env[key]
}
const version = JSON.parse(readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version
const lock = JSON.parse(readFileSync(join(runtime, 'package-lock.json'), 'utf8'))
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (/(?:^|\/)node_modules\/@deepseek-ai\/dsh(?:-[^/]+)?$/.test(path)) assert.equal(pkg.version, version, path + ' is not pinned to the requested DSH release')
}
const archive = resolve(archiveArg)
const oldArchive = resolve(oldArchiveArg)
const origin = 'http://127.0.0.1:' + Number(portArg)
const pkgPath = join(home, 'profiles/web/node_modules/deepseek-harness-wallet/package.json')
const result = { dsh: version, node: process.version, platform: process.platform, install: false, start: false, uninstall: false, rollback: false }

function command(args) {
  const run = spawnSync(process.execPath, [cli, ...args], { cwd: runtime, env, encoding: 'utf8', timeout: 180_000, windowsHide: true })
  if (run.status !== 0) throw Error('DSH command failed: ' + args.slice(0, 4).join(' ') + '\n' + String(run.stderr || '').replace(/([?&]token=)[^\s]+/g, '$1[redacted]').slice(-1800))
  return run.stdout
}

async function boot(expectedWallet) {
  const child = spawn(process.execPath, [cli, 'web', '--no-open', '--host', '127.0.0.1', '--port', portArg], { cwd: runtime, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  try {
    let cookie = ''
    let ready = false
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw Error('DSH exited before listening: ' + output.replace(/([?&]token=)[^\s]+/g, '$1[redacted]').slice(-1600))
      try {
        const startUrl = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s\u001b]+/)?.[0]
        if (startUrl) {
          const auth = await fetch(startUrl, { redirect: 'manual' })
          cookie = auth.headers.getSetCookie().map(s => s.split(';')[0]).join('; ')
        }
        const page = await fetch(origin + '/', { headers: { cookie } })
        if (page.ok) {
          const html = await page.text()
          if (expectedWallet) assert.ok(html.includes('deepseek-harness-wallet'), 'wallet missing from boot graph')
          else assert.ok(!html.includes('deepseek-harness-wallet'), 'wallet still in boot graph after removal')
          ready = true
          break
        }
      } catch {}
      await new Promise(r => setTimeout(r, 300))
    }
    if (!ready) throw Error('DSH web did not become ready: ' + output.replace(/([?&]token=)[^\s]+/g, '$1[redacted]').slice(-1400))
    const health = await fetch(origin + '/api/wallet/health', { headers: { cookie, origin } })
    if (expectedWallet) {
      assert.equal(health.status, 200)
      const data = await health.json()
      assert.equal(data.plugin.version, expectedWallet)
      assert.equal(data.usage.locked, false)
      result.hostVersion = data.host.version
      const page = await (await fetch(origin + '/', { headers: { cookie } })).text()
      const clientPath = page.match(/"id":"deepseek-harness-wallet","url":"([^"]+)"/)?.[1]
      assert.ok(clientPath, 'wallet client URL missing')
      const client = await fetch(origin + clientPath, { headers: { cookie } })
      assert.equal(client.status, 200)
      assert.ok((await client.text()).includes('__ModuleLoader__.load'))
      const preferences = await fetch(origin + '/api/wallet/preferences', { headers: { cookie, origin } })
      assert.equal(preferences.status, 200)
    } else assert.equal(health.status, 404)
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM')
    if (child.exitCode === null) await new Promise(r => child.once('exit', r))
  }
}

try {
  command(['plugin', '--profile', 'web', 'add', archive])
  assert.equal(JSON.parse(readFileSync(pkgPath, 'utf8')).version, '0.3.10')
  result.install = true
  await boot('0.3.10')
  result.start = true
  command(['plugin', '--profile', 'web', 'remove', 'deepseek-harness-wallet'])
  await boot(null)
  result.uninstall = true
  command(['plugin', '--profile', 'web', 'add', oldArchive])
  await boot('0.3.9')
  result.rollback = true
  result.checkedAt = new Date().toISOString()
  console.log(JSON.stringify(result))
} catch (error) {
  console.error(error.message)
  console.log(JSON.stringify(result))
  process.exitCode = 1
}
