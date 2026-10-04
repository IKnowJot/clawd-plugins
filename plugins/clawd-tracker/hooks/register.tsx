import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, Limit, Past, Run } from '../types'

// One run per prompt: it starts on the main turn's start and is delivered on its completion.
const run = atom({ plugin: 'clawd-tracker', key: 'run' } as const, null)
const now = atom({ plugin: 'clawd-tracker', key: 'now' } as const, 0)
const view = atom({ plugin: 'clawd-tracker', key: 'view' } as const, { isHidden: false })
const history = atom({ plugin: 'clawd-tracker', key: 'history' } as const, [] as Past[])
const limits = atom({ plugin: 'clawd-tracker', key: 'limits' } as const, [] as Limit[])

// The manifest's userConfig, set by register; a change reloads the module.
type Options = { showCost: boolean; showPlanUsage: boolean }
let opts: Options = { showCost: true, showPlanUsage: true }

const STAGES = ['Reading', 'Prepping', 'Cooking', 'Taste test', 'Delivered'] as const
const DELIVERED = 4

const CLAY = '#D97757'
const CLAY_DARK = '#B45F43'
const INK = '#1F1E1D'
const DONE = '#3B9C5F'
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

// ---------------------------------------------------------------------------
// What Clawd is doing: each tool call maps to an activity (a costume), a stage
// on the tracker (null keeps the current one) and a short line of text.

type Step = { activity: Activity; stage: number | null; note: string }

const STAGE_OF: Record<Activity, number | null> = {
  order: 0,
  read: 0,
  search: 0,
  explore: 0,
  web: 0,
  plan: 1,
  think: null,
  cook: 2,
  build: 2,
  paint: 2,
  quill: 2,
  tinker: 2,
  install: 2,
  juggle: 2,
  test: 3,
  terminal: null,
  git: null,
  wait: null,
  deliver: DELIVERED,
  oops: null,
}

// Several verbs per activity so the line under the bar never feels canned.
const VERBS: Record<Activity, string[]> = {
  order: ['Order received', 'Taking your order', 'Reading the ticket'],
  read: ['Reading', 'Studying', 'Skimming', 'Poring over'],
  search: ['Searching for', 'Hunting for', 'Sniffing out', 'Tracking down'],
  explore: ['Scouting', 'Exploring', 'Mapping out', 'Charting'],
  web: ['Surfing to', 'Catching a wave to', 'Browsing'],
  plan: ['Planning', 'Jotting down the plan', 'Sketching the steps'],
  think: ['Thinking', 'Pondering', 'Connecting the dots', 'Mulling it over', 'Brewing ideas'],
  cook: ['Cooking up', 'Seasoning', 'Simmering', 'Stirring'],
  build: ['Building', 'Hammering out', 'Framing up', 'Constructing'],
  paint: ['Painting', 'Styling', 'Touching up'],
  quill: ['Writing', 'Penning', 'Drafting'],
  tinker: ['Tinkering with', 'Tuning', 'Tightening'],
  test: ['Taste-testing', 'Running', 'Quality-checking'],
  terminal: ['Running', 'Typing', 'Executing'],
  install: ['Unpacking', 'Installing', 'Hauling in'],
  git: ['Shipping', 'Stamping', 'Sending out'],
  juggle: ['Juggling helpers on', 'Delegating', 'Rallying the crew for'],
  wait: ['Waiting on you', 'Needs your call', 'Holding for your answer'],
  deliver: ['Delivered', 'Order up', 'Served hot'],
  oops: ['Stopped', 'Dropped the pizza', 'Interrupted'],
}

const hash = (s: string): number => {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

const pick = (activity: Activity, seed: string): string => {
  const list = VERBS[activity]
  return list[hash(seed) % list.length] ?? list[0] ?? ''
}

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)
const extOf = (p: string): string => (/\.([a-z0-9]+)$/i.exec(p)?.[1] ?? '').toLowerCase()
const baseOf = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const PAINT = new Set(['css', 'scss', 'sass', 'less', 'styl', 'svg'])
const QUILL = new Set(['md', 'mdx', 'txt', 'rst', 'adoc'])
const TINKER = new Set(['json', 'yml', 'yaml', 'toml', 'ini', 'env', 'lock', 'xml', 'plist', 'conf', 'cfg'])

const fileActivity = (path: string, fallback: Activity): Activity => {
  const ext = extOf(path)
  if (PAINT.has(ext)) return 'paint'
  if (QUILL.has(ext)) return 'quill'
  if (TINKER.has(ext) || /(^|\/)\.[a-z]+rc$/i.test(path)) return 'tinker'
  return fallback
}

const TEST_CMD = /\b(test|tests|jest|vitest|pytest|mocha|playwright|cypress|tsc|typecheck|lint|eslint|ruff|mypy|clippy|check|build|xcodebuild|cargo (test|build|check)|go (test|build|vet))\b/
const INSTALL_CMD = /\b(npm (i|install|ci|add)|pnpm (i|install|add)|yarn( add| install)?$|yarn add|bun (i|install|add)|pip3? install|uv (add|sync|pip)|poetry (add|install)|brew install|cargo add|go get|gem install|pod install)\b/
const GIT_CMD = /^\s*(git|gh)\b/

