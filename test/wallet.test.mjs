/**
 * Unit tests for the wallet pricing/accounting pure functions.
 * Run with `node --test test/` (zero dependencies, node:test).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRICE_POLICIES,
  isBeijingPeak,
  ratesFor,
  costOf,
  normalizeThreshold,
  sumBalances,
} from '../index.js'

// Beijing wall-clock helper: ms timestamp for a Beijing local time.
function bj(y, m, d, h, min = 0) {
  return Date.UTC(y, m - 1, d, h - 8, min)
}

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
