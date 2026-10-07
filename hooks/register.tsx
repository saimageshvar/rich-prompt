import type { PromptEditInput, PromptEditResult, Register } from 'claude-code'

const ITEM = /^(\s*)(?:([-*+])|(\d+)\.)\s+/
const PAIRS: Record<string, string> = { '(': ')', '[': ']', '`': '`' }
const BEFORE_OPENER = /[\s(\[{]/
const BEFORE_CLOSER = /[\s)\]}]/
const FENCE = /^\s*```/gm

type Next = (e: PromptEditInput) => Promise<PromptEditResult>
type Armed = { at: number; len: number }

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

  return async (e: PromptEditInput, next: Next): Promise<PromptEditResult> => {
    const was = armed
    armed = undefined
    const typed = e.inputText
    const isInsert = e.start === e.end && typed.length === 1 && e.key?.key === typed

    if (typed === '\n') {
      const { lineStart, before, m } = listPrefix(e)
      const rest = e.text.slice(e.end, (e.text.indexOf('\n', e.end) + 1 || e.text.length + 1) - 1)
      if (before !== undefined) {
        if (m && before.length === m[0].length && isBlank(rest)) {
          return { text: e.text.slice(0, lineStart) + e.text.slice(e.end), cursor: lineStart }
        }
        const lead = m ? `${m[1]}${m[2] ?? `${Number(m[3]) + 1}.`} ` : /^\s*/.exec(before)![0]
        if (lead) return next({ ...e, inputText: '\n' + lead })
      }
      return next(e)
    }

    if (was && was.len === e.text.length) {
      const closerAt = was.at
      const dropCloser = { ...e, text: e.text.slice(0, closerAt) + e.text.slice(closerAt + 1) }
      if (isInsert && e.end === closerAt && e.text[closerAt] === typed) return next(dropCloser)
      if (typed === '' && e.end - e.start === 1 && e.end === closerAt) return next(dropCloser)
    }

    const closer = PAIRS[typed]
    if (isInsert && closer) {
      const prev = e.text[e.start - 1]
      const next_ = e.text[e.start]
      const okBefore = typed !== '`' || prev === undefined || BEFORE_OPENER.test(prev)
      const okAfter = next_ === undefined || BEFORE_CLOSER.test(next_)
      if (okBefore && okAfter) {
        armed = { at: e.start + 1, len: e.text.length + 2 }
        const r = await next({ ...e, inputText: typed + closer })
        return { ...r, cursor: r.cursor - 1 }
      }
    }

    return next(e)
  }
}

export const register: Register = on => {
  const edit = createEditor()
  on('prompt.edit', ($, e, next) => edit(e, next))
}
