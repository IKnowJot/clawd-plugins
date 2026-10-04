#!/bin/sh
# Renders docs/clawd-tracker-demo.mp4: the story's frames, drawn by the
# tracker's own code, captured in headless Chromium and encoded with ffmpeg.
# Needs node 22+, ffmpeg and a Playwright install (PLAYWRIGHT_DIR: its node_modules).
set -e
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
work=${TMPDIR:-/tmp}/clawd-video
rm -rf "$work" && mkdir -p "$work/frames"

mod="$repo/plugins/clawd-tracker/hooks/register.tsx"
cut=$(grep -n "^// Terminal: the same tracker" "$mod" | cut -d: -f1)
{
  echo "type Run = any; type Activity = any; type Past = any; type Limit = any"
  echo "const atom = (a: any, _b: any) => a"
  sed -n "3,$((cut - 1))p" "$mod" | grep -v "^import type"
  cat "$here/story.ts"
} > "$work/story.ts"
[ -f "$repo/docs/themes.svg" ] || "$here/gallery.sh" themes
node --experimental-strip-types --no-warnings "$work/story.ts" "$work/story.json" "$repo/docs/themes.svg"

cp "$here/page.html" "$work/page.html"
NODE_PATH="${PLAYWRIGHT_DIR}" node "$here/render.mjs" "$work"

dur=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$work/story.json')).total)")
ding=$(node -e "console.log(Math.round(JSON.parse(require('fs').readFileSync('$work/story.json')).dingAt*1000))")
ffmpeg -y -loglevel error -framerate 30 -i "$work/frames/%05d.jpg" \
  -i "$repo/plugins/clawd-tracker/sounds/ding.wav" \
  -filter_complex "[1:a]adelay=${ding}|${ding},apad,atrim=0:${dur}[a]" \
  -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 160k -movflags +faststart "$repo/docs/clawd-tracker-demo.mp4"
echo "wrote docs/clawd-tracker-demo.mp4"
