/** What Claude is up to, as the games see it. */
export type ClaudeStatus = 'idle' | 'working' | 'needs' | 'done'

export type Status = {
  claude: ClaudeStatus
  /** What Claude needs from you, when `claude` is `needs`. */
  needs?: string
  /** When Claude last finished, for the "Claude is done" banner. */
  doneAt?: number
}

export type GameId = 'conga' | 'hats' | 'stacks' | 'flappy'

/** What the pane shows: the menu, or a game. */
export type Screen = 'menu' | GameId

/** The props the arcade hands each game. */
export type GameProps = {
  status: Status
  best: number
  /** The time the props were drawn, so a game can age its banners. */
  now: number
  /** How many columns one square cell takes on this surface. */
  cellW: number
  /** The board's size in cells, from the pane's size. */
  cols: number
  rows: number
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-arcade': {
      status: Status
      best: Record<string, number>
      now: number
      screen: Screen
    }
  }
}
