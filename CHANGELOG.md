# Changelog

## clawd-tracker 0.3.0

- **Receipt**: the delivery line sums up the job: files touched, lines in and out, how the last check went, steps and today's order number.
- **Waiting on you**: the band turns amber and counts up while Claude waits for your answer or your OK on a step.
- **Helpers**: a mini Clawd per subagent, in the costume of what it's doing.
- **Delivery ding** for jobs of 20 seconds or more (`sound` setting).
- **Themes**: `pizza`, `coffee`, `rocket` and `construction` (`theme` setting).
- **`/tracker stats`**: today's orders, time, steps, tokens and the longest job.
- **Context warning**: ctx turns amber at 80% and red at 90%, with a one-time tip at 85%.
- **Per-project ETA**: estimates prefer the current project's history once it has a few jobs.

## clawd-tracker 0.2.0

- Progress moves only on real events: the task list, or the furthest stage reached. The stage being worked on pulses.
- ETA from this run's pace per task, or from past jobs that got this far; job size label.
- Thought bubble between actions, a hop and sparkles on each stage up, and a reaction when a step fails.
- 5-hour and weekly plan usage, with a heads-up at 90% (`showCost` and `showPlanUsage` settings).
- Fixed: the terminal drew only the close button.
- Tests for the desktop and terminal surfaces.

## clawd-tracker 0.1.0

- First release: the five-stage tracker with 20 Clawd costumes, ETA, tokens, context and cost.
