import type { PromptEditInput, PromptEditResult, Register } from 'claude-code'

const ITEM = /^(\s*)(?:([-*+])|(\d+)\.)\s+/
const PAIRS: Record<string, string> = { '(': ')', '[': ']', '`': '`' }
const BEFORE_OPENER = /[\s(\[{]/
const BEFORE_CLOSER = /[\s)\]}]/
const FENCE = /^\s*```/gm

type Next = (e: PromptEditInput) => Promise<PromptEditResult>
type Armed = { ats: number[]; len: number }

const isBlank = (s: string) => s.trim() === ''

const listPrefix = (e: PromptEditInput) => {
  const lineStart = e.text.lastIndexOf('\n', e.start - 1) + 1
  const before = e.text.slice(lineStart, e.start)
  if (isBlank(before)) return { lineStart }
  const inFence = (e.text.slice(0, lineStart).match(FENCE)?.length ?? 0) % 2 === 1
  const m = inFence ? null : ITEM.exec(before)
  return { lineStart, before, m }
}

export const createEditor = () => {
  let armed: Armed | undefined

  const edit = async (e: PromptEditInput, next: Next, ats: number[]) => {
    const typed = e.inputText
    const isInsert = e.start === e.end && typed.length === 1 && e.key?.key === typed

    if (typed === '\n') {
      const { lineStart, before, m } = listPrefix(e)
      const rest = e.text.slice(e.end, (e.text.indexOf('\n', e.end) + 1 || e.text.length + 1) - 1)
      if (before !== undefined) {
        if (m && before.length === m[0].length && isBlank(rest)) {
          return { r: { text: e.text.slice(0, lineStart) + e.text.slice(e.end), cursor: lineStart }, ats }
        }
        const lead = m ? `${m[1]}${m[2] ?? `${Number(m[3]) + 1}.`} ` : /^\s*/.exec(before)![0]
        if (lead) return { r: await next({ ...e, inputText: '\n' + lead }), ats }
      }
      return { r: await next(e), ats }
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
    if (isInsert && closer) {
      const prev = e.text[e.start - 1]
      const next_ = e.text[e.start]
      const okBefore = typed !== '`' || prev === undefined || BEFORE_OPENER.test(prev)
      const okAfter = next_ === undefined || BEFORE_CLOSER.test(next_)
      if (okBefore && okAfter) {
        const r = await next({ ...e, inputText: typed + closer })
        return { r: { ...r, cursor: r.cursor - 1 }, ats, added: e.start + 1 }
      }
    }

    return { r: await next(e), ats }
  }

  return async (e: PromptEditInput, next: Next): Promise<PromptEditResult> => {
    const live = armed && armed.len === e.text.length ? armed.ats : []
    armed = undefined
    const { r, ats, added } = await edit(e, next, live)
    // Closers we inserted stay type-over-able while edits happen before them; leaving the pair forgets them
    const delta = r.text.length - e.text.length
    const kept = ats.filter(at => at >= e.end).map(at => at + delta)
    if (added !== undefined) kept.push(added)
    if (kept.length) armed = { ats: kept, len: r.text.length }
    return r
  }
}

export const register: Register = on => {
  const edit = createEditor()
  on('prompt.edit', ($, e, next) => edit(e, next))
}
