import { describe, expect, mock, test } from 'claude-code/testing'

const BAND = { component: 'AbovePrompt', props: { bodyColumns: 120 } } as const

// Stands in for Claude Code beneath the plugin: every event answers plainly.
// Returns the mock clock, and the clips the plugin asked to play.
const engine = (on: any, { failTools = false, ask = false } = {}) => {
  const clock = mock.clock(on)
  mock.store(on)
  const played: string[] = []
  on('ui.render', async () => null)
  on('ui.toast', async () => undefined)
  on('audio.play', async (_$: any, e: any) => {
    played.push(String(e.clip?.asset ?? e.asset ?? ''))
    return {}
  })
  on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }))
  on('tool.call', async () => ({ result: {}, text: failTools ? 'exit 1' : 'ok', isError: failTools }))
  on('tool.check', async () => ({ decision: ask ? 'ask' : 'allow' }))
  on('command.run', async () => ({ text: '' }))
  on('session.measure', async (_$: any, e: any) => ({ changed: e.changed }))
  return { clock, played }
}

// Ends a turn the way the engine reports it: answered, not aborted.
const done = (extra: Record<string, unknown> = {}) =>
  ({ answer: 'done', durationMs: 0, isAborted: false, turnId: 't1', reason: 'answer', ...extra }) as any

// Opens an order the way a session does: a prompt, then the main turn.
const order = async ($: any, text: string) => {
  await $.prompt.submit({ text })
  await $.turn.start({ text, turnId: 't1' })
}

