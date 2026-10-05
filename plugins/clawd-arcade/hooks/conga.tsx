import type { ClientKeyEvent, ClientModule } from 'claude-code'

import type { GameProps } from '../types'

// Clawd Conga: Clawd leads a conga line of mini Clawds around the board,
// gobbling pizza. Each slice adds a dancer and speeds the beat up a little.
// Hit a wall or the line and the conga trips.

type Cell = [number, number]
type Phase = 'ready' | 'playing' | 'paused' | 'over'
type Game = {
  cols: number
  rows: number
  line: Cell[]
  dir: Cell
  queued: Cell[]
  pizza: Cell
  score: number
  phase: Phase
  pausedFor: string
  tick: number
  every: number
  props: GameProps
  doneSeen?: number
  bannerTicks: number
  isNewBest: boolean
}
type State = { game: Game; frame: number }

const TICK_MS = 30
const START_EVERY = 5 // ticks per step: 150ms
const FASTEST = 2 // 60ms
const BANNER_TICKS = Math.round(6000 / TICK_MS)

const CLAY = '#D97757'
const CLAY_DARK = '#B45F43'
const INK = '#1F1E1D'
const BOARD = '#262624'
const BOARD_ALT = '#2B2B29'

const DIRS: Record<string, Cell> = {
  up: [0, -1], w: [0, -1], k: [0, -1],
  down: [0, 1], s: [0, 1], j: [0, 1],
  left: [-1, 0], a: [-1, 0],
  right: [1, 0], d: [1, 0], l: [1, 0],
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const same = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1]

const placePizza = (g: Game): Cell => {
  const free: Cell[] = []
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (!g.line.some(c => c[0] === x && c[1] === y)) free.push([x, y])
  return free[Math.floor(Math.random() * free.length)] ?? [0, 0]
}

const fresh = (cols: number, rows: number, props: GameProps): Game => {
  const y = Math.floor(rows / 2)
  const x = Math.floor(cols / 3)
  const g: Game = {
    cols, rows,
    line: [[x, y], [x - 1, y], [x - 2, y]],
    dir: [1, 0],
    queued: [],
    pizza: [0, 0],
    score: 0,
    phase: 'ready',
    pausedFor: '',
    tick: 0,
    every: START_EVERY,
    props,
    bannerTicks: 0,
    isNewBest: false,
  }
  g.pizza = placePizza(g)
  return g
}

// One beat of the conga: move, eat, or trip.
const step = (g: Game, post: (data: { type: 'score'; game: 'conga'; score: number }) => void): void => {
  const next = g.queued.shift()
  if (next && !(next[0] === -g.dir[0] && next[1] === -g.dir[1])) g.dir = next
  const head = g.line[0]
  const to: Cell = [head[0] + g.dir[0], head[1] + g.dir[1]]
  const eats = same(to, g.pizza)
  const body = eats ? g.line : g.line.slice(0, -1)
  if (to[0] < 0 || to[1] < 0 || to[0] >= g.cols || to[1] >= g.rows || body.some(c => same(c, to))) {
    g.phase = 'over'
    g.isNewBest = g.score > g.props.best
    post({ type: 'score', game: 'conga', score: g.score })
    return
  }
  g.line = [to, ...body]
  if (eats) {
    g.score += 1
    g.every = Math.max(FASTEST, START_EVERY - Math.floor(g.score / 4))
    g.pizza = placePizza(g)
  }
}

const onKeyFor = (g: Game, restart: () => void) => (ev: ClientKeyEvent): void => {
  const key = ev.key.toLowerCase()
  if (key === ' ' || key === 'space' || key === 'return') {
    if (g.phase === 'over') return restart()
    g.phase = g.phase === 'playing' ? 'paused' : 'playing'
    g.pausedFor = ''
    return
  }
  if (key === 'r') return restart()
  const dir = DIRS[key]
  if (!dir) return
  if (g.phase === 'ready' || g.phase === 'paused') g.phase = 'playing'
  const last = g.queued[g.queued.length - 1] ?? g.dir
  if (!same(dir, last) && !(dir[0] === -last[0] && dir[1] === -last[1]) && g.queued.length < 3) g.queued.push(dir)
}

type Run = { text: string; bg: string; fg?: string; bold?: boolean }

