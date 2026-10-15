// @vitest-environment jsdom

// npm packages
import { describe, it, expect, beforeAll } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { cursorCharLeft, deleteCharBackward } from '@codemirror/commands'
// local
import { createState, getText, readFixture, fixtureNames } from './helpers.js'
import { switchMode } from '/src/app/editor/functions/create-state.js'

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
    cursorCharLeft(view)
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

  it('skips hidden emphasis marks', () => {
    const view = createView('a **b** c\n')
    view.dispatch({ selection: EditorSelection.cursor(7) })
    cursorCharLeft(view)
    expect(view.state.selection.main.head).toBe(5)
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
