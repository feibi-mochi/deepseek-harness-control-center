/**
 * Unit tests for the wallet pricing/accounting pure functions.
 * Run with `node --test test/` (zero dependencies, node:test).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import {
  PRICE_POLICIES,
  addOfficialUsage,
  accountStorageSnapshot,
  __testing as hostTesting,
  apply as applyWallet,
  balanceCurrency,
  healthSnapshot,
  historyDayKey,
  normalizeHistory,
  isBeijingPeak,
  parseOfficialPricingHtml,
  pricingWindowSnapshot,
  ratesFor,
  costOf,
  normalizeStoreData,
  normalizeThreshold,
  sumBalances,
  normalizeAccountsData,
  maskKey,
  validateApiKey,
} from '../index.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

function readProjectFile(path) {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8')
}

function localMarkdownTargets(markdown) {
  const targets = []
  const links = /!?\[[^\]]*\]\(([^)]+)\)/g
  for (const match of markdown.matchAll(links)) {
    let target = match[1].trim().replace(/^<|>$/g, '')
    if (/^(?:[a-z]+:|#)/i.test(target)) continue
    target = target.split('#', 1)[0]
    if (target !== '') targets.push(target)
  }
  return targets
}

function createRouteRequest(method, body, url) {
  const req = new EventEmitter()
  req.method = method
  req.url = url || '/'
  const completion = new Promise((resolveEnd) => {
    req.response = {
      status: null,
      headers: null,
      body: '',
      writeHead(status, headers) {
        req.response.status = status
        req.response.headers = headers
      },
      end(value) {
        req.response.body = value === undefined ? '' : String(value)
        resolveEnd(req.response)
      },
    }
  })
  req.send = function () {
    queueMicrotask(() => {
      if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
      req.emit('end')
    })
    return completion
  }
  return req
}

// Beijing wall-clock helper: ms timestamp for a Beijing local time.
function bj(y, m, d, h, min = 0) {
  return Date.UTC(y, m - 1, d, h - 8, min)
}

function loadClientBundle(React, globals = {}, windowOverrides = {}) {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  let definition
  const values = new Map()
  const window = {
    __ModuleLoader__: { load(value) { definition = value } },
    innerWidth: 1359,
    innerHeight: 851,
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null },
      setItem(key, value) { values.set(key, String(value)) },
    },
    ...windowOverrides,
  }
  runInNewContext(source, { window, ...globals })
  assert.ok(definition, 'client bundle must register with the module loader')
  return {
    exports: definition.factory((id) => {
      assert.equal(id, 'react')
      return React
    }),
    window,
  }
}

function createHookRenderer() {
  const hooks = []
  const pendingEffects = []
  let cursor = 0
  let effectsEnabled = false
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return {
        type,
        props: { ...(props || {}), children: children.length === 1 ? children[0] : children },
      }
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = { current: initial }
      return hooks[index]
    },
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      return [hooks[index], (value) => {
        hooks[index] = typeof value === 'function' ? value(hooks[index]) : value
      }]
    },
    // Effects stay no-ops unless a test opts in via render(..., { flushEffects: true });
    // collected callbacks then run right after the render pass so fetch-driven
    // state can settle before a follow-up render.
    useEffect(fn) {
      const index = cursor++
      if (effectsEnabled && !(index in hooks)) { hooks[index] = null; pendingEffects.push(fn) }
      else if (!(index in hooks)) hooks[index] = null
    },
    useLayoutEffect() { cursor++ },
  }
  return {
    React,
    render(Component, props, options) {
      cursor = 0
      effectsEnabled = !!(options && options.flushEffects)
      const tree = Component(props)
      if (pendingEffects.length > 0) {
        const fns = pendingEffects.splice(0)
        for (const fn of fns) fn()
      }
      return tree
    },
  }
}

function findElement(node, predicate) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }
  if (predicate(node)) return node
  return findElement(node.props && node.props.children, predicate)
}

function walletComponent(bundleExports) {
  let Component
  let slot
  bundleExports.apply({
    inject(_names, callback) {
      callback({
        effect(run) { run() },
        slots: {
          register(definition, value) {
            slot = definition
            Component = value
            return () => {}
          },
        },
      })
    },
  })
  return { Component, slot }
}

test('client bundle registers the loader under the package name', () => {
  // client-modules verifies the boot graph row id (the package name) against
  // the id the bundle passes to __ModuleLoader__.load; a mismatch aborts the
  // whole plugin boot ("loaded without registering ..."). Regression guard
  // for https://github.com/feibi-mochi/deepseek-harness-control-center/issues/1
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const match = client.match(/id:\s*'([^']+)'/)
  assert.ok(match, 'lib/client.js must register a loader module id')
  assert.equal(match[1], pkg.name, 'loader id must equal the package name')
})

test('release READMEs use only approved status badges and every local Markdown target exists', () => {
  const documents = [
    resolve(REPO_ROOT, 'README.md'),
    resolve(REPO_ROOT, 'docs/i18n/README.zh-CN.md'),
  ]
  for (const document of documents) {
    const markdown = readFileSync(document, 'utf8')
    const images = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)]
    assert.ok(images.length >= 5, `${document} must retain a compact graphical badge row`)
    for (const [, , target] of images) {
      assert.match(
        target,
        /^(?:https:\/\/img\.shields\.io\/|https:\/\/github\.com\/feibi-mochi\/deepseek-harness-control-center\/actions\/workflows\/validate\.yml\/badge\.svg$)/,
        `${document} contains a non-badge image: ${target}`,
      )
    }
    assert.doesNotMatch(markdown, /docs\/assets\/(?:floating|above-threshold|below-threshold)/i)
    assert.doesNotMatch(markdown, /<img\b/i)
    assert.doesNotMatch(markdown, /^###\s+(?:Screenshots|截图)\s*$/m)
    for (const target of localMarkdownTargets(markdown)) {
      assert.equal(existsSync(resolve(dirname(document), target)), true, `${document} points to missing ${target}`)
    }
  }
  const rootReadme = readProjectFile('README.md')
  assert.match(
    rootReadme,
    /\[简体中文\]\(https:\/\/github\.com\/feibi-mochi\/deepseek-harness-control-center\/blob\/[^)]+\/docs\/i18n\/README\.zh-CN\.md\)/,
    'the npm-rendered root README must use a repository-backed Chinese link',
  )
})

test('release identity and intended npm archive inventory stay aligned', () => {
  const pkg = JSON.parse(readProjectFile('package.json'))
  assert.equal(pkg.name, 'deepseek-harness-wallet')
  assert.equal(pkg.version, '0.3.3')
  assert.equal(pkg.main, 'index.js')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.deepEqual(pkg.files, [
    'CHANGELOG.md',
    'index.js',
    'lib/client.js',
    'lib/plans.js',
    'cordis.patch.yml',
    'integrations/dsh-session-delete/**',
  ])
  assert.equal(pkg.repository.url, 'git+https://github.com/feibi-mochi/deepseek-harness-control-center.git')
  assert.equal(pkg.homepage, 'https://github.com/feibi-mochi/deepseek-harness-control-center#readme')
  assert.equal(pkg.bugs.url, 'https://github.com/feibi-mochi/deepseek-harness-control-center/issues')
  assert.match(pkg.description, /monitor/i)
  assert.match(pkg.description, /recharge/i)
  assert.match(pkg.description, /reminder/i)
  assert.match(pkg.description, /session/i)

  const intendedArchive = [
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
  ]
  for (const path of intendedArchive) {
    assert.equal(existsSync(resolve(REPO_ROOT, path)), true, `intended archive entry is missing: ${path}`)
  }
  assert.deepEqual(intendedArchive.length, 15)
})

test('host integration kit is pinned, reviewable, and free of local-machine data', () => {
  const base = 'integrations/dsh-session-delete'
  const compatibility = JSON.parse(readProjectFile(`${base}/compatibility.json`))
  assert.equal(compatibility.upstream.commit, '47f943859bef60e4160492346772ded9b24f765a')
  assert.equal(compatibility.upstream.rootPackageVersion, '0.1.0-rc.5')
  assert.equal(compatibility.upstream.license, 'MIT')
  assert.match(compatibility.upstream.repository, /^https:\/\/github\.com\/deepseek-ai\/DeepSeek-Harness$/)

  const patch = readProjectFile(`${base}/${compatibility.referencePatch.path}`)
  const hash = createHash('sha256').update(patch).digest('hex')
  assert.equal(hash, compatibility.referencePatch.sha256)
  assert.match(patch, /session\.delete/)
  assert.match(patch, /data-dshw-capability-permanent-delete/)
  assert.match(patch, /JsonlSessionPersistence/)
  assert.match(patch, /SqliteSessionPersistence/)

  const combined = [
    'README.md', 'README.zh-CN.md', 'AGENT_PROMPT.md', 'UPSTREAM-NOTICE.md',
    'compatibility.json', 'preflight.mjs', 'reference/dsh-47f9438-session-delete.patch',
  ].map(path => readProjectFile(`${base}/${path}`)).join('\n')
  assert.doesNotMatch(combined, /C:\\Users\\|\/Users\/[^/]+\/|\/home\/[^/]+\/|DEEPSEEK_API_KEY\s*=|npm_[A-Za-z0-9]+/)
  assert.match(combined, /temporary|临时/i)
  assert.match(combined, /closed-source|封闭源码/i)
  assert.match(combined, /do not force|禁止.*强套/i)
})

test('documentation distinguishes host-gated deletion from clearing wallet data', () => {
  const english = readProjectFile('README.md')
  const chinese = readProjectFile('docs/i18n/README.zh-CN.md')
  assert.match(english, /permanent (?:session )?deletion[^\n]*(?:host|capabilit)/i)
  assert.match(english, /unsupported hosts?[^\n]*disabled/i)
  assert.match(chinese, /永久删除[^\n]*宿主/)
  assert.match(chinese, /不支持[^\n]*禁用/)
  assert.match(english, /Clear current-session wallet data/i)
  assert.match(english, /does not delete the conversation/i)
  assert.match(chinese, /清除本会话钱包数据/)
  assert.match(chinese, /不会删除对话/)
})

test('README heroes stay compact while product overviews remain structured below features', () => {
  const englishReadme = readProjectFile('README.md').replaceAll('\r\n', '\n')
  const chineseReadme = readProjectFile('docs/i18n/README.zh-CN.md').replaceAll('\r\n', '\n')
  const englishHero = englishReadme.split('## What it does', 1)[0]
  const chineseHero = chineseReadme.split('## 能做什么', 1)[0]
  assert.ok(englishHero.length < 1800, 'English hero must remain quickly scannable')
  assert.ok(chineseHero.length < 1200, 'Chinese hero must remain quickly scannable')
  assert.match(englishHero, /consider leaving a ⭐ Star/, 'English Star prompt must remain in the hero')
  assert.match(chineseHero, /考虑点一个 ⭐ Star/, 'Chinese Star prompt must remain in the hero')
  const english = englishReadme.split('## Project overview')[1].split('## Install')[0]
  const chinese = chineseReadme.split('## 项目介绍')[1].split('## 安装')[0]
  assert.ok(english.length >= 1500 && english.length < 3000, 'English overview must remain substantial but scannable')
  assert.ok(chinese.length >= 500 && chinese.length < 1500, 'Chinese overview must remain substantial but scannable')
  assert.doesNotMatch(english, /consider leaving a ⭐ Star/, 'English Star prompt must not trail the overview')
  assert.doesNotMatch(chinese, /考虑点一个 ⭐ Star/, 'Chinese Star prompt must not trail the overview')
  for (const term of ['One place for the signals that matter', 'Present when needed, quiet when not', 'Extensible without hiding the boundaries']) {
    assert.match(english, new RegExp(term, 'i'), `English introduction is missing ${term}`)
  }
  for (const term of ['把重要信息收回对话旁边', '需要时出现，平时不打扰', '可以扩展，但不隐藏能力边界']) {
    assert.match(chinese, new RegExp(term), `Chinese introduction is missing ${term}`)
  }
  assert.match(english, /cannot be enabled by configuring the plugin alone/i)
  assert.match(english, /integrations\/dsh-session-delete\/AGENT_PROMPT\.md/)
  assert.match(chinese, /不是在插件里改个配置就能启用/)
  assert.match(chinese, /integrations\/dsh-session-delete\/AGENT_PROMPT\.md/)
})

test('policy table: since dates match the documented timeline', () => {
  assert.equal(PRICE_POLICIES.length, 4)
  // 2025-02-09: deepseek-chat / deepseek-reasoner.
  assert.equal(PRICE_POLICIES[0].since, Date.UTC(2025, 1, 9))
  // 2026-04-24: v4 flat rates (V4 preview launch).
  assert.equal(PRICE_POLICIES[1].since, Date.UTC(2026, 3, 24))
  // 2026-08-17 00:00 Beijing = 2026-08-16T16:00Z.
  assert.equal(PRICE_POLICIES[2].since, Date.UTC(2026, 7, 16, 16))
  assert.equal(PRICE_POLICIES[2].peakOffPeak, true)
  // 2026-08-21 00:00 Beijing = 2026-08-20T16:00Z: Vision Exp release.
  assert.equal(PRICE_POLICIES[3].since, Date.UTC(2026, 7, 20, 16))
  assert.equal(PRICE_POLICIES[3].peakOffPeak, true)
  assert.deepEqual(PRICE_POLICIES[3].models['deepseek-v4-flash-vision-exp'], { cacheHit: [0.05, 0.1], input: [1.5, 3], output: [4.5, 9] })
})

test('official pricing parser reads vision rates and the weekend rule', () => {
  const html = `<table>
    <tr><td>模型</td><td>deepseek-v4-flash</td><td>deepseek-v4-pro</td><td>deepseek-v4-flash-vision-exp</td></tr>
    <tr><td>百万tokens输入（缓存命中）</td><td>空闲时段</td><td>0.05元</td><td>0.15元</td><td>0.05元</td></tr>
    <tr><td>高峰时段</td><td>0.10元</td><td>0.30元</td><td>0.10元</td></tr>
    <tr><td>百万tokens输入（缓存未命中）</td><td>空闲时段</td><td>1.5元</td><td>4.5元</td><td>1.5元</td></tr>
    <tr><td>高峰时段</td><td>3.0元</td><td>9.0元</td><td>3.0元</td></tr>
    <tr><td>百万tokens输出</td><td>空闲时段</td><td>4.5元</td><td>13.5元</td><td>4.5元</td></tr>
    <tr><td>高峰时段</td><td>9.0元</td><td>27.0元</td><td>9.0元</td></tr>
  </table>
  <p>高峰时段为北京时间 9:00 - 12:00、14:00 - 18:00（其余为空闲时段）。我们将于北京时间2026年8月23日（周日）00:00起，对峰谷计费规则做出调整，周末（周六、周日）全天不再区分峰谷时段，统一按照低谷时段价格收取调用费用。</p>${'x'.repeat(500)}`
  const parsed = parseOfficialPricingHtml(html)
  assert.deepEqual(parsed.models['deepseek-v4-flash-vision-exp'], {
    cacheHit: [0.05, 0.1], input: [1.5, 3], output: [4.5, 9],
  })
  assert.deepEqual(parsed.peakWindows, [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }])
  assert.equal(parsed.weekendOffPeakSince, bj(2026, 8, 23, 0, 0))
  assert.match(parsed.ruleVersion, /^official-[0-9a-f]{12}$/)
  assert.throws(() => parseOfficialPricingHtml(html.replace('<td>0.05元</td>', '<td>0.06元</td>')), /relationship changed/)
  assert.throws(() => parseOfficialPricingHtml(html.replace('14:00 - 18:00', '18:00 - 14:00')), /peak window is invalid/)
})

test('official pricing parser accepts the current weekday-only wording', () => {
  const html = `<table>
    <tr><td>模型</td><td>deepseek-v4-flash</td><td>deepseek-v4-pro</td><td>deepseek-v4-flash-vision-exp</td></tr>
    <tr><td>百万tokens输入（缓存命中）</td><td>空闲时段</td><td>0.05元</td><td>0.15元</td><td>0.05元</td></tr>
    <tr><td>高峰时段</td><td>0.10元</td><td>0.30元</td><td>0.10元</td></tr>
    <tr><td>百万tokens输入（缓存未命中）</td><td>空闲时段</td><td>1.5元</td><td>4.5元</td><td>1.5元</td></tr>
    <tr><td>高峰时段</td><td>3.0元</td><td>9.0元</td><td>3.0元</td></tr>
    <tr><td>百万tokens输出</td><td>空闲时段</td><td>4.5元</td><td>13.5元</td><td>4.5元</td></tr>
    <tr><td>高峰时段</td><td>9.0元</td><td>27.0元</td><td>9.0元</td></tr>
  </table>
  <p>空闲时段价格为高峰时段价格的一半。高峰时段为北京时间周一至周五 9:00 - 12:00、14:00 - 18:00（其余为空闲时段）。</p>${'x'.repeat(500)}`
  const parsed = parseOfficialPricingHtml(html)
  assert.deepEqual(parsed.peakWindows, [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }])
  assert.equal(parsed.weekendOffPeakSince, bj(2026, 8, 23, 0, 0))
})

test('official pricing sync updates only current peak policies and preserves historical flat rates', () => {
  hostTesting.applyOfficialPricing({
    models: {
      'deepseek-v4-flash': { cacheHit: [0.05, 0.1], input: [1.5, 3], output: [4.5, 9] },
      'deepseek-v4-pro': { cacheHit: [0.15, 0.3], input: [4.5, 9], output: [13.5, 27] },
      'deepseek-v4-flash-vision-exp': { cacheHit: [0.05, 0.1], input: [1.5, 3], output: [4.5, 9] },
    },
    peakWindows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }],
    weekendOffPeakSince: bj(2026, 8, 23, 0),
    ruleVersion: 'official-test',
  }, { headers: { get() { return null } } })
  assert.deepEqual(ratesFor('deepseek-v4-flash', bj(2026, 5, 1, 10)), { cacheHit: 0.02, input: 1, output: 2 })
  assert.deepEqual(ratesFor('deepseek-v4-flash', bj(2026, 8, 18, 10)), { cacheHit: 0.1, input: 3, output: 9 })
  assert.equal(ratesFor('deepseek-v4-flash-vision-exp', bj(2026, 8, 20, 10)), null)
})
test('portable AES-GCM account encryption round-trips and rejects tampering', () => {
  const key = Buffer.alloc(32, 7)
  const iv = Buffer.alloc(12, 3)
  const encrypted = hostTesting.encryptApiKeyAes('sk-portable-1234567890', key, iv)
  assert.equal(encrypted.scheme, 'aes-gcm-file-key')
  assert.doesNotMatch(JSON.stringify(encrypted), /sk-portable/)
  assert.equal(hostTesting.decryptApiKeyAes(encrypted, key), 'sk-portable-1234567890')
  const tampered = { ...encrypted, tag: Buffer.alloc(16, 9).toString('base64') }
  assert.throws(() => hostTesting.decryptApiKeyAes(tampered, key))
})

test('health snapshot exposes compatibility, pricing sync, and encrypted account status without secrets', () => {
  const health = healthSnapshot()
  assert.equal(health.ok, true)
  assert.equal(health.plugin.name, 'deepseek-harness-wallet')
  assert.equal(health.plugin.version, JSON.parse(readProjectFile('package.json')).version)
  assert.equal(typeof health.host.compatibility.status, 'string')
  assert.equal(typeof health.pricing.status, 'string')
  assert.equal(health.accounts.encryptedAtRest, true)
  assert.equal(typeof health.usage.status, 'string')
  assert.equal(health.usage.retentionDays, 365)
  assert.equal(Object.hasOwn(health, 'apiKey'), false)
  assert.equal(typeof accountStorageSnapshot().scheme, 'string')
})

test('isBeijingPeak: peak windows are 09:00-12:00 and 14:00-18:00 Beijing', () => {
  assert.equal(isBeijingPeak(bj(2026, 8, 17, 8, 59)), false)
  assert.equal(isBeijingPeak(bj(2026, 8, 17, 9, 0)), true)
  assert.equal(isBeijingPeak(bj(2026, 8, 17, 11, 59)), true)
  assert.equal(isBeijingPeak(bj(2026, 8, 17, 12, 0)), false) // lunch gap
  assert.equal(isBeijingPeak(bj(2026, 8, 17, 13, 59)), false)
  assert.equal(isBeijingPeak(bj(2026, 8, 17, 14, 0)), true)
  assert.equal(isBeijingPeak(bj(2026, 8, 17, 17, 59)), true)
  assert.equal(isBeijingPeak(bj(2026, 8, 17, 18, 0)), false)
  // UTC sanity: 09:00 Beijing == 01:00 UTC.
  assert.equal(isBeijingPeak(Date.UTC(2026, 7, 17, 1, 0)), true)
  assert.equal(isBeijingPeak(Date.UTC(2026, 7, 16, 18, 0)), false)
})

test('isBeijingPeak: weekends become all-day off-peak from 2026-08-23', () => {
  // The official change takes effect at 2026-08-23 00:00 Beijing
  // (2026-08-22T16:00Z): Saturday and Sunday no longer enter peak pricing.
  assert.equal(isBeijingPeak(bj(2026, 8, 28, 10, 0)), true, 'Friday remains peak at 10:00')
  assert.equal(isBeijingPeak(bj(2026, 8, 29, 10, 0)), false, 'Saturday is all-day off-peak')
  assert.equal(isBeijingPeak(bj(2026, 8, 30, 10, 0)), false, 'Sunday is all-day off-peak')
  assert.equal(isBeijingPeak(bj(2026, 8, 31, 10, 0)), true, 'Monday resumes weekday peak pricing')
})

test('pricing snapshot hides peak windows on weekends for stale-client safety', () => {
  const sunday = pricingWindowSnapshot(bj(2026, 8, 23, 11, 23))
  assert.equal(sunday.weekendOffPeak, true)
  assert.equal(sunday.isPeak, false)
  assert.deepEqual(sunday.windows, [])
  const monday = pricingWindowSnapshot(bj(2026, 8, 24, 10, 0))
  assert.equal(monday.weekendOffPeak, false)
  assert.equal(monday.isPeak, true)
  assert.deepEqual(monday.windows, [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }])
})

test('ratesFor: flat v4 rates before the peak/off-peak rollout', () => {
  assert.deepEqual(ratesFor('deepseek-v4-flash', bj(2026, 8, 16, 23, 59)), {
    cacheHit: 0.02, input: 1, output: 2,
  })
  assert.deepEqual(ratesFor('deepseek-v4-pro', bj(2026, 8, 16, 23, 59)), {
    cacheHit: 0.025, input: 3, output: 6,
  })
})

test('ratesFor: vision model starts at its 2026-08-21 launch boundary', () => {
  assert.equal(ratesFor('deepseek-v4-flash-vision-exp', bj(2026, 8, 20, 23, 59)), null)
  assert.deepEqual(ratesFor('deepseek-v4-flash-vision-exp', bj(2026, 8, 21, 0, 0)), {
    cacheHit: 0.05, input: 1.5, output: 4.5,
  })
  assert.deepEqual(ratesFor('deepseek-v4-flash-vision-exp', bj(2026, 8, 21, 10, 0)), {
    cacheHit: 0.1, input: 3, output: 9,
  })
})

test('ratesFor: peak/off-peak rollout from 2026-08-17 00:00 Beijing', () => {
  // 00:00 is off-peak.
  assert.deepEqual(ratesFor('deepseek-v4-flash', bj(2026, 8, 17, 0, 0)), {
    cacheHit: 0.05, input: 1.5, output: 4.5,
  })
  assert.deepEqual(ratesFor('deepseek-v4-pro', bj(2026, 8, 17, 0, 0)), {
    cacheHit: 0.15, input: 4.5, output: 13.5,
  })
  // Peak starts 09:00.
  assert.deepEqual(ratesFor('deepseek-v4-flash', bj(2026, 8, 17, 9, 0)), {
    cacheHit: 0.1, input: 3, output: 9,
  })
  assert.deepEqual(ratesFor('deepseek-v4-pro', bj(2026, 8, 17, 9, 0)), {
    cacheHit: 0.3, input: 9, output: 27,
  })
  // Lunch gap is off-peak.
  assert.deepEqual(ratesFor('deepseek-v4-flash', bj(2026, 8, 17, 12, 0)), {
    cacheHit: 0.05, input: 1.5, output: 4.5,
  })
  // Second peak window.
  assert.deepEqual(ratesFor('deepseek-v4-pro', bj(2026, 8, 17, 14, 0)), {
    cacheHit: 0.3, input: 9, output: 27,
  })
  // Off-peak again after 18:00.
  assert.deepEqual(ratesFor('deepseek-v4-pro', bj(2026, 8, 17, 18, 0)), {
    cacheHit: 0.15, input: 4.5, output: 13.5,
  })
})

test('ratesFor: chat/reasoner keep flat rates after the rollout', () => {
  assert.deepEqual(ratesFor('deepseek-chat', bj(2026, 8, 17, 10, 0)), {
    cacheHit: 0.5, input: 2, output: 8,
  })
  assert.deepEqual(ratesFor('deepseek-reasoner', bj(2026, 8, 17, 10, 0)), {
    cacheHit: 1, input: 4, output: 16,
  })
})

test('ratesFor: v4 policy boundary and unknown models', () => {
  assert.deepEqual(ratesFor('deepseek-v4-pro', Date.UTC(2026, 3, 24, 0, 0)), {
    cacheHit: 0.025, input: 3, output: 6,
  })
  assert.equal(ratesFor('deepseek-v4-pro', Date.UTC(2026, 3, 23, 23, 59)), null)
  assert.equal(ratesFor('some-other-model', bj(2026, 8, 17, 10, 0)), null)
})

test('costOf: flat-rate math and cache-write exemption', () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 }
  // v4-pro flat: 3 + 6 + 0.025 = 9.025.
  assert.equal(costOf('deepseek-v4-pro', usage, bj(2026, 8, 1, 10, 0)), 9.025)
  // cacheWrite is never billed, no matter its size.
  assert.equal(
    costOf('deepseek-v4-pro', { ...usage, cacheWriteTokens: 999_999_999 }, bj(2026, 8, 1, 10, 0)),
    9.025,
  )
  assert.equal(costOf('some-other-model', usage, bj(2026, 8, 1, 10, 0)), null)
})

test('costOf: peak and off-peak totals after the rollout', () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 }
  // v4-pro peak: 9 + 27 + 0.3 = 36.3; off-peak: 4.5 + 13.5 + 0.15 = 18.15.
  assert.equal(costOf('deepseek-v4-pro', usage, bj(2026, 8, 17, 10, 0)), 36.3)
  assert.equal(costOf('deepseek-v4-pro', usage, bj(2026, 8, 17, 22, 0)), 18.15)
})

test('costOf: legacy input/output field aliases still work', () => {
  const usage = { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000 }
  assert.equal(costOf('deepseek-v4-pro', usage, bj(2026, 8, 1, 10, 0)), 9.025)
})

test('normalizeThreshold: coercion, clamping, and two-decimal rounding', () => {
  assert.equal(normalizeThreshold(1), 1)
  assert.equal(normalizeThreshold('2.5'), 2.5)
  assert.equal(normalizeThreshold(0), 0)
  assert.equal(normalizeThreshold('abc'), 5) // DEFAULT_THRESHOLD
  assert.equal(normalizeThreshold(undefined), 5)
  assert.equal(normalizeThreshold(null), 5)
  assert.equal(normalizeThreshold(100_001), 100_000)
  assert.equal(normalizeThreshold(-3), 0)
  assert.equal(normalizeThreshold(1.234), 1.23)
  assert.equal(normalizeThreshold(1.239), 1.24)
})

test('sumBalances: prefers the CNY record, never mixes currencies', () => {
  const cny = { currency: 'CNY', total_balance: '7.09' }
  const usd = { currency: 'USD', total_balance: '50.00' }
  // CNY preferred over any USD record.
  assert.equal(sumBalances([cny, usd]), 7.09)
  assert.equal(sumBalances([usd, cny]), 7.09)
  // Mixed currencies without CNY: first record wins, no summing.
  assert.equal(sumBalances([usd, { currency: 'EUR', total_balance: '10.00' }]), 50)
  // Same-currency records do sum.
  assert.equal(sumBalances([
    { currency: 'USD', total_balance: '50.00' },
    { currency: 'USD', total_balance: '1.25' },
  ]), 51.25)
  // Empty and malformed inputs.
  assert.equal(sumBalances([]), 0)
  assert.equal(sumBalances(undefined), 0)
  assert.equal(sumBalances(null), 0)
  // Non-numeric records are ignored rather than NaN-poisoning the total.
  assert.equal(sumBalances([{ currency: 'CNY', total_balance: 'nope' }, usd]), 50)
})

test('official cost is accumulated at usage time and remains stable later', () => {
  const bucket = { models: {}, cost: 0, priced: true }
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 }
  addOfficialUsage(bucket, 'deepseek-v4-pro', usage, bj(2026, 8, 17, 22, 0))
  assert.equal(bucket.cost, 18.15)
  addOfficialUsage(bucket, 'deepseek-v4-pro', usage, bj(2026, 8, 18, 10, 0))
  assert.ok(Math.abs(bucket.cost - 54.45) < 1e-12)
  assert.equal(bucket.models['deepseek-v4-pro'].input, 2_000_000)

  const normalized = normalizeStoreData({
    version: 4,
    thresholds: { CNY: 5 },
    accountThresholds: {},
    sessions: { current: { official: { ...bucket }, third: { models: {} } } },
    officialProviders: [],
    knownProviders: [],
    plans: {},
  }, bj(2026, 8, 19, 22, 0))
  assert.ok(Math.abs(normalized.store.sessions.current.official.cost - 54.45) < 1e-12)
  assert.equal(normalized.migrated, false)
})

test('legacy stores migrate once and malformed counters are sanitized', () => {
  const legacy = {
    threshold: '7.25',
    sessions: {
      old: {
        official: { models: { 'deepseek-v4-pro': {
          input: 1_000_000,
          output: 1_000_000,
          cacheRead: 1_000_000,
          cacheWrite: -10,
          reasoning: 'bad',
        } } },
        third: { models: {} },
      },
    },
  }
  const first = normalizeStoreData(legacy, bj(2026, 8, 17, 22, 0))
  assert.equal(first.migrated, true)
  assert.equal(first.store.version, 4)
  assert.equal(first.store.thresholds.CNY, 7.25)
  assert.equal(first.store.sessions.old.official.cost, 18.15)
  assert.equal(first.store.sessions.old.official.models['deepseek-v4-pro'].cacheWrite, 0)
  assert.equal(first.store.sessions.old.official.models['deepseek-v4-pro'].reasoning, 0)

  const second = normalizeStoreData(first.store, bj(2026, 8, 18, 10, 0))
  assert.equal(second.migrated, false)
  assert.equal(second.store.sessions.old.official.cost, 18.15)
})

test('history day keys use Beijing calendar boundaries and malformed events are dropped', () => {
  const atMs = bj(2026, 8, 23, 12)
  assert.equal(historyDayKey(Date.parse('2026-08-22T15:59:59Z')), '2026-08-22')
  assert.equal(historyDayKey(Date.parse('2026-08-22T16:00:00Z')), '2026-08-23')
  const duplicateId = createHash('sha256').update('duplicate').digest('hex')
  const oldAt = atMs - 366 * 86_400_000
  const normalized = normalizeHistory({
    events: {
      [duplicateId]: {
        occurredAt: atMs - 10_000,
        sessionId: 'session-history', provider: 'deepseek-official', model: 'deepseek-v4-flash', official: true,
        priced: true, cost: 0.01, usage: { input: 10, output: 20 },
      },
      [createHash('sha256').update('newer').digest('hex')]: {
        occurredAt: atMs - 1_000,
        sessionId: 'session-history', provider: 'deepseek-official', model: 'deepseek-v4-flash', official: true,
        priced: true, cost: 0.02, usage: { input: 30, output: 40 },
      },
      [createHash('sha256').update('old').digest('hex')]: {
        occurredAt: oldAt,
        sessionId: 'session-history', provider: 'deepseek-official', model: 'deepseek-v4-flash', official: true,
        priced: true, cost: 0.03, usage: { input: 50, output: 60 },
      },
      bad: { occurredAt: atMs, sessionId: 'session-history', provider: 'deepseek-official' },
    },
  }, atMs)
  assert.equal(Object.keys(normalized.events).length, 2)
  assert.equal(normalized.events[duplicateId].usage.input, 10)
  assert.equal(normalized.timezone, 'Asia/Shanghai')
  assert.equal(normalized.retentionDays, 365)
})
test('wallet store normalization bounds untrusted session and model identifiers', () => {
  const models = {}
  for (let index = 0; index < 510; index += 1) models['model-' + index] = { input: 1 }
  models['bad\u0000model'] = { input: 999 }
  const sessions = {}
  for (let index = 0; index < 5_010; index += 1) {
    sessions['session-' + index] = { official: { models: index === 0 ? models : {} }, third: { models: {} } }
  }
  sessions['bad\u0000session'] = { official: { models: {} }, third: { models: {} } }
  const normalized = normalizeStoreData({ version: 3, thresholds: { CNY: 5 }, sessions, officialProviders: [], knownProviders: [] })
  assert.equal(Object.keys(normalized.store.sessions).length, 5_000)
  assert.equal(Object.keys(normalized.store.sessions['session-0'].official.models).length, 500)
  assert.equal(Object.hasOwn(normalized.store.sessions, 'bad\u0000session'), false)
  assert.equal(Object.hasOwn(normalized.store.sessions['session-0'].official.models, 'bad\u0000model'), false)
})
test('unknown official models retain tokens and mark the session cost unpriced', () => {
  const bucket = { models: {}, cost: 0, priced: true }
  addOfficialUsage(bucket, 'future-model', { inputTokens: 123, outputTokens: 45 }, Date.now())
  assert.equal(bucket.priced, false)
  assert.equal(bucket.cost, 0)
  assert.equal(bucket.models['future-model'].input, 123)
  assert.equal(bucket.models['future-model'].output, 45)
})

test('balance currency follows the selected balance row', () => {
  assert.equal(balanceCurrency([{ currency: 'USD', total_balance: '8.50' }]), 'USD')
  assert.equal(balanceCurrency([
    { currency: 'USD', total_balance: '8.50' },
    { currency: 'CNY', total_balance: '2.00' },
  ]), 'CNY')
  assert.equal(balanceCurrency([{ currency: 'CNY', total_balance: 'bad' }]), null)
})

test('client layout flips above a bottom-edge chip and clamps each floating size', () => {
  const { React } = createHookRenderer()
  const { exports } = loadClientBundle(React)
  const above = exports.__testing.computePanelPosition(
    { left: 1100, top: 820, bottom: 843 },
    { width: 300, height: 340 },
    1359,
    851,
  )
  assert.equal(above.left, 1051)
  assert.equal(above.top, 474)
  assert.equal(above.visibility, 'visible')

  const below = exports.__testing.computePanelPosition(
    { left: 20, top: 20, bottom: 42 },
    { width: 300, height: 340 },
    1359,
    851,
  )
  assert.equal(below.top, 48)
  assert.equal(exports.__testing.clampPosition({ x: 2000, y: 900 }, 36, 36, 1359, 851).x, 1319)
  assert.equal(exports.__testing.clampPosition({ x: 2000, y: 900 }, 306, 340, 1359, 851).x, 1049)
  const freeDot = exports.__testing.settleDotPosition({ x: 317, y: 246 }, 36, 36, 1359, 851)
  assert.equal(freeDot.x, 317, 'a minimized dot must keep its free horizontal position')
  assert.equal(freeDot.y, 246, 'a minimized dot must keep its free vertical position')
})

test('wallet chip uses pointer drop zones without blocking continuous drags', () => {
  const { React } = createHookRenderer()
  const { exports } = loadClientBundle(React)
  const choose = exports.__testing.chooseChipDock
  const home = { left: 425, top: 600, right: 1205, bottom: 740, width: 780, height: 140 }
  const content = { left: 280, top: 0, right: 1400, bottom: 1000, width: 1120, height: 1000 }

  assert.equal(choose({ x: 450, y: 650 }, 180, 22, 1400, 1000, home, { x: 540, y: 661 }, content), 'home')
  // The chip itself can still be clamped inside the composer while the
  // pointer has crossed its lower edge: this must dock in one drag.
  assert.equal(choose({ x: 600, y: 710 }, 180, 22, 1400, 1000, home, { x: 690, y: 746 }, content), 'bottom')
  assert.equal(choose({ x: 4, y: 400 }, 180, 22, 1400, 1000, home, { x: 12, y: 420 }, content), 'left')
  assert.equal(choose({ x: 1216, y: 400 }, 180, 22, 1400, 1000, home, { x: 1390, y: 420 }, content), 'right')
  // The sidebar is horizontal free space, while its divider with the main
  // white content area is a separate vertical dock.
  assert.equal(choose({ x: 80, y: 400 }, 180, 22, 1400, 1000, home, { x: 170, y: 420 }, content), 'free')
  assert.equal(choose({ x: 190, y: 400 }, 180, 22, 1400, 1000, home, { x: 286, y: 420 }, content), 'content-left')
  assert.equal(exports.__testing.computeSideDockX('content-left', 52, 1400, content), 282, 'the divider dock belongs on the white content side')
  assert.equal(choose({ x: 500, y: 300 }, 180, 22, 1400, 1000, home, { x: 590, y: 311 }, content), 'free')
  assert.equal(choose({ x: 600, y: 900 }, 180, 22, 1400, 1000, home, { x: 690, y: 911 }, content), 'free')

  const sidebarDrop = exports.__testing.clampFreeDrop(
    { x: 190, y: 400 }, 180, 22, 1400, 1000, { x: 220, y: 420 }, content,
  )
  assert.equal(sidebarDrop.x, 98, 'a horizontal sidebar chip must not cross the divider')
})

test('wallet chip saved layout is validated before use', () => {
  const { React } = createHookRenderer()
  const { exports } = loadClientBundle(React)
  const left = exports.__testing.normalizeChipLayout({ dock: 'left', x: '4', y: '120' })
  assert.equal(left.dock, 'left')
  assert.equal(left.x, 4)
  assert.equal(left.y, 120)
  assert.equal(exports.__testing.normalizeChipLayout({ dock: 'content-left', x: 200, y: 120 }).dock, 'content-left')
  const invalid = exports.__testing.normalizeChipLayout({ dock: 'unknown', x: 'bad', y: null })
  assert.equal(invalid.dock, 'home')
  assert.equal(invalid.x, 0)
  assert.equal(invalid.y, 0)
})

test('wallet chip scale is stepped, bounded, and drives a live slider', () => {
  const renderer = createHookRenderer()
  const { exports, window } = loadClientBundle(renderer.React)
  assert.equal(exports.__testing.normalizeChipScale('0.83'), 0.85)
  assert.equal(exports.__testing.normalizeChipScale('0.2'), 0.75)
  assert.equal(exports.__testing.normalizeChipScale('2'), 1.25)
  assert.equal(exports.__testing.normalizeChipScale('bad'), 1)

  const { Component } = walletComponent(exports)
  let tree = renderer.render(Component, { sessionId: 'session-1' })
  let chip = findElement(tree, (element) => element.props && element.props['aria-label'] === 'DeepSeek 钱包')
  assert.equal(chip.props.style.zoom, 1)
  findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_chipMain').props.onClick()
  tree = renderer.render(Component, { sessionId: 'session-1' })
  const slider = findElement(tree, (element) => element.type === 'input' && element.props['aria-label'] === '钱包芯片比例')
  assert.ok(slider)
  assert.equal(slider.props.type, 'range')
  assert.equal(slider.props.min, '75')
  assert.equal(slider.props.max, '105', 'the default home dock caps the slider at 105%')
  slider.props.onChange({ target: { value: '85' } })
  tree = renderer.render(Component, { sessionId: 'session-1' })
  chip = findElement(tree, (element) => element.props && element.props['aria-label'] === 'DeepSeek 钱包')
  assert.equal(chip.props.style.zoom, 0.85)
  assert.equal(window.localStorage.getItem('dshw-chip-scale-v1'), '0.85')
})

test('home chip keeps a clickable compact value when the composer slot shrinks', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /\.dshw_anchorHome\{[^}]*overflow:hidden/)
  assert.match(source, /\.dshw_anchorHome\{[^}]*min-width:44px/)
  assert.ok(!/@container dshw-home/.test(source), 'container queries must not size the home anchor: inline-size containment collapses it to the 44px minimum even in roomy composers')
  assert.match(source, /\.dshw_anchorHome\.dshw_compact \.dshw_recharge\{display:none\}/)
  assert.match(source, /\.dshw_anchorHome\.dshw_fit \.dshw_chipMain>span:not\(\.dshw_homePrimary\)\{display:none\}/, 'a tight row must degrade to balance plus recharge before collapsing to the bare value')
  assert.match(source, /chipNode\.clientWidth >= chipNode\.scrollWidth - 1 \? 'fit' : 'compact'/, 'home sizing must let the composer row decide between full, fit, and compact modes')
  assert.match(source, /dock === 'home' \? 1\.05 : 1\.25/, 'the scale cap must tighten to 105% while the chip is docked in the composer')
  assert.match(source, /max: String\(scaleMaxPercent\)/, 'the slider max must follow the dock-specific scale cap')
  assert.match(source, /chipScaleRef\.current > 1\.05\) saveChipScale\(1\.05\)/, 'a stored 125% must clamp down when the chip returns home')

  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const { Component } = walletComponent(exports)
  const tree = renderer.render(Component, { sessionId: 'session-1' })
  const anchor = findElement(tree, (element) => element.props && element.props.className === 'dshw_anchor dshw_anchorHome')
  const primary = findElement(tree, (element) => element.props && element.props.className === 'dshw_balanceText dshw_homePrimary')
  assert.ok(anchor, 'the in-composer state must expose a constrained home container')
  assert.ok(primary, 'the compact state must preserve the official balance as its primary value')
  assert.equal(primary.props.children[0].props.className, 'dshw_homePrimaryLabel')
  assert.equal(primary.props.children[1].props.className, 'dshw_homePrimaryValue')
})

test('docked chip escapes the composer stacking context', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /\.dshw_chipLift\{z-index:80!important\}/, 'the lift class must outrank host panels that cover docked chips')
  assert.match(source, /isStackingContext\(/, 'trapping ancestor stacking contexts must be detected')
  assert.match(source, /outermost\.classList\.add\('dshw_chipLift'\)/, 'the outermost trapping ancestor must be lifted while docked')
  assert.match(source, /outermost\.classList\.remove\('dshw_chipLift'\)/, 'the lift must be removed when the effect cleans up')
})

test('low-balance chip keeps a red frame and pulses inward', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /\.dshw_chipLow\{[^}]*border-color:[^;}]*state-error-primary[^}]*animation:dshwChipPulseIn/)
  assert.match(source, /\.dshw_chipLow:hover,\.dshw_chipLow:focus-within\{border-color:[^;}]*state-error-primary/)
  assert.match(source, /@keyframes dshwChipPulseIn/)
  assert.match(source, /box-shadow:inset 0 0 0 3px rgba\(229,83,75,\.32\)/)
  assert.match(source, /\.dshw_chipLow\.dshw_noBlink\{animation:none\}/)
})

test('official and third-party displays can be selected independently', () => {
  const renderer = createHookRenderer()
  const { exports, window } = loadClientBundle(renderer.React)
  assert.deepEqual({ ...exports.__testing.normalizeDataVisibility({ official: false, third: true }) }, { official: false, third: true })
  assert.deepEqual({ ...exports.__testing.normalizeDataVisibility({ official: false, third: false }) }, { official: true, third: false })

  const { Component } = walletComponent(exports)
  let tree = renderer.render(Component, { sessionId: 'session-1' })
  findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_chipMain').props.onClick()
  tree = renderer.render(Component, { sessionId: 'session-1' })
  let thirdToggle = findElement(tree, (element) => element.type === 'input' && element.props['aria-label'] === '显示第三方 token')
  assert.equal(thirdToggle.props.checked, true)
  thirdToggle.props.onChange({ target: { checked: false } })
  tree = renderer.render(Component, { sessionId: 'session-1' })
  assert.equal(findElement(tree, (element) => element.props && element.props.children === '第三方合计'), null)
  let officialToggle = findElement(tree, (element) => element.type === 'input' && element.props['aria-label'] === '显示官方数据')
  assert.equal(officialToggle.props.disabled, true, 'the final visible source cannot be turned off')

  thirdToggle = findElement(tree, (element) => element.type === 'input' && element.props['aria-label'] === '显示第三方 token')
  thirdToggle.props.onChange({ target: { checked: true } })
  tree = renderer.render(Component, { sessionId: 'session-1' })
  officialToggle = findElement(tree, (element) => element.type === 'input' && element.props['aria-label'] === '显示官方数据')
  officialToggle.props.onChange({ target: { checked: false } })
  tree = renderer.render(Component, { sessionId: 'session-1' })
  assert.equal(findElement(tree, (element) => element.props && element.props.children === '官方 DeepSeek'), null)
  assert.ok(findElement(tree, (element) => element.props && element.props.children === '第三方合计'))
  assert.equal(findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_recharge'), null)
  assert.equal(window.localStorage.getItem('dshw-data-visibility-v1'), JSON.stringify({ official: false, third: true }))
})

test('completion reminders support manual close and bounded timeout choices', () => {
  const renderer = createHookRenderer()
  const { exports, window } = loadClientBundle(renderer.React)
  assert.deepEqual(
    { ...exports.__testing.normalizeNotifyConfig(null) },
    { enabled: true, timeout: 10 },
  )
  assert.deepEqual(
    { ...exports.__testing.normalizeNotifyConfig({ enabled: false, timeout: 0 }) },
    { enabled: false, timeout: 0 },
  )
  assert.deepEqual(
    { ...exports.__testing.normalizeNotifyConfig({ enabled: true, timeout: 17 }) },
    { enabled: true, timeout: 10 },
  )
  assert.deepEqual(
    { ...exports.__testing.normalizeNotifyConfig({ enabled: true, autoCloseMs: null }) },
    { enabled: true, timeout: 0 },
  )
  assert.deepEqual(
    { ...exports.__testing.normalizeNotifyConfig({ enabled: false, autoCloseMs: 30000 }) },
    { enabled: false, timeout: 30 },
  )

  const { Component } = walletComponent(exports)
  let tree = renderer.render(Component, { sessionId: 'session-1' })
  findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_chipMain').props.onClick()
  tree = renderer.render(Component, { sessionId: 'session-1' })
  // The reminder toggle and its timeout merged into one select (compact card)
  const select = findElement(tree, (element) => element.type === 'select' && element.props['aria-label'] === '完成提醒')
  assert.ok(select, 'the merged reminder select must render')
  assert.equal(select.props.value, '10')
  assert.deepEqual(select.props.children.map((option) => option.props.value), ['off', '5', '10', '30', '60', 'keep'])

  select.props.onChange({ target: { value: 'keep' } })
  tree = renderer.render(Component, { sessionId: 'session-1' })
  assert.equal(
    findElement(tree, (element) => element.type === 'select' && element.props['aria-label'] === '完成提醒').props.value,
    'keep',
  )
  assert.equal(window.localStorage.getItem('dshw-completion-notify-v1'), JSON.stringify({ enabled: true, timeout: 0 }))

  select.props.onChange({ target: { value: 'off' } })
  tree = renderer.render(Component, { sessionId: 'session-1' })
  assert.equal(
    findElement(tree, (element) => element.type === 'select' && element.props['aria-label'] === '完成提醒').props.value,
    'off',
  )
})

test('simultaneous completions are deduplicated and displayed as a single-file queue', async () => {
  const notifications = []
  class FakeNotification {
    static permission = 'granted'
    constructor(title, options) {
      this.title = title
      this.options = options
      this.onclick = null
      this.onclose = null
      notifications.push(this)
    }
    close() {}
  }
  const renderer = createHookRenderer()
  const { exports, window } = loadClientBundle(renderer.React, {
    Notification: FakeNotification,
    navigator: {},
    AbortController,
    setTimeout,
    clearTimeout,
  })
  window.addEventListener = () => {}
  window.removeEventListener = () => {}
  window.focus = () => {}
  window.localStorage.setItem('dshw-completion-notify-v1', JSON.stringify({ enabled: true, timeout: 0 }))

  let snapshot = {
    ids: ['one', 'two'],
    byId: {
      one: { id: 'one', displayTitle: '第一段对话', completed: false },
      two: { id: 'two', displayTitle: '第二段对话', completed: false },
    },
  }
  let changed
  let unsubscribed = false
  const opened = []
  const cleanupNotifier = exports.__testing.installCompletionNotifier({
    sessions: {
      list: {
        getSnapshot: () => snapshot,
        subscribe(callback) { changed = callback; return () => { unsubscribed = true } },
      },
      open(id) { opened.push(id) },
    },
  })

  snapshot = {
    ids: ['one', 'two'],
    byId: {
      one: { id: 'one', displayTitle: '第一段对话', completed: true },
      two: { id: 'two', displayTitle: '第二段对话', completed: true },
    },
  }
  changed()
  changed()
  assert.equal(notifications.length, 2, 'the single active popup is refreshed when another conversation completes')
  assert.match(notifications[1].options.body, /第一段对话/)
  assert.match(notifications[1].options.body, /另有 1 个对话/)

  notifications[1].onclose()
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(notifications.length, 3, 'closing the refreshed popup advances the queue')
  notifications[2].onclick()
  assert.deepEqual(opened, ['two'])
  cleanupNotifier()
  assert.equal(unsubscribed, true)
})

test('a persistent reminder is refreshed when the same conversation completes again', () => {
  const notifications = []
  class FakeNotification {
    static permission = 'granted'
    constructor(title, options) {
      this.title = title
      this.options = options
      this.onclick = null
      this.onclose = null
      this.closed = false
      notifications.push(this)
    }
    close() { this.closed = true }
  }
  const { React } = createHookRenderer()
  const { exports, window } = loadClientBundle(React, {
    Notification: FakeNotification,
    navigator: {},
    AbortController,
    setTimeout,
    clearTimeout,
  })
  window.addEventListener = () => {}
  window.removeEventListener = () => {}
  window.focus = () => {}
  window.localStorage.setItem('dshw-completion-notify-v1', JSON.stringify({ enabled: true, timeout: 0 }))

  let snapshot = {
    ids: ['selected'],
    byId: { selected: { id: 'selected', displayTitle: '当前对话', running: true, completed: false } },
  }
  let changed
  const cleanupNotifier = exports.__testing.installCompletionNotifier({
    sessions: {
      list: {
        getSnapshot: () => snapshot,
        subscribe(callback) { changed = callback; return () => {} },
      },
      open() {},
    },
  })

  snapshot = {
    ids: ['selected'],
    byId: { selected: { id: 'selected', displayTitle: '当前对话', running: false, completed: false } },
  }
  changed()
  assert.equal(notifications.length, 1)

  snapshot = {
    ids: ['selected'],
    byId: { selected: { id: 'selected', displayTitle: '当前对话', running: true, completed: false } },
  }
  changed()
  snapshot = {
    ids: ['selected'],
    byId: { selected: { id: 'selected', displayTitle: '当前对话', running: false, completed: false } },
  }
  changed()

  assert.equal(notifications.length, 2, 'the second completion must not be swallowed by the persistent first reminder')
  assert.equal(notifications[0].closed, true)
  assert.match(notifications[1].options.body, /当前对话/)
  cleanupNotifier()
})

test('a selected conversation still notifies when it changes from running to idle', () => {
  const notifications = []
  class FakeNotification {
    static permission = 'granted'
    constructor(title, options) {
      this.title = title
      this.options = options
      this.onclick = null
      this.onclose = null
      notifications.push(this)
    }
    close() {}
  }
  const { React } = createHookRenderer()
  const { exports, window } = loadClientBundle(React, {
    Notification: FakeNotification,
    navigator: {},
    AbortController,
    setTimeout,
    clearTimeout,
  })
  window.addEventListener = () => {}
  window.removeEventListener = () => {}
  window.focus = () => {}
  window.localStorage.setItem('dshw-completion-notify-v1', JSON.stringify({ enabled: true, timeout: 0 }))

  let snapshot = {
    ids: ['selected'],
    byId: {
      selected: { id: 'selected', displayTitle: '当前对话', running: true, completed: false },
    },
  }
  let changed
  const cleanupNotifier = exports.__testing.installCompletionNotifier({
    sessions: {
      list: {
        getSnapshot: () => snapshot,
        subscribe(callback) { changed = callback; return () => {} },
      },
      open() {},
    },
  })

  snapshot = {
    ids: ['selected'],
    byId: {
      selected: { id: 'selected', displayTitle: '当前对话', running: false, completed: false },
    },
  }
  changed()
  assert.equal(notifications.length, 1)
  assert.match(notifications[0].options.body, /当前对话/)
  cleanupNotifier()
})

test('storage lease prevents duplicate completion reminders when Web Locks are unavailable', () => {
  const notifications = []
  class FakeNotification {
    static permission = 'granted'
    constructor(title, options) { this.title = title; this.options = options; notifications.push(this) }
    close() {}
  }
  const shared = new Map()
  const sharedStorage = {
    getItem(key) { return shared.has(key) ? shared.get(key) : null },
    setItem(key, value) { shared.set(key, String(value)) },
    removeItem(key) { shared.delete(key) },
  }
  const globals = { Notification: FakeNotification, navigator: {}, AbortController, setTimeout, clearTimeout }
  const first = loadClientBundle(createHookRenderer().React, globals, { localStorage: sharedStorage })
  const second = loadClientBundle(createHookRenderer().React, globals, { localStorage: sharedStorage })
  for (const runtime of [first, second]) {
    runtime.window.addEventListener = () => {}
    runtime.window.removeEventListener = () => {}
    runtime.window.focus = () => {}
  }
  sharedStorage.setItem('dshw-completion-notify-v1', JSON.stringify({ enabled: true, timeout: 0 }))
  let snapshot = { ids: ['one'], byId: { one: { id: 'one', displayTitle: '同一个完成事件', completed: false } } }
  const changes = []
  const makeContext = () => ({
    sessions: {
      list: {
        getSnapshot: () => snapshot,
        subscribe(callback) { changes.push(callback); return () => {} },
      },
      open() {},
    },
  })
  const cleanups = [
    first.exports.__testing.installCompletionNotifier(makeContext()),
    second.exports.__testing.installCompletionNotifier(makeContext()),
  ]
  snapshot = { ids: ['one'], byId: { one: { id: 'one', displayTitle: '同一个完成事件', completed: true } } }
  changes.forEach((change) => change())
  assert.equal(notifications.length, 1)
  cleanups.forEach((cleanup) => cleanup())
})

test('compatibility adapter centralizes desktop bridges and storage fallback', async () => {
  const opened = []
  const notices = []
  const handle = { close() {}, onclick: null, onclose: null }
  const { React } = createHookRenderer()
  const { exports } = loadClientBundle(React)
  const adapter = exports.__testing.createCompatibilityAdapter({
    localStorage: {
      getItem() { throw new Error('storage disabled') },
      setItem() { throw new Error('storage disabled') },
      removeItem() { throw new Error('storage disabled') },
    },
    __DSH_WALLET_ADAPTER__: {
      capabilities: { permanentDelete: true },
      notify(options) { notices.push(options); return handle },
      openExternal(url) { opened.push(url); return true },
    },
  })

  adapter.storage.setItem('setting', 123)
  assert.equal(adapter.storage.getItem('setting'), '123')
  adapter.storage.removeItem('setting')
  assert.equal(adapter.storage.getItem('setting'), null)
  const wrappedHandle = adapter.notify('完成', { body: '测试', tag: 'one' })
  assert.notEqual(wrappedHandle, handle)
  assert.equal(wrappedHandle.delegate, handle)
  assert.equal(typeof wrappedHandle.close, 'function')
  assert.deepEqual(
    notices.map(({ title, body, tag, requireInteraction }) => ({ title, body, tag, requireInteraction })),
    [{ title: '完成', body: '测试', tag: 'one', requireInteraction: false }],
  )
  assert.equal(typeof notices[0].onClick, 'function')
  assert.equal(typeof notices[0].onClose, 'function')
  assert.equal(adapter.openExternal('https://platform.deepseek.com/top_up'), true)
  assert.deepEqual(opened, ['https://platform.deepseek.com/top_up'])
  assert.equal(adapter.hasCapability('permanentDelete'), true)
  assert.equal(await adapter.requestNotificationPermission(), 'bridge')
})

test('desktop notification bridges may be fire-and-forget and expose native callbacks', async () => {
  let payload
  const clicked = []
  const adapter = loadClientBundle(createHookRenderer().React).exports.__testing.createCompatibilityAdapter({
    __DSH_WALLET_ADAPTER__: {
      notify(value) { payload = value },
      requestNotificationPermission() { return Promise.resolve('granted') },
    },
  })
  const handle = adapter.notify('完成', { body: '后台任务', tag: 'one', requireInteraction: true })
  handle.onclick = () => clicked.push('clicked')
  payload.onClick()
  assert.deepEqual(clicked, ['clicked'])
  assert.equal(typeof handle.close, 'function')
  assert.equal(payload.requireInteraction, true)
  assert.equal(await adapter.requestNotificationPermission(), 'granted')
})

test('a synchronous desktop notification handle stays connected to payload callbacks', () => {
  let payload
  const delegate = { closeCalls: 0, close() { this.closeCalls += 1 }, onclick: null, onclose: null }
  const adapter = loadClientBundle(createHookRenderer().React).exports.__testing.createCompatibilityAdapter({
    __DSH_WALLET_ADAPTER__: {
      notify(value) { payload = value; return delegate },
    },
  })
  const handle = adapter.notify('完成', { body: '桌面回调' })
  let clicked = 0
  let closed = 0
  handle.onclick = () => { clicked += 1 }
  handle.onclose = () => { closed += 1 }
  payload.onClick()
  assert.equal(clicked, 1, 'payload click reaches the wrapper returned to wallet code')
  delegate.onclick()
  assert.equal(clicked, 2, 'native handle onclick also reaches the wallet callback')
  payload.onClose()
  assert.equal(closed, 1)
  handle.close()
  assert.equal(delegate.closeCalls, 0, 'already-closed delegates are not closed twice')
})

test('an asynchronous desktop notification bridge forwards events and falls back on failure', async () => {
  const nativeNotifications = []
  class FakeNotification {
    static permission = 'granted'
    constructor(title, options) {
      this.title = title
      this.options = options
      this.onclick = null
      this.onclose = null
      this.closed = false
      nativeNotifications.push(this)
    }
    close() { this.closed = true }
  }
  let resolveBridge
  const delegate = { closeCalls: 0, close() { this.closeCalls += 1 }, onclick: null, onclose: null }
  const adapter = loadClientBundle(createHookRenderer().React).exports.__testing.createCompatibilityAdapter({
    Notification: FakeNotification,
    __DSH_WALLET_ADAPTER__: {
      notify() { return new Promise((resolve) => { resolveBridge = resolve }) },
    },
  })
  const handle = adapter.notify('完成', { body: '后台任务' })
  let clicked = 0
  handle.onclick = () => { clicked += 1 }
  resolveBridge(delegate)
  await new Promise((resolve) => setTimeout(resolve, 0))
  delegate.onclick()
  assert.equal(clicked, 1)
  handle.close()
  assert.equal(delegate.closeCalls, 1)

  const fallbackAdapter = loadClientBundle(createHookRenderer().React).exports.__testing.createCompatibilityAdapter({
    Notification: FakeNotification,
    __DSH_WALLET_ADAPTER__: {
      notify() { return Promise.reject(new Error('native bridge unavailable')) },
    },
  })
  const fallbackHandle = fallbackAdapter.notify('回退提醒', { body: '仍然显示' })
  let fallbackClicked = 0
  fallbackHandle.onclick = () => { fallbackClicked += 1 }
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(nativeNotifications.length, 1)
  nativeNotifications[0].onclick()
  assert.equal(fallbackClicked, 1)
})

test('compatibility adapter falls back to an in-page reminder without system notifications', () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName
      this.className = ''
      this.children = []
      this.parentNode = null
      this.listeners = {}
      this.attributes = {}
    }
    get childNodes() { return this.children }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child }
    removeChild(child) { this.children = this.children.filter((value) => value !== child); child.parentNode = null }
    setAttribute(name, value) { this.attributes[name] = String(value) }
    getAttribute(name) { return this.attributes[name] ?? null }
    addEventListener(name, callback) { this.listeners[name] = callback }
  }
  const body = new FakeElement('body')
  const documentElement = new FakeElement('html')
  documentElement.style = {}
  const document = {
    body,
    documentElement,
    createElement: (tagName) => new FakeElement(tagName),
    querySelector(selector) {
      return selector === '.dshw_noticeStack'
        ? body.children.find((child) => child.className === 'dshw_noticeStack') || null
        : null
    },
  }
  const { React } = createHookRenderer()
  const { exports } = loadClientBundle(React)
  const adapter = exports.__testing.createCompatibilityAdapter({ document })
  const notice = adapter.notify('对话已完成', { body: '点击打开', tag: 'completion' })
  assert.ok(notice)
  assert.equal(body.children.length, 1)
  assert.equal(body.children[0].children[0].attributes.role, 'status')
  notice.close()
  assert.equal(body.children.length, 0)
  assert.equal(adapter.supportsCssZoom(), false)
})

test('unsupported hosts disable the permanent-delete control instead of exposing a dead switch', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const { Component } = walletComponent(exports)
  let tree = renderer.render(Component, { sessionId: 'session-1' })
  findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_chipMain').props.onClick()
  tree = renderer.render(Component, { sessionId: 'session-1' })
  const toggle = findElement(tree, (element) => element.type === 'input' && element.props['aria-label'] === '开启永久删除会话')
  assert.equal(toggle.props.disabled, true)
  assert.equal(toggle.props.checked, false)
  assert.ok(findElement(tree, (element) => element.props && String(element.props.children || '').includes('不支持')), 'unsupported hosts must mark the permanent-delete control as unsupported')
})

test('compatible hosts enable the permanent-delete preference through capability discovery', () => {
  const renderer = createHookRenderer()
  const { exports, window } = loadClientBundle(renderer.React)
  window.document = {
    documentElement: {
      style: { zoom: '' },
      getAttribute(name) { return name === 'data-dshw-capability-permanent-delete' ? 'true' : null },
    },
  }
  const { Component } = walletComponent(exports)
  let tree = renderer.render(Component, { sessionId: 'session-1' })
  findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_chipMain').props.onClick()
  tree = renderer.render(Component, { sessionId: 'session-1' })
  const toggle = findElement(tree, (element) => element.type === 'input' && element.props['aria-label'] === '开启永久删除会话')
  assert.equal(toggle.props.disabled, false)
  toggle.props.onChange({ target: { checked: true } })
  assert.equal(window.localStorage.getItem('dshw-permanent-delete-v1'), 'true')
})

test('snap preview matches horizontal and vertical dock destinations', () => {
  const { React } = createHookRenderer()
  const { exports } = loadClientBundle(React)
  const preview = exports.__testing.computeSnapPreview
  const home = { left: 425, top: 600, right: 1205, bottom: 740, width: 780, height: 140 }
  const content = { left: 280, top: 0, right: 1400, bottom: 1000, width: 1120, height: 1000 }
  const anchor = { left: 710, top: 690, width: 0, height: 22 }
  const sizes = { horizontal: { width: 300, height: 22 }, vertical: { width: 40, height: 127 } }

  assert.equal(preview('free', { x: 500, y: 300 }, 1400, 1000, home, content, anchor, sizes), null)
  assert.deepEqual({ ...preview('home', { x: 500, y: 300 }, 1400, 1000, home, content, anchor, sizes) }, {
    dock: 'home', x: 710, y: 690, width: 300, height: 22, vertical: false,
  })
  assert.deepEqual({ ...preview('content-left', { x: 250, y: 400 }, 1400, 1000, home, content, anchor, sizes) }, {
    dock: 'content-left', x: 282, y: 400, width: 40, height: 127, vertical: true,
  })
  assert.deepEqual({ ...preview('bottom', { x: 600, y: 900 }, 1400, 1000, home, content, anchor, sizes) }, {
    dock: 'bottom', x: 665, y: 976, width: 300, height: 22, vertical: false,
  })
})

test('client uses native controls, keeps first-click recharge confirmation, and registers an interactive slot', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const { Component, slot } = walletComponent(exports)
  assert.equal(slot.name, 'conversation.input.left')

  let tree = renderer.render(Component, { sessionId: 'session-1' })
  const mainButton = findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_chipMain')
  const rechargeButton = findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_recharge')
  assert.ok(mainButton)
  assert.ok(rechargeButton)
  assert.equal(mainButton.props['aria-haspopup'], 'dialog')
  assert.equal(findElement(tree, (element) => element.type === 'a'), null)

  rechargeButton.props.onClick({ preventDefault() {}, stopPropagation() {} })
  tree = renderer.render(Component, { sessionId: 'session-1' })
  const confirmation = findElement(tree, (element) => element.props && element.props.role === 'dialog' && element.props['aria-modal'] === 'true')
  assert.ok(confirmation, 'the first recharge click must render a confirmation dialog even while details are closed')
})

test('wallet details minimize directly to a freely movable dot', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const { Component } = walletComponent(exports)

  let tree = renderer.render(Component, { sessionId: 'session-1' })
  findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_chipMain').props.onClick()
  tree = renderer.render(Component, { sessionId: 'session-1' })
  const panelHeader = findElement(tree, (element) => element.props && String(element.props.className || '').includes('dshw_panelHeader'))
  assert.ok(panelHeader)
  assert.equal(typeof panelHeader.props.onPointerDown, 'function', 'the details panel header must be draggable')
  const minimizeButton = findElement(tree, (element) => element.type === 'button' && element.props.children === '－ 最小化')
  assert.ok(minimizeButton)

  minimizeButton.props.onClick()
  tree = renderer.render(Component, { sessionId: 'session-1' })
  const dot = findElement(tree, (element) => element.type === 'button' && element.props['aria-label'] === '钱包，点击展开')
  assert.ok(dot, 'minimize must go straight to the circular dot instead of the floating panel')
  assert.match(dot.props.className, /dshw_dot/)
})

test('vertical docks place each value below its matching label', () => {
  const renderer = createHookRenderer()
  const { exports, window } = loadClientBundle(renderer.React)
  window.localStorage.setItem('dshw-chip-layout-v4', JSON.stringify({ dock: 'content-left', x: 282, y: 120 }))
  const { Component } = walletComponent(exports)

  const tree = renderer.render(Component, { sessionId: 'session-1' })
  const metric = findElement(tree, (element) => element.props && element.props.className === 'dshw_metric')
  assert.ok(metric)
  assert.equal(metric.props.children[0].props.className, 'dshw_metricLabel')
  assert.equal(metric.props.children[0].props.children, '余额')
  assert.equal(metric.props.children[1].props.className, 'dshw_metricValue')
  assert.equal(metric.props.children[1].props.children, '--')
})

test('desktop bridge failures degrade to browser-safe behavior', async () => {
  const opened = []
  const adapter = loadClientBundle(createHookRenderer().React).exports.__testing.createCompatibilityAdapter({
    open(url, target, features) { opened.push({ url, target, features }) },
    __DSH_WALLET_ADAPTER__: {
      requestNotificationPermission() { return Promise.reject(new Error('native permission unavailable')) },
      openExternal() { return false },
    },
  })

  assert.equal(await adapter.requestNotificationPermission(), 'page')
  assert.equal(adapter.openExternal('https://platform.deepseek.com/top_up'), true)
  assert.deepEqual(opened, [{
    url: 'https://platform.deepseek.com/top_up',
    target: '_blank',
    features: 'noopener,noreferrer',
  }])

  const isolated = loadClientBundle(createHookRenderer().React).exports.__testing.createCompatibilityAdapter({
    __DSH_WALLET_ADAPTER__: {
      requestNotificationPermission() { throw new Error('bridge crashed') },
      openExternal() { throw new Error('bridge crashed') },
    },
  })
  assert.equal(await isolated.requestNotificationPermission(), 'page')
  assert.equal(isolated.openExternal('https://platform.deepseek.com/top_up'), false)
})

test('wallet HTTP routes enforce methods, bounded inputs, and session identifiers', async () => {
  const routes = new Map()
  const originalSetTimeout = globalThis.setTimeout
  const originalSetInterval = globalThis.setInterval
  const originalClearTimeout = globalThis.clearTimeout
  const originalClearInterval = globalThis.clearInterval
  const fakeTimer = () => ({ unref() {} })
  globalThis.setTimeout = fakeTimer
  globalThis.setInterval = fakeTimer
  globalThis.clearTimeout = () => {}
  globalThis.clearInterval = () => {}

  try {
    applyWallet({
      logger: { warn() {} },
      get() { return undefined },
      on() {},
      effect(run) { run(); return () => {} },
      webServer: {
        register(definition) {
          routes.set(definition.path, definition.handler)
          return () => routes.delete(definition.path)
        },
      },
    }, { pricingSync: false, planSync: false })

    async function call(path, method, body, url = path) {
      const handler = routes.get(path)
      assert.equal(typeof handler, 'function', `missing route ${path}`)
      const req = createRouteRequest(method, body, url)
      const handled = Promise.resolve(handler(req, req.response))
      const response = await req.send()
      await handled
      return { ...response, json: JSON.parse(response.body) }
    }

    let response = await call('/api/wallet/threshold', 'GET')
    assert.equal(response.status, 405)
    assert.equal(response.json.error, 'method-not-allowed')

    response = await call('/api/wallet/threshold', 'POST', { threshold: '3.00' })
    assert.equal(response.status, 400)
    assert.match(response.json.error, /number/)

    response = await call('/api/wallet/threshold', 'POST', { threshold: 3, padding: 'x'.repeat(5000) })
    assert.equal(response.status, 400)

    response = await call('/api/wallet/threshold', 'POST', { threshold: 1.239 })
    assert.equal(response.status, 200)
    assert.equal(response.json.threshold, 1.24)

    response = await call('/api/wallet/snapshot', 'GET', undefined, '/api/wallet/snapshot?session=session-route-check')
    assert.equal(response.status, 200)
    assert.equal(response.json.threshold, 1.24)
    assert.equal(response.json.session.official, null)

    response = await call('/api/wallet/clear-session', 'POST', { session: '../wallet.json' })
    assert.equal(response.status, 400)
    assert.match(response.json.error, /valid session id/)

    response = await call('/api/wallet/clear-session', 'POST', { session: 'session-route-check' })
    assert.equal(response.status, 200)
    assert.equal(response.json.ok, true)

    response = await call('/api/wallet/clear-session', 'DELETE', { session: 'session-route-check' })
    assert.equal(response.status, 405)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.setInterval = originalSetInterval
    globalThis.clearTimeout = originalClearTimeout
    globalThis.clearInterval = originalClearInterval
  }
})

test('client renders the 账户管理 section inside the detail panel', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const { Component } = walletComponent(exports)

  let tree = renderer.render(Component, { sessionId: 'session-1' })
  const mainButton = findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_chipMain')
  assert.ok(mainButton)
  mainButton.props.onClick({})
  tree = renderer.render(Component, { sessionId: 'session-1' })
  const title = findElement(tree, (element) => element.type === 'div' && element.props.className === 'dshw_title' && element.props.children === '\u8d26\u6237\u7ba1\u7406')
  assert.ok(title, 'the detail panel must contain the \u8d26\u6237\u7ba1\u7406 section')
})

test('normalizeAccountsData: filters malformed entries and validates activeId', () => {
  const data = normalizeAccountsData({
    accounts: [
      { id: 'acc_1', name: '  Alice  ', apiKey: 'sk-alice-1234567890' },
      { id: '', name: 'bad', apiKey: 'sk-x' },
      { name: 'no id', apiKey: 'sk-x' },
      null,
      'junk',
      { id: 'acc_2', name: 'Bob', apiKey: 'sk-bob-1234567890', createdAt: 123 },
    ],
    activeId: 'acc_1',
  })
  assert.equal(data.accounts.length, 2)
  assert.equal(data.accounts[0].name, 'Alice')
  assert.equal(data.accounts[0].createdAt > 0, true)
  assert.equal(data.accounts[1].createdAt, 123)
  assert.equal(data.activeId, 'acc_1')
  // An activeId pointing at a missing account is dropped.
  assert.equal(normalizeAccountsData({ accounts: data.accounts, activeId: 'acc_missing' }).activeId, null)
  // Garbage input degrades to an empty store.
  assert.deepEqual(normalizeAccountsData(null), { version: 2, accounts: [], activeId: null })
  assert.deepEqual(normalizeAccountsData([1, 2]), { version: 2, accounts: [], activeId: null })
  const many = normalizeAccountsData({ accounts: Array.from({ length: 60 }, (_, index) => ({ id: 'acc_' + index, name: 'A' + index, apiKey: 'sk-valid-' + String(index).padStart(8, '0') })) })
  assert.equal(many.accounts.length, 50)
})

test('maskKey and validateApiKey: masking and key sanity checks', () => {
  assert.equal(maskKey(''), '')
  assert.equal(maskKey(undefined), '')
  assert.equal(maskKey('short'), '***')
  assert.equal(maskKey('sk-1234567890'), 'sk-1***7890')
  assert.equal(validateApiKey(''), 'API key must not be empty')
  assert.equal(validateApiKey('   '), 'API key must not be empty')
  assert.equal(validateApiKey('short'), 'API key looks too short')
  assert.equal(validateApiKey('has space key123'), 'API key must not contain whitespace')
  assert.equal(validateApiKey('sk-valid\u0000bad'), 'API key must not contain control characters')
  assert.equal(validateApiKey('x'.repeat(513)), 'API key is too long')
  assert.equal(validateApiKey('sk-abcdefgh'), null)
  assert.equal(validateApiKey(42), 'API key must be a string')
})

/**
 * Load a fresh module instance whose DSH_HOME points at an empty temp dir, so
 * account tests start from a deterministic empty store and never touch real
 * user state (~/.dsh/storages/accounts.json). The unique query keeps each
 * instance separate from the statically imported one.
 */
