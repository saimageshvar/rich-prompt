# rich-prompt

**Make Claude Code's prompt box type like a code editor.**
Lists keep going, indentation sticks, and brackets close themselves.

<p align="center">
  <img src="assets/demo.gif" alt="rich-prompt demo: list continuation, auto-indent and bracket auto-pairing in the Claude Code prompt" width="720">
</p>

It's a Claude Code **mod**: nothing to run or invoke. Once it's installed, the prompt box just behaves better.

---

## What it does

| You type | You get | |
|---|---|---|
| `- buy milk` then <kbd>Shift</kbd>+<kbd>Enter</kbd> | `- buy milk`<br>`- │` | 📝 **Bullets continue** (`-`, `*`, `+`) |
| `1. clone` then <kbd>Shift</kbd>+<kbd>Enter</kbd> | `1. clone`<br>`2. │` | 🔢 **Numbers count up** (`a.` `B.` letters too) |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> on an empty `- ` | the empty bullet disappears | 🛑 **Ends the list** |
| <kbd>Space</kbd> <kbd>Space</kbd> right after an empty marker (`1. │`) | `   a. │` | ⇥ **Sub-indent** without Tab: the child marker follows the parent (`1.` → `a.` → `-`, bullets stay bullets) |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> on an empty `    - ` | one level up: `- │` | ⇤ **Outdents** before ending the list |
| <kbd>Backspace</kbd> right after an empty `- ` / `2. ` | the whole marker goes | ⌫ **Marker backspace** |
| new `2. ` inserted in the middle of `1. 2. 3.` | the items below renumber | 🔢 **Renumbers** |
| `    - nested` then <kbd>Shift</kbd>+<kbd>Enter</kbd> | `    - │` | ↳ **Nesting is kept** |
| `  indented` then <kbd>Shift</kbd>+<kbd>Enter</kbd> | `  │` | ⇥ **Auto-indent** keeps leading whitespace |
| `(`  `[`  `` ` `` | `(│)`  `[│]`  `` `│` `` | 🔗 **Auto-pair** |
| `(` `x` then `)` | `(x)│` | ⏭ **Closer steps over** the auto-inserted one, no `(x))` |
| `(` then <kbd>Backspace</kbd> | *(nothing)* | ⌫ **Backspace deletes both** halves of an empty pair |

`│` is the cursor. <kbd>Shift</kbd>+<kbd>Enter</kbd> means whatever key your terminal uses for a newline in the prompt.

### Things it leaves alone

- Two spaces after an empty marker only nest when there is an item to nest under at the same level; otherwise it is a plain space.
- Text inside <code>```</code> code fences never gets list continuation.
- Paste and selections are never auto-paired.
- `` ` `` only pairs at the start of a word, so ``don`t`` stays intact.
- Brackets only pair when the next character is a space, a closing bracket, or the end of the line. Typing `(` in front of a word won't add a stray `)`.

---

## Install

Needs **Claude Code v2.1.287+**. Mods are on by default.

```sh
npx skills add saimageshvar/rich-prompt -g -a claude-code
```

Drop `-g` to install into the current project only.

<details>
<summary>Manual install (clone + symlink)</summary>

```sh
git clone https://github.com/saimageshvar/rich-prompt ~/rich-prompt
ln -s ~/rich-prompt ~/.claude/skills/rich-prompt   # every session, hot-reloaded
```

</details>

Or try it for one session:

```sh
claude --plugin-dir ~/rich-prompt
```

## How it works

```mermaid
flowchart LR
  K[keystroke] --> H["prompt.edit hook<br/>(hooks/register.tsx)"]
  H -->|newline in a list| L[insert next bullet / number]
  H -->|newline elsewhere| I[copy leading whitespace]
  H -->|"( [ `"| P[insert pair, cursor in the middle]
  H -->|anything else| N[pass through unchanged]
```

All of it is one small `prompt.edit` hook in [`hooks/register.tsx`](hooks/register.tsx).

## Not supported

- **Tab to indent.** Tab never reaches the edit hook.
- **Rendered rich text** (bold, headings). The prompt stays plain text.

## Develop

```sh
claude plugin validate .
claude plugin test .
```

The demo GIF is recorded from a live Claude Code pane using herdr and [agg](https://github.com/asciinema/agg).
[`assets/record.py`](assets/record.py) types each scene one key at a time and snapshots the pane after every key:

```sh
python3 assets/record.py <herdr-pane-id> demo.cast   # pane running `claude --plugin-dir .`
agg --font-size 18 --theme monokai demo.cast assets/demo.gif
```
