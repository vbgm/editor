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
import { deleteCharBackward, deleteCharForward } from '@codemirror/commands'
import { insertNewBlock, newParagraphAfterQuote, insertLineBreak, joinItemLine, joinBackward, joinForward, listItemToParagraph, emptyListItemToParagraph } from '/src/app/editor/functions/gaps/commands.js'
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

// the text each line shows; a list item's further line is drawn indented (an invisible bullet)
const visibleLines = view => [...view.contentDOM.querySelectorAll('.cm-line')].map(line => {
  const copy = line.cloneNode(true)
  copy.querySelectorAll('.cm-list-indent').forEach(indent => indent.replaceWith('>'))
  return copy.textContent
})

describe('hidden blank lines', () => {
  it('are not shown between blocks (one or two)', () => {
    const view = createView('one\n\ntwo\n\n\nthree\n')
    expect(visibleLines(view)).toEqual(['one', 'two', 'three'])
    view.destroy()
  })

  it('show every two more as an empty paragraph', () => {
    const view = createView('one\n\n\n\ntwo\n\n\n\n\n\nthree\n')
    expect(visibleLines(view)).toEqual(['one', '', 'two', '', '', 'three'])
    expect(view.contentDOM.querySelectorAll('.cm-empty-paragraph').length).toBe(3)
    view.destroy()
  })

  it('show empty paragraphs at the end of the file too, not for its last line break', () => {
    const plain = createView('one\n\ntwo\n\n')
    plain.dispatch({ selection: EditorSelection.cursor(1) })
    expect(visibleLines(plain)).toEqual(['one', 'two'])
    plain.destroy()
    // an Enter left empty at the end
    const view = createView('one\n\ntwo\n\n\n')
    view.dispatch({ selection: EditorSelection.cursor(1) })
    expect(visibleLines(view)).toEqual(['one', 'two', ''])
    view.destroy()
  })

  it('do not take the cursor at the end of the file: it goes to the end of the text', () => {
    const view = createView('one\n\ntwo\n')
    view.dispatch({ selection: EditorSelection.cursor('one\n\ntwo\n'.length) })
    expect(view.state.selection.main.head).toBe('one\n\ntwo'.length)
    expect(visibleLines(view)).toEqual(['one', 'two'])
    view.destroy()
  })

  it('take the cursor at the end of the file to a trailing empty paragraph', () => {
    const view = createView('one\n\n\n')
    view.dispatch({ selection: EditorSelection.cursor('one\n\n\n'.length) })
    expect(view.state.selection.main.head).toBe('one\n\n'.length)
    view.destroy()
  })

  it('keep the new block after Enter at the end of the file', () => {
    const view = createView('one\n')
    view.dispatch({ changes: { from: 3, insert: '\n\n' }, selection: EditorSelection.cursor(5) })
    expect(view.state.selection.main.head).toBe(5)
    view.destroy()
  })

  it('show an empty paragraph inside a selection as selected', () => {
    const view = createView('one\n\n\n\ntwo\n')
    view.dispatch({ selection: { anchor: 0, head: 10 } })
    expect(view.contentDOM.querySelectorAll('.cm-selected-empty').length).toBe(1)
    view.dispatch({ selection: { anchor: 0 } })
    expect(view.contentDOM.querySelectorAll('.cm-selected-empty').length).toBe(0)
    view.destroy()
  })

  it('are a step of their own for Shift+↑/↓', async () => {
    const { selectBlockDown, selectBlockUp } = await import('/src/app/editor/functions/blocks/select.js')
    const view = createView('one\n\n\n\ntwo\n')
    view.dispatch({ selection: EditorSelection.cursor(3) })
    selectBlockDown(view)
    expect(view.state.selection.main.head).toBe('one\n\n'.length)
    selectBlockDown(view)
    expect(view.state.selection.main.head).toBe('one\n\n\n\ntwo'.length)
    // up: first to where 'two' starts, then onto the empty paragraph
    selectBlockUp(view)
    expect(view.state.selection.main.head).toBe('one\n\n\n\n'.length)
    selectBlockUp(view)
    expect(view.state.selection.main.head).toBe('one\n\n'.length)
    view.destroy()
  })

  it('show selected in Markdown mode on the blank line standing for each empty paragraph', () => {
    const view = createView('one\n\n\n\n\n\ntwo\n', { isMarkdownShown: true })
    view.dispatch({ selection: { anchor: 0, head: 12 } })
    const selected = [...view.contentDOM.querySelectorAll('.cm-line')].map(line => line.classList.contains('cm-selected-empty'))
    expect(selected).toEqual([false, false, true, false, true, false, false, false])
    view.destroy()
  })

  it('keep an empty paragraph when the cursor leaves it', () => {
    const view = createView('one\n\n\n\ntwo\n')
    view.dispatch({ selection: EditorSelection.cursor('one\n\n'.length) })
    view.dispatch({ selection: EditorSelection.cursor(0) })
    expect(visibleLines(view)).toEqual(['one', '', 'two'])
    view.destroy()
  })

  it('are shown in Markdown mode', () => {
    const view = createView('one\n\ntwo\n', { isMarkdownShown: true })
    expect(visibleLines(view)).toEqual(['one', '', 'two', ''])
    view.destroy()
  })

  it('stay visible inside code, and are hidden between the paragraphs of a list item', () => {
    const view = createView('```\na\n\nb\n```\n\n- item\n\n  more\n- next\n')
    expect(visibleLines(view)).toEqual(['', 'a', '', 'b', '', '• item', '>more', '• next'])
    expect(view.contentDOM.querySelector('.cm-item-paragraph').textContent).toContain('more')
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
    const view = createView('one\n\n\ntwo\n')
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
    const view = createView('one\n\n\ntwo\n')
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

  it('Enter in a quote starts a new, unquoted paragraph', () => {
    expect(run(newParagraphAfterQuote, '> quote|\n\nAfter\n')).toBe('> quote\n\n\n\nAfter\n')
    expect(run(newParagraphAfterQuote, '> > deep|\n')).toBe('> > deep\n\n\n')
    // the text after the cursor goes with it, later quote lines stay quoted
    expect(run(newParagraphAfterQuote, '> one| two\n> three\n')).toBe('> one\n\n two\n\n> three\n')
    // an empty quote line loses its quote
    expect(run(newParagraphAfterQuote, '> one\n> |\n')).toBe('> one\n\n\n')
    expect(newParagraphAfterQuote({ state: stateWithCursor('> - item|\n'), dispatch: () => {} })).toBe(false)
  })

  it('Shift+Enter starts a new line within the block', () => {
    expect(run(insertLineBreak, 'one| two\n')).toBe('one\n two\n')
    expect(run(insertLineBreak, 'one|\n\ntwo\n')).toBe('one\n\n\ntwo\n')
    // stays in the list item, under its text
    expect(run(insertLineBreak, '- item|\n')).toBe('- item\n  \n')
    expect(run(insertLineBreak, '10. item|\n')).toBe('10. item\n    \n')
    expect(run(insertLineBreak, '- a\n  - nested|\n')).toBe('- a\n  - nested\n    \n')
    // stays in the quote
    expect(run(insertLineBreak, '> quote|\n')).toBe('> quote\n> \n')
  })

  it('Backspace at the start of a list item\'s further line joins it to the line above', () => {
    expect(run(joinItemLine, '- item\n  |more\n')).toBe('- itemmore\n')
    expect(run(joinItemLine, '1. one\n   |next\n')).toBe('1. onenext\n')
    expect(joinItemLine({ state: stateWithCursor('- item\n  mo|re\n'), dispatch: () => {} })).toBe(false)
  })

  it('Shift+Enter in a heading starts a new block, as Enter', () => {
    expect(run(insertLineBreak, '# Title|\n')).toBe('# Title\n\n\n')
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

  it('Backspace at the start of a list item makes it a further line of the text above', () => {
    // drawn under that text, no blank line; in the file it keeps its own indentation
    expect(run(listItemToParagraph, '- one\n- |two\n\nAfter\n')).toBe('- one\ntwo\n\nAfter\n')
    expect(run(listItemToParagraph, '1. a\n2. |b\n3. c\n')).toBe('1. a\nb\n3. c\n')
    expect(run(listItemToParagraph, '- a\n- [ ] |b\n')).toBe('- a\nb\n')
    expect(run(listItemToParagraph, '- a\n- |b\n  more\n- c\n')).toBe('- a\nb\nmore\n- c\n')
    // the first item, with nothing above in the list, is a paragraph
    expect(run(listItemToParagraph, 'Intro\n\n- |a\n- b\n')).toBe('Intro\n\na\n- b\n')
  })

  it('Backspace on an empty item (after Enter) ends the list with a paragraph', () => {
    expect(run(listItemToParagraph, '- one\n- |\n')).toBe('- one\n\n\n')
    expect(run(listItemToParagraph, '- one\n- |\n- two\n')).toBe('- one\n\n\n\n- two\n')
  })

  it('Enter in an empty list item ends the list and starts a paragraph', () => {
    expect(run(emptyListItemToParagraph, '- one\n- |\n\nAfter\n')).toBe('- one\n\n\n\nAfter\n')
    expect(run(emptyListItemToParagraph, '- a\n- |\n- c\n')).toBe('- a\n\n\n\n- c\n')
    expect(emptyListItemToParagraph({ state: stateWithCursor('- one|\n'), dispatch: () => {} })).toBe(false)
    expect(emptyListItemToParagraph({ state: stateWithCursor('- one\n- |\n  more\n'), dispatch: () => {} })).toBe(false)
  })

  it('puts the cursor at the start of the text', () => {
    const state = runCommand(listItemToParagraph, stateWithCursor('- one\n- |two\n'))
    expect(state.selection.main.head).toBe('- one\n'.length)
  })

  it('makes a sub-item a further line of the text above it', () => {
    expect(run(listItemToParagraph, '- a\n  - |b\n')).toBe('- a\n  b\n')
    expect(run(listItemToParagraph, '1. a\n   - x\n   - |b\n   - c\n')).toBe('1. a\n   - x\n   b\n   - c\n')
  })

  it('leaves the middle of an item alone', () => {
    expect(listItemToParagraph({ state: stateWithCursor('- a|b\n'), dispatch: () => {} })).toBe(false)
  })

  it('Backspace and Delete next to empty paragraphs remove the nearest one', () => {
    expect(run(joinBackward, 'one\n\n\n\n|two\n')).toBe('one\n\ntwo\n')
    expect(run(joinBackward, 'one\n\n\n\n\n\n|two\n')).toBe('one\n\n\n\ntwo\n')
    expect(run(joinForward, 'one|\n\n\n\ntwo\n')).toBe('one\n\ntwo\n')
  })

  it('Backspace and Delete on an empty paragraph remove it', () => {
    const backspace = createView('one\n\n\n\ntwo\n')
    backspace.dispatch({ selection: EditorSelection.cursor('one\n\n'.length) })
    deleteCharBackward(backspace)
    expect(getText(backspace.state)).toBe('one\n\ntwo\n')
    backspace.destroy()
    const del = createView('one\n\n\n\ntwo\n')
    del.dispatch({ selection: EditorSelection.cursor('one\n\n'.length) })
    deleteCharForward(del)
    expect(getText(del.state)).toBe('one\n\ntwo\n')
    del.destroy()
  })

  it('Delete at the end of a block joins the paragraph below', () => {
    expect(run(joinForward, 'one|\n\ntwo\n')).toBe('onetwo\n')
  })

  it('keeps CRLF line breaks', () => {
    expect(run(insertNewBlock, 'one|\r\n\r\ntwo\r\n')).toBe('one\r\n\r\n\r\n\r\ntwo\r\n')
  })
})
