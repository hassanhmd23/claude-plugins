import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { Checklist, Task, TaskStatus } from '../types'

type $ = EngineInterface

const PLUGIN = 'clean-view'
const PLAN_TOOL = `mcp__${PLUGIN}__plan_steps`
const REPORT_TOOL = `mcp__${PLUGIN}__report_progress`
const ALWAYS_ALLOWED = new Set(['ToolSearch', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion'])
const METER = 10
const MAX_NAME = 40
const FALLBACK_NAME = 'Working on it'

const enabled = atom({ plugin: 'clean-view', key: 'cleanViewEnabled' } as const, true)
const checklist = atom({ plugin: 'clean-view', key: 'checklist' } as const, null)
const tick = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)

const SAID_NO = 'you said no to a step, so Claude paused'
const KEEPS_FAILING = 'a step keeps failing, Claude is trying another way'
const WAITING_FOR_REPLY = 'Claude is waiting for your reply'
const NEEDS_OK = 'Claude needs your OK to continue'
const HAS_QUESTION = 'Claude has a question for you'

const GUIDE = `## Clean View is on

The person sees a plain checklist of your plan instead of your tool calls. Keep it accurate:
- For every request, even a quick question, call \`${PLAN_TOOL}\` first with every step of the job in order (2 to 8 steps). If it is deferred, load it with ToolSearch first. If this session has TodoWrite or TaskCreate you may use your to-do list as the plan instead.
- Then call \`${REPORT_TOOL}\` as real progress happens, and with percent 100 the moment a step finishes.
- Write every step name in plain English a non-technical person understands, under 40 characters, starting with a verb, like "Build the pricing section".
- Never put file paths, file names, commands, code or tool names in a step name.`

// ---------- plain names ----------

const CODE_FILE = /\b[\w.-]+\.(?:[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs|php|json|ya?ml|toml|ini|md|mdx|css|scss|less|html?|vue|svelte|sh|bash|zsh|sql|lock|env|xml|gradle|txt)\b/gi

export function cleanName(raw: string): string {
  const text = raw
    .replace(/`[^`]*`?/g, ' ')
    .replace(/\S*\/\S*/g, ' ')
    .replace(CODE_FILE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text === '') return FALLBACK_NAME
  const name = text[0].toUpperCase() + text.slice(1)
  if (name.length <= MAX_NAME) return name
  const cut = name.slice(0, MAX_NAME - 1)
  const space = cut.lastIndexOf(' ')

  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`
}

// ---------- the checklist, as pure steps ----------

const task = (name: string, status: TaskStatus, id = name): Task => ({
  id,
  name: cleanName(name),
  status,
  percent: status === 'done' ? 100 : 0,
  hasReported: status === 'done',
})

/** One task active: the first not done, when none is. */
function settle(tasks: Task[]): Task[] {
  if (tasks.some(t => t.status === 'active')) return tasks
  const next = tasks.findIndex(t => t.status === 'upcoming')

  return tasks.map((t, i) => (i === next ? { ...t, status: 'active' } : t))
}

export function startJob(prompt: string, now: number): Checklist {
  return {
    title: cleanName(prompt.split(/\s+/).slice(0, 6).join(' ')),
    phase: 'working',
    tasks: [task('Understand your request', 'active'), task('Plan the steps', 'upcoming')],
    hasPlan: false,
    needsYouReason: null,
    stuckReason: null,
    startedAt: now,
    finishedAt: null,
    isCollapsed: false,
  }
}

export function planSteps(list: Checklist, steps: readonly string[]): Checklist {
  const tasks = steps.map((s, i) => task(s, i === 0 ? 'active' : 'upcoming', `step-${i}`))

  return { ...list, tasks, hasPlan: true }
}

export function reportProgress(list: Checklist, name: string, percent: number): Checklist {
  const clean = cleanName(name)
  const pct = Math.max(0, Math.min(100, Math.round(Number.isFinite(percent) ? percent : 0)))
  let tasks = [...list.tasks]
  let at = tasks.findIndex(t => t.name.toLowerCase() === clean.toLowerCase())
  if (at === -1) {
    // A new step goes after the last one already started.
    const lastStarted = tasks.map(t => t.status !== 'upcoming').lastIndexOf(true)
    at = lastStarted + 1
    tasks.splice(at, 0, task(clean, 'upcoming', `step-${tasks.length}-${clean}`))
  }
  tasks = tasks.map((t, i): Task => {
    if (i < at) return t.status === 'done' ? t : { ...t, status: 'done', percent: 100, hasReported: true }
    if (i === at) return { ...t, status: pct >= 100 ? 'done' : 'active', percent: pct, hasReported: true }

    return t.status === 'active' ? { ...t, status: 'upcoming' } : t
  })

  return { ...list, tasks: settle(tasks), hasPlan: true }
}

type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' }
const FROM_TODO = { pending: 'upcoming', in_progress: 'active', completed: 'done' } as const

export function fromTodos(list: Checklist, todos: readonly Todo[]): Checklist {
  const tasks = todos.map((todo, i) => {
    const fresh = task(todo.content, FROM_TODO[todo.status], `todo-${i}`)
    const old = list.tasks.find(t => t.name === fresh.name)
    return fresh.status === 'active' && old?.status === 'active' ? { ...fresh, percent: old.percent, hasReported: old.hasReported } : fresh
  })

  return { ...list, tasks: settle(tasks), hasPlan: true }
}

export function addTask(list: Checklist, id: string, subject: string): Checklist {
  const tasks = list.hasPlan ? list.tasks : []

  return { ...list, tasks: settle([...tasks, task(subject, 'upcoming', id)]), hasPlan: true }
}

export function updateTask(list: Checklist, id: string, status?: string, subject?: string): Checklist {
  if (status === 'deleted') return { ...list, tasks: settle(list.tasks.filter(t => t.id !== id)) }
  const tasks = list.tasks.map((t): Task => {
    if (t.id !== id) return t
    const named = subject ? { ...t, name: cleanName(subject) } : t
    if (status === 'completed') return { ...named, status: 'done', percent: 100, hasReported: true }
    if (status === 'in_progress') return { ...named, status: 'active' }
    if (status === 'pending') return { ...named, status: 'upcoming' }
    return named
  })
  const active = tasks.find(t => t.id === id && t.status === 'active')

  return {
    ...list,
    tasks: settle(active ? tasks.map(t => (t.status === 'active' && t !== active ? { ...t, status: 'upcoming' } : t)) : tasks),
  }
}

// ---------- calm words for what went wrong ----------

export function apiErrorReason(kind: string, details = ''): string {
  if (/too long|context|max_output/i.test(details) || kind === 'max_output_tokens') return 'type /compact and try again'
  if (kind === 'rate_limit' || kind === 'billing_error') return 'you hit your usage limit, try again a little later'
  if (kind === 'overloaded' || kind === 'server_error') return "Claude's servers are busy, try again in a minute"
  if (/auth|oauth|credential|verification|account/.test(kind)) return 'type /login'
  if (/network|connect|ECONN|ENOTFOUND|fetch failed|socket|timed? ?out/i.test(details) || kind === 'unknown') {
    return 'the internet connection dropped'
  }

  return 'something went wrong, try again'
}

// ---------- drawing ----------

const duration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function meter(t: Task, frame: number): string {
  if (t.status === 'done') return '█'.repeat(METER)
  if (t.status === 'upcoming') return '░'.repeat(METER)
  if (t.hasReported) {
    const filled = Math.round(t.percent / 10)
    return '█'.repeat(filled) + '░'.repeat(METER - filled)
  }
  const at = frame % (METER + 2)
  return Array.from({ length: METER }, (_, i) => (i >= at - 2 && i <= at ? '█' : '░')).join('')
}

const fit = (text: string, width: number) =>
  text.length <= width ? text.padEnd(width) : `${text.slice(0, Math.max(0, width - 1))}…`

// ---------- the mod ----------

let clock: Timer | undefined
let failures = 0
let lastApiError: { kind: string; details: string } | undefined

const isOn = ($: $) => read($, enabled)
const setList = ($: $, fn: (list: Checklist) => Checklist) =>
  update($, checklist, list => (list === null ? list : fn(list)))

/** The 250ms clock runs only while a job is working or waiting on the person. */
async function syncClock($: $) {
  const list = await read($, checklist)
  const isLive = list !== null && (list.phase === 'working' || list.phase === 'needs-you')
  if (isLive && clock === undefined) clock = $.clock.every(250, () => void update($, tick, n => n + 1))
  if (!isLive && clock !== undefined) {
    clock.cancel()
    clock = undefined
  }
}

async function change($: $, fn: (list: Checklist) => Checklist) {
  await setList($, fn)
  await syncClock($)
}

const working = (list: Checklist): Checklist => ({ ...list, phase: 'working', needsYouReason: null, stuckReason: null })
const needsYou = (reason: string) => (list: Checklist): Checklist => ({ ...list, phase: 'needs-you', needsYouReason: reason })
const stuck = (reason: string) => (list: Checklist): Checklist => ({ ...list, phase: 'stuck', stuckReason: reason })

async function finish($: $, fn: (list: Checklist) => Checklist) {
  const now = await $.clock.now()
  await change($, list => ({ ...fn(list), finishedAt: now }))
}

async function setEnabled($: $, value: boolean) {
  await update($, enabled, () => value)
  await $.store.set('cleanViewEnabled', value)
  $.ui.toast(value ? 'Clean View is on: tool details are hidden' : 'Clean View is off: showing every detail')
}

async function nameJob($: $, prompt: string, startedAt: number) {
  const reply = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 30,
    system: 'You name tasks for people who are not technical. Answer with the name alone.',
    prompt: `Name this request in 2 to 6 plain words, starting with a verb, no punctuation:\n\n${prompt.slice(0, 2000)}`,
  })
  if (!reply.isAnswered) return
  const title = cleanName(reply.text.replace(/["'.]/g, ''))
  await setList($, list => (list.startedAt === startedAt ? { ...list, title } : list))
}

export function registerCleanView(on: On) {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('cleanViewEnabled')
    await update($, enabled, () => saved !== false)
    await $.tool.register({
      name: 'plan_steps',
      isDeferred: false,
      description:
        'Lay out every step of the job up front, 2 to 8 short plain-English names in order, before any other tool. The first step starts right away.',
      inputSchema: {
        type: 'object',
        properties: { steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 } },
        required: ['steps'],
      },
    })
    await $.tool.register({
      name: 'report_progress',
      isDeferred: false,
      description:
        'Report progress on the current step by its plan name, 0 to 100. Send 100 the moment a step finishes; the next one starts on its own.',
      inputSchema: {
        type: 'object',
        properties: { task: { type: 'string' }, percent: { type: 'number', minimum: 0, maximum: 100 } },
        required: ['task', 'percent'],
      },
    })
    await $.command.register({ name: 'simple', description: 'Turn Clean View on or off', argumentHint: 'on|off' })
    await syncClock($)

    return next(e)
  })

  on('command.run', { command: 'simple' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const value = arg === 'on' ? true : arg === 'off' ? false : !(await isOn($))
    await setEnabled($, value)

    return { text: `Clean View is ${value ? 'on' : 'off'}.` }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await isOn($))) return composed

    return { sections: [...composed.sections, { id: `${PLUGIN}:guide`, text: GUIDE, scope: 'session' }] }
  })

  on('turn.start', async ($, e, next) => {
    const text = e.text.trim()
    if (text === '' || text.startsWith('/')) return next(e)
    const list = await read($, checklist)
    if (list?.phase === 'working') return next(e)
    if (list?.phase === 'needs-you') {
      await change($, working)
      return next(e)
    }
    const now = await $.clock.now()
    failures = 0
    await update($, checklist, () => startJob(text, now))
    await syncClock($)
    $.clock.after(0, () => void nameJob($, text, now))

    return next(e)
  })

  on('tool.call', { tool: PLAN_TOOL }, async ($, e) => {
    const steps = (Array.isArray(e.steps) ? e.steps : []).map(String).slice(0, 8)
    if (steps.length === 0) return { deny: 'plan_steps needs at least one step name.' }
    const now = await $.clock.now()
    await update($, checklist, list => planSteps(working(list ?? startJob(steps[0], now)), steps))
    await syncClock($)
    const text = `Planned ${steps.length} steps. The first one has started.`

    return { result: text, text }
  })

  on('tool.call', { tool: REPORT_TOOL }, async ($, e) => {
    const list = await read($, checklist)
    if (list === null || !list.hasPlan) return { deny: `Call ${PLAN_TOOL} first.` }
    const percent = Math.max(0, Math.min(100, Math.round(Number(e.percent) || 0)))
    await change($, l => reportProgress(working(l), String(e.task ?? ''), percent))
    const text = `Progress noted: ${percent}%.`

    return { result: text, text }
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined || e.tool === PLAN_TOOL || e.tool === REPORT_TOOL) return next(e)
    const isEnabled = await isOn($)
    const list = await read($, checklist)
    if (isEnabled && !ALWAYS_ALLOWED.has(e.tool) && !list?.hasPlan) {
      return { deny: `Clean View: call ${PLAN_TOOL} with the steps of this job before any other tool.` }
    }
    if (e.tool === 'AskUserQuestion') await change($, needsYou(HAS_QUESTION))
    else if (list?.phase === 'needs-you') await change($, working)

    const ran = await next(e)

    if (ran.isError) {
      if (/doesn't want to proceed|user (denied|rejected|declined)|permission .*denied/i.test(ran.text ?? '')) {
        await change($, stuck(SAID_NO))
      } else if (++failures >= 3) {
        await change($, stuck(KEEPS_FAILING))
      }
    } else if (ran.deny === undefined) {
      failures = 0
      const now = await read($, checklist)
      if (now?.phase === 'stuck' || now?.phase === 'needs-you') await change($, working)
      if (e.tool === 'TodoWrite') await change($, l => fromTodos(l, e.todos))
      if (e.tool === 'TaskCreate') {
        const id = (ran.result as { task?: { id: string } } | undefined)?.task?.id
        if (id !== undefined) await change($, l => addTask(l, id, e.subject))
      }
      if (e.tool === 'TaskUpdate') await change($, l => updateTask(l, e.taskId, e.status, e.subject))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (/permission/i.test(e.notification_type)) await change($, needsYou(NEEDS_OK))

    return next(e)
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    await change($, stuck(SAID_NO))

    return next(e)
  })

  on('classic.StopFailure', async ($, e, next) => {
    lastApiError = { kind: e.error, details: e.error_details ?? '' }
    await finish($, stuck(apiErrorReason(e.error, e.error_details)))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const list = await read($, checklist)
    if (list === null || list.phase === 'done' || list.phase === 'stopped') return next(e)

    if (e.reason === 'error') {
      const err = lastApiError ?? { kind: 'unknown', details: '' }
      await finish($, stuck(apiErrorReason(err.kind, err.details)))
    } else if (e.reason === 'refusal') {
      await finish($, stuck("Claude couldn't help with that request"))
    } else if (e.reason === 'aborted') {
      await finish($, l => (l.stuckReason === SAID_NO ? l : { ...l, phase: 'stopped' }))
    } else if (list.hasPlan && list.tasks.some(t => t.status !== 'done')) {
      await finish($, needsYou(WAITING_FOR_REPLY))
    } else {
      await finish($, l => ({
        ...l,
        phase: 'done',
        needsYouReason: null,
        stuckReason: null,
        tasks: l.tasks.map(t => ({ ...t, status: 'done', percent: 100, hasReported: true })),
      }))
      const startedAt = list.startedAt
      $.clock.after(5000, () =>
        void setList($, l => (l.startedAt === startedAt && l.phase === 'done' ? { ...l, isCollapsed: true } : l)),
      )
    }
    lastApiError = undefined

    return next(e)
  })

  // ---------- hide the technical rows ----------

  on('ui.render', { component: ['ToolUse', 'ToolResult', 'ToolGroup'] }, async ($, e, next) => {
    if (!(await isOn($))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) =>
    (await isOn($)) ? next({ ...e, props: { ...e.props, hint: '' } }) : next(e),
  )

  // ---------- the band ----------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const isEnabled = await isOn($)
    const list = isEnabled ? await read($, checklist) : null
    const frame = await read($, tick)
    const now = await $.clock.now()
    const width = e.props.bodyColumns

    const toggle = (
      <Button
        key="clean-view-toggle"
        label={isEnabled ? '● Clean View: ON' : '○ Clean View: OFF'}
        variant={isEnabled ? 'primary' : 'secondary'}
        onPress={() => setEnabled($, !isEnabled)}
      />
    )

    let header = <Text> </Text>
    if (list !== null) {
      const elapsed = duration((list.finishedAt ?? now) - list.startedAt)
      if (list.phase === 'working') header = <Text bold wrap="truncate-end">{list.title} <Text dimColor>· {elapsed}</Text></Text>
      if (list.phase === 'needs-you') {
        header = (
          <Text wrap="truncate-end">
            <Text bold inverse color="warning"> Needs you </Text> {list.needsYouReason}
          </Text>
        )
      }
      if (list.phase === 'stuck') header = <Text color="warning" wrap="truncate-end">⚠ Stuck: {list.stuckReason}</Text>
      if (list.phase === 'stopped') header = <Text wrap="truncate-end">■ Stopped · {list.title} · <Text dimColor>you pressed Esc</Text></Text>
      if (list.phase === 'done') {
        header = (
          <Text wrap="truncate-end">
            <Text color="success">✓ All done</Text> · {list.title} · <Text dimColor>took {elapsed}</Text>
          </Text>
        )
      }
    }

    const headerRow = (
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexShrink={1}>{header}</Box>
        {toggle}
      </Box>
    )
    if (list === null || (list.phase === 'done' && list.isCollapsed)) return headerRow

    const nameWidth = Math.max(8, width - 2 - 1 - METER - 2 - 7)
    const firstUpcoming = list.tasks.findIndex(t => t.status === 'upcoming')
    const rows = list.tasks.map((t, i) => {
      const name = fit(t.name, nameWidth)
      const bar = meter(t, frame)
      if (t.status === 'done') {
        return (
          <Text key={t.id}>
            <Text color="success">✓ </Text><Text dimColor>{name} </Text><Text color="success">{bar}</Text>  Done
          </Text>
        )
      }
      if (t.status === 'active') {
        const icon = list.phase === 'needs-you' ? '‖ ' : '▶ '
        return (
          <Text key={t.id}>
            <Text color="claude">{icon}</Text><Text bold>{name} </Text><Text color="claude">{bar}</Text>  {t.hasReported ? `${t.percent}%` : 'Working'}
          </Text>
        )
      }
      return (
        <Text key={t.id} dimColor>
          ○ {name} {bar}  {i === firstUpcoming ? 'Next' : 'Up next'}
        </Text>
      )
    })

    return (
      <Box flexDirection="column">
        {headerRow}
        {rows}
      </Box>
    )
  })
}