const terminal = ($: any) => $.ui.mount({ plugin: 'clawd-tracker', surface: 'terminal', ...BAND })
const has = async (ui: any, text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined

describe('clawd-tracker', () => {
  test('draws the tracker on the desktop and in the terminal', async ($, on) => {
    engine(on)
    await order($, 'fix the logo everywhere')
    await $.tool.call({ tool: 'Read', file_path: 'src/logo.tsx' } as any)

    const desktop = await $.ui.mount({ plugin: 'clawd-tracker', surface: 'desktop', ...BAND })
    const svg = await desktop.find({ type: 'Svg' })
    expect(svg).toBeDefined()
    expect(String(svg?.props?.alt)).toContain('fix the logo everywhere')
    await desktop.unmount()

    const ui = await terminal($)
    expect(await has(ui, /Reading/)).toBe(true)
    await ui.unmount()
  })

  test('a git command does not jump the bar to Taste test', async ($, on) => {
    engine(on)
    await order($, 'look at history')
    await $.tool.call({ tool: 'Bash', command: 'git log --oneline' } as any)
    const ui = await terminal($)
    expect(await has(ui, /\[Reading\]/)).toBe(true)
    await ui.unmount()
  })

  test('/tracker hides and shows the band', async ($, on) => {
    engine(on)
    await order($, 'anything')
    const hidden = await $.command.run({ command: 'tracker', args: '' })
    expect(String(hidden?.text)).toContain('hidden')
    const shown = await $.command.run({ command: 'tracker', args: '' })
    expect(String(shown?.text)).toContain('shown')
  })

  test('shows plan usage from the 5-hour and weekly windows', async ($, on) => {
    engine(on)
    await order($, 'big refactor')
    await $.session.measure({
      context: { tokens: 0, max: 200_000 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 42 },
        { kind: 'seven_day', percentUsed: 91.5 },
      ],
      changed: ['rateLimits'],
    } as any)
    const ui = await terminal($)
    expect(await has(ui, /5h 42% · wk 92%/)).toBe(true)
    await ui.unmount()
  })

  test('a failed step shows a snag', async ($, on) => {
    engine(on, { failTools: true })
    await order($, 'run the build')
    await $.tool.call({ tool: 'Bash', command: 'npm run build' } as any)
    const ui = await terminal($)
    expect(await has(ui, /hit a snag/)).toBe(true)
    await ui.unmount()
  })

  test('a task list drives the bar and the ETA', async ($, on) => {
    engine(on)
    await order($, 'ship the feature')
    const todos = (done: number) =>
      Array.from({ length: 4 }, (_, i) => ({ content: `step ${i}`, activeForm: `Doing step ${i}`, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending' }))
    await $.tool.call({ tool: 'TodoWrite', todos: todos(0) } as any)
    let ui = await terminal($)
    expect(await has(ui, /Medium job · sizing up…/)).toBe(true)
    expect(await has(ui, /0\/4 tasks/)).toBe(true)
    await ui.unmount()
    await $.tool.call({ tool: 'TodoWrite', todos: todos(2) } as any)
    ui = await terminal($)
    expect(await has(ui, /2\/4 tasks/)).toBe(true)
    expect(await has(ui, /\[Cooking\]/)).toBe(true)
    await ui.unmount()
  })

  test('delivery prints a receipt and dings after a long job', async ($, on) => {
    const { clock, played } = engine(on)
    await order($, 'tidy the header')
    await $.tool.call({ tool: 'Edit', file_path: 'src/Header.tsx', old_string: 'a\nb', new_string: 'a\nb\nc' } as any)
    await $.tool.call({ tool: 'Write', file_path: 'src/Logo.tsx', content: 'x\ny' } as any)
    await $.tool.call({ tool: 'Bash', command: 'npm test' } as any)
    await clock.advance(30_000)
    await $.turn.complete(done())
    const ui = await terminal($)
    expect(await has(ui, /2 files · \+5 −2 · checks ✓ · 3 steps · order #1 today/)).toBe(true)
    await ui.unmount()
    expect(played).toEqual(['sounds/ding.wav'])
  })

  test('a quick job delivers without a ding', async ($, on) => {
    const { clock, played } = engine(on)
    await order($, 'one read')
    await $.tool.call({ tool: 'Read', file_path: 'a.ts' } as any)
    await clock.advance(3_000)
    await $.turn.complete(done())
    expect(played).toEqual([])
  })

  test('a permission prompt shows "waiting on you" once it lasts', async ($, on) => {
    const { clock } = engine(on, { ask: true })
    await order($, 'deploy it')
    await $.tool.check({ tool: 'Bash', input: { command: 'npm publish' }, tool_use_id: 'tu1' } as any)
    let ui = await terminal($)
    expect(await has(ui, /Waiting on you/)).toBe(false)
    await ui.unmount()
    await clock.advance(5_000)
    ui = await terminal($)
    expect(await has(ui, /Waiting on you · 0:05/)).toBe(true)
    expect(await has(ui, /Needs your OK on Bash/)).toBe(true)
    await ui.unmount()
  })

  test('subagents show up as helpers and leave when done', async ($, on) => {
    engine(on)
    await order($, 'research three things')
    await $.turn.start({ text: 'look into A', turnId: 'a1', agentId: 'agent-a' } as any)
    await $.tool.call({ tool: 'Grep', pattern: 'logo', agentId: 'agent-a' } as any)
    let ui = await terminal($)
    expect(await has(ui, /🔍/)).toBe(true)
    await ui.unmount()
    await $.turn.complete(done({ turnId: 'a1', agentId: 'agent-a' }))
    ui = await terminal($)
    expect(await has(ui, /🔍/)).toBe(false)
    await ui.unmount()
  })

  test('/tracker stats sums up the day', async ($, on) => {
    const { clock } = engine(on)
    await order($, 'first job')
    await $.tool.call({ tool: 'Read', file_path: 'a.ts' } as any)
    await clock.advance(60_000)
    await $.turn.complete(done())
    const out = await $.command.run({ command: 'tracker', args: 'stats' })
    expect(String(out?.text)).toContain('1 order delivered')
    expect(String(out?.text)).toContain('Time cooking: 1:00')
  })

  test('the coffee theme renames the stages', { options: { theme: 'coffee' } }, async ($, on) => {
    engine(on)
    await order($, 'make a latte')
    const ui = await terminal($)
    expect(await has(ui, /\[Grinding\] › Brewing › Pouring › Tasting › Served/)).toBe(true)
    await ui.unmount()
  })
})
