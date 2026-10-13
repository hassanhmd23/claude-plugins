import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'
import type { Snapshot } from '../types'
import { bar, k, modelName, snapshot, tone } from './format'

const current = atom({ plugin: 'usage-line', key: 'snapshot' } as const, null)

// Set from each model request; the session API has no getter for it.
let effort: string | undefined

// The caveman plugin's badge, when it is installed; its colours are dropped for ours.
async function badge($: EngineInterface) {
  try {
    const home = await $.env.get('HOME')
    const ran = await $.process.run(['bash', `${home}/.claude/hooks/caveman-statusline.sh`], { timeoutMs: 2000 })
    const text = ran.exitCode === 0 ? ran.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim() : ''
    return text || undefined
  } catch {
    return undefined
  }
}

async function refresh($: EngineInterface) {
  const [model, root, usage, now, git, caveman] = await Promise.all([
    $.session.model(),
    $.session.root(),
    $.session.usage(),
    $.clock.now(),
    $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 2000 }).catch(() => undefined),
    badge($),
  ])
  const branch = git?.exitCode === 0 ? git.stdout.trim() || undefined : undefined
  const next = snapshot({ model: modelName(model), effort, project: root.split('/').pop() ?? root, branch, badge: caveman, usage, now })
  await update($, current, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // Clears the notice 0.1.0 pinned with $.ui.status; the host keeps it across updates.
    $.ui.status(undefined)
    await refresh($)
    // Keeps the reset countdowns moving between turns.
    $.clock.every(60_000, () => refresh($))
    return started
  })

  on('turn.step', async function* ($, e, next) {
    effort = e.effort === undefined ? undefined : String(e.effort)
    return yield* next(e)
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const s: Snapshot | null = await read($, current)
    if (!s) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const sep = <Text dimColor> · </Text>
    const gauge = (label: string, percent: number) => {
      const [fill, track] = bar(percent)
      return (
        <Text>
          {label} <Text color={tone(percent)}>{fill}</Text>
          <Text dimColor>{track}</Text> <Text color={tone(percent)}>{Math.round(percent)}%</Text>
        </Text>
      )
    }

    const top = [
      <Text>
        {s.model}
        {s.effort && <Text dimColor> ({s.effort})</Text>}
      </Text>,
      <Text>{s.project}</Text>,
      s.branch && <Text>{s.branch}</Text>,
      s.cost !== undefined && <Text>${s.cost.toFixed(2)}</Text>,
      <Text>{s.minutes}m</Text>,
      s.badge && <Text color="#d78700">{s.badge}</Text>,
    ].filter(Boolean) as RenderChildren[]

    const bottom = [
      s.context && (
        <Text>
          {gauge('ctx', s.context.percent)}
          <Text dimColor> {k(s.context.tokens)}/{k(s.context.window)}</Text>
        </Text>
      ),
      ...s.limits.map(l => (
        <Text>
          {gauge(l.label, l.percent)}
          {l.reset && <Text dimColor> {l.reset}</Text>}
        </Text>
      )),
    ].filter(Boolean) as RenderChildren[]

    const row = (parts: RenderChildren[]) => (
      <Text wrap="truncate">{parts.flatMap((p, i) => (i ? [sep, p] : [p]))}</Text>
    )

    return (
      <Box flexDirection="column">
        {row(e.props.isWorking ? [...top, <Text dimColor>{e.props.hint}</Text>] : top)}
        {bottom.length > 0 && row(bottom)}
      </Box>
    )
  })
}
