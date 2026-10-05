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
// Opens the pane and picks a game from the menu.
const play = async ($: any, game: 'conga' | 'hats', surface: 'desktop' | 'terminal' = 'desktop') => {
  const ui = await pane($, surface)
  await ui.press({ key: `play-${game}` })
  return ui
}
const has = async (ui: any, text: RegExp, scope?: { in: string }) => (await ui.find({ type: 'Text', text, ...scope })) !== undefined
const shows = async (ui: any, text: RegExp, scope?: { in: string }) => ((await has(ui, text, scope)) ? text.source : `missing ${text.source}`)

describe('clawd-arcade', () => {
  for (const surface of ['desktop', 'terminal'] as const) {
    test(`Clawd Conga starts, dances and trips on the ${surface}`, async ($, on) => {
      engine(on)
      const ui = await play($, 'conga', surface)
      expect(await has(ui, /Clawd Conga/)).toBe(true)
      expect(await has(ui, /Press an arrow key to start/i, { in: 'conga' })).toBe(true)

      await ui.key({ key: 'right', in: 'conga' })
      await ui.advance(300)
      expect(await has(ui, /Line of 3/, { in: 'conga' })).toBe(true)

      // Straight on into the wall: the conga trips.
      await ui.advance(5000)
      expect(await has(ui, /The conga tripped!/, { in: 'conga' })).toBe(true)
      await ui.unmount()
    })
  }

  test('a posted score becomes the best, and a lower one does not replace it', async ($, on) => {
    engine(on)
    const ui = await play($, 'conga')
    await ui.post({ type: 'score', game: 'conga', score: 7 }, { in: 'conga' })
    expect(await has(ui, /Best 7/)).toBe(true)
    await ui.post({ type: 'score', game: 'conga', score: 3 }, { in: 'conga' })
    expect(await has(ui, /Best 7/)).toBe(true)
    await ui.post({ type: 'score', game: 'nope', score: 99 }, { in: 'conga' })
    expect(await has(ui, /Best 99/)).toBe(false)
    await ui.press({ key: 'back' })
    expect(await has(ui, /Best 7/)).toBe(true)
    await ui.unmount()
  })

  test('the round pauses while Claude needs you', async ($, on) => {
    let answer = () => {}
    const hold = new Promise<void>(done => (answer = done))
    engine(on, { hold })
    await $.turn.start({ text: 'ask me', turnId: 't1' })
    const ui = await play($, 'conga')
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
    expect(await shows(ui, /Paused · Space to dance on/, { in: 'conga' })).not.toMatch(/^missing/)
    await ui.unmount()
  })

  test('the done banner shows when Claude finishes', async ($, on) => {
    engine(on)
    await $.turn.start({ text: 'do it', turnId: 't1' })
    const ui = await play($, 'conga')
    await $.turn.complete({ answer: 'done', durationMs: 0, isAborted: false, turnId: 't1', reason: 'answer' } as any)
    await ui.advance(100)
    expect(await has(ui, /Claude is done!/, { in: 'conga' })).toBe(true)
    await ui.advance(7000)
    expect(await has(ui, /Claude is done!/, { in: 'conga' })).toBe(false)
    await ui.unmount()
  })

  test('the menu lists the games and goes back', async ($, on) => {
    engine(on)
    const ui = await pane($)
    expect(await has(ui, /Clawd Arcade/)).toBe(true)
    expect(await has(ui, /Lead a conga line/)).toBe(true)
    expect(await has(ui, /Watch the shuffle/)).toBe(true)
    expect(await has(ui, /coming soon/)).toBe(false) // a Button's label, not Text
    await ui.press({ key: 'play-hats' })
    expect(await has(ui, /Hat Trick/)).toBe(true)
    await ui.press({ key: 'back' })
    expect(await has(ui, /Watch the shuffle/)).toBe(true)
    await ui.unmount()
  })

  for (const surface of ['desktop', 'terminal'] as const) {
    test(`Hat Trick shows, shuffles and takes a pick on the ${surface}`, async ($, on) => {
      engine(on)
      const ui = await play($, 'hats', surface)
      expect(await has(ui, /Press Space to start/i, { in: 'hats' })).toBe(true)
      await ui.key({ key: ' ', in: 'hats' })
      await ui.advance(100)
      expect(await has(ui, /Clawd is under this one/, { in: 'hats' })).toBe(true)
      await ui.advance(2000)
      expect(await has(ui, /Shuffling 3 times/, { in: 'hats' })).toBe(true)
      await ui.advance(3000)
      expect(await has(ui, /Where is Clawd\?/, { in: 'hats' })).toBe(true)
      await ui.key({ key: '2', in: 'hats' })
      expect((await has(ui, /Found him!/, { in: 'hats' })) || (await has(ui, /Not that one!/, { in: 'hats' }))).toBe(true)
      await ui.advance(1500)
      expect((await has(ui, /Round 2/, { in: 'hats' })) || (await has(ui, /Game over · 0 rounds cleared/, { in: 'hats' }))).toBe(true)
      await ui.unmount()
    })
  }

  test('surfaces without games say so', async ($, on) => {
    engine(on)
    const ui = await pane($, 'vscode')
    expect(await has(ui, /need the Claude desktop app or the terminal/)).toBe(true)
    await ui.unmount()
  })
})
