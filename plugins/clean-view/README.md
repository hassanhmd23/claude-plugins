# clean-view

A Claude Code mod that makes Claude calm and friendly to watch. While Claude works, it hides tool calls, file diffs and command output. In their place, one plain checklist sits above the prompt:

```
Build my landing page · 1m 12s                     [ ● Clean View: ON ]
✓ Read your brand notes            ██████████  Done
▶ Build the pricing section        ██████░░░░  60%
○ Add the contact form             ░░░░░░░░░░  Next
○ Polish the footer                ░░░░░░░░░░  Up next
```

The header says **Needs you** when Claude waits for your OK or your reply, **Stuck** when something goes wrong, **Stopped** after Esc, and **All done** when the job finishes.

Turn it on or off with the button at the right of the band, or type `/simple on`, `/simple off` or `/simple`. Your choice is remembered.

## Install

Type at the prompt of a Claude Code terminal session:

```
/plugin install clean-view --marketplace hassanhmd23/claude-plugins
```

Answer `y` to add the marketplace, then pick a scope.
