# Privacy

clawd-tracker and clawd-arcade run entirely on your machine.

## clawd-tracker

- **It collects nothing and sends nothing.** No network calls, no analytics, no accounts.
- **It reads no files, environment variables or credentials.** It only sees what Claude Code passes its hooks: the tools Claude calls, token counts, context fill and your plan usage percentages, to draw the band.
- **What it keeps, locally:** whether the band is hidden (this session only), and for your last 60 finished jobs their duration, step count, task count, token count and project folder, to estimate how long jobs take. These stay in Claude Code's own plugin storage on your machine. Uninstalling the plugin removes them.

## clawd-arcade

- **It collects nothing and sends nothing.** It sees whether Claude is working, done or waiting on you, to pause the game and show banners.
- **What it keeps, locally:** your best score per game, in Claude Code's own plugin storage. Uninstalling the plugin removes it.

Questions: [open an issue](https://github.com/IKnowJot/clawd-plugins/issues).
