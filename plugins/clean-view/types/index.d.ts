export type TaskStatus = 'done' | 'active' | 'upcoming'

export type Task = {
  id: string
  name: string
  status: TaskStatus
  percent: number
  hasReported: boolean
}

export type Phase = 'working' | 'needs-you' | 'stuck' | 'stopped' | 'done'

export type Checklist = {
  title: string
  phase: Phase
  tasks: Task[]
  /** False while only the placeholder steps show. */
  hasPlan: boolean
  needsYouReason: string | null
  stuckReason: string | null
  startedAt: number
  finishedAt: number | null
  isCollapsed: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'clean-view': {
      cleanViewEnabled: boolean
      checklist: Checklist | null
      tick: number
    }
  }
}
