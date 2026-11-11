import { atom, read, update } from 'claude-code'
import type { PromptEditInput, PromptEditResult, Register } from 'claude-code'

import type { Settings } from '../types'

// Editor behaviours that predate the settings pane stay on; the mobile-keyboard ones are opt-in.
export const DEFAULTS: Settings = {
  lists: true,
  indent: true,
  pairs: true,
  capitalize: false,
  capitalizeI: false,
  spaceAfterPunct: false,
  doubleSpacePeriod: false,
  trimSpaceBeforePunct: false,
  autocomplete: false,
}

const GROUPS: { title: string; items: { key: keyof Settings; label: string; hint: string }[] }[] = [
  {
    title: 'Editor',
    items: [
      { key: 'lists', label: 'Lists', hint: 'Continue, nest, renumber and end bullets and numbers' },
      { key: 'indent', label: 'Auto-indent', hint: 'New lines keep the leading whitespace' },
      { key: 'pairs', label: 'Auto-pair', hint: '( [ ` close themselves and step over' },
    ],
  },
  {
    title: 'Smart keyboard',
    items: [
      { key: 'capitalize', label: 'Capitalize sentences', hint: 'First letter of a sentence or line' },
      { key: 'capitalizeI', label: 'Capitalize "i"', hint: 'i, i\'m, i\'ll become I' },
      { key: 'spaceAfterPunct', label: 'Space after punctuation', hint: 'a,b becomes a, b (, ; ! ?)' },
      { key: 'doubleSpacePeriod', label: 'Double space adds a period', hint: 'word␣␣ becomes word. ' },
      { key: 'trimSpaceBeforePunct', label: 'No space before punctuation', hint: 'word , becomes word,' },
      { key: 'autocomplete', label: 'Word autocomplete', hint: 'Suggest words above the box; learns from your prompts, stored locally' },
    ],
  },
]

