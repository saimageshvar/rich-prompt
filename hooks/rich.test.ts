import { test, expect } from 'claude-code/testing'
import { createEditor } from './register'

const engine = async (e: any) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length })
const key = (text: string, k: string, pos = text.length) => ({ origin: { kind: 'composer' }, text, cursor: pos, start: pos, end: pos, inputText: k, key: { key: k } }) as any
const run = (ed: ReturnType<typeof createEditor>, e: any) => ed(e, engine)

test('list continuation, numbering, end on empty item', async () => {
  const ed = createEditor()
  expect(await run(ed, key('- a', '\n'))).toEqual({ text: '- a\n- ', cursor: 6 })
  expect(await run(ed, key('1. a', '\n'))).toEqual({ text: '1. a\n2. ', cursor: 8 })
  expect(await run(ed, key('- a\n- ', '\n'))).toEqual({ text: '- a\n', cursor: 4 })
})
test('Enter between marker and text keeps the item; blank lines do not accumulate indent', async () => {
  const ed = createEditor()
  expect((await run(ed, key('- abc', '\n', 2))).text).toBe('- \n- abc')
  expect((await run(ed, key('    ', '\n'))).text).toBe('    \n')
  expect((await run(ed, key('  code', '\n'))).text).toBe('  code\n  ')
})
test('no list continuation inside a fence', async () => {
  const ed = createEditor()
  expect((await run(ed, key('```\n- a', '\n'))).text).toBe('```\n- a\n')
})
test('pairs, types over its own closer, paired backspace', async () => {
  const ed = createEditor()
  expect(await run(ed, key('', '('))).toEqual({ text: '()', cursor: 1 })
  expect(await run(ed, key('()', ')', 1))).toEqual({ text: '()', cursor: 2 })
  await run(ed, key('', '['))
  const bs = { ...key('[]', ''), cursor: 1, start: 0, end: 1, inputText: '', key: { key: 'backspace' } }
  expect(await run(ed, bs)).toEqual({ text: '', cursor: 0 })
})
test('foreign closers are not swallowed; stale state is cleared', async () => {
  const ed = createEditor()
  expect(await run(ed, key('a)', ')', 1))).toEqual({ text: 'a))', cursor: 2 })
  await run(ed, key('', '('))
  await run(ed, key('(', 'x', 1))
  expect(await run(ed, key('(x)', ')', 2))).toEqual({ text: '(x))', cursor: 3 })
})
test('backquote pairs only at word start; never on paste or selection', async () => {
  const ed = createEditor()
  expect((await run(ed, key('it', '`'))).text).toBe('it`')
  expect((await run(ed, key('a ', '`'))).text).toBe('a ``')
  expect((await run(ed, key('foo', '(', 0))).text).toBe('(foo')
  expect((await run(ed, { ...key('', '('), key: undefined })).text).toBe('(')
  expect((await run(ed, { ...key('ab', '('), start: 0, end: 2 })).text).toBe('(')
})
