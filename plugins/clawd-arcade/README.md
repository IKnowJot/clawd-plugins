# clawd-arcade

Clawd-themed games in a side pane, to play while Claude works.

## Games

- **🐛 Clawd Conga**: Clawd leads a conga line of mini Clawds around the board, squashing bugs. Every bug adds a dancer and quickens the beat. Hit a wall or the line and the conga trips.
- **🎩 Hat Trick**: Clawd hides under one of his chef hats, the hats shuffle, and you pick the one he's under. Every round shuffles more and faster, and every second round adds a hat, up to six.
- More on the way: **Clawd Stacks** and **Flappy Clawd**.

## Playing

- `/arcade` opens the pane next to your chat, with a menu of games. **← Games** goes back to it.
- **Click the game** to give it the keyboard. **Esc** hands the keyboard back to your prompt.
- **Clawd Conga**: steer with the arrow keys or WASD. Space pauses, R restarts.
- **Hat Trick**: Space starts. When the shuffle stops, pick a hat with ← → and Enter, a number key, or a click.

## It keeps an eye on Claude

- **Claude needs you** (a question, or a step waiting for your OK): the round pauses straight away and says so. Answer, click back into the game and press Space.
- **Claude finishes**: a "Claude is done!" banner slides in. Finish your round or hop back.
- The line above the game always says what Claude is up to.

Works in the Claude desktop app's Code tab and in the terminal (not in VS Code or on mobile, which can't host interactive panes).

## What it hooks

It only watches; it never blocks, rewrites or answers anything.

| Event | What the arcade does with it |
| --- | --- |
| `session.start` | Registers `/arcade` and loads your best scores |
| `command.run` (`/arcade`) | Opens the pane |
| `turn.start` / `turn.complete` | Notes that Claude is working, or done (for the banner) |
| `tool.call` | Notes when Claude is waiting on you: a question, or a step that will stop for your OK (asked read-only of Claude Code's permission rules; it never makes or changes that decision) |
| `ui.message` | Receives a finished round's score from the game and keeps your best |
| `ui.render` (`Pane`) | Draws the pane and the game |

Your best score per game is kept on your machine. Nothing is sent anywhere.

## Development

```bash
claude plugin validate plugins/clawd-arcade
claude plugin test plugins/clawd-arcade
```
