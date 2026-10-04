# clawd-plugins

Claude Code mods, starring Clawd.

![Clawd tracking a whole order, from ticket to delivery](docs/demo.svg)

| Plugin | Type | What it does |
| --- | --- | --- |
| [clawd-tracker](plugins/clawd-tracker) | mod | A Domino's-style order tracker above the prompt. Clawd acts out whatever Claude is doing (reading, cooking up edits, taste-testing, juggling subagents) next to an honest progress bar, a learned ETA, a delivery receipt and ding, helper Clawds for subagents, plan usage and four themes. |

## Setup

Mods use Claude Code's **function hooks**, an early-access feature that is off by default. Turn it on once by adding this to `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
  }
}
```

If the file already has content, add the `"env"` block next to what's there rather than replacing it.

## Install

In Claude Code:

```
/plugin marketplace add ikjot23/clawd-plugins
/plugin install clawd-tracker@clawd-plugins
```

Or from a terminal:

```bash
claude plugin marketplace add ikjot23/clawd-plugins
```

```bash
claude plugin install clawd-tracker@clawd-plugins
```

Then restart Claude Code (in the desktop app, quit with Cmd+Q and reopen) and send any prompt. Toggle the tracker any time with `/tracker`.

To try it for one session without installing, from a clone:

```bash
claude --plugin-dir ./plugins/clawd-tracker
```

Works in the Claude desktop app's Code tab and in the terminal. Tested on Claude Code 2.1.284 and 2.1.286; function hooks are early-access, so a later release may change them.

## Layout

```
.claude-plugin/marketplace.json   the catalog `/plugin marketplace add` reads
plugins/<name>/
  .claude-plugin/plugin.json      manifest
  hooks/hooks.json                points at the hooks module
  hooks/register.tsx              the mod itself
  types/index.d.ts                its state contract
  sounds/                         the delivery ding (synthesized, rights-free)
  tests/*.test.ts                 run with `claude plugin test`
docs/                             preview images
CHANGELOG.md                      what changed in each version
```

Check before publishing:

```bash
claude plugin validate plugins/clawd-tracker
```

```bash
claude plugin test plugins/clawd-tracker
```

## License

MIT. Clawd's pixel body and the drawing approach are adapted from [johnnyvizz/claude-kit](https://github.com/johnnyvizz/claude-kit) (MIT). Clawd and Claude belong to Anthropic; this is an unofficial fan project.
