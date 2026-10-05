/** What Claude is up to, as the games see it. */
export type ClaudeStatus = 'idle' | 'working' | 'needs' | 'done'

export type Status = {
  claude: ClaudeStatus
  /** What Claude needs from you, when `claude` is `needs`. */
  needs?: string
  /** When Claude last finished, for the "order's up" banner. */
  doneAt?: number
}

/** The props the arcade hands each game. */
export type GameProps = {
  status: Status
  best: number
  /** The time the props were drawn, so a game can age its banners. */
  now: number
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-arcade': {
      status: Status
      best: Record<string, number>
      now: number
    }
  }
}
