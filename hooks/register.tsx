import type { PromptEditInput, PromptEditResult, Register } from 'claude-code'

const ITEM = /^(\s*)(?:([-*+])|(\d+)\.)\s+/
const PAIRS: Record<string, string> = { '(': ')', '[': ']', '`': '`' }
const BEFORE_OPENER = /[\s(\[{]/
const BEFORE_CLOSER = /[\s)\]}]/
const FENCE = /^\s*```/gm

type Next = (e: PromptEditInput) => Promise<PromptEditResult>
type Armed = { ats: number[]; len: number }

const isBlank = (s: string) => s.trim() === ''

const nextMarker = (m: RegExpExecArray) => (m[2] ?? `${Number(m[3]) + 1}.`)

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

const renumberFrom = (text: string, at: number, indent: number, n: number) => {
  if (at < 0) return text
  const lines = text.slice(at).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = ITEM.exec(lines[i])
    const depth = /^\s*/.exec(lines[i])![0].length
    if (isBlank(lines[i]) || depth < indent) break
    if (depth > indent) continue
    if (!m?.[3]) break
    lines[i] = lines[i].replace(/^(\s*)\d+/, `$1${n++}`)
  }
  return text.slice(0, at) + lines.join('\n')
}

const lineEnd = (text: string, from: number) => {
  const i = text.indexOf('\n', from)
  return i < 0 ? -1 : i + 1
}

const listPrefix = (e: PromptEditInput, upto = e.start) => {
  const lineStart = e.text.lastIndexOf('\n', e.start - 1) + 1
  const before = e.text.slice(lineStart, upto)
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
          if (m[1]) {
            const parent = parentItem(e.text, lineStart, m[1].length)
            const indent = parent?.[1] ?? ''
            const marker = parent ? nextMarker(parent) : (m[2] ?? '1.')
            const prefix = `${indent}${marker} `
            const text = e.text.slice(0, lineStart) + prefix + e.text.slice(e.end)
            const out = /^\d/.test(marker)
              ? renumberFrom(text, lineEnd(text, lineStart), indent.length, Number.parseInt(marker, 10) + 1)
              : text
            return { r: { text: out, cursor: lineStart + prefix.length }, ats }
          }
          return { r: { text: e.text.slice(0, lineStart) + e.text.slice(e.end), cursor: lineStart }, ats }
        }
        const lead = m ? `${m[1]}${m[2] ?? `${Number(m[3]) + 1}.`} ` : /^\s*/.exec(before)![0]
        if (lead) {
          const r = await next({ ...e, inputText: '\n' + lead })
          if (!m?.[3]) return { r, ats }
          const text = renumberFrom(r.text, lineEnd(r.text, r.cursor), m[1].length, Number(m[3]) + 2)
          return { r: { ...r, text }, ats }
        }
      }
      return { r: await next(e), ats }
    }

    if (e.start !== e.end && typed.length === 1 && e.key?.key === typed && PAIRS[typed]) {
      const wrapped = typed + e.text.slice(e.start, e.end) + PAIRS[typed]
      return { r: await next({ ...e, inputText: wrapped }), ats }
    }

    if (typed === '' && e.end - e.start === 1 && e.key?.key === 'backspace') {
      const { lineStart, before, m } = listPrefix(e, e.end)
      if (m && m[0].length === before!.length && isBlank(e.text.slice(e.end, e.text.indexOf('\n', e.end) + 1 || undefined))) {
        return { r: await next({ ...e, start: lineStart }), ats }
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