async function freshAccountsModule() {
  const dir = mkdtempSync(join(tmpdir(), 'dshw-accounts-'))
  process.env.DSH_HOME = dir
  return import('../index.js?accounts-' + dir.replace(/[\\/]/g, '_'))
}

test('multi-account store: first account auto-activates, list masks keys, remove clears activeId', async () => {
  const mod = await freshAccountsModule()

  const first = mod.addAccount('Alice', 'sk-alice-1234567890')
  assert.equal(first.ok, true)
  assert.ok(first.account.id.startsWith('acc_'))
  // The first account becomes the active one automatically.
  assert.equal(mod.activeAccount().id, first.account.id)

  const second = mod.addAccount('Bob', 'sk-bob-1234567890')
  assert.equal(second.ok, true)
  assert.equal(mod.activeAccount().id, first.account.id) // still Alice

  // Invalid input is rejected without touching the store.
  assert.equal(mod.addAccount('', 'sk-x').ok, false)
  assert.equal(mod.addAccount('Carol', 'short').ok, false)
  assert.equal(mod.accountListView().accounts.length, 2)

  const view = mod.accountListView()
  assert.equal(view.activeId, first.account.id)
  assert.equal(view.accounts[0].active, true)
  assert.equal(view.accounts[1].active, false)
  assert.ok(!view.accounts[0].maskedKey.includes('alice'))
  assert.equal(view.accounts[0].maskedKey, 'sk-a***7890')

  // Removing a missing id fails; removing the active account clears activeId.
  assert.equal(mod.removeAccount('acc_missing').ok, false)
  assert.equal(mod.removeAccount(first.account.id).ok, true)
  assert.equal(mod.activeAccount(), null)
  assert.equal(mod.accountListView().activeId, null)
})

