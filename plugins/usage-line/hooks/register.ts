import type { EngineInterface, Register } from 'claude-code'
import { line } from './format'

async function refresh($: EngineInterface) {
  const [model, root, usage, now, git] = await Promise.all([
    $.session.model(),
    $.session.root(),
    $.session.usage(),
    $.clock.now(),
    $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 2000 }).catch(() => undefined),
  ])
  const branch = git?.exitCode === 0 ? git.stdout.trim() : undefined
  $.ui.status(line({ model, project: root.split('/').pop() ?? root, branch, usage, now }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refresh($)
    // Keeps the reset countdowns moving between turns.
    $.clock.every(60_000, () => refresh($))
    return started
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($)
    return next(e)
  })
}
