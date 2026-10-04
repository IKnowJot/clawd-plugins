# clawd-tracker

Your Claude Code task, tracked like a pizza order.

A bar above the prompt walks through five stages, **Reading → Prepping → Cooking → Taste test → Delivered**, while Clawd acts out exactly what Claude is doing right now. Underneath: the current step, a live ETA, elapsed time, tokens, context fill and estimated cost.

## Clawd's 20 costumes

| Claude is… | Clawd… | Stage |
| --- | --- | --- |
| Starting your request | holds up the order ticket | Reading |
| Reading a file | puts on reading glasses, turns the pages | Reading |
| Searching code (`Grep`) | sweeps a detective's magnifier | Reading |
| Listing files (`Glob`) | ties on a bandana, scans with a spyglass | Reading |
| On the web / in a browser | rides a surfboard | Reading |
| Writing a task list or plan | scribbles on a clipboard | Prepping |
| Thinking | gets a thought bubble | (stays put) |
| Editing code | flips an omelette in a chef's hat | Cooking |
| Creating a file | swings a hammer in a hard hat | Cooking |
| Editing CSS / SVG | paints in a beret, the brush changes color | Cooking |
| Editing docs (`.md`, `.txt`) | writes with a quill | Cooking |
| Editing config / other tools | turns a wrench, a gear spins | Cooking |
| Installing packages | hauls a parcel on its head | Cooking |
| Running subagents | juggles | Cooking |
| Running tests, builds, linters | swirls a bubbling flask in lab goggles | Taste test |
| Running other commands | types on a tiny laptop | Taste test |
| Using git / gh | delivers a stamped envelope in a mail cap | Taste test |
| Asking you a question | holds up a "?" sign | (stays put) |
| Done | party hat, confetti, pizza box | Delivered |
| Interrupted | drops the pizza | Stopped |

Each activity has a few verbs that rotate ("Simmering ThemeToggle.tsx", "Seasoning api.ts"), so the line never reads the same twice.

## The ETA

Claude Code doesn't know how long a task will take, so nothing can count down exactly. Once Claude writes a task list (`TodoWrite` or the task tools), the tracker times the finished tasks and projects the rest: "3/5 tasks · About 2 min left". Before that it says "Estimating…".

## Usage numbers

- **tok**: tokens used this run, including subagents.
- **ctx**: how full the main context window is.
- **≈$**: an estimate at API list prices. On a Pro or Max plan you aren't billed per token, so treat it as a sense of scale.

## Commands

- `/tracker`: show or hide the tracker. The ✕ on the bar hides it too; `/tracker` brings it back.

Works in the desktop app (animated SVG) and in the terminal (text version with an emoji per activity).
