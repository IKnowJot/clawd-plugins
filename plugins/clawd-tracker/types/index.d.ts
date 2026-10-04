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
  /** Where the fill lands, 0..1 across all five tracks. */
  pos: number
  /** Where the fill was drawn when it last started sliding toward `pos`. */
  prevPos: number
  /** When that slide started. */
  posAt: number
  /** The furthest stage celebrated so far. */
  lastStage: number
  /** When Clawd last celebrated a stage up. */
  cheerAt?: number
  /** Files edited or written this run, for the receipt. */
  files: string[]
  /** Lines written and replaced, counted from the edits. */
  added: number
  removed: number
  /** How the last test, build or lint command went. */
  lastTest?: 'pass' | 'fail'
  /** When Claude started waiting on you (a question or a permission prompt). */
  waitingSince?: number
  waitingFor?: string
  /** Subagents at work, by id, with what each is doing. */
  agents: Record<string, Activity>
}

/** A delivered run, kept across sessions to estimate how long work takes. */
export type Past = {
  ms: number
  tools: number
  tasks: number
  /** When it was delivered; counts today's orders. */
  when?: number
  tokens?: number
  /** The directory it ran in; the ETA prefers a project's own history. */
  project?: string
}

/** A plan usage window: `five_hour`, `seven_day`, or a gateway's `spend_limit`. */
export type Limit = {
  kind: string
  percentUsed: number
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-tracker': {
      run: Run | null
      now: number
      view: { isHidden: boolean }
      history: Past[]
      limits: Limit[]
    }
  }
}
