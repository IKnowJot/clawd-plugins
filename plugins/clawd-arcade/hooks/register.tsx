import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { GameId, Screen, Status } from '../types'

// The arcade pane: a menu of games, the game being played, what Claude is up
// to, and each game's best score.
const PANE = 'clawd-arcade'
const status = atom({ plugin: 'clawd-arcade', key: 'status' } as const, { claude: 'idle' } as Status)
const best = atom({ plugin: 'clawd-arcade', key: 'best' } as const, {} as Record<string, number>)
const now = atom({ plugin: 'clawd-arcade', key: 'now' } as const, 0)
const screen = atom({ plugin: 'clawd-arcade', key: 'screen' } as const, 'menu' as Screen)

type Listing = { id: GameId; name: string; blurb: string; score: string; isReady: boolean }
const GAMES: Listing[] = [
  { id: 'conga', name: 'Clawd Conga', blurb: 'Lead a conga line of mini Clawds and squash bugs.', score: 'bugs', isReady: true },
  { id: 'hats', name: 'Hat Trick', blurb: 'Clawd hides under a hat. Watch the shuffle, then find him.', score: 'rounds', isReady: true },
  { id: 'stacks', name: 'Clawd Stacks', blurb: 'Stack falling blocks into lines.', score: 'lines', isReady: false },
  { id: 'flappy', name: 'Flappy Clawd', blurb: 'Hop through the gaps.', score: 'gaps', isReady: false },
]
const PLAYABLE = GAMES.filter(g => g.isReady).map(g => g.id as string)

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1) + '…' : s)
const toolName = (tool: string): string => clip(tool.replace(/^mcp__/, '').split('__').pop() || tool, 24)
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

// A tool call's own arguments: the event minus the keys the engine adds.
const argsOf = (e: Record<string, unknown>): Record<string, unknown> => {
  const { tool: _t, tool_use_id: _id, agentId: _a, ...args } = e
  return args
}

const CLAUDE_LINE: Record<Status['claude'], string> = {
  idle: 'Claude is free. Play away.',
  working: 'Claude is cooking. Play away.',
  needs: 'Claude needs you',
  done: 'Claude is done!',
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'arcade', description: 'Open Clawd Arcade: games to play while Claude works' })
    const saved = await $.store.get('best')
    if (saved && typeof saved === 'object') await update($, best, () => saved as Record<string, number>)
    return started
  })

  on('command.run', { command: 'arcade' }, async $ => {
    await update($, screen, () => 'menu' as Screen)
    await $.ui.open({ id: PANE, title: 'Clawd Arcade' })
    return { text: 'Clawd Arcade is open. Pick a game, click it, then play with the keyboard. Esc gives the keyboard back.' }
  })

  // What Claude is doing, for the games' banners: working, done, or waiting on you.
  on('turn.start', async ($, e, next) => {
    if (!(e as Record<string, unknown>).agentId) await update($, status, () => ({ claude: 'working' }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ev = e as unknown as Record<string, unknown>
    if (!ev.agentId) {
      const at = await $.clock.now()
      const isStopped = str(ev.reason) !== '' && str(ev.reason) !== 'answer'
      await update($, status, () => (isStopped ? { claude: 'idle' } : { claude: 'done', doneAt: at }))
      await update($, now, () => at)
    }
    return next(e)
  })

  // A question, or a step that will stop for your OK (asked read-only of the
  // permission rules; the decision stays with Claude Code and you).
  on('tool.call', async ($, e, next) => {
    const ev = e as unknown as Record<string, unknown>
    const tool = str(ev.tool)
    if (ev.agentId) return next(e)
    const verdict = tool === 'AskUserQuestion' ? null : await $.tool.check({ tool, input: argsOf(ev) })
    const needs = tool === 'AskUserQuestion' ? 'your answer' : verdict?.decision === 'ask' ? `your OK on ${toolName(tool)}` : ''
    if (needs) await update($, status, () => ({ claude: 'needs', needs }))
    const ran = await next(e)
    if (needs) await update($, status, () => ({ claude: 'working' }))
    return ran
  })

  // A game posts its score when a round ends; keep each game's best.
  on('ui.message', { requestId: PANE }, async ($, e) => {
    const data = e.data as { type?: unknown; game?: unknown; score?: unknown } | null
    const game = str(data?.game)
    const score = typeof data?.score === 'number' && Number.isFinite(data.score) ? Math.max(0, Math.floor(data.score)) : -1
    if (data?.type !== 'score' || !PLAYABLE.includes(game) || score < 0) return {}
    const all = await update($, best, b => ((b[game] ?? 0) >= score ? b : { ...b, [game]: score }))
    await $.store.set('best', all)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const st = await read($, status)
    const all = await read($, best)
    const shown = await read($, screen)
    await read($, now)
    const at = await $.clock.now()

    if (!('Client' in ui) || e.surface === 'vscode' || e.surface === 'mobile') {
      return (
        <Box flexDirection="column">
          <Text bold>Clawd Arcade</Text>
          <Text dimColor>The games need the Claude desktop app or the terminal.</Text>
        </Box>
      )
    }
    const { Client } = ui
    const tone = st.claude === 'needs' ? 'yellow' : st.claude === 'done' ? 'green' : 'gray'
    const claudeLine = (
      <Text color={tone} bold={st.claude === 'needs' || st.claude === 'done'}>
        {st.claude === 'needs' ? `${CLAUDE_LINE.needs}: ${st.needs ?? 'you'}. Press Esc to answer.` : CLAUDE_LINE[st.claude]}
      </Text>
    )

    if (shown === 'menu') {
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold color="#D97757">
            Clawd Arcade
          </Text>
          {claudeLine}
          {GAMES.map(game => (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Button
                  key={`play-${game.id}`}
                  label={game.isReady ? `Play ${game.name}` : `${game.name} (coming soon)`}
                  onPress={() => (game.isReady ? update($, screen, () => game.id as Screen) : undefined)}
                />
                {game.isReady && <Text dimColor>Best {all[game.id] ?? 0}</Text>}
              </Box>
              <Text dimColor>{game.blurb}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    // Square cells: a desktop column is about a third as wide as a row is
    // tall, a terminal one about half.
    const cellW = e.surface === 'terminal' ? 2 : 3
    const cols = clamp(Math.floor(((e.props as { bodyColumns?: number }).bodyColumns ?? 60) / cellW) - 1, 12, 28)
    const rows = clamp((e.viewport?.rows ?? 30) - 12, 10, 20)
    const game = GAMES.find(g => g.id === shown) ?? GAMES[0]
    const props = { status: st, best: all[game.id] ?? 0, now: at, cellW, cols, rows }
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={2} alignItems="center">
          <Button key="back" label="← Games" onPress={() => update($, screen, () => 'menu' as Screen)} />
          <Text>
            <Text bold color="#D97757">
              {game.name}
            </Text>
            <Text dimColor> · Best {all[game.id] ?? 0}</Text>
          </Text>
        </Box>
        {claudeLine}
        {game.id === 'hats' ? (
          <Client key="hats" module="./hats.tsx" props={props} />
        ) : (
          <Client key="conga" module="./conga.tsx" props={props} />
        )}
      </Box>
    )
  })
}
