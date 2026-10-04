# clawd-plugins

Claude Code mods, starring Clawd.

| Plugin | Type | What it does |
| --- | --- | --- |
| [clawd-tracker](plugins/clawd-tracker) | mod | A Domino's-style order tracker above the prompt. Clawd acts out whatever Claude is doing (reading, cooking up edits, taste-testing, juggling subagents) next to a live ETA, tokens, context and cost. |

## Install

In Claude Code:

```
/plugin marketplace add <github-user>/clawd-plugins
/plugin install clawd-tracker@clawd-plugins
```

Then start a new session. Toggle the tracker any time with `/tracker`.

### From a local clone

```bash
git clone https://github.com/<github-user>/clawd-plugins.git ~/clawd-plugins
```

```bash
claude plugin marketplace add ~/clawd-plugins
```

```bash
claude plugin install clawd-tracker@clawd-plugins
```

Or load it for one session without installing:

```bash
claude --plugin-dir ~/clawd-plugins/plugins/clawd-tracker
```

Mods use Claude Code's function hooks (`hooks/register.tsx`), an early-access API. Tested on Claude Code 2.1.284; a later release may change it.

## Layout

```
.claude-plugin/marketplace.json   the catalog `/plugin marketplace add` reads
plugins/<name>/
  .claude-plugin/plugin.json      manifest
  hooks/hooks.json                points at the hooks module
  hooks/register.tsx              the mod itself
  types/index.d.ts                its state contract
```

Check before publishing: `claude plugin validate plugins/<name>` and `claude plugin validate .`.

## License

MIT. Clawd's pixel body and the drawing approach are adapted from [johnnyvizz/claude-kit](https://github.com/johnnyvizz/claude-kit) (MIT). Clawd and Claude belong to Anthropic; this is an unofficial fan project.
