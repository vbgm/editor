// npm packages
import { describe, it, expect } from 'vitest'
import { EditorSelection } from '@codemirror/state'
// local
import { readFixture, runCommand, undoOnce, getText, createState, stateWithCursor } from './helpers.js'
import { moveBlockUp, moveBlockDown } from '/src/app/editor/functions/move/index.js'
import { dragSource, dropSlots, dropSpec } from '/src/app/editor/functions/dnd/slots.js'

// dropping at slot k gives the same file as k presses of Alt+↑ (k < 0) or Alt+↓ (k > 0) with the
// cursor (or selection) the drag started from
function pressed (state, dragged, steps) {
  let current = state.update({ selection: dragged.selection }).state
  for (let step = 0; step < Math.abs(steps); step++) {
    current = runCommand(steps < 0 ? moveBlockUp : moveBlockDown, current)
  }
  return getText(current)
}

function dropped (state, dragged, steps) {
  const spec = dropSpec(state, dragged, steps)
  if (!spec) throw new Error(`no drop: line ${dragged.from}-${dragged.to}, ${steps} steps`)
  return getText(state.update(spec).state)
}

function checkEveryLine (state) {
  let checked = 0
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number)
    if (!line.text.trim()) continue
    const dragged = dragSource(state, line.from)
    if (!dragged) continue
    const { up, down } = dropSlots(state, dragged)
    for (let steps = -up.length; steps <= down.length; steps++) {
      if (!steps) continue
      expect(dropped(state, dragged, steps), `line ${number}, ${steps} steps`).toBe(pressed(state, dragged, steps))
      checked++
    }
    // one press further does nothing
    expect(pressed(state, dragged, -up.length - 1)).toBe(pressed(state, dragged, -up.length))
    expect(pressed(state, dragged, down.length + 1)).toBe(pressed(state, dragged, down.length))
  }
  return checked
}

describe('dropping a dragged block', () => {
  it('gives the same file as pressing Alt+↑/↓ as often, from every line of the sample', () => {
    const state = createState(readFixture('basic.md').toString())
    expect(checkEveryLine(state)).toBeGreaterThan(100)
  })

  it('does the same for nested lists', () => {
    const lists = [
      '- A\n  - a1\n  - a2\n    - deep\n- B\n- C\n  - c1\n',
      '1. one\n2. two\n   - x\n   - y\n3. three\n   1. a\n   2. b\n',
      '- A\n  - a1\n\n  more of A\n- B\n  - b1\n  - b2\n',
      'para\n\n- A\n  - a1\n- B\n\nafter\n'
    ]
    for (const text of lists) checkEveryLine(createState(text))
  })

  it('does the same for headings and sections', () => {
    checkEveryLine(createState('# A\n\ntext a\n\n## a1\n\nx\n\n## a2\n\ny\n\n# B\n\n## b1\n\nz\n'))
  })

  it('moves the selected blocks when the handle is next to one of them', () => {
    const state = createState('one\n\ntwo\n\nthree\n\nfour\n')
    const selected = state.update({ selection: EditorSelection.single(0, 7) }).state
    const dragged = dragSource(selected, selected.doc.line(3).from)
    expect([dragged.from, dragged.to]).toEqual([1, 3])
    expect(dropped(selected, dragged, 2)).toBe('three\n\nfour\n\none\n\ntwo\n')
  })

  it('is one undo step and keeps the cursor on its text', () => {
    const state = stateWithCursor('one\n\ntw|o\n\nthree\n')
    const dragged = dragSource(state, 0)
    const after = state.update(dropSpec(state, dragged, 2)).state
    expect(getText(after)).toBe('two\n\nthree\n\none\n')
    expect(after.selection.main.head).toBe(2)
    expect(getText(undoOnce(after))).toBe('one\n\ntwo\n\nthree\n')
  })

  it('cannot move front matter or go above it', () => {
    const state = createState('---\ntitle: x\n---\n\none\n\ntwo\n')
    expect(dragSource(state, 0)).toBe(null)
    const dragged = dragSource(state, state.doc.line(5).from)
    expect(dropSlots(state, dragged).up.length).toBe(0)
  })
})
