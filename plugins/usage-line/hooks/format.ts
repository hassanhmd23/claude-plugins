import type { SessionUsage } from 'claude-code'

// 10-cell bar with half steps: 45 -> "━━━━╸─────"
export const bar = (percent: number): string => {
  const halves = Math.round(Math.min(Math.max(percent, 0), 100) / 5)
  const full = Math.floor(halves / 2)
  const half = halves % 2 ? '╸' : ''
  return '━'.repeat(full) + half + '─'.repeat(10 - full - half.length)
}

// 152340 -> "152k"
const k = (n: number): string => (n >= 1000 ? `${Math.floor(n / 1000)}k` : `${n}`)

// ms until reset -> "2h10m" / "3d11h" / "now"
export const until = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  if (s <= 0) return 'now'
  if (s >= 86400) return `${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(s / 60)}m`
}

const gauge = (label: string, percent: number): string => `${label} ${bar(percent)} ${Math.round(percent)}%`

const LIMITS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }

export type LineInput = { model: string; project: string; branch?: string; usage: SessionUsage; now: number }

// Fields the engine doesn't have are left out, as in the bash status line.
export const line = ({ model, project, branch, usage, now }: LineInput): string => {
  const parts = [model, project]
  if (branch) parts.push(branch)
  if (usage.cost) parts.push(`$${usage.cost.usd.toFixed(2)}`)
  parts.push(`${Math.floor((now - usage.startedAt) / 60000)}m`)

  const { percent, tokens, window } = usage.context
  if (percent !== undefined) parts.push(`${gauge('ctx', percent)} ${k(tokens ?? 0)}/${k(window)}`)
  for (const limit of usage.rateLimits) {
    const reset = limit.resetsAt ? ` ↻${until(Date.parse(limit.resetsAt) - now)}` : ''
    parts.push(gauge(LIMITS[limit.kind] ?? limit.kind, limit.percentUsed) + reset)
  }

  return parts.join(' · ')
}
