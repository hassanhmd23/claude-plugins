# usage-line

A Claude Code mod that draws two rows under the prompt, in place of the shortcuts hint:

```
Opus 5.5 (medium) · my-project · main · $2.11 · 23m · [CAVEMAN]
ctx ━╸━━━━━━━━ 12% 116k/1000k · 5h ━╸━━━━━━━━ 10% ↻4h36m · 7d ━━━╸━━━━━━ 36% @Sun 17:00
```

Model and effort · project · git branch · session cost · minutes elapsed · the [caveman](https://github.com/JuliusBrussee/caveman) badge when installed. Then the context window and the 5-hour and 7-day rate limits, each bar green under 50%, yellow under 80%, red above. Fields Claude Code doesn't have (rate limits off a subscription, branch outside git) are left out. It refreshes after each turn, when usage moves, and every minute.

## Install

Type at the prompt of a Claude Code terminal session:

```
/plugin install usage-line --marketplace hassanhmd23/claude-plugins
```

Answer `y` to add the marketplace, then pick a scope.
