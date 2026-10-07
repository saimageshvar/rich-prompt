# rich-prompt

A Claude Code mod that gives the prompt box editor-like behaviour.

- **Lists:** Shift+Enter (or your terminal's newline key) after `- item`, `* item` or `1. item` starts the next item; numbers increment; Enter on an empty item ends the list. Not applied inside ``` fences.
- **Auto-indent:** a new line keeps the previous line's leading whitespace.
- **Auto-pair:** `(`, `[` and `` ` `` insert their closer; typing the closer steps over it; Backspace inside an empty pair removes both. Backquote pairs only at the start of a word; nothing pairs on paste or over a selection.

Not supported: Tab indent (Tab never reaches the edit hook), rendered rich text.

## Install

Needs a Claude Code build with mods and `"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"` in the `env` block of `~/.claude/settings.json`.

```sh
git clone https://github.com/saimageshvar/rich-prompt ~/rich-prompt
ln -s ~/rich-prompt ~/.claude/skills/rich-prompt   # every session, hot-reloaded
# or one-off: claude --plugin-dir ~/rich-prompt
```

## Develop

```sh
claude plugin validate .
claude plugin test .
```
