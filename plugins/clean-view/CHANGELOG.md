# Changelog

## v0.1.0 - 2026-10-13

First release.

- While Claude works, tool calls, file diffs and command output are hidden. A plain checklist above the prompt shows the job name, the time it has been running, each step with a progress meter, and Done, Next and Up next labels.
- The header changes to **Needs you** for a permission prompt, a question or a reply Claude is waiting for. It shows **Stuck** for a refused step, repeated failures, API errors and refusals, **Stopped** after Esc, and **All done**, which shrinks to one line after 5 seconds.
- Claude lays out a plan first through the `plan_steps` tool and reports progress with `report_progress`. It can also use its to-do list as the plan. Every step name is cleaned into plain English.
- Turn it on or off with the button in the band or `/simple on|off`. The choice is remembered across restarts.
- The checklist is shared state, under `clean-view`, so other mods can read it.
