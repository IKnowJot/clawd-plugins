# Privacy

clawd-tracker runs entirely on your machine.

- **It collects nothing and sends nothing.** No network calls, no analytics, no accounts.
- **It reads no files, environment variables or credentials.** It only sees what Claude Code passes its hooks: the tools Claude calls, token counts, context fill and your plan usage percentages, to draw the band.
- **What it keeps, locally:** whether the band is hidden (this session only), and for your last 60 finished jobs their duration, step count, task count, token count and project folder, to estimate how long jobs take. These stay in Claude Code's own plugin storage on your machine. Uninstalling the plugin removes them.

Questions: [open an issue](https://github.com/IKnowJot/clawd-plugins/issues).
