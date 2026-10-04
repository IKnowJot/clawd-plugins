// Captures every frame of the story page in headless Chromium.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(join(process.env.NODE_PATH || process.cwd(), 'noop.js'))
const { chromium } = require('playwright')

const work = process.argv[2]
const story = JSON.parse(readFileSync(join(work, 'story.json'), 'utf8'))

// The installed Chrome, else Playwright's own Chromium.
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' })
await page.goto('file://' + join(work, 'page.html'))
await page.evaluate(s => window.load(s), story)

const n = story.frames.length
for (let i = 0; i < n; i++) {
  await page.evaluate(i => window.frame(i), i)
  await page.screenshot({ path: join(work, 'frames', String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 })
  if (i % 150 === 0) console.log(`frame ${i}/${n}`)
}
await browser.close()
