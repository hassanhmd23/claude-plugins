import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cleanName } from './clean-view'

const PLAN = 'mcp__clean-view__plan_steps'
const REPORT = 'mcp__clean-view__report_progress'
const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const
const SURFACES = ['terminal', 'desktop'] as const

/** The world beneath the plugin, and a job begun with a real prompt. */
async function begin($: Engine, on: On) {
  mock.store(on)
  mock.clock(on, { now: 1_000 })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('classic.Notification', () => ({}))
  on('tool.call', { tool: 'Read' }, () => ({ result: { type: 'text', file: { content: 'hi' } } }))
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [] } }))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
}

async function band($: Engine, surface: (typeof SURFACES)[number]) {
  return $.ui.mount({ plugin: 'clean-view', surface, ...BAND })
}

test('step names come out plain and short', () => {
  expect(cleanName('Build the pricing section in `src/Pricing.tsx`')).toBe('Build the pricing section in')
  expect(cleanName('update src/components/Footer and polish it')).toBe('Update and polish it')
  expect(cleanName('fix Pricing.tsx styles')).toBe('Fix styles')
  const long = cleanName('Write a very long description of the pricing section so that it goes past eighty chars')
  expect(long.length <= 40).toBe(true)
  expect(long.endsWith('…')).toBe(true)
  expect(cleanName('`npm test`')).toBe('Working on it')
})

test('a to-do list and a 60% report draw done, current, next and up next', async ($, on) => {
  await begin($, on)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Read your brand notes', status: 'completed', activeForm: 'Reading' },
      { content: 'Build the pricing section', status: 'in_progress', activeForm: 'Building' },
      { content: 'Add the contact form', status: 'pending', activeForm: 'Adding' },
      { content: 'Polish the footer', status: 'pending', activeForm: 'Polishing' },
    ],
  })
  await $.tool.call({ tool: REPORT, task: 'Build the pricing section', percent: 60 })

  for (const surface of SURFACES) {
    const ui = await band($, surface)
    expect(await ui.find({ type: 'Text', text: /✓ Read your brand notes.*Done/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▶ Build the pricing section.*██████░░░░.*60%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /○ Add the contact form.*Next$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /○ Polish the footer.*Up next$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /Clean View: ON/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a permission prompt shows Needs you', async ($, on) => {
  await begin($, on)
  await $.tool.call({ tool: PLAN, steps: ['Read your notes', 'Build the page'] })
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })

  for (const surface of SURFACES) {
    const ui = await band($, surface)
    expect(await ui.find({ type: 'Text', text: /Needs you.*Claude needs your OK to continue/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /‖ Build|‖ Read/ })).toBeDefined()
    await ui.unmount()
  }
})

test('/simple off hides the band but keeps the button', async ($, on) => {
  await begin($, on)
  await $.tool.call({ tool: PLAN, steps: ['Read your notes', 'Build the page'] })
  await $.command.run({
    command: 'simple',
    args: 'off',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })

  const ui = await band($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /Read your notes/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /Clean View: OFF/ })).toBeDefined()
  await ui.unmount()
})

test('a step reported at 100 is checked off and the next one starts', async ($, on) => {
  await begin($, on)
  const planned = await $.tool.call({ tool: PLAN, steps: ['Read your notes', 'Build the page', 'Check it works'] })
  expect(planned.text).toBe('Planned 3 steps. The first one has started.')
  const noted = await $.tool.call({ tool: REPORT, task: 'Read your notes', percent: 140 })
  expect(noted.text).toBe('Progress noted: 100%.')

  const ui = await band($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /✓ Read your notes.*Done/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▶ Build the page.*Working/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /○ Check it works.*Next$/ })).toBeDefined()
  await ui.unmount()
})

test('tools are denied until there is a plan', async ($, on) => {
  await begin($, on)
  const before = await $.tool.call({ tool: 'Read', file_path: '/work/a.md' })
  expect(before.deny ?? (before.isError ? before.text : undefined)).toMatch(/plan_steps/)

  await $.tool.call({ tool: PLAN, steps: ['Read your notes'] })
  const after = await $.tool.call({ tool: 'Read', file_path: '/work/a.md' })
  expect(after.deny).toBeUndefined()
  expect(after.isError).toBeUndefined()
})