test('activateAccount: writes the key into the credentials seam and hot-switches', async () => {
  const mod = await freshAccountsModule()
  // Balance refresh fires after activation; keep it off the real network.
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('network disabled in tests') }
  try {
    const added = mod.addAccount('Alice', 'sk-alice-1234567890')
    const bob = mod.addAccount('Bob', 'sk-bob-1234567890')
    const written = []
    const ctx = {
      logger: { warn() {} },
      get(key) {
        if (key === 'credentials') {
          return {
            async set(ref, value) { written.push([ref, value]) },
            async resolve() { return undefined },
          }
        }
        return undefined
      },
    }

    const result = await mod.activateAccount(ctx, bob.account.id)
    assert.equal(result.ok, true)
    assert.deepEqual(written, [['DEEPSEEK_API_KEY', 'sk-bob-1234567890']])
    assert.equal(mod.activeAccount().id, bob.account.id)
    await new Promise((resolve) => setTimeout(resolve, 0)) // drain the refresh
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('activateAccount: missing accounts and refused credential writes fail safely', async () => {
  const mod = await freshAccountsModule()
  const added = mod.addAccount('Alice', 'sk-alice-1234567890')
  const ctx = {
    logger: { warn() {} },
    get(key) {
      if (key === 'credentials') {
        return {
          async set() { throw new Error('shadowed write refused') },
          async resolve() { return undefined },
        }
      }
      return undefined
    },
  }

  assert.equal((await mod.activateAccount(ctx, 'acc_missing')).ok, false)
  const failed = await mod.activateAccount(ctx, added.account.id)
  assert.equal(failed.ok, false)
  // The raw provider message may name paths, env vars or key fragments: the
  // browser must only ever see a bounded enum.
  assert.equal(failed.error, 'credential-write-refused')
  assert.doesNotMatch(failed.error, /shadowed write refused/, 'upstream error text must not reach the client')
  // The stored activeId is left untouched on failure.
  assert.equal(mod.activeAccount().id, added.account.id)
})

test('plugin registers a host settings-panel section below the visual tools', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /ctx\.slots\.inject\('settings\.section'/, 'the wallet must register a settings-panel section through the host slots API')
  assert.match(source, /id: 'wallet',\s*\r?\n\s*order: 40/, 'the section must use order 40, right below the vision-toolkit section at 30')
  assert.match(source, /WalletSettingsSection/, 'the settings section component must exist')
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const { Component } = walletComponent(exports)
  const tree = renderer.render(Component, { sessionId: 'session-1' })
  // WalletChip 仍正常渲染（回归）
  const chip = findElement(tree, (element) => element.props && element.props['aria-label'] === 'DeepSeek 钱包')
  assert.ok(chip, 'the composer chip must keep rendering')
})

test('host settings section renders the restyled card without crashing', () => {
  const renderer = createHookRenderer()
  const { exports, window } = loadClientBundle(renderer.React)
  // fetch 在测试环境不可达: 组件必须走错误分支也不崩
  const Section = exports.__testing.WalletSettingsSection
  assert.equal(typeof Section, 'function', 'WalletSettingsSection must be exported for render coverage')
  let tree = renderer.render(Section, { close: function () {} })
  // 异步 fetch 完成后再渲染一帧(错误/空数据分支)
  tree = renderer.render(Section, { close: function () {} })
  const balanceCard = findElement(tree, (element) => element.props && String(element.props.className || '').includes('dshw_settingsHero'))
  const setCard = findElement(tree, (element) => element.props && String(element.props.className || '').includes('dshw_setCard'))
  const heading = findElement(tree, (element) => element.props && element.props.className === 'dshw_settingsHeading')
  const reminderCard = findElement(tree, (element) => element.props && String(element.props.className || '').includes('dshw_reminderCard'))
  assert.ok(balanceCard, 'the settings section must render the account overview card')
  assert.ok(setCard, 'the settings section must render the grouped settings card')
  assert.ok(heading, 'the redesigned settings section must establish a clear page heading')
  assert.ok(reminderCard, 'reminder and session controls must stay grouped')
})

test('client selects the balance row matching the server-selected currency', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const rows = [
    { currency: 'USD', total_balance: '9.00' },
    { currency: 'CNY', total_balance: '2.00' },
  ]
  assert.equal(exports.__testing.selectBalanceInfo({ currency: 'CNY', balances: rows }), rows[1])
  assert.equal(exports.__testing.selectBalanceInfo({ currency: 'USD', balances: rows }), rows[0])
  assert.equal(exports.__testing.selectBalanceInfo({ currency: 'EUR', balances: rows }), rows[0])
  assert.equal(exports.__testing.selectBalanceInfo({ currency: 'CNY', balances: [] }), null)
  assert.equal(exports.__testing.balanceErrorText('unauthorized'), 'API Key 无效或已过期')
  assert.equal(exports.__testing.balanceErrorText('a raw upstream secret'), '余额暂不可用')
})