const classify = (tool: string, e: Record<string, unknown>): Step => {
  const seed = str(e.tool_use_id) || tool
  const step = (activity: Activity, target = ''): Step => ({
    activity,
    stage: STAGE_OF[activity],
    note: target ? `${pick(activity, seed)} ${target}` : pick(activity, seed),
  })
  const file = str(e.file_path) || str(e.notebook_path) || str(e.path)

  switch (tool) {
    case 'Read':
    case 'NotebookRead':
      return step('read', baseOf(file))
    case 'Grep':
      return step('search', `"${clip(str(e.pattern), 28)}"`)
    case 'Glob':
    case 'LS':
      return step('explore', clip(str(e.pattern) || baseOf(file) || 'the project', 30))
    case 'WebFetch':
      return step('web', clip(str(e.url).replace(/^https?:\/\//, ''), 34))
    case 'WebSearch':
      return step('web', `"${clip(str(e.query), 30)}"`)
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
    case 'EnterPlanMode':
    case 'ExitPlanMode':
      return step('plan')
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return step(fileActivity(file, 'cook'), baseOf(file))
    case 'Write':
      return step(fileActivity(file, 'build'), baseOf(file))
    case 'Agent':
    case 'Task':
      return step('juggle', clip(str(e.description), 32))
    case 'AskUserQuestion':
      return step('wait')
    case 'Skill':
      return step('read', `the ${clip(str(e.skill), 24)} skill`)
    case 'Bash':
    case 'PowerShell': {
      const cmd = str(e.command).trim()
      const shown = clip(cmd.split('\n')[0] ?? cmd, 34)
      if (GIT_CMD.test(cmd)) return step('git', shown)
      if (INSTALL_CMD.test(cmd)) return step('install', shown)
      if (TEST_CMD.test(cmd)) return step('test', shown)
      return step('terminal', shown)
    }
  }
  if (/browser|playwright|chrome/i.test(tool)) return step('web', clip(str(e.url) || tool.split('__').pop() || tool, 30))
  return step('tinker', clip(tool.replace(/^mcp__/, '').split('__').pop() || tool, 30))
}

// ---------------------------------------------------------------------------
// Usage: tokens come from the engine, the dollar figure is an estimate from
// list prices (a subscription is not billed per token).

type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  model?: string
}

// USD per million tokens: input, output, cache read, cache write.
const PRICES: [RegExp, [number, number, number, number]][] = [
  [/fable|mythos/, [10, 50, 1, 12.5]],
  [/opus-5|opus-4-[5-9]/, [5, 25, 0.5, 6.25]],
  [/opus/, [15, 75, 1.5, 18.75]],
  [/sonnet/, [3, 15, 0.3, 3.75]],
  [/haiku/, [1, 5, 0.1, 1.25]],
]

const costOf = (model: string, u: Usage): number => {
  const [i, o, r, w] = PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? [5, 25, 0.5, 6.25]
  return (
    ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o + (u.cache_read_input_tokens || 0) * r + (u.cache_creation_input_tokens || 0) * w) / 1e6
  )
}

const sumTokens = (u: Usage): number =>
  (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)

const windowOf = (model: string): number => (/\[1m\]|1m/i.test(model) || /fable|opus-5|sonnet-5/i.test(model) ? 1_000_000 : 200_000)

// ---------------------------------------------------------------------------
// Formatting.

const fmtTokens = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`)
const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`
const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const etaText = (r: Run, at: number, past: Past[]): string => {
  if (r.status === 'done') return `Delivered in ${fmtTime((r.endedAt ?? at) - r.startedAt)}`
  if (r.status === 'stopped') return `Stopped at ${fmtTime((r.endedAt ?? at) - r.startedAt)}`
  return `${sizeOf(r)} · ${estimate(r, at, past)}`
}

type Piece = { text: string; tone?: 'warn' | 'hot' }

const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: 'wk', spend_limit: 'spend' }

const statsPieces = (r: Run, at: number, lims: Limit[]): Piece[] => {
  const parts: Piece[] = []
  if (r.tasksTotal) parts.push({ text: `${r.tasksDone}/${r.tasksTotal} tasks` })
  parts.push({ text: fmtTime((r.endedAt ?? at) - r.startedAt) })
  parts.push({ text: `${fmtTokens(r.tokens)} tok` })
  if (r.ctxTokens) parts.push({ text: `ctx ${Math.min(100, Math.round((r.ctxTokens / r.ctxMax) * 100))}%` })
  if (opts.showCost) parts.push({ text: `≈${fmtCost(r.cost)}` })
  if (opts.showPlanUsage) {
    for (const l of lims) {
      const pct = Math.round(l.percentUsed)
      parts.push({ text: `${LIMIT_LABEL[l.kind] ?? l.kind} ${pct}%`, tone: pct >= 90 ? 'hot' : pct >= 75 ? 'warn' : undefined })
    }
  }
  return parts
}

const statsText = (r: Run, at: number, lims: Limit[]): string => statsPieces(r, at, lims).map(p => p.text).join(' · ')

const titleOf = (text: string): string => {
  const plain = text.replace(/<\/?[A-Za-z_][^>]*>/g, ' ')
  const line = plain.split('\n').map(l => l.trim()).find(Boolean) ?? ''
  if (!line) return 'Your order'
  const words = line.split(/\s+/)
  return clip(words.slice(0, 8).join(' ') + (words.length > 8 ? '…' : ''), 60)
}

// ---------------------------------------------------------------------------
// Run state.

const fresh = (title: string, at: number, prev: Run | null): Run => ({
  title,
  startedAt: at,
  stage: 0,
  reached: 0,
  activity: 'order',
  note: pick('order', title),
  tools: 0,
  helpers: 0,
  tasksDone: 0,
  tasksTotal: 0,
  taskStatus: {},
  tokens: 0,
  cost: 0,
  ctxTokens: prev?.ctxTokens ?? 0,
  ctxMax: prev?.ctxMax ?? 200_000,
  model: prev?.model ?? '',
  status: 'running',
  pos: 0,
  prevPos: 0,
  posAt: at,
  lastStage: 0,
})

// ---------------------------------------------------------------------------
// Progress moves only on real events. With a task list the fill is the share
// of tasks done; without one it fills through the furthest stage reached.
// Delivered fills on delivery alone. A change slides over SLIDE_MS.

const SLIDE_MS = 700

const posOf = (r: Run): number => {
  if (r.status === 'done') return 1
  if (r.tasksTotal > 0) return (r.tasksDone / r.tasksTotal) * 0.8
  return (Math.min(3, r.reached) + 1) / 5
}

// Where the fill is drawn at `at`, partway through a slide.
const posNow = (r: Run, at: number): number => {
  const t = Math.min(1, Math.max(0, (at - r.posAt) / SLIDE_MS))
  return r.prevPos + (r.pos - r.prevPos) * t
}

// Call after any change to a run: starts a slide when the fill should move.
const settle = (r: Run, at: number): Run => {
  const pos = posOf(r)
  const moved = pos === r.pos ? r : { ...r, prevPos: posNow(r, at), pos, posAt: at }
  const stage = stageOf(moved)
  return stage > moved.lastStage ? { ...moved, lastStage: stage, cheerAt: at } : moved
}

// The stage being worked on, the one that pulses.
const stageOf = (r: Run): number => {
  if (r.status === 'done') return DELIVERED
  if (r.tasksTotal > 0) return Math.min(3, Math.floor(((r.tasksDone + 0.5) / r.tasksTotal) * 4))
  return Math.min(3, r.reached)
}

