import type { ClientElements, ClientKeyEvent, ClientModule, ClientPointerEvent, RenderElement } from 'claude-code'

import type { GameProps } from '../types'

// Hat Trick: Clawd hides under one of his chef hats, the hats shuffle, and you
// pick the one he's under. Each round shuffles more and faster; every second
// round adds a hat, up to six.

type Phase = 'ready' | 'show' | 'drop' | 'shuffle' | 'pick' | 'reveal' | 'over'
type Swap = { a: number; b: number }
type Game = {
  round: number
  hats: number
  /** Which slot each hat stands in. */
  slotOf: number[]
  /** The hat Clawd is under. */
  clawd: number
  swaps: Swap[]
  swapMs: number
  phase: Phase
  /** Milliseconds into the current phase. */
  t: number
  sel: number
  picked: number
  isRight: boolean
  isPaused: boolean
  props: GameProps
  doneSeen?: number
  bannerMs: number
  isNewBest: boolean
}
type State = { game: Game; frame: number }

const TICK_MS = 30
const SHOW_MS = 1400
const DROP_MS = 350
const REVEAL_MS = 1300
const BANNER_MS = 6000
const SLOT = 6 // cells per hat slot: a 4-cell hat and a 2-cell gap
const ROWS = 8

const CLAY = '#D97757'
const INK = '#1F1E1D'
const STAGE = '#262624'
const FLOOR = '#33302C'
const HAT = '#F2F0EA'
const HAT_SHADE = '#D8D4CA'
const BAND = '#C9C2B4'
const PICK = '#E0A33B'
const RIGHT = '#3B9C5F'

const hatsFor = (round: number): number => Math.min(6, 3 + Math.floor((round - 1) / 2))
const swapsFor = (round: number): number => 2 + round
const swapMsFor = (round: number): number => Math.max(190, 650 - round * 45)
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

const newRound = (g: Game, round: number): void => {
  const hats = hatsFor(round)
  g.round = round
  g.hats = hats
  g.slotOf = Array.from({ length: hats }, (_, i) => i)
  g.clawd = Math.floor(Math.random() * hats)
  g.swaps = Array.from({ length: swapsFor(round) }, () => {
    const a = Math.floor(Math.random() * hats)
    const b = (a + 1 + Math.floor(Math.random() * (hats - 1))) % hats
    return { a, b }
  })
  g.swapMs = swapMsFor(round)
  g.phase = 'show'
  g.t = 0
  g.sel = Math.floor(hats / 2)
  g.picked = -1
}

const fresh = (props: GameProps): Game => {
  const g = {
    round: 1, hats: 3, slotOf: [0, 1, 2], clawd: 1, swaps: [], swapMs: 600, phase: 'ready', t: 0,
    sel: 1, picked: -1, isRight: false, isPaused: false, props, bannerMs: 0, isNewBest: false,
  } as Game
  return g
}

// The slots after a run of swaps: each swap trades the hats in two slots.
const swapped = (slotOf: number[], swaps: Swap[]): number[] =>
  swaps.reduce((slots, { a, b }) => slots.map(slot => (slot === a ? b : slot === b ? a : slot)), slotOf)

// Where each hat stands, in cells from the stage's left, and how high it rides.
const hatPlaces = (g: Game): { x: number; lift: number }[] => {
  const base = (slot: number) => 1 + slot * SLOT
  // Mid-shuffle, the hats stand where the swaps so far have put them.
  const done = g.phase === 'shuffle' ? Math.min(g.swaps.length, Math.floor(g.t / g.swapMs)) : 0
  const slots = swapped(g.slotOf, g.swaps.slice(0, done))
  const places = slots.map(slot => ({ x: base(slot), lift: 0 }))
  if (g.phase === 'shuffle') {
    const swap = g.swaps[done]
    if (swap) {
      const p = ease((g.t % g.swapMs) / g.swapMs)
      slots.forEach((slot, hat) => {
        if (slot === swap.a) places[hat] = { x: base(swap.a) + (base(swap.b) - base(swap.a)) * p, lift: Math.round(Math.sin(p * Math.PI) * 2) }
        if (slot === swap.b) places[hat] = { x: base(swap.b) + (base(swap.a) - base(swap.b)) * p, lift: 0 }
      })
    }
  }
  if (g.phase === 'show') places[g.clawd].lift = 3
  if (g.phase === 'drop') places[g.clawd].lift = Math.round(3 * (1 - g.t / DROP_MS))
  if (g.phase === 'reveal' || g.phase === 'over') {
    if (g.picked >= 0) places[g.picked].lift = 3
    places[g.clawd].lift = 3
  }
  return places
}

