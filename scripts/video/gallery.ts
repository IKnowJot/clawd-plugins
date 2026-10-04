// A gallery of the tracker mid-job: one row per Clawd costume, all the same
// width so the bars line up. Drawn by the tracker's own code (prepended by
// gallery.sh). Writes docs/gallery.svg; gallery.sh also renders a PNG.

import * as fs from 'fs'

const W = 900
const t0 = 1_000_000
const GAP = 22
const PAD = 26

const lims = (h5: number, wk: number) => [
  { kind: 'five_hour', percentUsed: h5 },
  { kind: 'seven_day', percentUsed: wk },
]
const todos = (n: number, done: number) => Array.from({ length: n }, (_, i) => ({ status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending' }))

type Row = { title: string; build: (r: any) => any; lims: { kind: string; percentUsed: number }[]; secs: number }
const rows: Row[] = [
  { title: 'Find where the old logo is used', secs: 14, lims: lims(8, 22), build: r => ({ ...r, activity: 'read', note: 'Studying Header.tsx', tools: 2 }) },
  { title: 'Track down the flaky login test', secs: 31, lims: lims(9, 22), build: r => ({ ...r, activity: 'search', note: 'Sniffing out "retryLogin"', tools: 5 }) },
  { title: 'Plan the dark mode rollout', secs: 48, lims: lims(11, 23), build: r => ({ ...r, activity: 'plan', note: 'Sketching the steps', tools: 6, stage: 1, reached: 1 }) },
  { title: 'Refactor the checkout flow', secs: 95, lims: lims(17, 25), build: r => trackTasks({ ...r, activity: 'cook', note: 'Simmering Checkout.tsx', tools: 14, stage: 2, reached: 2 }, 'TodoWrite', { todos: todos(5, 2) }, t0) },
  { title: 'Restyle the landing page', secs: 72, lims: lims(21, 26), build: r => ({ ...r, activity: 'paint', note: 'Styling theme.css', tools: 11, stage: 2, reached: 2 }) },
  { title: 'Research three payment providers', secs: 64, lims: lims(29, 31), build: r => ({ ...r, activity: 'juggle', note: 'Juggling 3 helpers', tools: 9, stage: 2, reached: 2, agents: { a: 'web', b: 'read', c: 'search' } }) },
  { title: 'Ship the 2.0 release', secs: 158, lims: lims(46, 78), build: r => trackTasks({ ...r, activity: 'test', note: 'Taste-testing npm test', tools: 27, stage: 3, reached: 3 }, 'TodoWrite', { todos: todos(5, 4) }, t0) },
  { title: 'Deploy to production', secs: 121, lims: lims(58, 93), build: r => ({ ...r, activity: 'terminal', note: 'Running npm run deploy', tools: 19, stage: 3, reached: 3, waitingSince: t0 + 118_000, waitingFor: 'your OK on Bash' }) },
  {
    title: 'Swap the old logo for the new one everywhere',
    secs: 252,
    lims: lims(42, 18),
    build: r => ({ ...r, status: 'done', endedAt: t0 + 252_000, stage: DELIVERED, reached: DELIVERED, activity: 'deliver', files: ['a', 'b', 'c'], added: 42, removed: 10, lastTest: 'pass', tools: 23, note: '' }),
  },
]

const usage = (secs: number) => ({ tokens: Math.round(secs * 1900), ctxTokens: 30_000 + secs * 260, ctxMax: 1_000_000, cost: secs * 0.0035 })

const drawn = rows.map(row => {
  let r = { ...fresh(row.title, t0, null), ...usage(row.secs) }
  r = row.build(r)
  if (r.status === 'done') r = { ...r, note: `Delivered: ${receipt(r)} · order #3 today` }
  r = settle(r, t0)
  r = { ...r, prevPos: r.pos, posAt: 0, cheerAt: undefined }
  const at = r.endedAt ?? t0 + row.secs * 1000
  return trackerSvg(r, W, at, [], row.lims)
})

const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
const fullW = W + PAD * 2
const fullH = PAD * 2 + rows.length * H + (rows.length - 1) * GAP
// Dark only: the tracker's colors resolve as they do in dark mode.
const dark = (svg: string) =>
  svg.split('.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#e7e5e0}.kr{stroke:#e7e5e0}').join('.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#30302e}.kr{stroke:#3a3a37}')
// Each row's fill clip and its animation are named per row, so rows don't share them.
const own = (svg: string, i: number) =>
  svg
    .replace(/id="fc"/g, `id="fc${i}"`)
    .replace(/url\(#fc\)/g, `url(#fc${i})`)
    .replace(/\.cf\{/g, `.cf${i}{`)
    .replace(/class="cf"/g, `class="cf${i}"`)
    .replace(/@keyframes fill\{/g, `@keyframes fill${i}{`)
    .replace(/animation:fill /g, `animation:fill${i} `)
const rowsSvg = drawn.map((svg, i) => `<g transform="translate(${PAD},${PAD + i * (H + GAP)})">${inner(own(svg, i))}</g>`).join('')
const gallery = `<svg xmlns="http://www.w3.org/2000/svg" width="${fullW}" height="${fullH}" viewBox="0 0 ${fullW} ${fullH}"><rect width="${fullW}" height="${fullH}" rx="14" fill="#1f1f1e"/>${dark(rowsSvg)}</svg>`
fs.writeFileSync(process.argv[2], gallery)
console.log(`gallery ${fullW}x${fullH}, ${rows.length} rows`)
