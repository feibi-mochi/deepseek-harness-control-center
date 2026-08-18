/**
 * Unit tests for the wallet pricing/accounting pure functions.
 * Run with `node --test test/` (zero dependencies, node:test).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import {
  PRICE_POLICIES,
  addOfficialUsage,
  apply as applyWallet,
  balanceCurrency,
  isBeijingPeak,
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
  let cursor = 0
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
    useEffect() { cursor++ },
    useLayoutEffect() { cursor++ },
  }
  return {
    React,
    render(Component, props) {
      cursor = 0
      return Component(props)
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
  assert.equal(pkg.version, '0.2.0')
  assert.equal(pkg.main, 'index.js')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.deepEqual(pkg.files, [
    'CHANGELOG.md',
    'index.js',
    'lib/client.js',
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
    'package.json',
  ]
  for (const path of intendedArchive) {
    assert.equal(existsSync(resolve(REPO_ROOT, path)), true, `intended archive entry is missing: ${path}`)
  }
  assert.deepEqual(intendedArchive.length, 14)
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
  const englishReadme = readProjectFile('README.md')
  const chineseReadme = readProjectFile('docs/i18n/README.zh-CN.md')
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
  assert.equal(PRICE_POLICIES.length, 3)
  // 2025-02-09: deepseek-chat / deepseek-reasoner.
  assert.equal(PRICE_POLICIES[0].since, Date.UTC(2025, 1, 9))
  // 2026-04-24: v4 flat rates (V4 preview launch).
  assert.equal(PRICE_POLICIES[1].since, Date.UTC(2026, 3, 24))
  // 2026-08-17 00:00 Beijing = 2026-08-16T16:00Z.
  assert.equal(PRICE_POLICIES[2].since, Date.UTC(2026, 7, 16, 16))
  assert.equal(PRICE_POLICIES[2].peakOffPeak, true)
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

test('ratesFor: flat v4 rates before the peak/off-peak rollout', () => {
  assert.deepEqual(ratesFor('deepseek-v4-flash', bj(2026, 8, 16, 23, 59)), {
    cacheHit: 0.02, input: 1, output: 2,
  })
  assert.deepEqual(ratesFor('deepseek-v4-pro', bj(2026, 8, 16, 23, 59)), {
    cacheHit: 0.025, input: 3, output: 6,
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
    version: 2,
    threshold: 5,
    sessions: { current: { official: bucket, third: { models: {} } } },
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
  assert.equal(first.store.version, 2)
  assert.equal(first.store.threshold, 7.25)
  assert.equal(first.store.sessions.old.official.cost, 18.15)
  assert.equal(first.store.sessions.old.official.models['deepseek-v4-pro'].cacheWrite, 0)
  assert.equal(first.store.sessions.old.official.models['deepseek-v4-pro'].reasoning, 0)

  const second = normalizeStoreData(first.store, bj(2026, 8, 18, 10, 0))
  assert.equal(second.migrated, false)
  assert.equal(second.store.sessions.old.official.cost, 18.15)
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
  assert.match(source, /dock === 'home' \? 1\.2 : 1\.25/, 'the scale cap must tighten to 105% while the chip is docked in the composer')
  assert.match(source, /max: String\(scaleMaxPercent\)/, 'the slider max must follow the dock-specific scale cap')
  assert.match(source, /chipScaleRef\.current > 1\.2\) saveChipScale\(1\.2\)/, 'a stored 125% must clamp down when the chip returns home')

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

  const { Component } = walletComponent(exports)
  let tree = renderer.render(Component, { sessionId: 'session-1' })
  findElement(tree, (element) => element.type === 'button' && element.props.className === 'dshw_chipMain').props.onClick()
  tree = renderer.render(Component, { sessionId: 'session-1' })
  const toggle = findElement(tree, (element) => element.type === 'input' && element.props['aria-label'] === '开启对话完成后提醒')
  const timeout = findElement(tree, (element) => element.type === 'select' && element.props['aria-label'] === '提醒自动关闭时间')
  assert.equal(toggle.props.checked, true)
  assert.equal(timeout.props.value, '10')
  assert.deepEqual(timeout.props.children.map((option) => option.props.value), ['0', '5', '10', '30', '60'])

  timeout.props.onChange({ target: { value: '0' } })
  tree = renderer.render(Component, { sessionId: 'session-1' })
  assert.equal(
    findElement(tree, (element) => element.type === 'select' && element.props['aria-label'] === '提醒自动关闭时间').props.value,
    '0',
  )
  assert.equal(window.localStorage.getItem('dshw-completion-notify-v1'), JSON.stringify({ enabled: true, timeout: 0 }))
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
  assert.equal(adapter.notify('完成', { body: '测试', tag: 'one' }), handle)
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
  assert.ok(findElement(tree, (element) => element.props && element.props.children === '宿主不支持'))
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
    }, {})

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
  assert.deepEqual(normalizeAccountsData(null), { version: 1, accounts: [], activeId: null })
  assert.deepEqual(normalizeAccountsData([1, 2]), { version: 1, accounts: [], activeId: null })
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
  assert.equal(failed.error, 'shadowed write refused')
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
  const balanceCard = findElement(tree, (element) => element.props && String(element.props.className || '').includes('dshw_balanceCard'))
  const setCard = findElement(tree, (element) => element.props && String(element.props.className || '').includes('dshw_setCard'))
  assert.ok(balanceCard, 'the settings section must render the balance card')
  assert.ok(setCard, 'the settings section must render the grouped settings card')
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
