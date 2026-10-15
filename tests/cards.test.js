// @vitest-environment jsdom

// npm packages
import { describe, it, expect, beforeAll } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
// local
import { createState } from './helpers.js'
import { active } from '/src/app/editor/functions/blocks/decorations.js'
import { moveBlockDown } from '/src/app/editor/functions/move/index.js'

// Line marks and the active block of a real EditorView. jsdom has no layout, so the measuring
// functions CodeMirror calls are stubbed (the card boxes themselves need layout to be checked).
beforeAll(() => {
  const rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 }
  Range.prototype.getClientRects = () => []
  Range.prototype.getBoundingClientRect = () => rect
  window.requestIdleCallback = callback => setTimeout(callback, 0)
})

const idle = () => new Promise(resolve => setTimeout(resolve, 10))

function createView (text) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  return new EditorView({ state: createState(text), parent })
}

const lineClasses = view => [...view.contentDOM.querySelectorAll('.cm-line')].map(line => line.className)

function type (view, text, at = view.state.selection.main.head) {
  view.dispatch({
    changes: { from: at, insert: text },
    selection: EditorSelection.cursor(at + text.length),
    userEvent: 'input.type'
  })
}

describe('cards while typing', () => {
  it('keep their classes when typing a letter', () => {
    const view = createView('first paragraph\n\nsecond paragraph\n')
    const before = lineClasses(view)
    type(view, 'x', 5)
    expect(lineClasses(view)).toEqual(before)
    view.destroy()
  })

  it('turn into a heading after typing "# " at the start of a line (after idle)', async () => {
    const view = createView('first paragraph\n\nsecond\n')
    type(view, '# ', 0)
    await idle()
    expect(lineClasses(view)[0]).toContain('cm-block--heading')
    view.destroy()
  })

  it('cover a new line right away after pressing Enter', () => {
    const view = createView('- one\n- two\n')
    type(view, '\n- ', 'x- one'.length - 1)
    expect(lineClasses(view).slice(0, 3).every(name => name.includes('cm-block--listItem'))).toBe(true)
    view.destroy()
  })

  it('are right at once after a block move (no jump while they catch up)', () => {
    const view = createView('para\n\n- a\n- b\n')
    view.dispatch({ selection: EditorSelection.cursor(0) })
    moveBlockDown(view)
    const fresh = createView(view.state.doc.toString())
    expect(lineClasses(view)).toEqual(lineClasses(fresh))
    view.destroy()
    fresh.destroy()
  })

  it('move the active highlight when the cursor goes to another block', () => {
    const view = createView('one\n\ntwo\n')
    const activeText = () => {
      const block = view.plugin(active).block
      return view.state.sliceDoc(block.from, block.to)
    }
    view.dispatch({ selection: EditorSelection.cursor(0) })
    expect(activeText()).toBe('one')
    view.dispatch({ selection: EditorSelection.cursor(6) })
    expect(activeText()).toBe('two')
    view.destroy()
  })

  it('keep the active highlight on a whole line selected with its line break', () => {
    const view = createView('one\n\ntwo\n', { isMarkdownShown: true })
    view.dispatch({ selection: EditorSelection.range(0, 4) })
    const block = view.plugin(active).block
    expect(view.state.sliceDoc(block.from, block.to)).toBe('one')
    view.destroy()
  })

  it('keep the active highlight on a line selected backwards from its end', () => {
    const view = createView('one\n\ntwo\n')
    // from the end of 'two' back to the end of 'one' (the cursor skips the hidden blank line)
    view.dispatch({ selection: EditorSelection.range(8, 3) })
    const block = view.plugin(active).block
    expect(view.state.sliceDoc(block.from, block.to)).toBe('two')
    view.destroy()
  })

  it('keep the same active block object while the cursor stays in the block', () => {
    const view = createView('one two\n\nthree\n')
    view.dispatch({ selection: EditorSelection.cursor(0) })
    const before = view.plugin(active).block
    view.dispatch({ selection: EditorSelection.cursor(4) })
    expect(view.plugin(active).block).toBe(before)
    view.destroy()
  })
})
