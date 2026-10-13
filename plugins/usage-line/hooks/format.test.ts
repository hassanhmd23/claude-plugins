import { expect, test } from 'claude-code/testing'
import { bar, line, until } from './format'

test('bar fills in half steps', () => {
  expect(bar(0)).toBe('──────────')
  expect(bar(45)).toBe('━━━━╸─────')
  expect(bar(100)).toBe('━━━━━━━━━━')
  expect(bar(150)).toBe('━━━━━━━━━━')
})

test('until formats reset countdowns', () => {
  expect(until(-1)).toBe('now')
  expect(until(5 * 60_000)).toBe('5m')
  expect(until((2 * 60 + 10) * 60_000)).toBe('2h10m')
  expect(until((3 * 24 + 11) * 3_600_000)).toBe('3d11h')
})

test('line joins the fields and skips missing ones', () => {
  const now = Date.parse('2026-10-13T12:00:00Z')
  const usage = {
    startedAt: now - 12 * 60_000,
    context: { tokens: 152_340, window: 1_000_000, percent: 15 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-13T14:10:00Z' }],
    cost: { usd: 1.5 },
  }
  expect(line({ model: 'Opus', project: 'kit', branch: 'main', usage, now })).toBe(
    'Opus · kit · main · $1.50 · 12m · ctx ━╸──────── 15% 152k/1000k · 5h ━━━━────── 42% ↻2h10m',
  )
  expect(line({ model: 'Opus', project: 'kit', usage: { startedAt: now, context: { window: 1 }, rateLimits: [] }, now })).toBe(
    'Opus · kit · 0m',
  )
})
