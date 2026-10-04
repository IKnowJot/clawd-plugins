export type Activity =
  | 'order'
  | 'read'
  | 'search'
  | 'explore'
  | 'web'
  | 'plan'
  | 'think'
  | 'cook'
  | 'build'
  | 'paint'
  | 'quill'
  | 'tinker'
  | 'test'
  | 'terminal'
  | 'install'
  | 'git'
  | 'juggle'
  | 'wait'
  | 'deliver'
  | 'oops'

export type RunStatus = 'running' | 'done' | 'stopped'

export type Run = {
  title: string
  startedAt: number
  endedAt?: number
  /** Stage Clawd is in now: 0 Reading, 1 Prepping, 2 Cooking, 3 Taste test, 4 Delivered. */
  stage: number
  /** Furthest stage reached this run; the tracker never fills backwards. */
  reached: number
  activity: Activity
  note: string
  tools: number
  helpers: number
  tasksDone: number
  tasksTotal: number
  /** When the task list first appeared; the ETA is measured from here. */
  tasksSince?: number
  taskStatus: Record<string, string>
  tokens: number
  cost: number
  ctxTokens: number
  ctxMax: number
  model: string
  status: RunStatus
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-tracker': {
      run: Run | null
      now: number
      view: { isHidden: boolean }
    }
  }
}