// ---------------------------------------------------------------------------
// ETA. With a task list: this run's pace per task, or the learned pace before
// the first task lands. Without one: of past runs that took at least as many
// steps as this one has, how long they usually ran. Both sharpen as work goes.

const HISTORY_MAX = 60

const median = (xs: number[]): number => {
  const v = [...xs].sort((x, y) => x - y)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

const sizeOf = (r: Run): string => {
  if (r.tasksTotal > 0) return r.tasksTotal <= 2 ? 'Small job' : r.tasksTotal <= 5 ? 'Medium job' : 'Large job'
  if (r.tools < 6) return 'Small job'
  return r.tools < 25 ? 'Medium job' : 'Large job'
}

const fmtLeft = (ms: number): string => (ms < 60_000 ? 'under a minute left' : `about ${Math.round(ms / 60_000)} min left`)

const estimate = (r: Run, at: number, past: Past[]): string => {
  const elapsed = at - r.startedAt
  if (r.tasksTotal > 0) {
    if (r.tasksDone >= r.tasksTotal) return 'wrapping up'
    if (r.tasksDone > 0 && r.tasksSince !== undefined) {
      return fmtLeft(((at - r.tasksSince) / r.tasksDone) * (r.tasksTotal - r.tasksDone))
    }
    const paces = past.filter(p => p.tasks > 0).map(p => p.ms / p.tasks)
    if (paces.length >= 3) return `~${Math.max(1, Math.round((median(paces) * r.tasksTotal) / 60_000))} min job`
    return 'sizing up…'
  }
  const peers = past.filter(p => p.tasks === 0 && p.tools >= Math.max(1, r.tools)).map(p => p.ms)
  if (peers.length < 3) return 'sizing up…'
  const left = median(peers) - elapsed
  return left > 0 ? `usually ${fmtLeft(left)}` : 'running longer than usual'
}

const live = (r: Run | null): r is Run => r !== null && r.status === 'running'

const apply = (r: Run | null, s: Step): Run | null => {
  if (!live(r)) return r
  const stage = s.stage ?? r.stage
  return { ...r, activity: s.activity, note: s.note, stage, reached: Math.max(r.reached, stage), tools: r.tools + 1 }
}

// Task lists: TodoWrite sends the whole list; TaskCreate/TaskUpdate send one change each.
const trackTasks = (r: Run | null, tool: string, e: Record<string, unknown>, at: number): Run | null => {
  if (!live(r)) return r
  let { tasksDone, tasksTotal, note } = r
  const taskStatus = { ...r.taskStatus }

  if (tool === 'TodoWrite' && Array.isArray(e.todos)) {
    const todos = e.todos as { status?: string; activeForm?: string; content?: string }[]
    tasksTotal = todos.length
    tasksDone = todos.filter(t => t.status === 'completed').length
    const active = todos.find(t => t.status === 'in_progress')
    if (active) note = clip(active.activeForm || active.content || note, 60)
  } else if (tool === 'TaskCreate') {
    tasksTotal += 1
  } else if (tool === 'TaskUpdate') {
    const id = str(e.taskId) || str(e.id)
    const status = str(e.status)
    const was = taskStatus[id]
    if (status === 'completed' && was !== 'completed') tasksDone += 1
    if (status === 'deleted' && was !== 'deleted') {
      tasksTotal = Math.max(0, tasksTotal - 1)
      if (was === 'completed') tasksDone = Math.max(0, tasksDone - 1)
    }
    if (status === 'in_progress' && str(e.activeForm)) note = clip(str(e.activeForm), 60)
    if (id && status) taskStatus[id] = status
  } else {
    return r
  }
  return {
    ...r,
    tasksDone: Math.min(tasksDone, tasksTotal),
    tasksTotal,
    taskStatus,
    note,
    tasksSince: tasksTotal ? (r.tasksSince ?? at) : undefined,
  }
}

// ---------------------------------------------------------------------------
// Clawd: the Claude Code crab on a 30×28 pixel grid, one costume per activity.
// Body and crab drawing adapted from johnnyvizz/claude-kit (MIT).

type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

type Pose = { front?: number; back?: number; frontCls?: string; backCls?: string }

const body = (f: Fill, p: Pose = {}): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14 + (p.back ?? 0), 4, 4, CLAY, p.backCls)
  f(23, 14 + (p.front ?? 0), 4, 4, CLAY, p.frontCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

const glasses = (f: Fill, c = INK): void => {
  for (const x of [8, 18]) {
    f(x, 11, 4, 1, c)
    f(x, 14, 4, 1, c)
    f(x, 11, 1, 4, c)
    f(x + 3, 11, 1, 4, c)
  }
  f(12, 12, 6, 1, c)
}

const CHEF_HAT = ['........lll.......', '.......lllll......', '.wwwwgwwwwwwgwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwgwwwwwggwwwww', '.wwwwgwwwwwggwwwww', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.']
const HARD_HAT = ['.....yyyyyyyy.....', '...yyyyyhhyyyyy...', '..yyyyyyhhyyyyyy..', '..yyyyyyhhyyyyyy..', '.yyyyyyyhhyyyyyyy.', 'dddddddddddddddddd']

const COSTUMES: Record<Activity, (f: Fill) => void> = {
  // Holds up the order ticket.
  order: f => {
    body(f, { front: -4, frontCls: 'it' })
    f(23, 2, 6, 8, '#F4F3EE', 'it')
    f(24, 4, 4, 1, '#9A9A96', 'it')
    f(24, 6, 3, 1, '#9A9A96', 'it')
    f(24, 8, 4, 1, CLAY, 'it')
  },
  // Reading glasses and a book whose page keeps turning.
  read: f => {
    body(f)
    glasses(f)
    f(8, 17, 15, 5, '#7A4A26')
    f(9, 17, 6, 4, '#F4F3EE')
    f(16, 17, 6, 4, '#F4F3EE')
    f(15, 17, 1, 5, '#5A3519')
    f(10, 18, 4, 1, '#C9C7BE')
    f(10, 20, 3, 1, '#C9C7BE')
    f(17, 18, 4, 1, '#C9C7BE')
    f(17, 20, 3, 1, '#C9C7BE')
    f(16, 17, 6, 4, '#FFFFFF', 'pg')
  },
  // Detective magnifier sweeping for matches.
  search: f => {
    body(f, { front: -4, frontCls: 'it' })
    stamp(f, 23, 1, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(24, 2, 3, 3, 'rgba(169,214,245,.7)', 'it')
    f(25, 6, 1, 4, '#7A4A26', 'it')
    f(24, 2, 1, 1, '#FFFFFF', 'gl')
  },
  // Bandana and spyglass, scouting the project.
  explore: f => {
    body(f, { front: -4, frontCls: 'it' })
    f(7, 8, 16, 2, '#D0453F')
    f(10, 8, 1, 1, '#F4F3EE')
    f(16, 9, 1, 1, '#F4F3EE')
    f(3, 9, 4, 1, '#D0453F')
    f(4, 10, 2, 2, '#D0453F')
    stamp(f, 23, 2, ['....gg', '...gbg', '..bb..', '.bb...', 'bb....'], { b: '#7A4A26', g: '#E0B04A' }, 'it')
  },
  // Rides a surfboard over the wave: fetching from the web.
  web: f => {
    body(f)
    f(15, 4, 1, 6, '#4FA3E0')
    f(2, 25, 26, 2, '#F5C542')
    f(13, 25, 4, 2, '#D0453F')
    f(0, 27, 30, 1, '#4FA3E0', 'wv')
    f(4, 26, 2, 1, '#BEE3F8', 'wv')
    f(19, 26, 2, 1, '#BEE3F8', 'wv')
  },
  // Clipboard and pencil: writing the plan.
  plan: f => {
    body(f, { front: -3, frontCls: 'it' })
    f(0, 9, 7, 10, '#B08D57')
    f(1, 11, 5, 7, '#F4F3EE')
    f(2, 9, 3, 2, '#8E929A')
    f(2, 12, 3, 1, '#9A9A96')
    f(2, 14, 3, 1, '#9A9A96')
    f(2, 16, 1, 1, DONE)
    f(4, 16, 1, 1, '#9A9A96')
    f(25, 4, 1, 6, '#F5C542', 'it')
    f(25, 10, 1, 1, '#F4C7A1', 'it')
    f(25, 3, 1, 1, '#E58FA0', 'it')
  },
  // Thought bubble with dots, between moves.
  think: f => {
    body(f, { front: -2 })
    f(21, 0, 8, 1, '#E4E2DA')
    f(20, 1, 10, 3, '#E4E2DA')
    f(21, 4, 8, 1, '#E4E2DA')
    f(19, 6, 2, 2, '#E4E2DA')
    f(17, 8, 1, 1, '#E4E2DA')
    f(22, 2, 1, 1, INK, 'd1')
    f(24, 2, 1, 1, INK, 'd2')
    f(26, 2, 1, 1, INK, 'd3')
  },
  // Chef's toque; flips an omelette: editing code.
  cook: f => {
    body(f, { front: -4, frontCls: 'pan' })
    stamp(f, 6, 1, CHEF_HAT, { w: '#F4F3EE', l: '#F7F6F2', g: '#D2D1C8', b: '#E4E2DA', d: '#C9C7BE' })
    f(22, 8, 7, 2, '#4A4A48', 'pan')
    f(28, 10, 1, 1, '#4A4A48', 'pan')
    f(24, 7, 3, 1, '#F5B731', 'egg')
    f(23, 7, 1, 1, '#FFFFFF', 'egg')
  },
  // Hard hat and hammer: writing a new file.
  build: f => {
    body(f, { front: -4, frontCls: 'it' })
    stamp(f, 6, 4, HARD_HAT, { y: '#F5C542', h: '#FBE08A', d: '#C99A1E' })
    stamp(f, 23, 2, ['sssss', 'sssss', '..w..', '..w..', '..w..', '..w..', '..w..', '..w..'], { s: '#8E929A', w: '#7A4A26' }, 'it')
  },
  // Beret, palette and a brush that changes color: styles.
  paint: f => {
    body(f, { front: -4, frontCls: 'it' })
    f(14, 5, 1, 2, '#2B2B4A')
    f(9, 6, 12, 2, '#3A3A6A')
    f(7, 8, 15, 2, '#3A3A6A')
    f(0, 15, 7, 5, '#E8D5B0')
    f(1, 16, 1, 1, '#D0453F')
    f(3, 16, 1, 1, '#4FA3E0')
    f(5, 17, 1, 1, '#F5C542')
    f(2, 18, 1, 1, DONE)
    f(26, 3, 1, 7, '#7A4A26', 'it')
    f(26, 2, 1, 1, '#C9CCD2', 'it')
    f(26, 0, 1, 2, '#7F77DD', 'tip')
  },
  // Quill and ink pot: docs and text.
  quill: f => {
    body(f, { front: -4, frontCls: 'it' })
    f(0, 18, 5, 4, '#2B2B4A')
    f(1, 17, 3, 1, '#55514C')
    stamp(f, 23, 0, ['....ww', '...www', '..www.', '..ww..', '.ww...', '.w....', 'w.....', 'k.....'], { w: '#F4F3EE', k: INK }, 'it')
    f(8, 19, 14, 3, '#F4F3EE')
    f(9, 20, 8, 1, '#9A9A96')
  },
  // Goggles up, wrench turning, a gear spinning: config and other tools.
  tinker: f => {
    body(f)
    f(7, 8, 16, 2, '#55514C')
    f(9, 8, 3, 2, '#9FD3F0')
    f(18, 8, 3, 2, '#9FD3F0')
    stamp(f, 0, 10, ['.s.s', 'sss.', '.s..', '.s..'], { s: '#8E929A' }, 'it')
    stamp(f, 24, 2, ['.g.g.', 'ggggg', 'gg.gg', 'ggggg', '.g.g.'], { g: '#C9CCD2' }, 'gr')
  },
  // Lab goggles and a bubbling flask: tests, builds, linters.
  test: f => {
    body(f, { front: -4, frontCls: 'it' })
    f(8, 11, 4, 4, 'rgba(120,190,235,.45)')
    f(18, 11, 4, 4, 'rgba(120,190,235,.45)')
    f(12, 12, 6, 1, '#55514C')
    f(7, 12, 1, 1, '#55514C')
    f(22, 12, 1, 1, '#55514C')
    stamp(f, 23, 3, ['..gg..', '..gg..', '..gg..', '.gggg.', 'gllllg', 'gllllg', '.gggg.'], { g: '#CDE7F5', l: '#5FCB8A' }, 'it')
    f(25, 1, 1, 1, '#5FCB8A', 'b1')
    f(24, 0, 1, 1, '#5FCB8A', 'b2')
  },
  // Typing away at a tiny laptop: shell commands.
  terminal: f => {
    body(f, { frontCls: 'tb', backCls: 'ta' })
    f(9, 15, 12, 7, '#2B2B2E')
    f(9, 15, 12, 1, '#55514C')
    f(10, 17, 6, 1, '#5FCB8A')
    f(10, 19, 4, 1, '#5FCB8A')
    f(15, 19, 1, 1, '#5FCB8A', 'cur')
    f(6, 22, 18, 1, '#8E929A')
  },
  // Carries a parcel on its head: installing packages.
  install: f => {
    body(f, { front: -6, back: -6 })
    f(8, 1, 14, 9, '#C8935A', 'bx')
    f(14, 1, 2, 9, '#E8C48A', 'bx')
    f(8, 9, 14, 1, '#A87442', 'bx')
    f(10, 4, 3, 2, '#F4F3EE', 'bx')
  },
  // Mail carrier's cap and a stamped envelope: git and GitHub.
  git: f => {
    body(f, { front: -5, frontCls: 'it' })
    f(8, 6, 14, 3, '#2F4E8C')
    f(17, 9, 7, 1, '#1E3360')
    f(14, 7, 2, 1, '#F5C542')
    f(23, 3, 7, 5, '#F4F3EE', 'it')
    stamp(f, 23, 3, ['k.....k', '.k...k.', '..k.k..', '...k...'], { k: '#C9C7BE' }, 'it')
    f(28, 4, 1, 1, '#D0453F', 'it')
  },
  // Juggles three balls: subagents at work.
  juggle: f => {
    body(f, { front: -3, back: -3, frontCls: 'tb', backCls: 'ta' })
    f(8, 5, 2, 2, '#7F77DD', 'j1')
    f(14, 3, 2, 2, '#1D9E75', 'j2')
    f(20, 5, 2, 2, '#F5C542', 'j3')
  },
  // Holds up a "?" sign: Claude needs your answer.
  wait: f => {
    body(f, { front: -6, back: -6 })
    f(7, 0, 16, 9, '#F4F3EE', 'sg')
    f(7, 8, 16, 1, '#C9C7BE', 'sg')
    stamp(f, 13, 1, ['.ccc.', 'c...c', '...c.', '..c..', '.....', '..c..'], { c: CLAY_DARK }, 'sg')
  },
  // Party hat, confetti and the pizza box: delivered.
  deliver: f => {
    body(f)
    stamp(f, 13, 3, ['..r..', '..p..', '.pyp.', '.ypy.', 'pypyp', 'ypypy'], { p: '#7F77DD', y: '#F5C542', r: '#D0453F' })
    f(5, 17, 20, 4, '#C8935A')
    f(5, 17, 20, 1, '#E8C48A')
    f(13, 18, 4, 2, '#D0453F')
    f(14, 18, 2, 1, '#F4F3EE')
    f(2, 0, 1, 1, '#7F77DD', 'c1')
    f(27, 2, 1, 1, '#1D9E75', 'c2')
    f(5, 5, 1, 1, '#F5C542', 'c3')
    f(24, 0, 1, 1, '#D0453F', 'c4')
  },
  // Sweat drop and a dropped pizza: interrupted.
  oops: f => {
    body(f)
    f(23, 8, 2, 3, '#7EC3F0', 'dr')
    f(0, 24, 6, 2, '#F5B731')
    f(1, 24, 1, 1, '#D0453F')
    f(4, 25, 1, 1, '#D0453F')
  },
}

// Pure CSS, run by the compositor. Periods divide one second, so the
// once-a-second redraw while working restarts them in phase.
const CRAB_CSS = `<style>
.run,.run g{transform-box:fill-box}
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
@keyframes blink{50%{opacity:.15}}
.a-order.run .it{animation:bob .5s steps(1) infinite}
.a-read.run .la,.a-read.run .lb,.a-read.run .bd{animation:none}
.a-read.run .pg{transform-origin:0 50%;animation:page 1s ease-in-out infinite}
@keyframes page{0%,30%{transform:scaleX(1)}60%,100%{transform:scaleX(-1)}}
.a-search.run .it{animation:scan 1s steps(1) infinite}.a-search.run .gl{animation:blink 1s steps(1) infinite -.5s}
@keyframes scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}
.a-explore.run .it{transform-origin:0 100%;animation:sweep 1s ease-in-out infinite}
@keyframes sweep{50%{transform:rotate(-14deg)}}
.a-web.run{transform-origin:50% 100%;animation:sway 1s ease-in-out infinite}
.a-web.run .la,.a-web.run .lb,.a-web.run .bd{animation:none}
.a-web.run .wv{animation:wave 1s steps(2) infinite}
@keyframes sway{25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}@keyframes wave{50%{transform:translateX(-2px)}}
.a-plan.run .it{animation:scribble .5s steps(1) infinite}
@keyframes scribble{25%{transform:translate(-1px,1px)}50%{transform:translate(1px,0)}75%{transform:translate(0,1px)}}
.a-think.run .la,.a-think.run .lb{animation:none}
.a-think.run .d1{animation:blink 1s steps(1) infinite}.a-think.run .d2{animation:blink 1s steps(1) infinite -.66s}.a-think.run .d3{animation:blink 1s steps(1) infinite -.33s}
.a-cook.run .pan{transform-origin:0 50%;animation:tilt 1s ease-in-out infinite}
.a-cook.run .egg{animation:flip 1s ease-in-out infinite}
@keyframes tilt{20%,40%{transform:rotate(-12deg)}}@keyframes flip{30%{transform:translateY(-5px) scaleY(-1)}60%{transform:translateY(0)}}
.a-build.run .it{transform-origin:50% 100%;animation:hammer .5s ease-in infinite}
@keyframes hammer{50%{transform:rotate(-35deg)}}
.a-paint.run .it,.a-paint.run .tip{transform-origin:50% 100%;animation:brush .5s ease-in-out infinite}
.a-paint.run .tip rect{animation:hue 1s steps(1) infinite}
@keyframes brush{50%{transform:rotate(18deg)}}@keyframes hue{0%{fill:#7F77DD}33%{fill:#D0453F}66%{fill:#1D9E75}}
.a-quill.run .it{transform-origin:0 100%;animation:write .5s ease-in-out infinite}
@keyframes write{50%{transform:rotate(10deg) translateX(1px)}}
.a-tinker.run .it{transform-origin:100% 100%;animation:twist .5s ease-in-out infinite}
.a-tinker.run .gr{transform-origin:50% 50%;animation:spin 1s linear infinite}
@keyframes twist{50%{transform:rotate(-35deg)}}@keyframes spin{to{transform:rotate(90deg)}}
.a-test.run .it{transform-origin:50% 100%;animation:swirl .5s ease-in-out infinite}
.a-test.run .b1{animation:rise 1s linear infinite}.a-test.run .b2{animation:rise 1s linear infinite -.5s}
@keyframes swirl{25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}@keyframes rise{0%{transform:translateY(2px);opacity:1}100%{transform:translateY(-3px);opacity:0}}
.a-terminal.run .la,.a-terminal.run .lb,.a-terminal.run .bd{animation:none}
.a-terminal.run .ta{animation:st .25s steps(1) infinite}.a-terminal.run .tb{animation:st .25s steps(1) infinite -.125s}
.a-terminal.run .cur{animation:blink .5s steps(1) infinite}
.a-install.run .la{animation-duration:.25s}.a-install.run .lb{animation-duration:.25s;animation-delay:-.125s}
.a-install.run .bx{animation:bob .25s steps(1) infinite}
.a-git.run .it{animation:bob .5s steps(1) infinite}
.a-juggle.run .la,.a-juggle.run .lb{animation:none}
.a-juggle.run .ta{animation:st .5s steps(1) infinite}.a-juggle.run .tb{animation:st .5s steps(1) infinite -.25s}
.a-juggle.run .j1{animation:hop 1s ease-in-out infinite}.a-juggle.run .j2{animation:hop 1s ease-in-out infinite -.33s}.a-juggle.run .j3{animation:hop 1s ease-in-out infinite -.66s}
@keyframes hop{50%{transform:translateY(-4px)}}
.a-wait.run .la,.a-wait.run .lb{animation:none}
.a-wait.run .sg{transform-origin:50% 100%;animation:sway 1s ease-in-out infinite}
.a-deliver.run .la{animation-duration:.25s}.a-deliver.run .lb{animation-duration:.25s;animation-delay:-.125s}
.a-deliver.run .c1,.a-deliver.run .c2,.a-deliver.run .c3,.a-deliver.run .c4{animation:fall 1s linear infinite}
.a-deliver.run .c2{animation-delay:-.25s}.a-deliver.run .c3{animation-delay:-.5s}.a-deliver.run .c4{animation-delay:-.75s}
@keyframes fall{0%{transform:translateY(0);opacity:1}100%{transform:translateY(8px);opacity:0}}
.a-oops.run .la,.a-oops.run .lb,.a-oops.run .bd{animation:none}
.a-oops.run .dr{animation:fall 1s linear infinite}
@media (prefers-reduced-motion: reduce){.run,.run g,.run rect{animation:none!important}}
</style>`

// Props nest inside `bd` so they ride the bob; the legs step on their own.
const crab = (x: number, y: number, activity: Activity, isMoving: boolean, scale: number): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  ;(COSTUMES[activity] ?? body)(f)
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const inner = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  return `<g transform="translate(${x},${y}) scale(${scale})" shape-rendering="crispEdges"><g class="a-${activity}${isMoving ? ' run' : ''}">${inner}${group('la')}${group('lb')}</g></g>`
}

// ---------------------------------------------------------------------------
// The tracker row: one SVG, since the desktop wraps sibling elements.

const H = 66
const WARN = '#E0A33B'
const HOT = '#D9534F'

// A stage up: Clawd hops and sparkles for CHEER_MS. Each redraw restarts CSS,
// so the animation starts that far back in and picks up where it was.
const CHEER_MS = 1200
const CHEER_CSS = `<style>
.hop{animation:hop2 ${CHEER_MS}ms ease-out 1 both}
@keyframes hop2{0%{transform:translateY(0)}20%{transform:translateY(-8px)}40%{transform:translateY(0)}55%{transform:translateY(-3px)}70%,100%{transform:translateY(0)}}
.sp{transform-box:fill-box;transform-origin:50% 50%;opacity:0;animation:spark ${CHEER_MS}ms ease-out 1 both}
@keyframes spark{0%{opacity:0;transform:scale(.3)}25%{opacity:1;transform:scale(1.15)}100%{opacity:0;transform:translateY(-6px) scale(.6)}}
@media (prefers-reduced-motion: reduce){.hop,.sp{animation:none}}
</style>`
const SPARKS: [number, number][] = [[4, 10], [56, 6], [2, 40], [62, 34]]
const spark = ([x, y]: [number, number], delay: string): string =>
  `<g class="sp" style="${delay}"><rect x="${x + 2}" y="${y}" width="2" height="6" fill="#F2C94C"/><rect x="${x}" y="${y + 2}" width="6" height="2" fill="#F2C94C"/></g>`

const cheer = (r: Run, at: number, drawn: string): string => {
  const since = r.cheerAt === undefined ? Infinity : at - r.cheerAt
  if (since >= CHEER_MS) return drawn
  const delay = `animation-delay:-${Math.round(since)}ms`
  return `${CHEER_CSS}<g class="hop" style="${delay}">${drawn}</g>${SPARKS.map(p => spark(p, delay)).join('')}`
}

const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const charEm = (ch: string): number => (/[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-Z@%mw]/.test(ch) ? 0.72 : 0.56)
const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

const TRACK_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#e7e5e0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#30302e}}
.now{animation:pulse 1s ease-in-out infinite}@keyframes pulse{50%{opacity:.45}}
@media (prefers-reduced-motion: reduce){.now{animation:none}}
</style>`

const trackerSvg = (r: Run, W: number, at: number, past: Past[], lims: Limit[]): string => {
  const x0 = 72
  const barW = Math.max(160, W - x0 - 4)
  const gap = 5
  const segW = (barW - gap * 4) / 5
  const isDone = r.status === 'done'
  const color = r.status === 'stopped' ? '#9A9A96' : isDone ? DONE : CLAY

  const eta = etaText(r, at, past)
  const etaW = textWidth(eta, 12) + 6
  const title = fitText(r.title, 13, Math.max(60, barW - etaW - 10))
  const pieces = statsPieces(r, at, lims)
  const stats = pieces.map(p => p.text).join(' · ')
  const statsW = textWidth(stats, 11.5)
  const note = fitText(r.note, 12, Math.max(40, barW - statsW - 14))

  // Where the fill's edge sits, in px, for a progress value over all five tracks.
  const edge = (p: number): number => {
    const i = Math.min(4, Math.floor(p * 5))
    return x0 + i * (segW + gap) + Math.min(1, p * 5 - i) * segW
  }
  const from = edge(posNow(r, at))
  const to = edge(r.pos)
  const ms = Math.max(0, SLIDE_MS - (at - r.posAt))
  const sx = (px: number): string => ((px - x0) / barW).toFixed(5)
  // A slide in flight animates the clip from where the fill is drawn now to
  // where it lands, so a redraw mid-slide carries on from the same spot. The
  // resting transform is the end state, which is what reduced motion shows.
  const fillCss = `<style>.cf{transform-origin:${x0}px 0;transform:scaleX(${sx(to)})${
    ms > 0 && from !== to ? `;animation:fill ${Math.round(ms)}ms ease-out forwards` : ''
  }}@keyframes fill{from{transform:scaleX(${sx(from)})}to{transform:scaleX(${sx(to)})}}@media (prefers-reduced-motion: reduce){.cf{animation:none}}</style>`

  // The stage being worked on pulses, filled or not.
  const stage = stageOf(r)
  const pulse = (i: number): string => (r.status === 'running' && i === stage ? ' now' : '')
  const tracks = STAGES.map((_, i) => `<rect class="k${pulse(i)}" x="${x0 + i * (segW + gap)}" y="24" width="${segW}" height="7" rx="3.5"/>`).join('')
  const fills = STAGES.map((_, i) => `<rect class="${pulse(i).trim()}" x="${x0 + i * (segW + gap)}" y="24" width="${segW}" height="7" rx="3.5" fill="${color}"/>`).join('')
  const labels = STAGES.map((name, i) => {
    const x = x0 + i * (segW + gap)
    const isCurrent = i === stage
    const cls = isCurrent ? 't' : i < stage ? 's' : 'm'
    return `<text class="${cls}" x="${x}" y="44" font-family="${FONT}" font-size="10.5"${isCurrent ? ' font-weight="600"' : ''}>${xml(fitText(name, 10.5, segW))}</text>`
  }).join('')
  const segs = `<clipPath id="fc"><rect class="cf" x="${x0}" y="20" width="${barW}" height="15"/></clipPath>${tracks}<g clip-path="url(#fc)">${fills}</g>${labels}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${TRACK_CSS}${fillCss}${CRAB_CSS}
${cheer(r, at, crab(0, 5, r.activity, r.status !== 'stopped' || r.activity === 'oops', 2))}
<text class="t" x="${x0}" y="15" font-family="${FONT}" font-size="13" font-weight="600">${xml(title)}</text>
<text x="${x0 + barW}" y="15" text-anchor="end" font-family="${FONT}" font-size="12" fill="${color}" font-weight="500">${xml(eta)}</text>
${segs}
<text class="t" x="${x0}" y="61" font-family="${FONT}" font-size="12">${xml(note)}</text>
<text class="m" x="${x0 + barW}" y="61" text-anchor="end" font-family="${FONT}" font-size="11.5" font-variant-numeric="tabular-nums">${pieces
    .map((p, i) => `${i ? ' · ' : ''}${p.tone ? `<tspan fill="${p.tone === 'hot' ? HOT : WARN}" font-weight="600">${xml(p.text)}</tspan>` : xml(p.text)}`)
    .join('')}</text>
</svg>`
}

// Terminal: the same tracker in text.
const GLYPH: Record<Activity, string> = {
  order: '🧾',
  read: '📖',
  search: '🔍',
  explore: '🧭',
  web: '🏄',
  plan: '📋',
  think: '💭',
  cook: '🍳',
  build: '🔨',
  paint: '🎨',
  quill: '🪶',
  tinker: '🔧',
  test: '🧪',
  terminal: '⌨️',
  install: '📦',
  git: '📮',
  juggle: '🤹',
  wait: '✋',
  deliver: '🍕',
  oops: '💦',
}

const segText = (r: Run, width: number, at: number): string => {
  const filled = Math.round(posNow(r, at) * 5 * width)
  return STAGES.map((_, i) => '█'.repeat(Math.max(0, Math.min(width, filled - i * width))).padEnd(width, '░')).join(' ')
}

// ---------------------------------------------------------------------------

const toggle = async ($: EngineInterface): Promise<boolean> => {
  const next = await update($, view, v => ({ ...v, isHidden: !v.isHidden }))
  return !next.isHidden
}

export const register: Register = (on, options) => {
  const o = (options ?? {}) as Partial<Options>
  opts = { showCost: o.showCost !== false, showPlanUsage: o.showPlanUsage !== false }
  let pendingTitle = ''
  // Limit windows already warned about, keyed by kind and reset time.
  const warned = new Set<string>()

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'tracker',
      description: 'Show or hide the Clawd order tracker above the prompt',
    })
    const saved = await $.store.get('history')
    if (Array.isArray(saved)) await update($, history, () => saved as Past[])
    // Keeps the clock moving while a run is live; quiet otherwise.
    $.clock.every(1000, () => {
      void (async () => {
        if (!live(await read($, run))) return
        const at = await $.clock.now()
        await update($, now, () => at)
      })()
    })
    return started
  })

  on('command.run', { command: 'tracker' }, async $ => {
    const isShown = await toggle($)
    return { text: isShown ? 'Clawd tracker shown.' : 'Clawd tracker hidden.' }
  })

  on('prompt.submit', async ($, e, next) => {
    pendingTitle = titleOf(str((e as Record<string, unknown>).text))
    return next(e)
  })

  // The main loop's turn opens a new order; subagents' turns don't.
  on('turn.start', async ($, e, next) => {
    if (!(e as Record<string, unknown>).agentId) {
      const at = await $.clock.now()
      const title = pendingTitle || 'Your order'
      pendingTitle = ''
      await update($, run, prev => fresh(title, at, prev))
      await update($, now, () => at)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ev = e as unknown as Record<string, unknown>
    const tool = str(ev.tool)
    const isMain = !ev.agentId

    if (isMain) {
      const at = await $.clock.now()
      await update($, run, r => {
        const stepped = apply(r, classify(tool, ev))
        if (!live(stepped)) return stepped
        return settle(tool === 'Agent' || tool === 'Task' ? { ...stepped, helpers: stepped.helpers + 1 } : stepped, at)
      })
    } else {
      await update($, run, r => (live(r) ? { ...r, tools: r.tools + 1 } : r))
    }

    const ran = await next(e)

    if (isMain) {
      const at = await $.clock.now()
      await update($, run, r => {
        const tracked = trackTasks(r, tool, ev, at)
        if (!live(tracked)) return tracked
        // A failed step: Clawd reacts, and keeps the look while Claude regroups.
        if ((ran as { isError?: boolean } | undefined)?.isError) {
          return settle({ ...tracked, activity: 'oops', note: `Oops, ${clip(tool.replace(/^mcp__/, '').split('__').pop() || tool, 24)} hit a snag. Regrouping…` }, at)
        }
        // An answered question hands the floor back to Claude.
        return settle(tool === 'AskUserQuestion' ? { ...tracked, activity: 'think', note: pick('think', String(at)) } : tracked, at)
      })
    }
    return ran
  })

  // Every model request: tokens and cost for the run, context for the main loop.
  on('turn.step', async function* ($, e, next) {
    const ev = e as unknown as Record<string, unknown>
    // Back to the model between actions: Clawd thinks, unless it's still
    // reacting to a snag or waiting on you.
    if (!ev.agentId) {
      await update($, run, r =>
        live(r) && r.tools > 0 && r.activity !== 'oops' && r.activity !== 'wait'
          ? { ...r, activity: 'think', note: pick('think', `${r.title}${r.tools}`) }
          : r,
      )
    }
    const result = yield* next(e)
    const usage = (result as { usage?: Usage } | undefined)?.usage
    if (!usage) return result

    const model = usage.model || str(ev.model)
    await update($, run, r => {
      if (!live(r)) return r
      const base = { ...r, tokens: r.tokens + sumTokens(usage), cost: r.cost + costOf(model, usage) }
      if (ev.agentId) return base
      const isFirstThought = r.activity === 'order' && r.tools === 0
      return {
        ...base,
        model,
        ctxTokens: sumTokens(usage),
        ctxMax: windowOf(model),
        ...(isFirstThought ? { activity: 'think' as Activity, note: pick('think', r.title) } : {}),
      }
    })
    return result
  })

  // Plan usage: the 5-hour and weekly windows, from the last API response.
  on('session.measure', async ($, e, next) => {
    const ran = await next(e)
    if (!e.changed.includes('rateLimits')) return ran
    const lims = e.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed }))
    await update($, limits, () => lims)
    if (opts.showPlanUsage) {
      for (const l of e.rateLimits) {
        const key = `${l.kind}@${l.resetsAt ?? ''}`
        if (l.percentUsed < 90 || warned.has(key)) continue
        warned.add(key)
        await $.ui.toast(`Clawd: your ${LIMIT_LABEL[l.kind] ?? l.kind} limit is at ${Math.round(l.percentUsed)}%`)
      }
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const ev = e as unknown as Record<string, unknown>
    if (!ev.agentId) {
      const at = await $.clock.now()
      const reason = str(ev.reason)
      const isStopped = reason !== '' && reason !== 'answer'
      const today = new Date(at).toDateString()
      const orderNo = (await read($, history)).filter(p => p.when !== undefined && new Date(p.when).toDateString() === today).length + 1
      await update($, run, r => {
        if (!live(r)) return r
        return isStopped
          ? { ...r, status: 'stopped', endedAt: at, activity: 'oops', note: pick('oops', r.title) }
          : settle({
              ...r,
              status: 'done',
              endedAt: at,
              stage: DELIVERED,
              reached: DELIVERED,
              tasksDone: r.tasksTotal,
              activity: 'deliver',
              note: `${pick('deliver', r.title)}: ${r.tools} steps${r.helpers ? `, ${r.helpers} helper${r.helpers > 1 ? 's' : ''}` : ''}${r.tools > 0 ? ` · order #${orderNo} today` : ''}`,
            }, at)
      })
      await update($, now, () => at)
      // Delivered runs that did real work teach the ETA.
      const done = await read($, run)
      if (done?.status === 'done' && done.endedAt === at && done.tools > 0) {
        const past = await update($, history, h => [...h, { ms: at - done.startedAt, tools: done.tools, tasks: done.tasksTotal, when: at }].slice(-HISTORY_MAX))
        await $.store.set('history', past)
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, run)
    const v = await read($, view)
    if (r === null || v.isHidden || e.props.hasSurvey) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // Reading `now` redraws this every tick; the clock places the fill exactly.
    await read($, now)
    const at = Math.max(await $.clock.now(), r.startedAt)
    const past = await read($, history)
    const lims = await read($, limits)
    const hide = <Button key="clawd-hide" label="✕" plain role="dismiss" onPress={() => update($, view, x => ({ ...x, isHidden: true }))} />

    // Every surface's table names Svg, the terminal's with a stand-in that
    // draws nothing, so pick by surface: the terminal gets the text version.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const width = Math.max(260, Math.min(1400, (e.props.bodyColumns || 100) * 8 - 56))
      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Svg
            source={trackerSvg(r, width, at, past, lims)}
            alt={`${r.title}: ${STAGES[stageOf(r)]}, ${r.note}. ${etaText(r, at, past)}. ${statsText(r, at, lims)}`}
            width={width}
            height={H}
          />
          {hide}
        </Box>
      )
    }

    const cols = e.props.bodyColumns || 80
    const seg = Math.max(2, Math.min(8, Math.floor((cols - 50) / 5)))
    const color = r.status === 'done' ? 'green' : r.status === 'stopped' ? 'gray' : CLAY
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text>{GLYPH[r.activity]}</Text>
          <Text bold wrap="truncate-end">
            {r.title}
          </Text>
          <Text color={color}>{etaText(r, at, past)}</Text>
          {hide}
        </Box>
        <Text wrap="truncate-end">
          <Text color={color}>{segText(r, seg, at)}</Text>
          <Text dimColor>
            {'  '}
            {STAGES.map((s, i) => (r.status === 'running' && i === stageOf(r) ? `[${s}]` : s)).join(' › ')}
          </Text>
        </Text>
        <Text wrap="truncate-end">
          {r.note}
          <Text dimColor> · {statsText(r, at, lims)}</Text>
        </Text>
      </Box>
    )
  })
}
