// @vitest-environment jsdom

// npm packages
import { describe, it, expect, beforeAll } from 'vitest'
import { EditorView, runScopeHandlers } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { cursorCharLeft, cursorLineBoundaryBackward, deleteCharBackward } from '@codemirror/commands'
// local
import { createState, getText, readFixture, fixtureNames } from './helpers.js'
import { switchMode } from '/src/app/editor/functions/create-state.js'
import { cursorLeftOverLineMark } from '/src/app/editor/functions/syntax/index.js'

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

// what each line shows: its text, with widgets as their symbol, collapsed lines as 'collapsed'
const shown = view => [...view.contentDOM.querySelectorAll('.cm-line')].map(line => {
  if (line.classList.contains('cm-collapsed-line')) return 'collapsed'
  const copy = line.cloneNode(true)
  copy.querySelectorAll('.cm-task-checkbox').forEach(box => box.replaceWith(box.checked ? '[x]' : '[ ]'))
  return copy.textContent
})

describe('hidden Markdown', () => {
  it('hides heading marks, emphasis, code and link syntax', () => {
    const view = createView('## Title ##\n\n*em* **strong** ~~gone~~ `code` [link](http://x "t") <http://a> \\*\n')
    expect(shown(view)).toEqual(['Title', 'em strong gone code link http://a *'])
    view.destroy()
  })

  it('draws bullets and checkboxes, keeps numbers', () => {
    const view = createView('- one\n- [ ] todo\n- [x] done\n\n1. first\n')
    expect(shown(view)).toEqual(['• one', '• [ ] todo', '• [x] done', '1. first'])
    view.destroy()
  })

  it('shows heading and list marks as typed until a space follows them', () => {
    for (const text of ['#', '##', '-', '1.']) {
      const view = createView(`${text}\n`)
      expect(shown(view), text).toEqual([text])
      expect(view.contentDOM.querySelectorAll('.cm-raw-line').length, text).toBe(1)
      view.destroy()
    }
    const view = createView('# Title\n\n- item\n\n## \n\n- \n')
    expect(shown(view)).toEqual(['Title', '• item', '', '• '])
    view.destroy()
  })

  it('lines up further lines of a list item under its text', () => {
    const view = createView('- item\n  more\nlazy\n\n10. ten\n    more\n')
    const indents = [...view.contentDOM.querySelectorAll('.cm-list-indent')].map(indent => indent.textContent)
    expect(indents).toEqual(['• ', '• ', '10. '])
    view.dispatch({ selection: EditorSelection.cursor(7) })
    expect(view.state.selection.main.head).toBe(9)
    view.destroy()
  })

  it('spaces nested items like first-level ones', () => {
    const view = createView('- a\n  - b\n    - c\n  more\n- d\n')
    const nested = [...view.contentDOM.querySelectorAll('.cm-nested-item')].map(line => line.textContent.replace(/^[^a-z]+/, ''))
    expect(nested).toEqual(['b', 'c'])
    view.destroy()
  })

  it('keeps the bullet of an empty item inside a list (after Enter)', () => {
    const view = createView('- one\n- \n')
    expect(shown(view)).toEqual(['• one', '• '])
    view.destroy()
  })

  it('collapses setext underlines and code fences, keeps the code', () => {
    const view = createView('Title\n===\n\n```js\n# code\n```\n')
    expect(shown(view)).toEqual(['Title', 'collapsed', 'collapsed', '# code', 'collapsed'])
    view.destroy()
  })

  it('hides quote marks and marks the line', () => {
    const view = createView('> quoted\n')
    expect(shown(view)[0]).toBe('quoted')
    expect(view.contentDOM.querySelector('.cm-line').classList.contains('cm-quote-line')).toBe(true)
    view.destroy()
  })

  it('shows everything in Markdown mode', () => {
    const view = createView('## Title\n\n- **one**\n', { isMarkdownShown: true })
    expect(shown(view)).toEqual(['## Title', '', '- **one**', ''])
    view.destroy()
  })

  it('never changes the file', () => {
    for (const name of fixtureNames()) {
      const text = readFixture(name).toString('utf8')
      const view = createView(text)
      expect(getText(view.state)).toBe(text)
      view.destroy()
    }
  })
})