test('settings account API Key field is masked as a password input', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const tree = renderer.render(exports.__testing.WalletSettingsSection, { close: () => {} })
  const keyInput = findElement(tree, element => element.type === 'input' && element.props['aria-label'] === 'API Key')
  assert.ok(keyInput)
  assert.equal(keyInput.props.type, 'password')
})
test('session cost follows the active account currency with a marked estimate', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /function sessionCostText/, 'a currency-aware session cost helper must exist')
  assert.match(source, /USD_ESTIMATE_PER_CNY/, 'USD display must be an explicit estimate, never a silent FX conversion')
  assert.doesNotMatch(source, /sessionCostText\([^)]*\), 'CNY'\)/, 'no call site may hard-code CNY after the currency follows the account')
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const Section = exports.__testing.WalletSettingsSection
  const tree = renderer.render(Section, { close: () => {} })
  assert.ok(tree, 'the settings section still renders')
})

test('findAccount resolves stored accounts and nulls for unknown ids', async () => {
  const mod = await freshAccountsModule()
  const a = mod.addAccount('Alice', 'sk-alice-1234567890').account
  mod.addAccount('Bob', 'sk-bob-1234567890')
  assert.equal(mod.findAccount(a.id).name, 'Alice')
  assert.equal(mod.findAccount('acc_missing'), null)
})

