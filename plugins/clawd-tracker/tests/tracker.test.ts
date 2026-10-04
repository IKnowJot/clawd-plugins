import { describe, expect, mock, test } from 'claude-code/testing'

const BAND = { component: 'AbovePrompt', props: { bodyColumns: 120 } } as const

// Stands in for Claude Code beneath the plugin: every event answers plainly.
const engine = (on: any) => {
  mock.clock(on)
  mock.store(on)
  on('ui.render', async () => null)
  on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: 'ok' }))
  on('command.run', async () => ({ text: '' }))
}

// Opens an order the way a session does: a prompt, then the main turn.
const order = async ($: any, text: string) => {
  await $.prompt.submit({ text })
  await $.turn.start({ text, turnId: 't1' })
}

describe('clawd-tracker', () => {
  test('draws the tracker on the desktop and in the terminal', async ($, on) => {
    engine(on)
    await order($, 'fix the logo everywhere')
    await $.tool.call({ tool: 'Read', input: { file_path: 'src/logo.tsx' }, file_path: 'src/logo.tsx' })

    const desktop = await $.ui.mount({ plugin: 'clawd-tracker', surface: 'desktop', ...BAND })
    const svg = await desktop.find({ type: 'Svg' })
    expect(svg).toBeDefined()
    expect(String(svg?.props?.alt)).toContain('fix the logo everywhere')
    await desktop.unmount()

    const terminal = await $.ui.mount({ plugin: 'clawd-tracker', surface: 'terminal', ...BAND })
    expect(await terminal.find({ type: 'Text', text: /Reading/ })).toBeDefined()
    await terminal.unmount()
  })

  test('a git command does not jump the bar to Taste test', async ($, on) => {
    engine(on)
    await order($, 'look at history')
    await $.tool.call({ tool: 'Bash', input: { command: 'git log --oneline' }, command: 'git log --oneline' })
    const ui = await $.ui.mount({ plugin: 'clawd-tracker', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /\[Reading\]/ })).toBeDefined()
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
    on('session.measure', async (_$: any, e: any) => ({ changed: e.changed }))
    on('ui.toast', async () => undefined)
    await order($, 'big refactor')
    await $.session.measure({
      context: { tokens: 0, max: 200_000 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 42 },
        { kind: 'seven_day', percentUsed: 91.5 },
      ],
      changed: ['rateLimits'],
    } as any)
    const ui = await $.ui.mount({ plugin: 'clawd-tracker', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /5h 42% · wk 92%/ })).toBeDefined()
    await ui.unmount()
  })

  test('a failed step shows a snag', async ($, on) => {
    mock.clock(on)
    mock.store(on)
    on('ui.render', async () => null)
    on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))
    on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }))
    on('tool.call', async () => ({ result: {}, text: 'exit 1', isError: true }))
    await order($, 'run the build')
    await $.tool.call({ tool: 'Bash', input: { command: 'npm run build' }, command: 'npm run build' })
    const ui = await $.ui.mount({ plugin: 'clawd-tracker', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /hit a snag/ })).toBeDefined()
    await ui.unmount()
  })

  test('a task list drives the bar and the ETA', async ($, on) => {
    engine(on)
    await order($, 'ship the feature')
    const todos = (done: number) =>
      Array.from({ length: 4 }, (_, i) => ({ content: `step ${i}`, activeForm: `Doing step ${i}`, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending' }))
    await $.tool.call({ tool: 'TodoWrite', input: { todos: todos(0) }, todos: todos(0) })
    let ui = await $.ui.mount({ plugin: 'clawd-tracker', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /Medium job · sizing up…/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0\/4 tasks/ })).toBeDefined()
    await ui.unmount()
    await $.tool.call({ tool: 'TodoWrite', input: { todos: todos(2) }, todos: todos(2) })
    ui = await $.ui.mount({ plugin: 'clawd-tracker', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /2\/4 tasks/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\[Cooking\]/ })).toBeDefined()
    await ui.unmount()
  })
})
