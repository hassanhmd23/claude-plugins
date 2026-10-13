import { expect, test } from 'claude-code/testing'
import { bar, k, snapshot, tone, until } from './format'

test('bar splits fill and track in half steps', () => {
  expect(bar(0)).toEqual(['', '━━━━━━━━━━'])
  expect(bar(45)).toEqual(['━━━━╸', '━━━━━'])
  expect(bar(150)).toEqual(['━━━━━━━━━━', ''])
})

test('tone turns yellow at 50 and red at 80', () => {
  expect([tone(49), tone(50), tone(80)]).toEqual(['success', 'warning', 'error'])
})

test('until and k format compactly', () => {
  expect([until(-1), until(5 * 60_000), until(130 * 60_000), until(83 * 3_600_000)]).toEqual(['now', '5m', '2h10m', '3d11h'])
  expect([k(999), k(152_340)]).toEqual(['999', '152k'])
})

test('snapshot reads usage and skips what is missing', () => {
  const now = Date.parse('2026-10-13T12:00:00Z')
  const s = snapshot({
    model: 'Opus',
    project: 'kit',
    now,
    usage: {
      startedAt: now - 12 * 60_000,
      context: { tokens: 152_340, window: 1_000_000, percent: 15 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-13T14:10:00Z' },
        { kind: 'seven_day', percentUsed: 36, resetsAt: '2026-10-18T17:00:00Z' },
      ],
      cost: { usd: 1.5 },
    },
  })
  expect(s).toMatchObject({ model: 'Opus', project: 'kit', cost: 1.5, minutes: 12, context: { percent: 15, tokens: 152_340 } })
  expect(s.limits[0]).toEqual({ label: '5h', percent: 42, reset: '↻2h10m' })
  expect(s.limits[1]?.reset).toMatch(/^@\w{3} \d\d:\d\d$/)

  const empty = snapshot({ model: 'Opus', project: 'kit', now, usage: { startedAt: now, context: { window: 1 }, rateLimits: [] } })
  expect([empty.context, empty.cost, empty.limits]).toEqual([undefined, undefined, []])
})