const settleSwaps = (g: Game): void => {
  g.slotOf = swapped(g.slotOf, g.swaps)
}

const advance = (g: Game, ms: number, post: (data: { type: 'score'; game: 'hats'; score: number }) => void): void => {
  if (g.isPaused || g.phase === 'ready' || g.phase === 'pick' || g.phase === 'over') return
  g.t += ms
  if (g.phase === 'show' && g.t >= SHOW_MS) {
    g.phase = 'drop'
    g.t = 0
  } else if (g.phase === 'drop' && g.t >= DROP_MS) {
    g.phase = 'shuffle'
    g.t = 0
  } else if (g.phase === 'shuffle' && g.t >= g.swaps.length * g.swapMs) {
    settleSwaps(g)
    g.phase = 'pick'
    g.t = 0
  } else if (g.phase === 'reveal' && g.t >= REVEAL_MS) {
    if (g.isRight) newRound(g, g.round + 1)
    else {
      g.phase = 'over'
      g.isNewBest = g.round - 1 > g.props.best
      post({ type: 'score', game: 'hats', score: g.round - 1 })
    }
  }
}

const pickSlot = (g: Game, slot: number): void => {
  if (g.phase !== 'pick' || slot < 0 || slot >= g.hats) return
  g.picked = g.slotOf.indexOf(slot)
  g.isRight = g.picked === g.clawd
  g.phase = 'reveal'
  g.t = 0
}

const onKeyFor = (g: Game, start: () => void) => (ev: ClientKeyEvent): void => {
  const key = ev.key.toLowerCase()
  if (g.phase === 'ready' || g.phase === 'over') {
    if (key === ' ' || key === 'space' || key === 'return') start()
    return
  }
  if (key === ' ' || key === 'space') {
    if (g.phase === 'pick') return pickSlot(g, g.sel)
    g.isPaused = !g.isPaused
    return
  }
  if (g.phase !== 'pick') return
  if (key === 'left' || key === 'a') g.sel = (g.sel + g.hats - 1) % g.hats
  else if (key === 'right' || key === 'd') g.sel = (g.sel + 1) % g.hats
  else if (key === 'return') pickSlot(g, g.sel)
  else if (/^[1-6]$/.test(key)) pickSlot(g, Number(key) - 1)
}

// ---------------------------------------------------------------------------
// The stage: a grid of square cells, each a fixed-width box.

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

const CHEF_HAT: string[] = ['.WW.', 'WWWW', 'BBBB']
const CLAWD: string[] = ['CCCC', 'CeeC', 'C..C']

const stage = (g: Game): Px[][] => {
  const cols = g.hats * SLOT + 1
  const grid: Px[][] = Array.from({ length: ROWS }, (_, y) => Array.from({ length: cols }, (): Px => ({ bg: y === 6 ? FLOOR : STAGE })))
  const put = (x: number, y: number, px: Px) => {
    if (y >= 0 && y < ROWS && x >= 0 && x < cols) grid[y][x] = px
  }
  const places = hatPlaces(g)
  // Clawd stands under his hat, wherever it goes.
  const home = places[g.clawd]
  const cx = Math.round(home.x)
  CLAWD.forEach((line, dy) =>
    [...line].forEach((ch, dx) => {
      if (ch === 'C') put(cx + dx, 3 + dy, { bg: CLAY })
      if (ch === 'e') put(cx + dx, 3 + dy, { bg: CLAY, glyph: '•', fg: INK })
    }),
  )
  // The hats, lowest first so a rising hat draws over a resting one.
  const order = places.map((p, hat) => ({ ...p, hat })).sort((a, b) => a.lift - b.lift)
  for (const { x, lift, hat } of order) {
    const hx = Math.round(x)
    const isPicked = (g.phase === 'reveal' || g.phase === 'over') && hat === g.picked
    CHEF_HAT.forEach((line, dy) =>
      [...line].forEach((ch, dx) => {
        const y = 3 - lift + dy
        if (ch === 'W') put(hx + dx, y, { bg: dx % 3 ? HAT : HAT_SHADE })
        if (ch === 'B') put(hx + dx, y, { bg: isPicked ? (g.isRight ? RIGHT : PICK) : BAND })
      }),
    )
  }
  // Under the floor: the hat numbers, and an arrow at the one you're choosing.
  for (let slot = 0; slot < g.hats; slot++) {
    const x = 1 + slot * SLOT
    const isSel = g.phase === 'pick' && slot === g.sel
    put(x + 1, 7, { bg: STAGE, glyph: isSel ? '▲' : String(slot + 1), fg: isSel ? PICK : '#8F8F8A' })
  }
  return grid
}