test('settings section renders populated data from the wallet APIs', async () => {
  const renderer = createHookRenderer()
  const mockFetch = (url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(
      String(url).includes('/accounts')
        ? { ok: true, activeId: 'acc_1', accounts: [{ id: 'acc_1', name: '主账户', maskedKey: 'sk-a***0001', active: true }] }
        : { ok: true, balance: { available: true, total: 1.98, currency: 'USD' }, lowBalance: false, threshold: 3, accounts: { activeId: 'acc_1', activeName: '主账户', count: 1 }, session: { official: { cost: 0.05 } } }
    ),
  })
  const { exports } = loadClientBundle(renderer.React, { fetch: mockFetch })
  const Section = exports.__testing.WalletSettingsSection
  // First render with effect flush: the fetches fire right after the pass.
  renderer.render(Section, { close: () => {} }, { flushEffects: true })
  await new Promise((resolve) => setTimeout(resolve, 30)) // let the responses settle into state
  const tree = renderer.render(Section, { close: () => {} })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('主账户'), 'the account row must render from live data')
  assert.ok(/1.98/.test(text), 'the balance figure must render')
})

test('history panel exposes a collapsed local 365-day ledger entry without mixing it into the chip', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const Panel = exports.__testing.UsageHistoryPanel
  const tree = renderer.render(Panel, { sessionId: 'session-history' })
  const toggle = findElement(tree, (element) => element.type === 'button' && element.props['aria-label'] === '查看历史用量')
  assert.ok(toggle, 'history stays collapsed until explicitly opened')
  assert.match(JSON.stringify(tree), /保留 365 天/)
  const source = readProjectFile('lib/client.js')
  assert.match(source, /\/api\/wallet\/history/)
  assert.match(source, /dshw_historyHeatmap/)
  assert.match(source, /清除历史账本/)
  assert.match(source, /key: 'history', sessionId: null, alwaysOpen: true/, 'settings history must stay expanded')
})

test('settings puts account management and always-open history directly below balance', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const tree = renderer.render(exports.__testing.WalletSettingsSection, { close: () => {} })
  const rows = Array.isArray(tree.props.children) ? tree.props.children : [tree.props.children]
  const keys = rows.map((row) => row && row.props ? row.props.key : null)
  const balanceIndex = keys.indexOf('balcard')
  const accountIndex = keys.indexOf('acc-t')
  const historyIndex = keys.indexOf('history')
  const healthIndex = keys.indexOf('health')
  assert.ok(balanceIndex >= 0 && accountIndex > balanceIndex, 'account management follows the balance overview')
  assert.ok(historyIndex > accountIndex, 'always-open history follows account management')
  assert.ok(healthIndex > historyIndex, 'health and preferences remain below primary account tasks')
  const historyElement = rows[historyIndex]
  assert.equal(historyElement.props.alwaysOpen, true)
})
test('settings history is permanently expanded while compact history stays collapsible', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const Panel = exports.__testing.UsageHistoryPanel
  const settingsTree = renderer.render(Panel, { sessionId: null, alwaysOpen: true })
  assert.equal(findElement(settingsTree, (element) => element.type === 'button' && element.props['aria-label'] === '查看历史用量'), null)
  assert.ok(findElement(settingsTree, (element) => element.props && element.props.children === '正在读取本地账本…'), 'settings shows the loading body immediately')

  const compactRenderer = createHookRenderer()
  const compactBundle = loadClientBundle(compactRenderer.React)
  const compactTree = compactRenderer.render(compactBundle.exports.__testing.UsageHistoryPanel, { sessionId: 'session-history' })
  assert.ok(findElement(compactTree, (element) => element.type === 'button' && element.props['aria-label'] === '查看历史用量'))
})
function installWalletRouteHarness(mod, credentials) {
  const routes = new Map()
  let usageTap = null
  const ctx = {
    logger: { warn() {} },
    get(key) { return key === 'credentials' ? credentials : undefined },
    on(name, handler) { if (name === 'llm/stream') usageTap = handler },
    effect(run) { return run() },
    webServer: {
      register(definition) {
        routes.set(definition.path, definition.handler)
        return () => routes.delete(definition.path)
      },
    },
  }
  mod.apply(ctx, { pricingSync: false, planSync: false })
  async function call(path, method, body, url = path) {
    const handler = routes.get(path)
    assert.equal(typeof handler, 'function', `missing route ${path}`)
    const req = createRouteRequest(method, body, url)
    const handled = Promise.resolve(handler(req, req.response))
    const response = await req.send()
    await handled
    return { ...response, json: JSON.parse(response.body) }
  }
  return { call, usageTap }
}