const PANE = 'rich-prompt-settings'
const settingsAtom = atom({ plugin: 'rich-prompt', key: 'settings' } as const, DEFAULTS, { shape: 'settings-1' })
let current: Settings = DEFAULTS
let words: Record<string, number> = {}
// Rows only follow typing, never cursor moves or recalls, so arrowing through text stays quiet
let typing = false
let offered: { text: string; cursor: number }[] = []
let dict: string[] | undefined
const WORDS = /[\p{L}][\p{L}'’-]{3,}/gu

export const suggest = (token: string, text: string, learned: Record<string, number>, dictionary: string[], max = 5) => {
  const lower = token.toLowerCase()
  const own = { ...learned }
  for (const w of text.toLowerCase().match(WORDS) ?? []) own[w] = (own[w] ?? 0) + 1
  const out: string[] = []
  const add = (w: string) => w !== lower && !out.includes(w) && out.push(w)
  Object.keys(own)
    .filter(w => w.startsWith(lower))
    .sort((a, b) => own[b] - own[a] || a.length - b.length)
    .slice(0, max)
    .forEach(add)
  for (let i = 0; out.length < max && i < dictionary.length; i++) if (dictionary[i].startsWith(lower)) add(dictionary[i])
  const caps = token[0] !== lower[0]
  return out.slice(0, max).map(w => (caps ? w[0].toUpperCase() + w.slice(1) : w))
}

const learn = (text: string) => {
  for (const w of text.toLowerCase().match(WORDS) ?? []) words[w] = (words[w] ?? 0) + 1
}

const WORD = /[\p{L}\p{N})\]"'’]/u
const SENT = /[.!?]["')\]]*\s+$/
const ABBR = /\b(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|no)\.\s+$/i
const PLAIN = /^[\p{L}\p{N}'’"\-,;!?]+$/u
const AFTER_I = /[\s(\["'“]/
const I_TRIGGERS = [' ', ',', '!', '?', ';', "'", '’']

const lineStartOf = (t: string, at: number) => (at === 0 ? 0 : t.lastIndexOf('\n', at - 1) + 1)

const inCode = (before: string) => {
  const ls = lineStartOf(before, before.length)
  return (before.slice(0, ls).match(FENCE)?.length ?? 0) % 2 === 1 || (before.slice(ls).match(/`/g)?.length ?? 0) % 2 === 1
}

const startsSentence = (before: string) => {
  const ls = lineStartOf(before, before.length)
  const line = before.slice(ls)
  const body = line.replace(/^\s*(?:(?:[-*+]|\d+\.|[A-Za-z]\.)\s+)?/, '')
  if (body) return SENT.test(body) && !ABBR.test(body)
  return true
}

const smart = (e: PromptEditInput, s: Settings): PromptEditInput | { text: string; cursor: number } | undefined => {
  const t = e.inputText
  const i = e.start
  const prev = e.text[i - 1]
  const before = e.text.slice(0, i)
  if (inCode(before)) return
  const loneI = prev === 'i' && (i < 2 || AFTER_I.test(e.text[i - 2]))
  const swapI = { ...e, text: before.slice(0, -1) + 'I' + e.text.slice(i) }

  if (t === ' ') {
    const next_ = e.text[i]
    if (s.doubleSpacePeriod && prev === ' ' && WORD.test(e.text[i - 2] ?? '') && (next_ === undefined || /\s/.test(next_))) {
      return { text: before.slice(0, -1) + '. ' + e.text.slice(i), cursor: i + 1 }
    }
    if (s.capitalizeI && loneI) return swapI
    return
  }

  if (s.capitalizeI && loneI && I_TRIGGERS.includes(t)) return swapI

  if (s.trimSpaceBeforePunct && ',;!?'.includes(t) && prev === ' ' && WORD.test(e.text[i - 2] ?? '')) {
    return { text: before.slice(0, -1) + t + e.text.slice(e.end), cursor: i }
  }

  if (/^\p{L}$/u.test(t)) {
    const tok = before.slice(Math.max(before.lastIndexOf(' '), before.lastIndexOf('\n')) + 1)
    const spaced = s.spaceAfterPunct && !!prev && ',;!?'.includes(prev) && tok.length > 1 && PLAIN.test(tok) && WORD.test(e.text[i - 2] ?? '')
    const lead = spaced ? ' ' : ''
    const up = s.capitalize && /^\p{Ll}$/u.test(t) && startsSentence(before + lead) ? t.toUpperCase() : t
    if (lead || up !== t) return { ...e, inputText: lead + up }
  }
}

const ITEM = /^(\s*)(?:([-*+])|(\d+|[A-Za-z])\.)\s+/
const PAIRS: Record<string, string> = { '(': ')', '[': ']', '`': '`' }
const BEFORE_OPENER = /[\s(\[{]/
const BEFORE_CLOSER = /[\s)\]}]/
const FENCE = /^\s*```/gm

type Next = (e: PromptEditInput) => Promise<PromptEditResult>
type Armed = { ats: number[]; len: number }
type Spaced = { at: number; len: number }

const isBlank = (s: string) => s.trim() === ''

const succ = (label: string, by = 1) => {
  if (/\d/.test(label)) return String(Number(label) + by)
  const c = label.charCodeAt(0) + by
  return c <= (label < 'a' ? 90 : 122) ? String.fromCharCode(c) : undefined
}

const nextMarker = (m: RegExpExecArray) => {
  const label = m[3] && succ(m[3])
  return m[2] ?? (label ? `${label}.` : '-')
}

const parentItem = (text: string, lineStart: number, indent: number) => {
  for (let end = lineStart - 1; end >= 0; ) {
    const start = text.lastIndexOf('\n', end - 1) + 1
    const line = text.slice(start, end)
    if (isBlank(line)) return undefined
    const m = ITEM.exec(line)
    if (m && m[1].length < indent) return m
    end = start - 1
  }
}

const renumberFrom = (text: string, at: number, indent: number, first: string | undefined) => {
  let label = first
  if (at < 0) return text
  const lines = text.slice(at).split('\n')
  for (let i = 0; i < lines.length && label; i++) {
    const m = ITEM.exec(lines[i])
    const depth = /^\s*/.exec(lines[i])![0].length
    if (isBlank(lines[i]) || depth < indent) break
    if (depth > indent) continue
    if (!m?.[3]) break
    lines[i] = lines[i].replace(/^(\s*)(\d+|[A-Za-z])/, `$1${label}`)
    label = succ(label)
  }
  return text.slice(0, at) + lines.join('\n')
}

const nestUnder = (text: string, lineStart: number, indent: number) => {
  let sibling: RegExpExecArray | undefined
  for (let end = lineStart - 1; end >= 0; ) {
    const start = text.lastIndexOf('\n', end - 1) + 1
    const line = text.slice(start, end)
    if (isBlank(line)) return undefined
    const m = ITEM.exec(line)
    if (m && m[1].length <= indent) return m[1].length === indent ? { anchor: m, sibling } : undefined
    if (m && (!sibling || m[1].length < sibling[1].length)) sibling = m
    end = start - 1
  }
}

const BULLET_CHILD: Record<string, string> = { '-': '*', '*': '+', '+': '-' }
const childMarker = (m: RegExpExecArray) => (m[2] ? BULLET_CHILD[m[2]] : /\d/.test(m[3]) ? 'a.' : '-')

const lineEnd = (text: string, from: number) => {
  const i = text.indexOf('\n', from)
  return i < 0 ? -1 : i + 1
}

const outdent = (e: PromptEditInput, lineStart: number, m: RegExpExecArray) => {
  const parent = parentItem(e.text, lineStart, m[1].length)
  const indent = parent?.[1] ?? ''
  const marker = parent ? nextMarker(parent) : (m[2] ?? '1.')
  const prefix = `${indent}${marker} `
  const text = e.text.slice(0, lineStart) + prefix + e.text.slice(e.end)
  const out = marker.endsWith('.')
    ? renumberFrom(text, lineEnd(text, lineStart), indent.length, succ(marker.slice(0, -1)))
    : text
  return { text: out, cursor: lineStart + prefix.length }
}

const listPrefixAt = (e: PromptEditInput, upto = e.start) => {
  const lineStart = e.text.lastIndexOf('\n', e.start - 1) + 1
  const before = e.text.slice(lineStart, upto)
  if (isBlank(before)) return { lineStart }
  const inFence = (e.text.slice(0, lineStart).match(FENCE)?.length ?? 0) % 2 === 1
  const m = inFence ? null : ITEM.exec(before)
  return { lineStart, before, m }
}

export const createEditor = (settings: () => Settings) => {
  let armed: Armed | undefined
  let spaced: Spaced | undefined

  const edit = async (e: PromptEditInput, next: Next, ats: number[], spaced: boolean) => {
    const s = settings()
    const typed = e.inputText
    const isInsert = e.start === e.end && typed.length === 1 && (e.key?.key === typed || (typed === ' ' && e.key?.key === 'space'))
    const listPrefix = (e: PromptEditInput, upto?: number) => {
      const p = listPrefixAt(e, upto)
      return s.lists ? p : { ...p, m: undefined }
    }

    if (typed === '\n') {
      const { lineStart, before, m } = listPrefix(e)
      const rest = e.text.slice(e.end, (e.text.indexOf('\n', e.end) + 1 || e.text.length + 1) - 1)
      if (before !== undefined) {
        if (m && before.length === m[0].length && isBlank(rest)) {
          if (m[1]) return { r: outdent(e, lineStart, m), ats }
          return { r: { text: e.text.slice(0, lineStart) + e.text.slice(e.end), cursor: lineStart }, ats }
        }
        const lead = m ? (m[2] || succ(m[3]) ? `${m[1]}${nextMarker(m)} ` : m[1]) : s.indent ? /^\s*/.exec(before)![0] : ''
        if (lead) {
          const r = await next({ ...e, inputText: '\n' + lead })
          if (!m?.[3]) return { r, ats }
          const text = renumberFrom(r.text, lineEnd(r.text, r.cursor), m[1].length, succ(m[3], 2))
          return { r: { ...r, text }, ats }
        }
      }
      return { r: await next(e), ats }
    }

    if (typed === '' && e.end - e.start === 1 && e.key?.key === 'backspace') {
      const { lineStart, before, m } = listPrefix(e, e.end)
      if (m && m[0].length === before!.length && isBlank(e.text.slice(e.end, e.text.indexOf('\n', e.end) + 1 || undefined))) {
        if (m[1]) return { r: outdent(e, lineStart, m), ats }
        return { r: await next({ ...e, start: lineStart }), ats }
      }
    }

    if (isInsert && typed === ' ') {
      const withSpace = { ...e, text: e.text.slice(0, e.start) + ' ' + e.text.slice(e.start) }
      const after = listPrefix(withSpace, e.start + 1)
      const emptyAfter = after.m && after.before!.length === after.m[0].length && isBlank(e.text.slice(e.end, (e.text.indexOf('\n', e.end) + 1 || e.text.length + 1) - 1))
      if (emptyAfter) {
        const { lineStart, m } = after
        const target = spaced ? nestUnder(e.text, lineStart, m![1].length) : undefined
        if (target) {
          const { anchor, sibling } = target
          const indent = sibling ? sibling[1] : ' '.repeat(anchor[0].length)
          const marker = sibling ? nextMarker(sibling) : childMarker(anchor)
          const prefix = `${indent}${marker} `
          let text = e.text.slice(0, lineStart) + prefix + e.text.slice(e.end)
          if (m![3]) text = renumberFrom(text, lineEnd(text, lineStart), m![1].length, m![3])
          if (marker.endsWith('.')) text = renumberFrom(text, lineEnd(text, lineStart), indent.length, succ(marker.slice(0, -1)))
          return { r: { text, cursor: lineStart + prefix.length }, ats }
        }
        return { r: await next(e), ats, spaced: !spaced }
      }
    }

    if (ats.includes(e.end)) {
      const rest = ats.filter(at => at !== e.end)
      const dropCloser = { ...e, text: e.text.slice(0, e.end) + e.text.slice(e.end + 1) }
      if (isInsert && e.text[e.end] === typed) return { r: await next(dropCloser), ats: rest }
      if (typed === '' && e.end - e.start === 1 && PAIRS[e.text[e.start]] === e.text[e.end]) {
        return { r: await next(dropCloser), ats: rest }
      }
    }

    const closer = PAIRS[typed]
    if (s.pairs && isInsert && closer) {
      const prev = e.text[e.start - 1]
      const next_ = e.text[e.start]
      const okBefore = typed !== '`' || prev === undefined || BEFORE_OPENER.test(prev)
      const okAfter = next_ === undefined || BEFORE_CLOSER.test(next_)
      if (okBefore && okAfter) {
        const r = await next({ ...e, inputText: typed + closer })
        return { r: { ...r, cursor: r.cursor - 1 }, ats, added: e.start + 1 }
      }
    }

    const out = isInsert ? smart(e, s) : undefined
    if (out) return { r: 'inputText' in out ? await next(out) : out, ats }

    return { r: await next(e), ats }
  }

  return async (e: PromptEditInput, next: Next): Promise<PromptEditResult> => {
    const live = armed && armed.len === e.text.length ? armed.ats : []
    const wasSpaced = spaced?.len === e.text.length && spaced.at === e.start
    armed = undefined
    spaced = undefined
    const { r, ats, added, spaced: pressed } = await edit(e, next, live, wasSpaced)
    if (pressed) spaced = { at: r.cursor, len: r.text.length }
    // Closers we inserted stay type-over-able while edits happen before them; leaving the pair forgets them
    const delta = r.text.length - e.text.length
    const kept = ats.filter(at => at >= e.end).map(at => at + delta)
    if (added !== undefined) kept.push(added)
    if (kept.length) armed = { ats: kept, len: r.text.length }
    return r
  }
}

export const register: Register = on => {
  const edit = createEditor(() => current)
  on('prompt.edit', ($, e, next) => {
    typing = e.inputText !== '' || e.end > e.start
    return edit(e, next)
  })

  on('prompt.change', async ($, e, next) => {
    const taken = e.origin.kind === 'engine' && offered.some(o => o.text === e.text && o.cursor === e.cursor)
    typing = false
    offered = []
    if (taken && current.autocomplete) {
      const after = e.text[e.cursor]
      if (after === ' ') await $.prompt.fill({ text: '', mode: 'insert', cursor: e.cursor + 1 })
      else if (after === undefined) await $.prompt.fill({ text: ' ', mode: 'insert' })
    }
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('settings')
    current = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) }
    const known = await $.store.get('words')
    words = known && typeof known === 'object' ? (known as Record<string, number>) : {}
    await update($, settingsAtom, () => current)
    $.ui.status(undefined)
    await $.command
      .register({ name: 'rich-prompt', description: 'Rich prompt: `settings` opens the settings pane' })
      .catch(() => undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!current.autocomplete) return next(e)
    learn(e.text)
    const top = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 5000)
    words = Object.fromEntries(top)
    await $.store.set('words', words)
    return next(e)
  })

  on('prompt.autocomplete', async ($, e, next) => {
    const base = await next(e)
    const atWordEnd = e.text[e.cursor] === undefined || /[\s.,;:!?)\]}'"`]/.test(e.text[e.cursor])
    if (!current.autocomplete || !typing || !atWordEnd || e.token.length < 3 || /^[\/@!#]/.test(e.token)) return base
    dict ??= await $.fs
      .read(`${$.plugin.root}/hooks/words.txt`)
      .then(t => (typeof t === 'string' ? t.split('\n').filter(Boolean) : []))
      .catch(() => {
        $.ui.log('rich-prompt: hooks/words.txt unreadable, dictionary off')
        return []
      })
    const mine = suggest(e.token, e.text, words, dict)
    offered = mine.map(w => ({ text: e.text.slice(0, e.start) + w + e.text.slice(e.cursor), cursor: e.start + w.length }))
    return { suggestions: [...base.suggestions, ...mine.map(text => ({ text, description: 'rich-prompt' }))] }
  })

  on('command.run', { command: 'rich-prompt' }, async ($, e) => {
    if (e.args.trim() && e.args.trim() !== 'settings') return { text: 'Usage: /rich-prompt settings' }
    await $.ui.open({ id: PANE, title: 'Rich prompt' })
    return { text: 'Rich prompt settings opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, settingsAtom)
    const save = async (next: Settings) => {
      if (current.autocomplete && !next.autocomplete) {
        words = {}
        await $.store.delete('words')
      }
      current = next
      await $.store.set('settings', next)
      await update($, settingsAtom, () => next)
    }

    return (
      <Box flexDirection="column">
        {GROUPS.map(group => (
          <Box key={group.title} flexDirection="column" marginBottom={1}>
            <Text bold>{group.title}</Text>
            {group.items.map(item => (
              <Box key={item.key} flexDirection="column">
                <Button key={item.key} onPress={() => save({ ...current, [item.key]: !current[item.key] })}>
                  {s[item.key] ? '[x]' : '[ ]'} {item.label}
                </Button>
                <Text dimColor>{'    ' + item.hint}</Text>
              </Box>
            ))}
          </Box>
        ))}
        <Button key="reset" onPress={() => save(DEFAULTS)}>
          Reset to defaults
        </Button>
      </Box>
    )
  })
}
