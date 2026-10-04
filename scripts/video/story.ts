// The demo video's story: one order, from ticket to delivery, drawn by the
// tracker's own code (prepended by build.sh). Writes one SVG per frame, plus
// the chat lines and captions the page shows at each moment.

import * as fs from 'fs'

const FPS = 30
const W = 900
const t0 = 1_000_000

// Seconds into the video → what Claude does. The band's clock runs in real time.
type Ev = { t: number; run: (r: any, at: number) => any; line?: string; caption?: string }

const todos = (done: number) =>
  ['Find every old logo', 'Swap the header logo', 'Update favicons', 'Check the build'].map((content, i) => ({
    content,
    activeForm: ['Finding every old logo', 'Swapping the header logo', 'Updating favicons', 'Checking the build'][i],
    status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending',
  }))

const tool = (name: string, e: Record<string, unknown>, ok = true) => (r: any, at: number) =>
  settle(trackTasks(tally(apply(r, classify(name, e)), name, e, !ok), name, e, at), at)

// Pace: story beats run at K of their written spacing.
const K = 0.7
const START = 2.2
const events: Ev[] = [
  { t: START, run: (_r, at) => fresh('Swap the old logo for the new one everywhere', at, null), caption: 'Your Claude Code task, tracked like a pizza order' },
  { t: START + 1.2 * K, run: r => ({ ...r, activity: 'think', note: 'Connecting the dots' }) },
  { t: START + 2.2 * K, run: tool('Read', { file_path: 'src/Header.tsx' }), line: 'Read src/Header.tsx' },
  { t: START + 3.4 * K, run: tool('Grep', { pattern: 'logo-old' }), line: 'Search "logo-old" · 7 matches' },
  { t: START + 4.6 * K, run: tool('TodoWrite', { todos: todos(0) }), line: 'Plan · 4 tasks', caption: 'The bar only moves on real progress' },
  { t: START + 6.4 * K, run: tool('TodoWrite', { todos: todos(1) }) },
  { t: START + 6.5 * K, run: tool('Edit', { file_path: 'src/Header.tsx', old_string: 'a\nb\nc', new_string: 'a\nb\nc\nd\ne' }), line: 'Edit src/Header.tsx · +5 −3' },
  { t: START + 7.8 * K, run: tool('Agent', { description: 'Find logo assets' }), line: 'Agent · 2 helpers searching', caption: 'A mini Clawd for every helper' },
  { t: START + 7.9 * K, run: r => ({ ...r, agents: { a: 'search', b: 'explore' } }) },
  { t: START + 9.2 * K, run: r => ({ ...r, agents: { a: 'read', b: 'search' } }) },
  { t: START + 10.4 * K, run: r => ({ ...r, agents: {} }) },
  { t: START + 10.5 * K, run: tool('TodoWrite', { todos: todos(2) }) },
  { t: START + 10.6 * K, run: tool('Write', { file_path: 'public/favicon.svg', content: 'x\n'.repeat(18) }), line: 'Write public/favicon.svg · +19', caption: 'Clawd acts out every step' },
  { t: START + 11.6 * K, run: tool('Edit', { file_path: 'src/Footer.tsx', old_string: 'a\nb\nc\nd\ne\nf\ng', new_string: 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np\nq\nr' }), line: 'Edit src/Footer.tsx · +18 −7' },
  { t: START + 12.6 * K, run: (r, at) => ({ ...apply(r, classify('Bash', { command: 'npm run build' })), waitingSince: at - WAIT_SHOW_MS, waitingFor: 'your OK on Bash' }), line: 'Bash npm run build · needs approval', caption: 'It tells you when it needs you' },
  { t: START + 16.4 * K, run: r => ({ ...r, waitingSince: undefined, waitingFor: undefined }), line: 'You approved · building…' },
  { t: START + 16.5 * K, run: tool('Bash', { command: 'npm run build' }) },
  { t: START + 17.6 * K, run: tool('TodoWrite', { todos: todos(3) }) },
  { t: START + 17.7 * K, run: tool('Bash', { command: 'npm test' }), line: 'Bash npm test · 46 passed' },
  {
    t: START + 19.6 * K,
    run: (r, at) =>
      settle({ ...r, status: 'done', endedAt: at, stage: DELIVERED, reached: DELIVERED, tasksDone: r.tasksTotal, activity: 'deliver', waitingSince: undefined, agents: {}, note: `Delivered: ${receipt(r)} · order #3 today` }, at),
    line: 'Done · logo swapped in 3 files',
    caption: 'A receipt (and a ding) when it lands',
  },
]
const DELIVER = START + 19.6 * K
const END = DELIVER + 2.8
const TOTAL = END + 3.4

// Token and context figures grow with the work, for the stats line.
const usageAt = (vt: number) => {
  const k = Math.max(0, Math.min(1, (vt - START) / (DELIVER - START)))
  return { tokens: Math.round(12_000 + k * 398_000), ctxTokens: Math.round(36_000 + k * 38_000), cost: 0.02 + k * 0.84 }
}

const past = [
  { ms: 30_000, tools: 9, tasks: 4 },
  { ms: 26_000, tools: 8, tasks: 4 },
  { ms: 34_000, tools: 11, tasks: 5 },
]
const lims = [
  { kind: 'five_hour', percentUsed: 42 },
  { kind: 'seven_day', percentUsed: 18 },
]

const frames: { svg: string | null; lines: string[]; caption: string; t: number }[] = []
let r: any = null
let next = 0
const lines: string[] = []
let caption = ''
let dingAt = 0
for (let i = 0; i < Math.round(TOTAL * FPS); i++) {
  const vt = i / FPS
  const at = t0 + Math.round(vt * 1000)
  while (next < events.length && events[next].t <= vt) {
    const ev = events[next++]
    const evAt = t0 + Math.round(ev.t * 1000)
    r = ev.run(r, evAt)
    if (ev.line) lines.push(ev.line)
    if (ev.caption) caption = ev.caption
    if (r?.status === 'done') dingAt = ev.t
  }
  let svg: string | null = null
  if (r && vt < END) {
    const u = usageAt(vt)
    const shown = r.status === 'done' ? r : { ...r, ...u, ctxMax: 1_000_000 }
    svg = trackerSvg(shown.status === 'done' ? { ...shown, ...usageAt(dingAt), ctxMax: 1_000_000 } : shown, W, at, past, lims)
  }
  frames.push({ svg, lines: [...lines], caption: vt >= END ? '' : caption, t: vt })
}

// Big Clawds for the title and end cards.
const bigCrab = (activity: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -6 42 40">${CRAB_CSS}${crab(0, 0, activity, true, 1)}</svg>`

fs.writeFileSync(
  process.argv[2],
  JSON.stringify({ fps: FPS, start: START, end: END, total: TOTAL, dingAt, titleCrab: bigCrab('cook'), endCrab: bigCrab('deliver'), frames }),
)
console.log(`frames ${frames.length}, ding at ${dingAt.toFixed(2)}s`)