test('usage-store lock state disables destructive wallet controls', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /var usageLocked =/)
  assert.match(source, /本地用量账本无法读取，阈值保存与清除已禁用/)
  assert.match(source, /disabled: usageLocked, onClick: saveThreshold/)
  assert.match(source, /用量账本存储已锁定，无法清除/)
  assert.match(source, /checked: true, disabled: usageLocked/, 'official provider toggles are disabled while the store is locked')
  assert.match(source, /checked: false, disabled: usageLocked/, 'known provider toggles are disabled while the store is locked')
})
test('history UI guards stale requests, starts at recent dates, and limits keyboard stops', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /historyRequestRef\.current/, 'history requests need a latest-response guard')
  assert.match(source, /node\.scrollWidth - node\.clientWidth/, 'the 365-day grid should open at the latest dates')
  assert.match(source, /ResizeObserver/, 'the recent-date position should survive responsive resizes')
  assert.match(source, /historyFollowLatestRef/, 'manual browsing of older dates must not be overwritten on resize')
  assert.match(source, /tabIndex: day\.calls > 0 \|\| isSelected \|\| isToday \? 0 : -1/, 'empty dates must not create hundreds of keyboard stops')
  assert.match(source, /dshw_historyCellToday/, 'today needs a visual marker independent of heat intensity')
  assert.match(source, /aria-current.*date/, 'today is announced to assistive technology')
})
test('provider classification UI states that history is not retroactively repriced', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /仅影响勾选后的后续调用；已记录的历史用量不重新计价/)
  assert.match(readProjectFile('README.md'), /Existing history is not retroactively reclassified/)
  assert.match(readProjectFile('docs/i18n/README.zh-CN.md'), /既有历史不会追溯重分桶/)
})
test('provider aliases are actually billed in the official bucket after opt-in', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-provider-route-'))
  process.env.DSH_HOME = dir
  const mod = await import('../index.js?provider-route-' + dir.replace(/[\\/]/g, '_'))
  try {
    const harness = installWalletRouteHarness(mod, undefined)
    let response = await harness.call('/api/wallet/official-providers', 'POST', { providers: ['deepseek-vision'] })
    assert.deepEqual(response.json.official, ['deepseek-vision'])
    assert.equal(typeof harness.usageTap, 'function')
    const downstream = async function* () {
      yield { type: 'usage', usage: { inputTokens: 1000, outputTokens: 2000 } }
    }
    for await (const _ of harness.usageTap(
      { sessionId: 'session-provider-route', provider: 'deepseek-vision', model: 'deepseek-v4-flash' },
      () => downstream(),
    )) {}
    response = await harness.call(
      '/api/wallet/snapshot',
      'GET',
      undefined,
      '/api/wallet/snapshot?session=session-provider-route',
    )
    assert.equal(response.json.session.official.tokens.input, 1000)
    assert.equal(response.json.session.official.tokens.output, 2000)
    assert.ok(response.json.session.official.cost > 0)
    assert.equal(response.json.session.third.tokens.input, 0)
    assert.deepEqual(response.json.providers.known, [])
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 550))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('history route deduplicates stable usage identities and keeps history clearing separate', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-history-'))
  process.env.DSH_HOME = dir
  const mod = await import('../index.js?history-' + dir.replace(/[\\/]/g, '_'))
  try {
    const harness = installWalletRouteHarness(mod, undefined)
    assert.equal(typeof harness.usageTap, 'function')
    async function record(options, usage) {
      const downstream = async function* () {
        yield { type: 'usage', usage }
      }
      for await (const _ of harness.usageTap(options, () => downstream())) {}
    }
    const identity = { sessionId: 'session-history', provider: 'deepseek-official', model: 'deepseek-v4-flash', turn: 1, step: 1 }
    await record(identity, { inputTokens: 1_000, outputTokens: 2_000 })
    await record(identity, { inputTokens: 3_000, outputTokens: 4_000 })
    await record({ sessionId: 'session-history', provider: 'third-party', model: 'other-model', turn: 1, step: 2 }, { inputTokens: 500, outputTokens: 600 })
    await record({ sessionId: 'session-history', provider: 'deepseek-official', model: 'deepseek-v4-pro', turn: 1, step: 1 }, { inputTokens: 100, outputTokens: 200 })

    let response = await harness.call('/api/wallet/history', 'GET', undefined, '/api/wallet/history?days=365')
    assert.equal(response.status, 200)
    assert.equal(response.json.days.length, 365)
    assert.equal(response.json.storage.status, 'ready')
    assert.equal(response.json.summary.total.calls, 3)
    assert.equal(response.json.summary.total.totalTokens, 8_400)
    assert.equal(response.json.summary.total.cost, response.json.summary.total.cost, 'summary cost is serializable')
    assert.equal(response.json.days.filter((day) => day.calls > 0).length, 1)

    response = await harness.call('/api/wallet/snapshot', 'GET', undefined, '/api/wallet/snapshot?session=session-history')
    assert.equal(response.json.session.official.tokens.input, 3_100)
    assert.equal(response.json.session.official.tokens.output, 4_200)
    assert.equal(response.json.session.third.tokens.input, 500)
    assert.equal(response.json.usageStorage.locked, false)

    response = await harness.call('/api/wallet/history', 'GET', undefined, '/api/wallet/history?days=6')
    assert.equal(response.status, 400)
    response = await harness.call('/api/wallet/history', 'GET', undefined, '/api/wallet/history?days=7abc')
    assert.equal(response.status, 400)
    response = await harness.call('/api/wallet/history', 'POST')
    assert.equal(response.status, 405)

    response = await harness.call('/api/wallet/clear-history', 'POST')
    assert.equal(response.status, 200)
    assert.equal(response.json.ok, true)
    response = await harness.call('/api/wallet/history', 'GET')
    assert.equal(response.json.summary.total.calls, 0)
    response = await harness.call('/api/wallet/snapshot', 'GET', undefined, '/api/wallet/snapshot?session=session-history')
    assert.equal(response.json.session.official.tokens.input, 3_100, 'clearing history must not clear current-session counters')
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 650))
    rmSync(dir, { recursive: true, force: true })
  }
})
test('clearing a session before a stable usage replacement does not undercount the new sample', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-history-clear-replace-'))
  process.env.DSH_HOME = dir
  const mod = await import('../index.js?history-clear-replace-' + dir.replace(/[\\/]/g, '_'))
  try {
    const harness = installWalletRouteHarness(mod, undefined)
    async function record(usage) {
      const downstream = async function* () { yield { type: 'usage', usage } }
      for await (const _ of harness.usageTap({
        sessionId: 'session-clear-replace', provider: 'deepseek-official', model: 'deepseek-v4-flash', turn: 2, step: 3,
      }, () => downstream())) {}
    }
    await record({ inputTokens: 1_000, outputTokens: 2_000 })
    await harness.call('/api/wallet/clear-session', 'POST', { session: 'session-clear-replace' })
    await record({ inputTokens: 3_000, outputTokens: 4_000 })
    const snapshot = await harness.call('/api/wallet/snapshot', 'GET', undefined, '/api/wallet/snapshot?session=session-clear-replace')
    assert.equal(snapshot.json.session.official.tokens.input, 3_000)
    assert.equal(snapshot.json.session.official.tokens.output, 4_000)
    const history = await harness.call('/api/wallet/history', 'GET')
    assert.equal(history.json.summary.total.calls, 1)
    assert.equal(history.json.summary.total.totalTokens, 7_000)
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 650))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reclassifying a stable unpriced provider sample restores official priced state', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-history-reclassify-'))
  process.env.DSH_HOME = dir
  const mod = await import('../index.js?history-reclassify-' + dir.replace(/[\\/]/g, '_'))
  try {
    const harness = installWalletRouteHarness(mod, undefined)
    await harness.call('/api/wallet/official-providers', 'POST', { providers: ['deepseek-proxy'] })
    async function record(usage) {
      const downstream = async function* () { yield { type: 'usage', usage } }
      for await (const _ of harness.usageTap({
        sessionId: 'session-reclassify', provider: 'deepseek-proxy', model: 'future-model', turn: 4, step: 1,
      }, () => downstream())) {}
    }
    await record({ inputTokens: 100, outputTokens: 150 })
    let snapshot = await harness.call('/api/wallet/snapshot', 'GET', undefined, '/api/wallet/snapshot?session=session-reclassify')
    assert.equal(snapshot.json.session.official.priced, false)
    await harness.call('/api/wallet/official-providers', 'POST', { providers: [] })
    await record({ inputTokens: 200, outputTokens: 300 })
    snapshot = await harness.call('/api/wallet/snapshot', 'GET', undefined, '/api/wallet/snapshot?session=session-reclassify')
    assert.equal(snapshot.json.session.official.priced, true)
    assert.equal(snapshot.json.session.official.tokens.input, 0)
    assert.equal(snapshot.json.session.third.tokens.input, 200)
    const history = await harness.call('/api/wallet/history', 'GET')
    assert.equal(history.json.summary.total.calls, 1)
    assert.equal(history.json.days.find((day) => day.calls === 1).third.calls, 1)
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 650))
    rmSync(dir, { recursive: true, force: true })
  }
})
test('history ledger persists across a plugin reload without storing conversation content', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-history-reload-'))
  process.env.DSH_HOME = dir
  const first = await import('../index.js?history-reload-a-' + dir.replace(/[\\/]/g, '_'))
  try {
    const firstHarness = installWalletRouteHarness(first, undefined)
    const downstream = async function* () {
      yield { type: 'usage', usage: { inputTokens: 7_000, outputTokens: 8_000 } }
    }
    for await (const _ of firstHarness.usageTap({
      sessionId: 'session-history-reload', provider: 'deepseek-official', model: 'deepseek-v4-pro', requestId: 'reload-request-1',
    }, () => downstream())) {}
    await new Promise(resolve => setTimeout(resolve, 650))
    const walletPath = join(dir, 'storages', 'wallet.json')
    const raw = readFileSync(walletPath, 'utf8')
    assert.doesNotMatch(raw, /prompt|answer|tool_arguments/i)
    const second = await import('../index.js?history-reload-b-' + dir.replace(/[\\/]/g, '_'))
    const secondHarness = installWalletRouteHarness(second, undefined)
    const response = await secondHarness.call('/api/wallet/history', 'GET')
    assert.equal(response.json.summary.total.totalTokens, 15_000)
    assert.equal(response.json.summary.total.calls, 1)
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 650))
    rmSync(dir, { recursive: true, force: true })
  }
})
test('missing primary usage ledger recovers from its backup without overwriting the backup', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-history-backup-'))
  process.env.DSH_HOME = dir
  const first = await import('../index.js?history-backup-a-' + dir.replace(/[\\/]/g, '_'))
  try {
    const firstHarness = installWalletRouteHarness(first, undefined)
    const downstream = async function* () { yield { type: 'usage', usage: { inputTokens: 900, outputTokens: 1_100 } } }
    for await (const _ of firstHarness.usageTap({
      sessionId: 'session-history-backup', provider: 'deepseek-official', model: 'deepseek-v4-flash', requestId: 'history-backup-1',
    }, () => downstream())) {}
    await new Promise(resolve => setTimeout(resolve, 650))
    const walletPath = join(dir, 'storages', 'wallet.json')
    const backupPath = walletPath + '.bak'
    assert.equal(existsSync(walletPath), true)
    assert.equal(existsSync(backupPath), true)
    const backupBefore = readFileSync(backupPath, 'utf8')
    unlinkSync(walletPath)

    const second = await import('../index.js?history-backup-b-' + dir.replace(/[\\/]/g, '_'))
    const secondHarness = installWalletRouteHarness(second, undefined)
    const health = await secondHarness.call('/api/wallet/health', 'GET')
    assert.equal(health.json.usage.status, 'recovered')
    const history = await secondHarness.call('/api/wallet/history', 'GET')
    assert.equal(history.json.summary.total.totalTokens, 2_000)
    await new Promise(resolve => setTimeout(resolve, 650))
    assert.equal(existsSync(walletPath), true, 'recovered ledger is restored to the primary path')
    assert.equal(readFileSync(backupPath, 'utf8'), backupBefore, 'valid backup is not replaced by a missing or corrupt primary')
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 100))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('unreadable primary and backup usage ledgers fail closed and reject writes', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-history-locked-'))
  const storageDir = join(dir, 'storages')
  mkdirSync(storageDir, { recursive: true })
  const walletPath = join(storageDir, 'wallet.json')
  const backupPath = walletPath + '.bak'
  writeFileSync(walletPath, '{broken-primary')
  writeFileSync(backupPath, '{broken-backup')
  process.env.DSH_HOME = dir
  const mod = await import('../index.js?history-locked-' + dir.replace(/[\\/]/g, '_'))
  try {
    const harness = installWalletRouteHarness(mod, undefined)
    const health = await harness.call('/api/wallet/health', 'GET')
    assert.equal(health.json.usage.status, 'locked')
    assert.equal(health.json.usage.locked, true)
    let response = await harness.call('/api/wallet/threshold', 'POST', { threshold: 4 })
    assert.equal(response.status, 423)
    assert.equal(response.json.error, 'usage-storage-locked')
    response = await harness.call('/api/wallet/clear-history', 'POST')
    assert.equal(response.status, 423)
    response = await harness.call('/api/wallet/official-providers', 'POST', { providers: ['proxy'] })
    assert.equal(response.status, 423)
    await new Promise(resolve => setTimeout(resolve, 650))
    assert.equal(readFileSync(walletPath, 'utf8'), '{broken-primary')
    assert.equal(readFileSync(backupPath, 'utf8'), '{broken-backup')
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 100))
    rmSync(dir, { recursive: true, force: true })
  }
})
test('first account rolls back activeId when the host refuses credential synchronization', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-account-rollback-'))
  process.env.DSH_HOME = dir
  const mod = await import('../index.js?account-rollback-' + dir.replace(/[\\/]/g, '_'))
  try {
    const harness = installWalletRouteHarness(mod, {
      async set() { throw new Error('shadowed write refused') },
      async resolve() { return undefined },
    })
    const response = await harness.call('/api/wallet/accounts', 'POST', {
      name: '未同步账户', apiKey: 'sk-unsynced-1234567890',
    })
    assert.equal(response.json.ok, true)
    assert.equal(response.json.synced, false)
    assert.equal(response.json.account.active, false)
    assert.equal((await harness.call('/api/wallet/accounts', 'GET')).json.activeId, null)
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 550))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('account persistence encrypts API keys instead of writing plaintext', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-account-encryption-'))
  process.env.DSH_HOME = dir
  const mod = await import('../index.js?account-encryption-' + dir.replace(/[\\/]/g, '_'))
  try {
    const harness = installWalletRouteHarness(mod, {
      async set() {},
      async resolve() { return undefined },
    })
    const response = await harness.call('/api/wallet/accounts', 'POST', {
      name: '加密账户', apiKey: 'sk-encrypted-1234567890',
    })
    assert.equal(response.json.ok, true)
    await new Promise(resolve => setTimeout(resolve, 700))
    const raw = readFileSync(join(dir, 'storages', 'accounts.json'), 'utf8')
    assert.doesNotMatch(raw, /sk-encrypted-1234567890/)
    assert.match(raw, /apiKeyEncrypted/)
    const stored = JSON.parse(raw)
    assert.equal(stored.version, 2)
    assert.equal(stored.accounts[0].apiKeyEncrypted.version, 1)
    assert.equal((await harness.call('/api/wallet/health', 'GET')).json.accounts.encryptedAtRest, true)
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 100))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('encrypted accounts survive a full module reload on the current platform', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-account-reload-'))
  process.env.DSH_HOME = dir
  try {
    const first = await import('../index.js?account-reload-first-' + dir.replace(/[\\/]/g, '_'))
    const firstHarness = installWalletRouteHarness(first, {
      async set() {},
      async resolve() { return undefined },
    })
    const added = await firstHarness.call('/api/wallet/accounts', 'POST', {
      name: '重载账户', apiKey: 'sk-reload-1234567890',
    })
    assert.equal(added.json.ok, true)
    await new Promise(resolve => setTimeout(resolve, 750))

    const second = await import('../index.js?account-reload-second-' + Date.now() + '-' + dir.replace(/[\\/]/g, '_'))
    const secondHarness = installWalletRouteHarness(second, {
      async set() {},
      async resolve() { return undefined },
    })
    const listed = await secondHarness.call('/api/wallet/accounts', 'GET')
    assert.equal(listed.json.accounts.length, 1)
    assert.equal(listed.json.accounts[0].name, '重载账户')
    assert.match(listed.json.accounts[0].maskedKey, /^sk-r\*{3}7890$/)
    const health = await secondHarness.call('/api/wallet/health', 'GET')
    assert.equal(health.json.accounts.status, 'ready')
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 100))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('missing primary account file recovers from its encrypted backup', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-account-backup-recovery-'))
  process.env.DSH_HOME = dir
  try {
    const first = await import('../index.js?account-backup-first-' + Date.now() + '-' + dir.replace(/[\\/]/g, '_'))
    const firstHarness = installWalletRouteHarness(first, {
      async set() {},
      async resolve() { return undefined },
    })
    const added = await firstHarness.call('/api/wallet/accounts', 'POST', {
      name: '备份恢复账户', apiKey: 'sk-backup-recovery-1234567890',
    })
    assert.equal(added.json.ok, true)
    await new Promise(resolve => setTimeout(resolve, 750))
    const accountPath = join(dir, 'storages', 'accounts.json')
    const backupPath = accountPath + '.bak'
    copyFileSync(accountPath, backupPath)
    unlinkSync(accountPath)

    const second = await import('../index.js?account-backup-second-' + Date.now() + '-' + dir.replace(/[\\/]/g, '_'))
    const secondHarness = installWalletRouteHarness(second, {
      async set() {},
      async resolve() { return undefined },
    })
    const listed = await secondHarness.call('/api/wallet/accounts', 'GET')
    assert.equal(listed.json.accounts.length, 1)
    assert.equal(listed.json.accounts[0].name, '备份恢复账户')
    const health = await secondHarness.call('/api/wallet/health', 'GET')
    assert.equal(health.json.accounts.status, 'recovered')
    await new Promise(resolve => setTimeout(resolve, 750))
    assert.equal(existsSync(accountPath), true, 'recovered data is written back to the primary file')
    assert.doesNotMatch(readFileSync(accountPath, 'utf8'), /sk-backup-recovery/)
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 100))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('corrupt primary account file recovers from a valid encrypted backup', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-account-corrupt-recovery-'))
  process.env.DSH_HOME = dir
  try {
    const first = await import('../index.js?account-corrupt-first-' + Date.now() + '-' + dir.replace(/[\\/]/g, '_'))
    const firstHarness = installWalletRouteHarness(first, {
      async set() {},
      async resolve() { return undefined },
    })
    const added = await firstHarness.call('/api/wallet/accounts', 'POST', {
      name: '损坏恢复账户', apiKey: 'sk-corrupt-recovery-1234567890',
    })
    assert.equal(added.json.ok, true)
    await new Promise(resolve => setTimeout(resolve, 750))
    const accountPath = join(dir, 'storages', 'accounts.json')
    const backupPath = accountPath + '.bak'
    const backupBefore = readFileSync(backupPath, 'utf8')
    const tampered = JSON.parse(readFileSync(accountPath, 'utf8'))
    tampered.accounts[0].apiKeyEncrypted.payload = Buffer.from('tampered-ciphertext').toString('base64')
    writeFileSync(accountPath, JSON.stringify(tampered))

    const second = await import('../index.js?account-corrupt-second-' + Date.now() + '-' + dir.replace(/[\\/]/g, '_'))
    const secondHarness = installWalletRouteHarness(second, {
      async set() {},
      async resolve() { return undefined },
    })
    const listed = await secondHarness.call('/api/wallet/accounts', 'GET')
    assert.equal(listed.json.accounts.length, 1)
    assert.equal(listed.json.accounts[0].name, '损坏恢复账户')
    const health = await secondHarness.call('/api/wallet/health', 'GET')
    assert.equal(health.json.accounts.status, 'recovered')
    await new Promise(resolve => setTimeout(resolve, 750))
    assert.doesNotMatch(readFileSync(accountPath, 'utf8'), /tampered-ciphertext|sk-corrupt-recovery/)
    assert.equal(readFileSync(backupPath, 'utf8'), backupBefore, 'valid encrypted backup is preserved during recovery')
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 100))
    rmSync(dir, { recursive: true, force: true })
  }
})
test('an unreadable encrypted account store fails closed without overwriting the file', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-account-locked-'))
  const storageDir = join(dir, 'storages')
  mkdirSync(storageDir, { recursive: true })
  const accountPath = join(storageDir, 'accounts.json')
  const corrupt = '{not valid encrypted account data'
  writeFileSync(accountPath, corrupt)
  process.env.DSH_HOME = dir
  const mod = await import('../index.js?account-locked-' + Date.now() + '-' + dir.replace(/[\\/]/g, '_'))
  try {
    const harness = installWalletRouteHarness(mod, {
      async set() {},
      async resolve() { return undefined },
    })
    const health = await harness.call('/api/wallet/health', 'GET')
    assert.equal(health.json.accounts.status, 'locked')
    const response = await harness.call('/api/wallet/accounts', 'POST', {
      name: '不能覆盖', apiKey: 'sk-must-not-overwrite-1234567890',
    })
    assert.equal(response.status, 423)
    assert.equal(response.json.error, 'account-storage-locked')
    await new Promise(resolve => setTimeout(resolve, 650))
    assert.equal(readFileSync(accountPath, 'utf8'), corrupt)
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 100))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('removing an account persists removal of its account-specific threshold', async () => {
  const previousHome = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'dshw-threshold-remove-'))
  process.env.DSH_HOME = dir
  const mod = await import('../index.js?threshold-remove-' + dir.replace(/[\\/]/g, '_'))
  try {
    const harness = installWalletRouteHarness(mod, {
      async set() {},
      async resolve() { return undefined },
    })
    const account = mod.addAccount('阈值账户', 'sk-threshold-1234567890').account
    await harness.call('/api/wallet/threshold', 'POST', { threshold: 4.25, currency: 'CNY' })
    await harness.call('/api/wallet/accounts/remove', 'POST', { id: account.id })
    await new Promise(resolve => setTimeout(resolve, 650))
    const wallet = JSON.parse(readFileSync(join(dir, 'storages', 'wallet.json'), 'utf8'))
    assert.equal(Object.hasOwn(wallet.accountThresholds || {}, account.id), false)
  } finally {
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 100))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('balance refresh returns safe error enums instead of upstream error text', async () => {
  const previousHome = process.env.DSH_HOME
  const previousFetch = globalThis.fetch
  const dir = mkdtempSync(join(tmpdir(), 'dshw-safe-error-'))
  process.env.DSH_HOME = dir
  const mod = await import('../index.js?safe-error-' + dir.replace(/[\\/]/g, '_'))
  globalThis.fetch = async () => ({ ok: false, status: 401, async json() { return {} } })
  try {
    const harness = installWalletRouteHarness(mod, {
      async set() {},
      async resolve() { return { value: 'sk-safe-error-1234567890' } },
    })
    const response = await harness.call('/api/wallet/refresh', 'POST')
    assert.equal(response.json.ok, true)
    const snapshot = await harness.call('/api/wallet/snapshot', 'GET')
    assert.equal(snapshot.json.balance.error, 'unauthorized')
    assert.doesNotMatch(JSON.stringify(snapshot.json), /sk-safe-error|status 401/)
  } finally {
    globalThis.fetch = previousFetch
    process.env.DSH_HOME = previousHome
    await new Promise(resolve => setTimeout(resolve, 100))
    rmSync(dir, { recursive: true, force: true })
  }
})
test('provider aliasing: wrapper routes can join the official bucket (Issue #21)', async () => {
  const { isOfficialProvider, normalizeProviderList, normalizeStoreData } = await import('../index.js')
  assert.equal(isOfficialProvider('deepseek-official'), true)
  assert.equal(isOfficialProvider('deepseek-official', []), true)
  assert.equal(isOfficialProvider('deepseek-vision'), false)
  assert.equal(isOfficialProvider('deepseek-vision', ['deepseek-vision']), true, 'a whitelisted wrapper route must bill officially')
  assert.equal(isOfficialProvider('deepseek-vision', 'deepseek-vision'), false, 'a non-array whitelist must not match')

  assert.deepEqual(normalizeProviderList(null), [])
  assert.deepEqual(normalizeProviderList(['a', 'a', 'deepseek-official', 42, '']), ['a'], 'dedupe, drop junk and the builtin name')
  const withProviders = normalizeStoreData({ officialProviders: ['deepseek-vision'], knownProviders: ['deepseek-vision'] })
  assert.deepEqual(withProviders.store.officialProviders, ['deepseek-vision'])
  assert.deepEqual(withProviders.store.knownProviders, ['deepseek-vision'])
  const bare = normalizeStoreData({})
  assert.deepEqual(bare.store.officialProviders, [], 'old stores migrate with empty provider lists')
})

