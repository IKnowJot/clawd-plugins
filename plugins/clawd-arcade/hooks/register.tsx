import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Status } from '../types'

// The arcade pane, what Claude is up to, and each game's best score.
const PANE = 'clawd-arcade'
const status = atom({ plugin: 'clawd-arcade', key: 'status' } as const, { claude: 'idle' } as Status)
const best = atom({ plugin: 'clawd-arcade', key: 'best' } as const, {} as Record<string, number>)
const now = atom({ plugin: 'clawd-arcade', key: 'now' } as const, 0)

const GAMES = ['conga'] as const
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1) + '…' : s)
const toolName = (tool: string): string => clip(tool.replace(/^mcp__/, '').split('__').pop() || tool, 24)

// A tool call's own arguments: the event minus the keys the engine adds.
const argsOf = (e: Record<string, unknown>): Record<string, unknown> => {
  const { tool: _t, tool_use_id: _id, agentId: _a, ...args } = e
  return args
}

const CLAUDE_LINE: Record<Status['claude'], string> = {
  idle: 'Claude is free. Play away.',
  working: 'Claude is cooking. Play away.',
  needs: 'Claude needs you',
  done: "Order's up! Claude is done.",
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
    await $.ui.open({ id: PANE, title: 'Clawd Arcade' })
    return { text: 'Clawd Arcade is open. Click the game, then use the arrow keys; Esc gives the keyboard back.' }
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
    if (data?.type !== 'score' || !(GAMES as readonly string[]).includes(game) || score < 0) return {}
    const all = await update($, best, b => ((b[game] ?? 0) >= score ? b : { ...b, [game]: score }))
    await $.store.set('best', all)
    return { props: { status: await read($, status), best: all[game] ?? 0, now: await $.clock.now() } }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const st = await read($, status)
    const all = await read($, best)
    await read($, now)
    const at = await $.clock.now()
    const tone = st.claude === 'needs' ? 'yellow' : st.claude === 'done' ? 'green' : 'gray'

    if (!('Client' in ui) || e.surface === 'vscode' || e.surface === 'mobile') {
      return (
        <Box flexDirection="column">
          <Text bold>Clawd Arcade</Text>
          <Text dimColor>The games need the Claude desktop app or the terminal.</Text>
        </Box>
      )
    }
    const { Client } = ui
    return (
      <Box flexDirection="column" gap={1}>
        <Text>
          <Text bold color="#D97757">
            Clawd Conga
          </Text>
          <Text dimColor> · best {all.conga ?? 0}</Text>
        </Text>
        <Text color={tone} bold={st.claude !== 'working' && st.claude !== 'idle'}>
          {st.claude === 'needs' ? `${CLAUDE_LINE.needs}: ${st.needs ?? 'you'}. Press Esc to answer.` : CLAUDE_LINE[st.claude]}
        </Text>
        <Client key="conga" module="./conga.tsx" props={{ status: st, best: all.conga ?? 0, now: at }} />
      </Box>
    )
  })
}
