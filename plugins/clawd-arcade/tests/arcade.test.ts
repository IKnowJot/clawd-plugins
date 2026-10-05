import { describe, expect, mock, test } from 'claude-code/testing'

const PANE = { component: 'Pane', requestId: 'clawd-arcade', props: { bodyColumns: 60 } } as const

// Stands in for Claude Code beneath the plugin: every event answers plainly.
const engine = (on: any, { hold = null as Promise<void> | null } = {}) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('ui.render', async () => null)
  on('ui.open', async () => ({}))
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }))
  on('tool.check', async () => ({ decision: 'allow' }))
  on('tool.call', async () => {
    if (hold) await hold
    return { result: {}, text: 'ok' }
  })
  on('ui.message', async () => ({}))
  return clock
}

const pane = ($: any, surface: 'desktop' | 'terminal' | 'vscode' = 'desktop') => $.ui.mount({ plugin: 'clawd-arcade', surface, ...PANE })
const has = async (ui: any, text: RegExp, scope?: { in: string }) => (await ui.find({ type: 'Text', text, ...scope })) !== undefined
const shows = async (ui: any, text: RegExp, scope?: { in: string }) => ((await has(ui, text, scope)) ? text.source : `missing ${text.source}`)

describe('clawd-arcade', () => {
  for (const surface of ['desktop', 'terminal'] as const) {
    test(`Clawd Conga starts, dances and trips on the ${surface}`, async ($, on) => {
      engine(on)
      const ui = await pane($, surface)
      expect(await has(ui, /Clawd Conga/)).toBe(true)
      expect(await has(ui, /press an arrow key to start/, { in: 'conga' })).toBe(true)

      await ui.key({ key: 'right', in: 'conga' })
      await ui.advance(300)
      expect(await has(ui, /line of 3/, { in: 'conga' })).toBe(true)

      // Straight on into the wall: the conga trips.
      await ui.advance(5000)
      expect(await has(ui, /The conga tripped!/, { in: 'conga' })).toBe(true)
      await ui.unmount()
    })
  }

  test('a posted score becomes the best, and a lower one does not replace it', async ($, on) => {
    engine(on)
    const ui = await pane($)
    await ui.post({ type: 'score', game: 'conga', score: 7 }, { in: 'conga' })
    expect(await has(ui, /best 7/)).toBe(true)
    await ui.post({ type: 'score', game: 'conga', score: 3 }, { in: 'conga' })
    expect(await has(ui, /best 7/)).toBe(true)
    await ui.post({ type: 'score', game: 'nope', score: 99 }, { in: 'conga' })
    expect(await has(ui, /best 99/)).toBe(false)
    await ui.unmount()
  })

  test('the round pauses while Claude needs you', async ($, on) => {
    let answer = () => {}
    const hold = new Promise<void>(done => (answer = done))
    engine(on, { hold })
    await $.turn.start({ text: 'ask me', turnId: 't1' })
    const ui = await pane($)
    await ui.key({ key: 'right', in: 'conga' })
    await ui.advance(200)

    const call = $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
    await ui.advance(100)
    expect(await shows(ui, /Claude needs you: your answer/)).not.toMatch(/^missing/)
    expect(await shows(ui, /Claude needs you: Esc to answer/, { in: 'conga' })).not.toMatch(/^missing/)

    answer()
    await call
    await ui.advance(50)
    expect(await shows(ui, /Claude is cooking/)).not.toMatch(/^missing/)
    expect(await shows(ui, /Paused · space to dance on/, { in: 'conga' })).not.toMatch(/^missing/)
    await ui.unmount()
  })

  test('the order-up banner shows when Claude finishes', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'do it', turnId: 't1' })
    const ui = await pane($)
    await $.turn.complete({ answer: 'done', durationMs: 0, isAborted: false, turnId: 't1', reason: 'answer' } as any)
    await ui.advance(100)
    expect(await has(ui, /Order's up! Claude is done/, { in: 'conga' })).toBe(true)
    await ui.advance(7000)
    expect(await has(ui, /Order's up!/, { in: 'conga' })).toBe(false)
    await ui.unmount()
  })

  test('surfaces without games say so', async ($, on) => {
    engine(on)
    const ui = await pane($, 'vscode')
    expect(await has(ui, /need the Claude desktop app or the terminal/)).toBe(true)
    await ui.unmount()
  })
})