const HatTrick: ClientModule<GameProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (!surface.state) {
    const game = fresh(props)
    let frame = 0
    const start = () => {
      Object.assign(game, fresh(game.props))
      newRound(game, 1)
    }
    // Redraw on the key itself, not the next tick, so input feels instant.
    const onKey = onKeyFor(game, start)
    surface.onKey(ev => {
      onKey(ev)
      surface.setState({ game, frame: (frame += 1) })
    })
    surface.onPointer((ev: ClientPointerEvent) => {
      if (ev.type !== 'down') return
      if (game.phase === 'ready' || game.phase === 'over') start()
      const cell = Math.floor(ev.x / game.props.cellW) - 1
      if (cell >= 0 && cell % SLOT < 4) pickSlot(game, Math.floor(cell / SLOT))
      surface.setState({ game, frame: (frame += 1) })
    })
    surface.every(TICK_MS, () => {
      if (game.bannerMs > 0) game.bannerMs -= TICK_MS
      advance(game, TICK_MS, d => surface.post(d))
      surface.setState({ game, frame: (frame += 1) })
    })
    surface.setState({ game, frame })
  }

  const g = surface.state?.game ?? fresh(props)
  g.props = props
  // Claude needs you: freeze the shuffle so you don't lose track.
  if (props.status.claude === 'needs' && ['show', 'drop', 'shuffle', 'reveal'].includes(g.phase)) g.isPaused = true
  if (props.status.doneAt !== undefined && props.status.doneAt !== g.doneSeen) {
    g.doneSeen = props.status.doneAt
    g.bannerMs = BANNER_MS
  }

  const banner =
    g.isPaused && props.status.claude === 'needs'
      ? { text: '✋ Claude needs you: Esc to answer, then click back and press Space', color: '#E0A33B' }
      : g.bannerMs > 0
        ? { text: '🎉 Claude is done! Hop back whenever you like.', color: RIGHT }
        : null

  const line =
    g.phase === 'ready'
      ? 'Click the stage, then press Space to start'
      : g.isPaused
        ? 'Paused · Space to carry on'
        : g.phase === 'show'
          ? `Round ${g.round} · Clawd is under this one. Watch closely…`
          : g.phase === 'drop' || g.phase === 'shuffle'
            ? `Round ${g.round} · Shuffling ${g.swaps.length} times…`
            : g.phase === 'pick'
              ? 'Where is Clawd? ← → and Enter, a number key, or click a hat'
              : g.phase === 'reveal'
                ? g.isRight
                  ? 'Found him! 🎉 Next round…'
                  : 'Not that one! There he is.'
                : `Game over · ${g.round - 1} round${g.round === 2 ? '' : 's'} cleared${g.isNewBest ? ' · New best! 🎉' : ''} · Space to play again`

  return (
    <Box flexDirection="column" gap={1}>
      {banner ? (
        <Text bold color={banner.color}>
          {banner.text}
        </Text>
      ) : (
        <Text dimColor>
          Round {g.round} · {g.hats} hats · Best {Math.max(props.best, g.phase === 'over' ? g.round - 1 : 0)}
        </Text>
      )}
      {paint(surface.elements, stage(g), props.cellW)}
      <Text bold={g.phase !== 'shuffle'} color={g.phase === 'over' ? CLAY : g.phase === 'reveal' && g.isRight ? RIGHT : undefined}>
        {line}
      </Text>
    </Box>
  )
}

export default HatTrick
