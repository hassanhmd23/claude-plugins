# claude-plugins

Claude Code mods. Install one by typing at the prompt of a Claude Code terminal session:

```
/plugin install <plugin> --marketplace hassanhmd23/claude-plugins
```

Answer `y` to add the marketplace, then pick a scope.

To get updates automatically, run `/plugin`, open **Marketplaces**, select `hassanhammoud-plugins` and choose **Enable auto-update**. Otherwise update with `claude plugin update <plugin>@hassanhammoud-plugins`.

| Plugin | What it does |
| --- | --- |
| [usage-line](plugins/usage-line) | Two-line status under the prompt: model, project, branch, cost, context and 5h/7d rate-limit bars |
