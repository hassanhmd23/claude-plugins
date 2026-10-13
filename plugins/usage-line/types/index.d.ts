export type Limit = { label: string; percent: number; reset?: string }

export type Snapshot = {
  model: string
  effort?: string
  project: string
  branch?: string
  cost?: number
  minutes: number
  context?: { percent: number; tokens: number; window: number }
  limits: Limit[]
  badge?: string
}

declare module 'claude-code' {
  interface PluginState {
    'usage-line': { snapshot: Snapshot | null }
  }
}
