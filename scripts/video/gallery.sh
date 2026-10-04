#!/bin/sh
# Renders docs/<name>.svg and docs/<name>.png from scripts/video/<name>.ts:
# `gallery` (one row per Clawd costume) or `themes` (one row per theme), drawn
# by the tracker's own code. Needs node 22+ and, for the PNG, a Playwright
# install (PLAYWRIGHT_DIR: its node_modules).
set -e
name=${1:-gallery}
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
work=${TMPDIR:-/tmp}/clawd-$name
mkdir -p "$work"
mod="$repo/plugins/clawd-tracker/hooks/register.tsx"
cut=$(grep -n "^// Terminal: the same tracker" "$mod" | cut -d: -f1)
{
  echo "type Run = any; type Activity = any; type Past = any; type Limit = any"
  echo "const atom = (a: any, _b: any) => a"
  sed -n "3,$((cut - 1))p" "$mod" | grep -v "^import type"
  cat "$here/$name.ts"
} > "$work/$name.ts"
node --experimental-strip-types --no-warnings "$work/$name.ts" "$repo/docs/$name.svg"
NODE_PATH="${PLAYWRIGHT_DIR}" node -e "
const { createRequire } = require('module')
const r = createRequire(require('path').join(process.env.NODE_PATH, 'x.js'))
const { chromium } = r('playwright')
;(async () => {
  const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
  const p = await b.newPage({ deviceScaleFactor: 2, colorScheme: 'dark', viewport: { width: 1200, height: 900 } })
  await p.goto('file://$repo/docs/$name.svg')
  await p.locator('svg').first().screenshot({ path: '$repo/docs/$name.png', omitBackground: true })
  await b.close()
})()
"
echo "wrote docs/$name.svg and docs/$name.png"
