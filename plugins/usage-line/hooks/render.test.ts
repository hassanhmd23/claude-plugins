import { expect, test } from 'claude-code/testing'

const HINT = { component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as const
const NOW = Date.parse('2026-10-13T12:00:00Z')

test('draws the session figures under the prompt', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('session.model', () => ({ value: 'Opus 5.5' }))
  on('session.root', () => ({ value: '/work/kit' }))
  on('clock.now', () => ({ value: NOW }))
  on('process.run', ($, e) => ({ value: { exitCode: e.argv[0] === 'git' ? 0 : 1, stdout: 'main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.usage', () => ({ value: {
    startedAt: NOW - 23 * 60_000,
    context: { tokens: 116_000, window: 1_000_000, percent: 12 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 85, resetsAt: '2026-10-13T16:36:00Z' }],
    cost: { usd: 2.11 },
  } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['cost'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-line', surface, ...HINT })
    for (const text of [/Opus 5\.5/, /^kit$/, /^main$/, /\$2\.11/, /116k\/1000k/, /↻4h36m/]) {
      expect(await ui.find({ type: 'Text', text })).toBeDefined()
    }
    await ui.unmount()
  }
})
