import type { SessionUsage } from 'claude-code'
import type { Limit, Snapshot } from '../types'

// 10-cell bar with half steps, split so the track can be drawn dim: 45 -> ["━━━━╸", "━━━━━"]
export const bar = (percent: number): [fill: string, track: string] => {
  const halves = Math.round(Math.min(Math.max(percent, 0), 100) / 5)
  const full = Math.floor(halves / 2)
  const half = halves % 2 ? '╸' : ''
  return ['━'.repeat(full) + half, '━'.repeat(10 - full - half.length)]
}

// Green under 50, yellow under 80, red from 80.
export const tone = (percent: number): 'success' | 'warning' | 'error' =>
  percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success'

// 152340 -> "152k"
export const k = (n: number): string => (n >= 1000 ? `${Math.floor(n / 1000)}k` : `${n}`)

// ms until reset -> "2h10m" / "3d11h" / "now"
export const until = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  if (s <= 0) return 'now'
  if (s >= 86400) return `${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(s / 60)}m`
}

// "claude-opus-5-5[1m]" -> "Opus 5.5"; anything else as given.
export const modelName = (id: string): string => {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}` : id
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Epoch ms -> "Sun 17:00", local time.
export const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// The 5h window counts down; the 7d one names when it resets, as the bash status line did.
const limit = ({ kind, percentUsed, resetsAt }: SessionUsage['rateLimits'][number], now: number): Limit => {
  const at = resetsAt ? Date.parse(resetsAt) : undefined
  if (kind === 'five_hour') return { label: '5h', percent: percentUsed, reset: at === undefined ? undefined : `↻${until(at - now)}` }
  if (kind === 'seven_day') return { label: '7d', percent: percentUsed, reset: at === undefined ? undefined : `@${clock(at)}` }
  return { label: kind === 'spend_limit' ? '$' : kind, percent: percentUsed }
}

export type SnapshotInput = Omit<Snapshot, 'cost' | 'minutes' | 'context' | 'limits'> & { usage: SessionUsage; now: number }

export const snapshot = ({ usage, now, ...rest }: SnapshotInput): Snapshot => {
  const { percent, tokens, window } = usage.context
  return {
    ...rest,
    cost: usage.cost?.usd,
    minutes: Math.floor((now - usage.startedAt) / 60000),
    context: percent === undefined ? undefined : { percent, tokens: tokens ?? 0, window },
    limits: usage.rateLimits.map(l => limit(l, now)),
  }
}