// One board row as runs of same-styled cells, two characters per cell.
const rowRuns = (g: Game, y: number): Run[] => {
  const runs: Run[] = []
  for (let x = 0; x < g.cols; x++) {
    const at = g.line.findIndex(c => c[0] === x && c[1] === y)
    const cell: Run =
      at === 0
        ? { text: '••', bg: CLAY, fg: INK, bold: true } // Clawd, eyes forward
        : at > 0
          ? { text: '▘▝', bg: at % 2 ? CLAY_DARK : CLAY, fg: INK } // the conga line: mini Clawds, little legs
          : same([x, y], g.pizza)
            ? { text: '🍕', bg: (x + y) % 2 ? BOARD : BOARD_ALT }
            : { text: '  ', bg: (x + y) % 2 ? BOARD : BOARD_ALT }
    const last = runs[runs.length - 1]
    if (last && last.bg === cell.bg && last.fg === cell.fg && last.bold === cell.bold && cell.text === '  ' && last.text.trim() === '') last.text += cell.text
    else runs.push(cell)
  }
  return runs
}

const Conga: ClientModule<GameProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const cols = clamp(Math.floor((surface.columns || 40) / 2) - 1, 12, 30)
  const rows = clamp((surface.rows || 18) - 4, 8, 18)

  if (!surface.state) {
    const game = fresh(cols, rows, props)
    let frame = 0
    const restart = () => {
      const g2 = fresh(game.cols, game.rows, game.props)
      Object.assign(game, g2, { phase: 'playing' as Phase })
    }
    surface.onKey(onKeyFor(game, restart))
    surface.every(TICK_MS, () => {
      game.tick += 1
      if (game.bannerTicks > 0) game.bannerTicks -= 1
      // Claude needs you: pause the round so nothing is lost while you answer.
      if (game.props.status.claude === 'needs' && game.phase === 'playing') {
        game.phase = 'paused'
        game.pausedFor = 'Claude needs you'
      }
      if (game.phase === 'playing' && game.tick % game.every === 0) step(game, d => surface.post(d))
      surface.setState({ game, frame: (frame += 1) })
    })
    surface.setState({ game, frame })
  }

  const g = surface.state?.game ?? fresh(cols, rows, props)
  g.props = props
  // Claude needs you: pause the round the moment that news arrives.
  if (props.status.claude === 'needs' && g.phase === 'playing') {
    g.phase = 'paused'
    g.pausedFor = 'Claude needs you'
  }
  // A new delivery shows the "order's up" banner for a few seconds.
  if (props.status.doneAt !== undefined && props.status.doneAt !== g.doneSeen) {
    g.doneSeen = props.status.doneAt
    g.bannerTicks = BANNER_TICKS
  }

  const banner =
    g.phase === 'paused' && g.pausedFor
      ? { text: `✋ ${g.pausedFor}: Esc to answer, then click back and press space`, color: '#E0A33B' }
      : g.bannerTicks > 0
        ? { text: "🍕 Order's up! Claude is done.", color: '#3B9C5F' }
        : null

  const status =
    g.phase === 'ready'
      ? 'Click here, then press an arrow key to start'
      : g.phase === 'paused'
        ? 'Paused · space to dance on'
        : g.phase === 'over'
          ? `The conga tripped! ${g.score} slice${g.score === 1 ? '' : 's'}${g.isNewBest ? ' · new best! 🎉' : ''} · space to go again`
          : `🍕 ${g.score} · line of ${g.line.length} · best ${Math.max(props.best, g.score)}`

  return (
    <Box flexDirection="column">
      {banner ? (
        <Text bold color={banner.color}>
          {banner.text}
        </Text>
      ) : (
        <Text dimColor>arrows or WASD to steer · space pauses · r restarts</Text>
      )}
      {Array.from({ length: g.rows }, (_, y) => (
        <Text>
          {rowRuns(g, y).map(run => (
            <Text backgroundColor={run.bg} color={run.fg} bold={run.bold}>
              {run.text}
            </Text>
          ))}
        </Text>
      ))}
      <Text bold={g.phase !== 'playing'} color={g.phase === 'over' ? CLAY : undefined} dimColor={g.phase === 'playing'}>
        {status}
      </Text>
    </Box>
  )
}

export default Conga
