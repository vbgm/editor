// @vitest-environment jsdom

// npm packages
import { describe, it, expect, beforeAll } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorSelection, RangeSet } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { cursorCharRight, cursorCharLeft } from '@codemirror/commands'
// local
import { createState, stateWithCursor, runCommand, getText } from './helpers.js'
import { gaps, computeAll } from '/src/app/editor/functions/gaps/index.js'
import { deleteCharBackward } from '@codemirror/commands'
import { insertNewBlock, joinBackward, joinForward } from '/src/app/editor/functions/gaps/commands.js'
import generateDocument from '/src/app/functions/generate-document.js'

beforeAll(() => {
  const rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 }
  Range.prototype.getClientRects = () => []
  Range.prototype.getBoundingClientRect = () => rect
  window.requestIdleCallback = callback => setTimeout(callback, 0)
})

function createView (text, options) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  return new EditorView({ state: createState(text, options), parent })
}

const visibleLines = view => [...view.contentDOM.querySelectorAll('.cm-line')].map(line => line.textContent)

describe('hidden blank lines', () => {
  it('are not shown between blocks', () => {
    const view = createView('one\n\ntwo\n\n\n\nthree\n')
    expect(visibleLines(view)).toEqual(['one', 'two', 'three'])
    view.destroy()
  })

  it('are shown in Markdown mode', () => {
    const view = createView('one\n\ntwo\n', { isMarkdownShown: true })
    expect(visibleLines(view)).toEqual(['one', '', 'two', ''])
    view.destroy()
  })

  it('stay visible inside code and inside a list item', () => {
    const view = createView('```\na\n\nb\n```\n\n- item\n\n  more\n- next\n')
    expect(visibleLines(view)).toEqual(['', 'a', '', 'b', '', '• item', '', '  more', '• next'])
    view.destroy()
  })

  it('are skipped by the cursor in one step each way', () => {
    const view = createView('one\n\n\ntwo\n')
    view.dispatch({ selection: EditorSelection.cursor(3) })
    cursorCharRight(view)
    expect(view.state.selection.main.head).toBe('one\n\n\n'.length)
    cursorCharLeft(view)
    expect(view.state.selection.main.head).toBe(3)
    view.destroy()
  })

  it('keep the blank line with the cursor visible', () => {
    const view = createView('one\n\n\n\ntwo\n')
    view.dispatch({ selection: EditorSelection.cursor('one\n\n'.length) })
    expect(visibleLines(view)).toEqual(['one', '', 'two'])
    view.dispatch({ selection: EditorSelection.cursor(0) })
    expect(visibleLines(view)).toEqual(['one', 'two'])
    view.destroy()
  })

  it('do not show an empty line after deleting a whole block', () => {
    const view = createView('one\n\ntwo\n\nthree\n')
    // 'two' and its line break selected, then deleted
    view.dispatch({ selection: EditorSelection.range(5, 9) })
    deleteCharBackward(view)
    expect(getText(view.state)).toBe('one\n\n\nthree\n')
    expect(view.state.selection.main.head).toBe(3)
    expect(visibleLines(view)).toEqual(['one', 'three'])
    view.destroy()
  })

  it('space the blank line with the cursor like a paragraph', () => {
    const view = createView('one\n\n\n\ntwo\n')
    view.dispatch({ selection: EditorSelection.cursor('one\n\n'.length) })
    const lines = [...view.contentDOM.querySelectorAll('.cm-line')]
    expect(lines[1].classList.contains('cm-new-block')).toBe(true)
    view.dispatch({ selection: EditorSelection.cursor(0) })
    expect(view.contentDOM.querySelector('.cm-new-block')).toBe(null)
    view.destroy()
  })

  it('stay hidden while typing in a block', () => {
    const view = createView('first paragraph\n\nsecond paragraph\n')
    view.dispatch({ changes: { from: 1, insert: 'x' }, selection: EditorSelection.cursor(2) })
    expect(visibleLines(view)).toEqual(['fxirst paragraph', 'second paragraph'])
    view.destroy()
  })

  it('do not change the file', () => {
    const text = 'one\n\n\ntwo\n'
    const view = createView(text)
    expect(getText(view.state)).toBe(text)
    view.destroy()
  })
})

describe('updating only the edited lines', () => {
  // after every edit, the ranges must be the same as computing everything again
  const same = state => {
    const value = state.field(gaps)
    const full = computeAll(state)
    return RangeSet.eq([value.decorations], [full.decorations]) && RangeSet.eq([value.atomicRanges], [full.atomicRanges])
  }

  it('gives the same result as computing everything, for many kinds of edits', () => {
    let state = createState(generateDocument(400))
    ensureSyntaxTree(state, state.doc.length)
    let seed = 7
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const inserts = ['a', ' ', '\n', '\n\n', '# ', '- ', '```\n', '\n```\n', '> ', '']
    for (let step = 0; step < 300; step++) {
      const pos = Math.floor(random() * state.doc.length)
      const insert = inserts[Math.floor(random() * inserts.length)]
      const deleteLength = insert ? 0 : Math.min(Math.floor(random() * 8), state.doc.length - pos)
      state = state.update({
        changes: { from: pos, to: pos + deleteLength, insert },
        selection: EditorSelection.cursor(pos + insert.length)
      }).state
      // compared with computing everything on the same syntax tree, so a tree the parser has
      // not finished yet is fine
      expect(same(state), `step ${step}: '${JSON.stringify(insert)}' at ${pos}`).toBe(true)
    }
  })
})

describe('Enter, Backspace and Delete between blocks', () => {
  const run = (command, text) => getText(runCommand(command, stateWithCursor(text)))

  it('Enter starts a new block after a paragraph or heading', () => {
    expect(run(insertNewBlock, 'one|\n\ntwo\n')).toBe('one\n\n\n\ntwo\n')
    expect(run(insertNewBlock, '# Title|\n')).toBe('# Title\n\n\n')
    expect(run(insertNewBlock, 'split| here\n')).toBe('split\n\n here\n')
  })

  it('Enter keeps the Markdown behaviour in lists and code', () => {
    expect(insertNewBlock({ state: stateWithCursor('- item|\n'), dispatch: () => {} })).toBe(false)
    expect(insertNewBlock({ state: stateWithCursor('```\ncode|\n```\n'), dispatch: () => {} })).toBe(false)
  })

  it('Backspace at the start of a paragraph joins it to the block above', () => {
    expect(run(joinBackward, 'one\n\n\n|two\n')).toBe('onetwo\n')
  })

  it('Backspace does not join headings or list items', () => {
    expect(joinBackward({ state: stateWithCursor('one\n\n|# Title\n'), dispatch: () => {} })).toBe(false)
    expect(joinBackward({ state: stateWithCursor('one\n\n|- item\n'), dispatch: () => {} })).toBe(false)
  })

  it('Delete at the end of a block joins the paragraph below', () => {
    expect(run(joinForward, 'one|\n\ntwo\n')).toBe('onetwo\n')
  })

  it('keeps CRLF line breaks', () => {
    expect(run(insertNewBlock, 'one|\r\n\r\ntwo\r\n')).toBe('one\r\n\r\n\r\n\r\ntwo\r\n')
  })
})
