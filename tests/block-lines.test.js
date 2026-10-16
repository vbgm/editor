// @vitest-environment jsdom

// npm packages
import { describe, it, expect, beforeAll } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
// local
import { createState } from './helpers.js'
import { moveBlockDown } from '/src/app/editor/functions/move/index.js'

// Line marks of a real EditorView. jsdom has no layout, so the measuring functions CodeMirror
// calls are stubbed.
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

// without the slide of a move (move/animate.js), which is only drawing
const lineClasses = view => [...view.contentDOM.querySelectorAll('.cm-line')].map(line => line.className.replace(/ cm-slide-\w+/g, ''))

function type (view, text, at = view.state.selection.main.head) {
  view.dispatch({
    changes: { from: at, insert: text },
    selection: EditorSelection.cursor(at + text.length),
    userEvent: 'input.type'
  })
}

describe('block line marks', () => {
  it('tell an item of another list apart', () => {
    const view = createView('- a\n- b\n\n1. one\n2. two\n')
    const of = text => [...view.contentDOM.querySelectorAll('.cm-line')].find(line => line.textContent.includes(text)).className
    expect(of('b')).toContain('cm-before--otherList')
    expect(of('one')).toContain('cm-after--otherList')
    expect(of('one')).toContain('cm-before--listItem')
    view.destroy()
  })

  it('name the blocks above and below', () => {
    const view = createView('# T\n\n- a\n- b\n\nText\n- c\n\nAfter\n')
    const classes = lineClasses(view)
    const of = text => classes[[...view.contentDOM.querySelectorAll('.cm-line')].findIndex(line => line.textContent.includes(text))]
    expect(of('T')).toContain('cm-before--listItem')
    expect(of('a')).toContain('cm-after--heading')
    expect(of('a')).toContain('cm-before--listItem')
    expect(of('b')).toContain('cm-after--listItem')
    expect(of('b')).toContain('cm-before--paragraph')
    expect(of('Text')).toContain('cm-before--listItem')
    expect(of('c')).toContain('cm-after--paragraph')
    expect(of('After')).toContain('cm-after--listItem')
    expect(of('After')).not.toContain('cm-before--')
    view.destroy()
  })

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
})
