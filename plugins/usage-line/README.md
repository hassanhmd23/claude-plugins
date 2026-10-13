# usage-line

A Claude Code mod that pins one status line under the prompt:

```
Opus 5.5 · my-project · main · $1.50 · 12m · ctx ━╸──────── 15% 152k/1000k · 5h ━━━━────── 42% ↻2h10m · 7d ━━──────── 21% ↻3d11h
```

Model · project · git branch · session cost · minutes elapsed · context window fill · 5-hour and 7-day rate limits with time to reset. Fields Claude Code doesn't have (rate limits off a subscription, branch outside git) are left out. It refreshes after each turn, when usage moves, and every minute.

## Install

Type at the prompt of a Claude Code terminal session:

```
/plugin install usage-line --marketplace hassanhmd23/claude-plugins
```

Answer `y` to add the marketplace, then pick a scope.