describe('cursor with hidden Markdown', () => {
  it('goes behind the heading mark when placed at the start of the line', () => {
    const view = createView('text\n\n## Title\n')
    view.dispatch({ selection: EditorSelection.cursor(6) })
    expect(view.state.selection.main.head).toBe(9)
    view.destroy()
  })

  it('moves left from the heading text to the line above', () => {
    const view = createView('text\n## Title\n')
    view.dispatch({ selection: EditorSelection.cursor(8) })
    cursorLeftOverLineMark(view)
    expect(view.state.selection.main.head).toBe(4)
    view.destroy()
  })

  it('stays before a heading or list mark with no space after it yet', () => {
    const view = createView('text\n\n##\n\n-\n')
    view.dispatch({ selection: EditorSelection.cursor(6) })
    expect(view.state.selection.main.head).toBe(6)
    view.dispatch({ selection: EditorSelection.cursor(10) })
    expect(view.state.selection.main.head).toBe(10)
    view.destroy()
  })

  it('stays behind the number of a numbered list item', () => {
    const view = createView('text\n\n1. one\n2. two\n')
    // placed at the line start or on the number (a click)
    for (const pos of [6, 7]) {
      view.dispatch({ selection: EditorSelection.cursor(pos), userEvent: 'select.pointer' })
      expect(view.state.selection.main.head, String(pos)).toBe(9)
    }
    // moving left from the text goes to the end of the line above, Home stays on the line
    view.dispatch({ selection: EditorSelection.cursor(16) })
    cursorLeftOverLineMark(view)
    expect(view.state.selection.main.head).toBe(12)
    view.dispatch({ selection: EditorSelection.cursor(16) })
    cursorLineBoundaryBackward(view)
    expect(view.state.selection.main.head).toBe(16)
    view.destroy()
  })

  it('goes behind a bullet when placed inside its mark (a click on the bullet)', () => {
    const view = createView('text\n\n- item\n')
    view.dispatch({ selection: EditorSelection.cursor(7) })
    expect(view.state.selection.main.head).toBe(8)
    view.destroy()
  })

  it('goes behind a task box when placed inside its mark', () => {
    const view = createView('text\n\n- [ ] item\n')
    for (const pos of [7, 8, 10, 11]) {
      view.dispatch({ selection: EditorSelection.cursor(pos), userEvent: 'select.pointer' })
      expect(view.state.selection.main.head, String(pos)).toBe(12)
    }
    view.destroy()
  })

  it('moves left from a task item text to the line above', () => {
    const view = createView('text\n\n- [ ] item\n')
    view.dispatch({ selection: EditorSelection.cursor(12) })
    cursorLeftOverLineMark(view)
    expect(view.state.selection.main.head).toBe(4)
    view.destroy()
  })

  it('Backspace at the start of a heading removes its mark', () => {
    const view = createView('text\n\n## Title\n')
    view.dispatch({ selection: EditorSelection.cursor(9) })
    deleteCharBackward(view)
    expect(getText(view.state)).toBe('text\n\nTitle\n')
    view.destroy()
  })

  it('deleting an escaped character deletes its hidden backslash too', () => {
    const view = createView('a\n\n\\# tag \\*\n')
    view.dispatch({ selection: EditorSelection.cursor(5) })
    deleteCharBackward(view)
    expect(getText(view.state)).toBe('a\n\n tag \\*\n')
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length - 1) })
    deleteCharBackward(view)
    expect(getText(view.state)).toBe('a\n\n tag \n')
    view.destroy()
  })

  it('keeps an escape in Markdown mode, where the backslash shows', () => {
    const view = createView('a \\*\n', { isMarkdownShown: true })
    view.dispatch({ selection: EditorSelection.cursor(4) })
    deleteCharBackward(view)
    expect(getText(view.state)).toBe('a \\\n')
    view.destroy()
  })

  it('skips hidden emphasis marks', () => {
    const view = createView('a **b** c\n')
    view.dispatch({ selection: EditorSelection.cursor(7) })
    cursorCharLeft(view)
    expect(view.state.selection.main.head).toBe(5)
    view.destroy()
  })
})

describe('Backspace in Markdown mode', () => {
  const backspace = view => runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Backspace' }), 'editor')

  it('deletes one character, also right behind a list number', () => {
    const view = createView('1. one\n2. two\n', { isMarkdownShown: true })
    view.dispatch({ selection: EditorSelection.cursor(10) })
    backspace(view)
    expect(getText(view.state)).toBe('1. one\n2.two\n')
    view.destroy()
  })

  it('still takes the whole mark off a list item in Document mode', () => {
    const view = createView('1. one\n2. two\n')
    view.dispatch({ selection: EditorSelection.cursor(10) })
    backspace(view)
    expect(getText(view.state)).toBe('1. one\n   two\n')
    view.destroy()
  })
})

describe('switching to Document mode', () => {
  it('puts a cursor from the start of a heading behind its hidden mark', () => {
    const view = createView('text\n\n## Title\n', { isMarkdownShown: true })
    view.dispatch({ selection: EditorSelection.cursor(6) })
    switchMode(view, false)
    expect(view.state.selection.main.head).toBe(9)
    view.destroy()
  })

  it('moves a cursor off a blank line to the end of the block above', () => {
    const view = createView('one\n\ntwo\n', { isMarkdownShown: true })
    view.dispatch({ selection: EditorSelection.cursor(4) })
    switchMode(view, false)
    expect(view.state.selection.main.head).toBe(3)
    view.destroy()
  })

  it('keeps the cursor where it is in Markdown mode', () => {
    const view = createView('text\n\n## Title\n')
    view.dispatch({ selection: EditorSelection.cursor(9) })
    switchMode(view, true)
    expect(view.state.selection.main.head).toBe(9)
    view.destroy()
  })
})