test('both panels surface the wallet version, locked to package.json', () => {
  const pkg = JSON.parse(readProjectFile('package.json'))
  const source = readProjectFile('lib/client.js')
  const m = source.match(/WALLET_VERSION = '([^']+)'/)
  assert.ok(m, 'the client bundle must declare WALLET_VERSION')
  assert.equal(m[1], pkg.version, 'WALLET_VERSION must match package.json')
  assert.ok((source.match(/DeepSeek Harness Control Center v' \+ WALLET_VERSION/g) || []).length >= 2, 'both the detail panel footer and the float panel footer must show the version')
  assert.ok(source.includes("'DeepSeek Harness Control Center v' + WALLET_VERSION"), 'the settings page footer must show the version')
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const tree = renderer.render(exports.__testing.WalletSettingsSection, { close: () => {} })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('v' + pkg.version), 'the rendered settings section carries the version')
})

test('peak ring clock registers on the sidebar footer slot, not the settings page', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /ctx\.slots\.inject\('sidebar\.footer\.action'/, 'the ring must register through the host sidebar footer slot')
  assert.match(source, /id: 'wallet-peak-ring'/, 'the footer entry needs its list-slot id')
  assert.match(source, /function PeakRingFooter/, 'the footer component must exist')
  // The ring once sat inside the settings hero; that placement was wrong and
  // must stay gone.
  assert.doesNotMatch(source, /dshw_peakHero|dshw_peakRingBox|key: 'peakhero'/, 'the settings page must not embed the ring clock')
  assert.match(source, /ReactDOM\.createPortal/, 'floating card and control panel must escape sidebar clipping through a portal')
  // Design-sheet commitments: warning/success color pair, triangle pointer,
  // zero in-ring text, an independent switch, and reminder dedup storage.
  assert.match(source, /\.dshw_ringOff\{stroke:var\(--dsw-alias-state-success-primary/, 'off-peak arcs use the success color family')
  assert.match(source, /\.dshw_ringPeak\{stroke:var\(--dsw-alias-state-error-primary/, 'peak arcs use the warning color family')
  assert.match(source, /React\.createElement\('polygon', \{ key: 'ptr'/, 'the pointer is a small triangle, not a dot')
  assert.match(source, /PEAK_RING_KEY/, 'the ring carries its own persisted switch')
  assert.match(source, /PEAK_NOTIFY_LAST_KEY/, 'switch reminders dedup through a persisted boundary marker')
})

test('sidebar foot ring renders the live peak windows and status labels', async () => {
  const renderer = createHookRenderer()
  const mockFetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      ok: true,
      pricingWindows: {
        timezone: 'Asia/Shanghai',
        offsetMinutes: 480,
        windows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }],
        offPeakRate: 0.5,
      },
    }),
  })
  const { exports } = loadClientBundle(renderer.React, { fetch: mockFetch }, { setInterval: () => 0, clearInterval: () => {} })
  const Ring = exports.__testing.PeakRingFooter
  assert.equal(typeof Ring, 'function', 'PeakRingFooter must be exported for render coverage')
  renderer.render(Ring, {}, { flushEffects: true })
  await new Promise((resolve) => setTimeout(resolve, 30)) // let snapshot settle
  const tree = renderer.render(Ring, { wide: true })
  assert.ok(tree, 'the wide footer row must render once the policy arrives')
  const row = findElement(tree, (el) => el.props && String(el.props.className || '').includes('dshw_footRing'))
  assert.ok(row, 'the 38px foot-row box must be present')
  assert.ok(!String(row.props.className).includes('dshw_footRingRail'), 'wide mode keeps the row shape')
  const svg = findElement(tree, (el) => el.type === 'svg')
  assert.ok(svg, 'the ring clock SVG must render')
  assert.equal(svg.props.width, 50, 'the wide row sets ring size to 50px')

  // Tooltip carries full detail
  assert.match(row.props.title, /峰谷时钟 · 当前(高峰|低谷半价)/, 'tooltip names the current period')
  assert.match(row.props.title, /还有 \d+ (小时 ?\d* ?分?|分钟)/, 'tooltip counts down to next switch')
  assert.match(row.props.title, /09:00–12:00 \/ 14:00–18:00/, 'tooltip lists both windows')
  assert.match(row.props['aria-label'], /(按标准价计费|按平价的 0\.5 倍计费)/, 'aria text states price meaning')

  // Status label & money display
  const label = findElement(tree, (el) => el.props && String(el.props.className || '').includes('dshw_footRingLabel'))
  assert.ok(label, 'wide mode renders the status label')
  const money = findElement(tree, (el) => el.props && String(el.props.className || '').includes('dshw_footRingMoney'))
  assert.ok(money, 'wide mode renders the balance and session cost line')

  // Triangle pointer + boundary ticks
  assert.ok(findElement(tree, (el) => el.type === 'polygon'), 'the pointer is a triangle')
  const peakArc = findElement(tree, (el) => el.props && String(el.props.className || '').includes('dshw_ringPeak'))
  assert.ok(peakArc, 'peak arcs are painted with warning family')
  const offArc = findElement(tree, (el) => el.props && String(el.props.className || '').includes('dshw_ringOff'))
  assert.ok(offArc, 'off-peak arcs are painted with success family')
})

test('sidebar foot ring collapses to the rail circle, goes neutral without policy', async () => {
  const renderer = createHookRenderer()
  const mockFetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      ok: true,
      pricingWindows: { windows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }] },
    }),
  })
  const { exports } = loadClientBundle(renderer.React, { fetch: mockFetch }, { setInterval: () => 0, clearInterval: () => {} })
  const Ring = exports.__testing.PeakRingFooter
  renderer.render(Ring, { wide: false }, { flushEffects: true })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const rail = renderer.render(Ring, { wide: false })
  const circle = findElement(rail, (el) => el.props && String(el.props.className || '').includes('dshw_footRingRail'))
  assert.ok(circle, 'rail mode renders the 40px circle variant')
  const svg = findElement(rail, (el) => el.type === 'svg')
  assert.equal(svg.props.width, 36, 'the rail ring sets size to 36px')

  // Policy missing or unreachable: neutral unconfigured ring
  const failing = createHookRenderer()
  const failingFetch = () => Promise.reject(new Error('down'))
  const { exports: bareExports, window: bareWindow } = loadClientBundle(failing.React, { fetch: failingFetch }, { setInterval: () => 0, clearInterval: () => {} })
  bareWindow.localStorage.setItem('dshw-peakring-v1', 'false')
  failing.render(bareExports.__testing.PeakRingFooter, {}, { flushEffects: true })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(failing.render(bareExports.__testing.PeakRingFooter, {}), null, 'switch off removes the sidebar seat')

  // Switch back on: neutral unconfigured ring
  const neutralBundle = createHookRenderer()
  const { exports: neutralExports } = loadClientBundle(neutralBundle.React, { fetch: failingFetch }, { setInterval: () => 0, clearInterval: () => {} })
  neutralBundle.render(neutralExports.__testing.PeakRingFooter, {}, { flushEffects: true })
  await new Promise((resolve) => setTimeout(resolve, 10))
  const neutral = neutralBundle.render(neutralExports.__testing.PeakRingFooter, {})
  assert.ok(neutral, 'the seat stays mounted with a neutral ring')
  assert.match(neutral.props.title, /计费时段未配置/, 'neutral tooltip claims no price')
  assert.ok(findElement(neutral, (el) => el.props && String(el.props.className || '').includes('dshw_ringNeutral')), 'neutral arc paints gray')
})

test('peakClockState wraps midnight, keys reminders, and reads IANA wall time', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const state = exports.__testing.peakClockState
  const wallHourIn = exports.__testing.wallHourIn
  assert.equal(typeof state, 'function', 'peakClockState must be exported for unit coverage')
  const policy = {
    timezone: 'Asia/Shanghai', offsetMinutes: 480,
    windows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }],
    offPeakRate: 0.5,
  }
  // 2026-08-20T12:00Z = Beijing 20:00: past every boundary, next switch 09:00.
  const late = state(policy, 20, Date.parse('2026-08-20T12:00:00Z'))
  assert.equal(late.inPeak, false)
  assert.match(late.tip, /09:00 恢复标准价 · 还有 13 小时/, 'late evening points at tomorrow morning')
  // Peak mid-morning: 12:00 ends the first window.
  const peak = state(policy, 10.5, Date.parse('2026-08-20T02:30:00Z'))
  assert.equal(peak.inPeak, true)
  assert.match(peak.tip, /12:00 后半价/, 'peak tooltip announces the coming discount')
  // Reminder ids: stable inside a period, distinct across the boundary.
  assert.equal(state(policy, 10, 0).periodId, state(policy, 11.9, 0).periodId, 'same period, same id')
  assert.notEqual(state(policy, 10, 0).periodId, state(policy, 13, 0).periodId, 'crossing a boundary changes the id')
  assert.notEqual(state(policy, 10, 0).periodId, state(policy, 20, 0).periodId, 'peak and off-peak ids differ')
  // Unconfigured policy collapses to the neutral state.
  const neutral = state({ windows: [] }, 10, 0)
  assert.equal(neutral.configured, false)
  assert.match(neutral.tip, /计费时段未配置/)
  assert.equal(neutral.periodId, null, 'no reminder fires without a policy')
  const weekend = state({
    timezone: 'Asia/Shanghai', offsetMinutes: 480,
    windows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }],
    offPeakRate: 0.5, weekendOffPeak: true,
  }, 10, Date.parse('2026-08-22T02:00:00Z'))
  assert.equal(weekend.configured, true, 'weekend policy remains configured')
  assert.equal(weekend.inPeak, false, 'weekend never enters peak')
  assert.equal(weekend.weekendOffPeak, true)
  assert.equal(weekend.windows.length, 0, 'weekend ring has no peak arcs')
  assert.match(weekend.tip, /周一 09:00 恢复工作日规则/)
  assert.doesNotMatch(weekend.tip, /还有|剩/, 'weekend tooltip omits a long countdown')
  assert.equal(weekend.countdownSummary, '周六全天低谷', 'Saturday card names the current day instead of showing remaining time')
  assert.equal(weekend.switchBody, '已进入周末低谷，全天按半价计费')
  assert.match(weekend.windowSummary, /周六全天低谷/)
  const nextSaturday = state({
    timezone: 'Asia/Shanghai', offsetMinutes: 480,
    windows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }],
    offPeakRate: 0.5, weekendOffPeak: true,
  }, 10, Date.parse('2026-08-29T02:00:00Z'))
  const nextSunday = state({
    timezone: 'Asia/Shanghai', offsetMinutes: 480,
    windows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }],
    offPeakRate: 0.5, weekendOffPeak: true,
  }, 10, Date.parse('2026-08-30T02:00:00Z'))
  const fridayEvening = state({
    timezone: 'Asia/Shanghai', offsetMinutes: 480,
    windows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }],
    offPeakRate: 0.5, weekendOffPeak: false,
    weekendOffPeakSince: Date.parse('2026-08-22T16:00:00Z'),
  }, 18.5, Date.parse('2026-08-28T10:30:00Z'))
  assert.equal(fridayEvening.countdownSummary, '周末全天低谷')
  assert.doesNotMatch(fridayEvening.countdownSummary, /周一|接续/, 'Friday card keeps the weekend reminder short')
  assert.doesNotMatch(fridayEvening.tip, /还有|剩/, 'Friday does not show a misleading Saturday countdown')
  assert.ok(fridayEvening.windowSummary.includes('周六/周日全天低谷'))
  assert.equal(nextSaturday.countdownSummary, '周六全天低谷')
  assert.equal(nextSunday.countdownSummary, '周日全天低谷')
  assert.equal(fridayEvening.periodId, nextSaturday.periodId, 'Friday evening and Saturday share the continuous low-price period')
  assert.equal(nextSaturday.periodId, nextSunday.periodId, 'Saturday and Sunday share one reminder period')
  const mondayMorning = state({
    timezone: 'Asia/Shanghai', offsetMinutes: 480,
    windows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }],
    offPeakRate: 0.5, weekendOffPeak: false,
    weekendOffPeakSince: Date.parse('2026-08-22T16:00:00Z'),
  }, 8, Date.parse('2026-08-31T00:00:00Z'))
  assert.equal(mondayMorning.countdownSummary, '剩 1h 进入高峰', 'Monday before 09:00 states the target state')
  assert.equal(nextSunday.periodId, mondayMorning.periodId, 'Monday before 09:00 remains in the same continuous low-price period')
  const weekendRing = exports.__testing.peakRingSVG([], 10, 76, weekend.ariaText, true)
  assert.ok(findElement(weekendRing, (el) => el.props && String(el.props.className || '').includes('dshw_ringOff')), 'weekend ring renders a full off-peak arc')
  // IANA wall time: Beijing 11:30 read from a UTC instant, plus offset fallback.
  const bjHour = wallHourIn('Asia/Shanghai', 480, new Date('2026-08-20T03:30:00Z'))
  assert.ok(Math.abs(bjHour - 11.5) < 0.01, 'Asia/Shanghai hour comes from IANA conversion')
  const fallback = wallHourIn('Not/AZone', 480, new Date('2026-08-20T03:30:00Z'))
  assert.ok(Math.abs(fallback - 11.5) < 0.01, 'unresolvable zones fall back to the policy offset')
})

test('settings expose the ring switch and the switch-reminder toggle', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const tree = renderer.render(exports.__testing.WalletSettingsSection, { close: () => {} })
  const ringToggle = findElement(tree, (el) => el.props && el.props['aria-label'] === '显示侧边栏峰谷时钟')
  const notifyToggle = findElement(tree, (el) => el.props && el.props['aria-label'] === '开启峰谷切换提醒')
  assert.ok(ringToggle, 'the ring visibility switch must render in the settings quad')
  assert.ok(notifyToggle, 'the peak switch-reminder toggle must render in the settings quad')
  assert.equal(ringToggle.props.checked, true, 'the ring defaults to on')
  assert.equal(notifyToggle.props.checked, false, 'reminders stay opt-in')
})

test('settings expose peak ring layout, scale slider (100-120%), recharge toggle and dock position', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const tree = renderer.render(exports.__testing.WalletSettingsSection, { close: () => {} })
  const orientSelect = findElement(tree, (el) => el.props && el.props['aria-label'] === '峰谷时钟布局')
  const scaleInput = findElement(tree, (el) => el.props && el.props['aria-label'] === '峰谷时钟卡片比例')
  const rechargeToggle = findElement(tree, (el) => el.props && el.props['aria-label'] === '显示时钟充值按钮')
  assert.ok(orientSelect, 'the layout orientation selector must render')
  assert.equal(orientSelect.props.value, 'horizontal', 'default orientation is horizontal')
  assert.ok(scaleInput, 'the peak clock scale slider must render')
  assert.equal(scaleInput.props.min, '100', 'minimum scale is 100%')
  assert.equal(scaleInput.props.max, '120', 'maximum scale is 120%')
  assert.equal(scaleInput.props.step, '5', 'scale step is 5%')
  assert.equal(scaleInput.props.value, '100', 'default scale is 100%')
  assert.ok(rechargeToggle, 'the recharge toggle must render')
  assert.equal(rechargeToggle.props.checked, true, 'recharge button defaults to visible')
})

test('peak ring footer supports vertical layout, hidden recharge, and floating mode with reset', async () => {
  const mockFetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      ok: true,
      pricingWindows: {
        timezone: 'Asia/Shanghai', offsetMinutes: 480,
        windows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }],
        offPeakRate: 0.5,
      },
      balance: { total: 100, currency: 'CNY' },
      session: { official: { cost: 0.25 } }
    }),
  })

  // 1. Vertical layout with recharge
  const r1 = createHookRenderer()
  const { exports: e1, window: w1 } = loadClientBundle(r1.React, { fetch: mockFetch }, { setInterval: () => 0, clearInterval: () => {} })
  w1.localStorage.setItem('dshw-peak-orient-v1', 'vertical')
  w1.localStorage.setItem('dshw-peak-recharge-v1', 'true')
  r1.render(e1.__testing.PeakRingFooter, { wide: true }, { flushEffects: true })
  await new Promise((resolve) => setTimeout(resolve, 30))
  let tree1 = r1.render(e1.__testing.PeakRingFooter, { wide: true })
  let row1 = findElement(tree1, (el) => el.props && String(el.props.className || '').includes('dshw_footRingVertical'))
  let horizBtn1 = findElement(tree1, (el) => el.props && String(el.props.className || '').includes('dshw_footRingBtnRechargeInline'))
  assert.ok(horizBtn1, 'vertical layout with recharge renders inline recharge button')

  // 2. Vertical layout with hidden recharge
  const r2 = createHookRenderer()
  const { exports: e2, window: w2 } = loadClientBundle(r2.React, { fetch: mockFetch }, { setInterval: () => 0, clearInterval: () => {} })
  w2.localStorage.setItem('dshw-peak-orient-v1', 'vertical')
  w2.localStorage.setItem('dshw-peak-recharge-v1', 'false')
  r2.render(e2.__testing.PeakRingFooter, { wide: true }, { flushEffects: true })
  await new Promise((resolve) => setTimeout(resolve, 30))
  let tree2 = r2.render(e2.__testing.PeakRingFooter, { wide: true })
  let horizBtn2 = findElement(tree2, (el) => el.props && String(el.props.className || '').includes('dshw_footRingBtnRechargeInline'))
  assert.equal(horizBtn2, null, 'turning off recharge removes the button')

  // 3. Floating mode
  const r3 = createHookRenderer()
  const { exports: e3, window: w3 } = loadClientBundle(r3.React, { fetch: mockFetch }, { setInterval: () => 0, clearInterval: () => {} })
  w3.localStorage.setItem('dshw-peak-dock-v1', 'free')
  w3.localStorage.setItem('dshw-peak-pos-v1', JSON.stringify({ x: 120, y: 240 }))
  r3.render(e3.__testing.PeakRingFooter, { wide: true }, { flushEffects: true })
  await new Promise((resolve) => setTimeout(resolve, 30))
  let tree3 = r3.render(e3.__testing.PeakRingFooter, { wide: true })
  let floating = findElement(tree3, (el) => el.props && String(el.props.className || '').includes('dshw_footRingFloating'))
  let resetBtn = findElement(tree3, (el) => el.props && String(el.props.className || '').includes('dshw_footRingResetBtn'))
  assert.ok(resetBtn, 'floating card provides a reset dock button')
})

