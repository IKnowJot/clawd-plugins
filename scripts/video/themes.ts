// The four themes side by side: one row each, mid-job, with the theme's name
// and setting value on the left. Drawn by the tracker's own code (prepended by
// gallery.sh). Writes docs/themes.svg; gallery.sh also renders a PNG.

import * as fs from 'fs'

const W = 900
const t0 = 1_000_000
const GAP = 26
const PAD = 26
const LABEL_W = 190

const lims = [
  { kind: 'five_hour', percentUsed: 34 },
  { kind: 'seven_day', percentUsed: 21 },
]
const todos = (n: number, done: number) => Array.from({ length: n }, (_, i) => ({ status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending' }))

type Row = { key: string; name: string; emoji: string; title: string; secs: number; build: (r: any) => any }
const rows: Row[] = [
  {
    key: 'pizza', name: 'Pizza', emoji: '🍕', title: 'Refactor the checkout flow', secs: 95,
    build: r => trackTasks({ ...r, activity: 'cook', note: 'Simmering Checkout.tsx', tools: 14, stage: 2, reached: 2 }, 'TodoWrite', { todos: todos(4, 2) }, t0),
  },
  {
    key: 'coffee', name: 'Coffee', emoji: '☕', title: 'Write the onboarding emails', secs: 64,
    build: r => trackTasks({ ...r, activity: 'quill', note: 'Penning welcome.md', tools: 9, stage: 2, reached: 2 }, 'TodoWrite', { todos: todos(5, 3) }, t0),
  },
  {
    key: 'rocket', name: 'Rocket', emoji: '🚀', title: 'Ship the 2.0 release', secs: 158,
    build: r => trackTasks({ ...r, activity: 'test', note: 'Taste-testing npm test', tools: 27, stage: 3, reached: 3 }, 'TodoWrite', { todos: todos(4, 3) }, t0),
  },
  {
    key: 'construction', name: 'Construction', emoji: '🏗️', title: 'Build the settings page', secs: 212,
    build: r => ({ ...r, status: 'done', endedAt: t0 + 212_000, stage: DELIVERED, reached: DELIVERED, activity: 'deliver', files: ['a', 'b', 'c', 'd'], added: 168, removed: 12, lastTest: 'pass', tools: 31 }),
  },
]

const usage = (secs: number) => ({ tokens: Math.round(secs * 1900), ctxTokens: 30_000 + secs * 260, ctxMax: 1_000_000, cost: secs * 0.0035 })

// Each row draws under its own theme: stage names and the delivery words.
const drawn = rows.map(row => {
  theme = THEMES[row.key]
  STAGES = theme.stages
  VERBS.deliver = theme.deliver
  let r = { ...fresh(row.title, t0, null), ...usage(row.secs) }
  r = row.build(r)
  if (r.status === 'done') r = { ...r, note: `${theme.deliver[0]}: ${receipt(r)} · order #4 today` }
  r = settle(r, t0)
  r = { ...r, prevPos: r.pos, posAt: 0, cheerAt: undefined }
  return trackerSvg(r, W, r.endedAt ?? t0 + row.secs * 1000, [], lims)
})

const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
// Each row's fill clip and its animation are named per row, so rows don't share them.
const own = (svg: string, i: number) =>
  svg
    .replace(/id="fc"/g, `id="fc${i}"`)
    .replace(/url\(#fc\)/g, `url(#fc${i})`)
    .replace(/\.cf\{/g, `.cf${i}{`)
    .replace(/class="cf"/g, `class="cf${i}"`)
    .replace(/@keyframes fill\{/g, `@keyframes fill${i}{`)
    .replace(/animation:fill /g, `animation:fill${i} `)
const dark = (svg: string) =>
  svg.split('.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#e7e5e0}.kr{stroke:#e7e5e0}').join('.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#30302e}.kr{stroke:#3a3a37}')

const fullW = LABEL_W + W + PAD * 2
const fullH = PAD * 2 + rows.length * H + (rows.length - 1) * GAP
const label = (row: Row, y: number) =>
  `<text x="${PAD}" y="${y + 30}" font-family="${FONT}" font-size="19" font-weight="700" fill="#ececec">${row.emoji} ${row.name}</text>` +
  `<text x="${PAD}" y="${y + 52}" font-family="ui-monospace,'SF Mono',Menlo,monospace" font-size="12.5" fill="#8f8f8a">theme: ${row.key}</text>`
const rowsSvg = drawn
  .map((svg, i) => {
    const y = PAD + i * (H + GAP)
    return `${label(rows[i], y)}<g transform="translate(${PAD + LABEL_W},${y})">${inner(own(svg, i))}</g>`
  })
  .join('')
const divider = rows
  .slice(1)
  .map((_, i) => `<line x1="${PAD}" x2="${fullW - PAD}" y1="${PAD + (i + 1) * (H + GAP) - GAP / 2}" y2="${PAD + (i + 1) * (H + GAP) - GAP / 2}" stroke="#2c2c2a"/>`)
  .join('')
const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${fullW}" height="${fullH}" viewBox="0 0 ${fullW} ${fullH}"><rect width="${fullW}" height="${fullH}" rx="14" fill="#1f1f1e"/>${divider}${dark(rowsSvg)}</svg>`
fs.writeFileSync(process.argv[2], out)
console.log(`themes ${fullW}x${fullH}`)
