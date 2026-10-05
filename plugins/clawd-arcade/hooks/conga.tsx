import type { ClientElements, ClientKeyEvent, ClientModule, RenderElement } from 'claude-code'

import type { GameProps } from '../types'

// Clawd Conga: Clawd leads a conga line of mini Clawds around the board,
// squashing bugs. Each bug adds a dancer and speeds the beat up a little.
// Hit a wall or the line and the conga trips.

type Cell = [number, number]
type Phase = 'ready' | 'playing' | 'paused' | 'over'
type Game = {
  cols: number
  rows: number
  line: Cell[]
  dir: Cell
  queued: Cell[]
  bug: Cell
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
const BUG = '#5FA35A'

const DIRS: Record<string, Cell> = {
  up: [0, -1], w: [0, -1], k: [0, -1],
  down: [0, 1], s: [0, 1], j: [0, 1],
  left: [-1, 0], a: [-1, 0],
  right: [1, 0], d: [1, 0], l: [1, 0],
}

const same = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1]

// ---------------------------------------------------------------------------
// The board: a grid of square cells, each a fixed-width box, so every row is
// the same width whatever the font.

type Px = { bg: string; glyph?: string; fg?: string }

const paint = (el: ClientElements, grid: Px[][], cellW: number): RenderElement => {
  const { Box, Text } = el
  return Box({
    flexDirection: 'column',
    children: grid.map(row => {
      const runs: { px: Px; n: number }[] = []
      for (const px of row) {
        const last = runs[runs.length - 1]
        if (last && !px.glyph && !last.px.glyph && last.px.bg === px.bg) last.n += 1
        else runs.push({ px, n: 1 })
      }
      return Box({
        flexDirection: 'row',
        children: runs.map(({ px, n }) =>
          Box({
            width: cellW * n,
            height: 1,
            backgroundColor: px.bg,
            justifyContent: 'center',
            overflow: 'hidden',
            children: px.glyph ? Text({ color: px.fg, bold: true, children: px.glyph }) : undefined,
          }),
        ),
      })
    }),
  })
}

// ---------------------------------------------------------------------------

const placeBug = (g: Game): Cell => {
  const free: Cell[] = []
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (!g.line.some(c => c[0] === x && c[1] === y)) free.push([x, y])
  return free[Math.floor(Math.random() * free.length)] ?? [0, 0]
}

const fresh = (props: GameProps): Game => {
  const { cols, rows } = props
  const y = Math.floor(rows / 2)
  const x = Math.floor(cols / 3)
  const g: Game = {
    cols, rows,
    line: [[x, y], [x - 1, y], [x - 2, y]],
    dir: [1, 0],
    queued: [],
    bug: [0, 0],
    score: 0,
    phase: 'ready',
    pausedFor: '',
    tick: 0,
    every: START_EVERY,
    props,
    bannerTicks: 0,
    isNewBest: false,
  }
  g.bug = placeBug(g)
  return g
}

// One beat of the conga: move, squash a bug, or trip.
const step = (g: Game, post: (data: { type: 'score'; game: 'conga'; score: number }) => void): void => {
  const next = g.queued.shift()
  if (next && !(next[0] === -g.dir[0] && next[1] === -g.dir[1])) g.dir = next
  const head = g.line[0]
  const to: Cell = [head[0] + g.dir[0], head[1] + g.dir[1]]
  const eats = same(to, g.bug)
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
    g.bug = placeBug(g)
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

const board = (g: Game): Px[][] =>
  Array.from({ length: g.rows }, (_, y) =>
    Array.from({ length: g.cols }, (_, x): Px => {
      const at = g.line.findIndex(c => c[0] === x && c[1] === y)
      if (at === 0) return { bg: CLAY, glyph: '••', fg: INK } // Clawd, eyes forward
      if (at > 0) return { bg: at % 2 ? CLAY_DARK : CLAY } // the conga line of mini Clawds
      if (same([x, y], g.bug)) return { bg: (x + y) % 2 ? BOARD : BOARD_ALT, glyph: '🐛', fg: BUG }
      return { bg: (x + y) % 2 ? BOARD : BOARD_ALT }
    }),
  )

const Conga: ClientModule<GameProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (!surface.state) {
    const game = fresh(props)
    let frame = 0
    const restart = () => {
      Object.assign(game, fresh(game.props), { phase: 'playing' as Phase })
    }
    // Redraw on the key itself, not the next tick, so input feels instant.
    const onKey = onKeyFor(game, restart)
    surface.onKey(ev => {
      onKey(ev)
      surface.setState({ game, frame: (frame += 1) })
    })
    surface.every(TICK_MS, () => {
      game.tick += 1
      if (game.bannerTicks > 0) game.bannerTicks -= 1
      if (game.phase === 'playing' && game.tick % game.every === 0) step(game, d => surface.post(d))
      surface.setState({ game, frame: (frame += 1) })
    })
    surface.setState({ game, frame })
  }

  const g = surface.state?.game ?? fresh(props)
  g.props = props
  // The pane changed size before the first move: fit the board to it.
  if (g.phase === 'ready' && (g.cols !== props.cols || g.rows !== props.rows)) Object.assign(g, fresh(props))
  // Claude needs you: pause the round the moment that news arrives.
  if (props.status.claude === 'needs' && g.phase === 'playing') {
    g.phase = 'paused'
    g.pausedFor = 'Claude needs you'
  }
  // Claude finishing shows the "Claude is done" banner for a few seconds.
  if (props.status.doneAt !== undefined && props.status.doneAt !== g.doneSeen) {
    g.doneSeen = props.status.doneAt
    g.bannerTicks = BANNER_TICKS
  }

  const banner =
    g.phase === 'paused' && g.pausedFor
      ? { text: `✋ ${g.pausedFor}: Esc to answer, then click back and press Space`, color: '#E0A33B' }
      : g.bannerTicks > 0
        ? { text: '🎉 Claude is done! Hop back whenever you like.', color: '#3B9C5F' }
        : null

  const status =
    g.phase === 'ready'
      ? 'Click the board, then press an arrow key to start'
      : g.phase === 'paused'
        ? 'Paused · Space to dance on'
        : g.phase === 'over'
          ? `The conga tripped! ${g.score} bug${g.score === 1 ? '' : 's'} squashed${g.isNewBest ? ' · New best! 🎉' : ''} · Space to go again`
          : `🐛 ${g.score} squashed · Line of ${g.line.length} · Best ${Math.max(props.best, g.score)}`

  return (
    <Box flexDirection="column" gap={1}>
      {banner ? (
        <Text bold color={banner.color}>
          {banner.text}
        </Text>
      ) : (
        <Text dimColor>Arrows or WASD to steer · Space pauses · R restarts</Text>
      )}
      {paint(surface.elements, board(g), props.cellW)}
      <Text bold={g.phase !== 'playing'} color={g.phase === 'over' ? CLAY : undefined} dimColor={g.phase === 'playing'}>
        {status}
      </Text>
    </Box>
  )
}

export default Conga