test('dark mode theme compliance: client css avoids un-themed hardcoded white background fallbacks', () => {
  const source = readProjectFile('lib/client.js')
  // Ensure no un-themed hardcoded #fff fallbacks in background variables for hero/cards/panels
  assert.doesNotMatch(source, /--dsw-alias-bg-elevated,#fff/g, 'bg-elevated must not fallback to hardcoded light #fff')
  assert.doesNotMatch(source, /--dsw-alias-bg-overlay,#fff/g, 'bg-overlay must not fallback to hardcoded light #fff')
  assert.doesNotMatch(source, /--dsw-alias-label-quaternary,rgba\(31,35,40/g, 'quaternary label must use standard dimmed variable')
  assert.doesNotMatch(source, /#fff(?:fff)?|#1f2328/g, 'client CSS must not carry light-theme-only hardcoded fallbacks')
  assert.match(source, /--dsw-alias-bg-layer-1/g, 'standard layer-1 bg variable is used')
})

test('mobile settings adaptation avoids :has and scopes host layout changes to the wallet dialog', () => {
  const source = readProjectFile('lib/client.js')
  assert.doesNotMatch(source, /:has\(/, 'older desktop WebViews must not depend on :has()')
  assert.match(source, /dshw_settingsHostDialog/, 'wallet settings should mark only its own host dialog')
  assert.match(source, /settingsSectionRef\.current/, 'the host marker is attached from the mounted wallet section')
  assert.match(source, /@media \(max-width:560px\)/, 'narrow settings need a dedicated breakpoint')
})
test('history and settings auxiliary labels use a readable theme tier', () => {
  const source = readProjectFile('lib/client.js')
  assert.doesNotMatch(source, /dshw_history(?:TitleCopy|Summary|Legend|WeekLabels|Empty)[^\n]*label-dimmed/, 'history text must not use the overly faint dimmed tier')
  assert.match(source, /dshw_historySummary span[^\n]*label-secondary/, 'history summary labels need a readable secondary tier')
  assert.match(source, /dshw_accountCount[^\n]*label-secondary/, 'account count needs a readable secondary tier')
})
test('floating peak card positions are clamped for saved coordinates, scale changes, and small viewports', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const clamp = exports.__testing.clampPeakPosition
  assert.equal(typeof clamp, 'function')
  const bottomRight = clamp({ x: 900, y: 700 }, 240, 100, 1024, 768, 8)
  assert.equal(bottomRight.x, 776)
  assert.equal(bottomRight.y, 660)
  const topLeft = clamp({ x: -100, y: -40 }, 240, 100, 1024, 768, 8)
  assert.equal(topLeft.x, 8)
  assert.equal(topLeft.y, 8)
  // A rendered 120% card wider than the viewport remains reachable at the
  // safe margin instead of producing a negative max coordinate.
  const oversized = clamp({ x: 900, y: 700 }, 1400, 900, 1024, 768, 8)
  assert.equal(oversized.x, 8)
  assert.equal(oversized.y, 8)
})

test('clicking peak ring footer toggles dedicated control panel with full customization choices', async () => {
  const renderer = createHookRenderer()
  const mockFetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      ok: true,
      pricingWindows: {
        timezone: 'Asia/Shanghai', offsetMinutes: 480,
        windows: [{ startHour: 9, endHour: 12 }, { startHour: 14, endHour: 18 }],
        offPeakRate: 0.5,
      },
      balance: { total: 88.5, currency: 'CNY' },
      session: { official: { cost: 1.2 } }
    }),
  })
  const { exports, window } = loadClientBundle(renderer.React, { fetch: mockFetch }, { setInterval: () => 0, clearInterval: () => {} })
  const Ring = exports.__testing.PeakRingFooter
  renderer.render(Ring, { wide: true }, { flushEffects: true })
  await new Promise((resolve) => setTimeout(resolve, 30))
  let tree = renderer.render(Ring, { wide: true })
  let panel = findElement(tree, (el) => el.props && String(el.props.className || '').includes('dshw_peakPanel'))
  assert.equal(panel, null, 'panel is initially closed')

  // Click the card to open dedicated panel
  let card = findElement(tree, (el) => el.props && String(el.props.className || '').includes('dshw_footRing'))
  assert.ok(card && typeof card.props.onClick === 'function', 'card has onClick handler')
  card.props.onClick({ stopPropagation: () => {} })

  tree = renderer.render(Ring, { wide: true })
  panel = findElement(tree, (el) => el.props && String(el.props.className || '').includes('dshw_peakPanel'))
  assert.ok(panel, 'clicking the card opens the dedicated peak control panel')
  assert.ok(findElement(panel, (el) => el.props && el.props['aria-label'] === '控制面板时钟排版'), 'panel exposes orientation selector')
  assert.ok(findElement(panel, (el) => el.props && el.props['aria-label'] === '控制面板时钟卡片比例'), 'panel exposes scale slider')
  assert.ok(findElement(panel, (el) => el.props && el.props['aria-label'] === '控制面板时钟充值按钮'), 'panel exposes recharge toggle')
  assert.ok(findElement(panel, (el) => el.props && el.props['aria-label'] === '控制面板开启峰谷切换提醒'), 'panel exposes notification toggle')
})

test('peak prefs writes suppress their own event echo', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /suppressSelfSyncRef/, 'the ring must guard against re-reading storage from its own dispatch')
  assert.match(source, /function announcePrefs/, 'preference writes go through one announce helper')
  assert.match(source, /if \(suppressSelfSyncRef\.current\) return/, 'the change listener skips the self echo')
  // Every preference writer must use the guarded announce helper rather than
  // dispatching the shared events inline; the inline form lets this component's
  // own listener re-read storage and setState again, racing the queued write.
  const ringBody = source.slice(source.indexOf('function PeakRingFooter'), source.indexOf('function WalletChip'))
  const ringDispatches = ringBody.match(/compatibility\.dispatch\(PEAK_RING_EVENT\)/g) || []
  assert.equal(ringDispatches.length, 1, 'the ring event may only be dispatched from inside announcePrefs')
  for (const fn of ['updateOrient', 'updateScale', 'updateRecharge', 'handleResetDock']) {
    const start = ringBody.indexOf('function ' + fn)
    assert.ok(start >= 0, fn + ' must exist')
    assert.match(ringBody.slice(start, start + 420), /announcePrefs\(/, fn + ' must announce through the guarded helper')
  }
})

test('all recharge surfaces use the desktop external-link adapter', () => {
  const source = readProjectFile('lib/client.js')
  assert.doesNotMatch(source, /window\.open\(/, 'desktop wrappers must not be bypassed by direct window.open calls')
  assert.match(source, /function openOfficialRecharge/, 'all compact recharge surfaces share the guarded helper')
  assert.ok((source.match(/openOfficialRecharge\(\)/g) || []).length >= 5, 'every compact recharge surface uses the guarded helper')
  assert.ok((source.match(/compatibility\.openExternal\(/g) || []).length >= 2, 'the helper and full wallet confirmation route through openExternal')
})

test('drag latch releases after pointerup so the card stays clickable', () => {
  const source = readProjectFile('lib/client.js')
  const ringBody = source.slice(source.indexOf('function PeakRingFooter'), source.indexOf('function WalletChip'))
  const upStart = ringBody.indexOf('function onUp()')
  assert.ok(upStart >= 0, 'the drag release handler must exist')
  const upBody = ringBody.slice(upStart, upStart + 1200)
  assert.match(upBody, /didDragRef\.current = false/, 'pointerup must clear the drag latch; otherwise a lost pointerup permanently swallows card clicks')
})

test('storage falls back to memory readably when the native write is refused', () => {
  const renderer = createHookRenderer()
  // A native store that accepts reads but refuses every write (private mode /
  // quota): the adapter must serve the fallback value back, not the stale one.
  const refusing = {
    getItem() { return 'stale-native-value' },
    setItem() { throw new Error('quota exceeded') },
    removeItem() {},
  }
  const { exports } = loadClientBundle(renderer.React, {}, { localStorage: refusing })
  const adapter = exports.__testing.createCompatibilityAdapter({ localStorage: refusing })
  adapter.storage.setItem('dshw-peak-dock-v1', 'sidebar')
  assert.equal(adapter.storage.getItem('dshw-peak-dock-v1'), 'sidebar', 'the refused write must still read back from memory')
  adapter.storage.removeItem('dshw-peak-dock-v1')
  assert.equal(adapter.storage.getItem('dshw-peak-dock-v1'), 'stale-native-value', 'after removal the native value is authoritative again')
})

test('plan quota card renders official windows, hides credentials, and stays collapsible', async () => {
  const renderer = createHookRenderer()
  const payload = {
    ok: true,
    configuredCount: 1,
    availableCount: 1,
    refreshing: false,
    sources: [
      {
        id: 'zai-global',
        name: 'Z.ai Coding Plan（全球）',
        region: 'global',
        sourceDomain: 'api.z.ai',
        configured: false,
        available: false,
        refreshing: false,
        error: 'missing-credential',
        limits: [],
      },
      {
        id: 'zai-cn',
        name: 'Z.ai Coding Plan（中国）',
        region: 'cn',
        sourceDomain: 'open.bigmodel.cn',
        configured: true,
        available: true,
        refreshing: false,
        error: null,
        level: 'pro',
        fetchedAt: Date.UTC(2026, 7, 23, 12),
        limits: [
          { id: 'tokens-5h', kind: 'tokens', window: '5h', usedPercentage: 42, remainingPercentage: 58, used: null, total: null, remaining: null, resetAt: null },
          { id: 'tools-month', kind: 'tools', window: 'month', usedPercentage: 93, remainingPercentage: 7, used: 93, total: 100, remaining: 7, resetAt: Date.UTC(2026, 8, 1, 0) },
        ],
      },
    ],
  }
  const requests = []
  const mockFetch = (url, options) => {
    requests.push({ url: String(url), method: options && options.method ? options.method : 'GET' })
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
  }
  const { exports } = loadClientBundle(renderer.React, { fetch: mockFetch })
  const Panel = exports.__testing.PlanUsagePanel
  assert.equal(typeof Panel, 'function', 'PlanUsagePanel must be exported for render coverage')

  renderer.render(Panel, { compact: false }, { flushEffects: true })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const tree = renderer.render(Panel, { compact: false })
  const text = JSON.stringify(tree)
  assert.equal(requests.length, 1, 'the first load must be a single read-only query')
  assert.equal(requests[0].url, '/api/wallet/plans')
  assert.equal(requests[0].method, 'GET')
  assert.match(text, /套餐额度/)
  assert.match(text, /5 小时窗口/, 'the 5-hour token window must be labeled')
  assert.match(text, /1 个月窗口/, 'the monthly tool window must be labeled')
  assert.match(text, /剩余 58%/, 'remaining quota must be the primary percentage')
  assert.match(text, /已用 42%/, 'used quota remains visible as secondary context')
  assert.match(text, /未配置/, 'an unconfigured plan must be reported instead of guessed')
  assert.match(text, /open\.bigmodel\.cn/, 'each source must name the official domain it queried')
  assert.doesNotMatch(text, /¥|\$/, 'subscription quota must never be converted into currency balance')
  const bar = findElement(tree, (element) => element.props && element.props.role === 'progressbar')
  assert.ok(bar, 'quota windows render as accessible progress bars')
  assert.equal(bar.props['aria-valuenow'], 58)
  const bars = []
  ;(function collectBars(node) {
    if (node === null || node === undefined || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(collectBars); return }
    if (node.props && node.props.role === 'progressbar') bars.push(node)
    collectBars(node.props && node.props.children)
  })(tree)
  assert.equal(bars[1].props['aria-valuenow'], 7)
  assert.match(String(bars[1].props.children.props.className), /critical/, '20% or less remaining uses the critical color')

  const compactRenderer = createHookRenderer()
  const compactBundle = loadClientBundle(compactRenderer.React, { fetch: mockFetch })
  const compactTree = compactRenderer.render(compactBundle.exports.__testing.PlanUsagePanel, { compact: true })
  assert.ok(findElement(compactTree, (element) => element.type === 'button' && element.props['aria-label'] === '查看套餐额度'), 'compact surfaces keep the plan card collapsible')

  const clientSource = readProjectFile('lib/client.js')
  assert.match(clientSource, /key: 'plans', compact: false/, 'wallet settings shows the expanded plan card')
  assert.match(clientSource, /key: 'plans-compact', compact: true/, 'the chip panel keeps a collapsible plan card')
})

test('composer wallet follows the selected provider instead of showing DeepSeek controls everywhere', () => {
  const renderer = createHookRenderer()
  const { exports } = loadClientBundle(renderer.React)
  const snapshot = {
    providers: { builtinOfficial: 'deepseek-official', official: ['deepseek-wrapper'] },
  }
  assert.equal(exports.__testing.providerModeFor(
    { provider: 'zai-coding-cn', model: 'glm-5.2' }, snapshot, true,
  ).kind, 'zai')
  assert.equal(exports.__testing.providerModeFor(
    { provider: 'openrouter', model: 'other-model' }, snapshot, true,
  ).kind, 'third')
  assert.equal(exports.__testing.providerModeFor(
    { provider: 'deepseek-official', model: 'deepseek-v4-flash' }, snapshot, true,
  ).kind, 'deepseek')
  assert.equal(exports.__testing.providerModeFor(
    { provider: 'deepseek-wrapper', model: 'deepseek-v4-flash-vision-exp' }, snapshot, true,
  ).kind, 'deepseek')

  const source = readProjectFile('lib/client.js')
  assert.match(source, /if \(providerMode\.kind !== 'deepseek'\) return null/, 'the peak clock disappears outside DeepSeek')
  assert.match(source, /if \(modelAware && !\/\^deepseek-v4-\//, 'the peak clock is limited to the V4 pricing family')
  assert.match(source, /activeProviderMode\.kind === 'zai'/, 'the composer chip has a Z.ai-specific presentation')
  assert.match(source, /'5h 剩' \+ planTokenRemaining/, 'the Z.ai chip shows remaining five-hour quota')
  assert.match(source, /'MCP 剩' \+ planToolRemaining/, 'the Z.ai chip shows remaining monthly tool quota')
  assert.match(source, /showDeepSeek \? React\.createElement\('button'/, 'recharge is gated by the selected provider')
  assert.match(source, /modelDirectories\.directoryFor\(sessionId\)/, 'the chip reads the host model-selection service')
  assert.match(source, /lowNoticeRef\.current\.close\(\)/, 'leaving DeepSeek closes a stale low-balance notice')

  const pkg = JSON.parse(readProjectFile('package.json'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-model-selection'))
})

test('composer label supports standard, text-only, and hidden presentation modes', () => {
  const normalRenderer = createHookRenderer()
  const normalBundle = loadClientBundle(normalRenderer.React)
  assert.equal(normalBundle.exports.__testing.normalizeChipStyle(null), 'standard')
  assert.equal(normalBundle.exports.__testing.normalizeChipStyle('standard'), 'standard')
  assert.equal(normalBundle.exports.__testing.normalizeChipStyle('text'), 'text')
  assert.equal(normalBundle.exports.__testing.normalizeChipStyle('hidden'), 'hidden')
  assert.equal(normalBundle.exports.__testing.normalizeChipStyle('unknown'), 'standard')

  const textRenderer = createHookRenderer()
  const textBundle = loadClientBundle(textRenderer.React)
  textBundle.window.localStorage.setItem('dshw-chip-style-v1', 'text')
  const textTree = textRenderer.render(textBundle.exports.__testing.WalletChip, { sessionId: 'session-style' })
  const textChip = findElement(textTree, (element) => element.props && element.props['data-dshw-chip'] === 'text')
  assert.ok(textChip, 'text mode keeps the composer label mounted')
  assert.match(String(textChip.props.className), /dshw_chipTextOnly/)

  const hiddenRenderer = createHookRenderer()
  const hiddenBundle = loadClientBundle(hiddenRenderer.React)
  hiddenBundle.window.localStorage.setItem('dshw-chip-style-v1', 'hidden')
  assert.equal(hiddenRenderer.render(hiddenBundle.exports.__testing.WalletChip, { sessionId: 'session-hidden' }), null)

  const settingsRenderer = createHookRenderer()
  const settingsBundle = loadClientBundle(settingsRenderer.React)
  const settingsTree = settingsRenderer.render(settingsBundle.exports.__testing.WalletSettingsSection, { close: () => {} })
  const styleSelect = findElement(settingsTree, (element) => element.type === 'select' && element.props['aria-label'] === '输入框标签样式')
  assert.ok(styleSelect, 'settings exposes the composer label presentation choice')
  const optionText = JSON.stringify(styleSelect)
  assert.match(optionText, /标准/)
  assert.match(optionText, /纯文字/)
  assert.match(optionText, /隐藏/)
})

test('maid-atelier compatibility prevents the skin from forcing the wallet button to 30px', () => {
  const source = readProjectFile('lib/client.js')
  assert.match(source, /body\[data-dsh-maid-atelier\] \.dshw_anchorHome\{min-height:38px\}/)
  assert.match(source, /button\.dshw_chipMain\[aria-haspopup="dialog"\]\{[^}]*width:auto;[^}]*height:100%/, 'wallet sizing must outrank the skin context-meter selector')
  assert.match(source, /button\.dshw_chipMain\[aria-haspopup="dialog"\]:hover:not\(:disabled\)\{transform:none/, 'skin hover motion must not offset the chip inside its frame')
  assert.match(source, /dshw_chipTextOnly/, 'the skin-compatible chip still supports borderless text mode')
  assert.match(source, /data-dshw-chip-main/, 'themes get a stable selector instead of guessing aria roles')
})
