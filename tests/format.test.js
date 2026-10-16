// npm packages
import { describe, it, expect } from 'vitest'
import { EditorSelection } from '@codemirror/state'
// local
import { createState, stateWithCursor, runCommand, undoOnce, getText } from './helpers.js'
import { setHeading, toggleList, toggleTask } from '/src/app/editor/functions/format/lines.js'
import { toggleInline, insertLink } from '/src/app/editor/functions/format/inline.js'

const run = (command, text) => getText(runCommand(command, stateWithCursor(text)))

// '[' and ']' in text mark the selection and are removed
function withSelection (text) {
  const from = text.indexOf('[')
  const to = text.indexOf(']') - 1
  const state = createState(text.replace('[', '').replace(']', ''))
  return state.update({ selection: EditorSelection.range(from, to) }).state
}
const runOnSelection = (command, text) => {
  const state = runCommand(command, withSelection(text))
  const { from, to } = state.selection.main
  return { text: getText(state), selected: state.sliceDoc(from, to) }
}

describe('line formats', () => {
  it('sets and changes heading levels', () => {
    expect(run(setHeading(2), 'Title|\n')).toBe('## Title\n')
    expect(run(setHeading(3), '# Title|\n')).toBe('### Title\n')
    expect(run(setHeading(0), '## Title|\n')).toBe('Title\n')
  })

  it('turns a setext heading into an ATX heading', () => {
    expect(run(setHeading(3), 'Title|\n=====\n\ntext\n')).toBe('### Title\n\ntext\n')
  })

  it('turns list items into a heading', () => {
    expect(run(setHeading(1), '- item|\n')).toBe('# item\n')
  })

  it('makes and removes bullet lists over the selected lines', () => {
    expect(runOnSelection(toggleList('bullet'), '[one\ntwo]\n').text).toBe('- one\n- two\n')
    expect(runOnSelection(toggleList('bullet'), '[- one\n- two]\n').text).toBe('one\ntwo\n')
    // paragraphs become one tight list
    expect(runOnSelection(toggleList('bullet'), '[one\n\ntwo]\n').text).toBe('- one\n- two\n')
  })

  it('numbers lists and switches between list kinds', () => {
    expect(runOnSelection(toggleList('ordered'), '[- one\n- two]\n').text).toBe('1. one\n2. two\n')
  })

  it('keeps nested items nested', () => {
    expect(runOnSelection(toggleList('ordered'), '[- one\n  - two]\n').text).toBe('1. one\n   1. two\n')
  })

  it('leaves code and blank lines alone', () => {
    expect(runOnSelection(setHeading(2), '[one\n\n```\ncode\n```]\n').text).toBe('## one\n\n```\ncode\n```\n')
  })

  it('is one undo step', () => {
    const state = runCommand(toggleList('bullet'), withSelection('[one\ntwo]\n'))
    expect(getText(undoOnce(state))).toBe('one\ntwo\n')
  })
})

describe('inline formats', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(runOnSelection(toggleInline('**'), 'a [word] b')).toEqual({ text: 'a **word** b', selected: 'word' })
  })

  it('unwraps when the markers are just outside or just inside', () => {
    expect(runOnSelection(toggleInline('**'), 'a **[word]** b')).toEqual({ text: 'a word b', selected: 'word' })
    expect(runOnSelection(toggleInline('**'), 'a [**word**] b')).toEqual({ text: 'a word b', selected: 'word' })
  })

  it('does not take the bold markers for italic ones', () => {
    expect(runOnSelection(toggleInline('*'), '**[word]**').text).toBe('***word***')
    expect(runOnSelection(toggleInline('*'), '***[word]***').text).toBe('**word**')
  })

  it('inserts a pair with the cursor in between without a selection', () => {
    const state = runCommand(toggleInline('`'), stateWithCursor('a | b'))
    expect(getText(state)).toBe('a `` b')
    expect(state.selection.main.head).toBe(3)
  })

  it('makes links', () => {
    expect(runOnSelection(insertLink, 'see [docs]').text).toBe('see [docs]()')
    const state = runCommand(insertLink, stateWithCursor('see |'))
    expect(getText(state)).toBe('see []()')
    expect(state.selection.main.head).toBe(5)
  })
})

describe('switching an item with sub-items between bullets and numbers', () => {
  it('keeps its further lines and sub-items in it', () => {
    expect(run(toggleList('ordered'), '- a|\n  - x\n  more\n- b\n')).toBe('1. a\n   - x\n   more\n- b\n')
    expect(run(toggleList('bullet'), '1. a|\n   - x\n     - deep\n')).toBe('- a\n  - x\n    - deep\n')
  })

  it('leaves an item\'s further lines without a mark', () => {
    const state = createState('- a\n  more\n- b\n').update({ selection: { anchor: 0, head: 15 } }).state
    expect(getText(runCommand(toggleList('ordered'), state))).toBe('1. a\n   more\n2. b\n')
  })

  it('turning an item off makes it a line under the text above, and on again an item at the same level', () => {
    const off = runCommand(toggleList('ordered'), stateWithCursor('1. a\n   1. w\n   2. |x\n2. b\n'))
    // drawn under w's text, but keeping its own indentation in the file
    expect(getText(off)).toBe('1. a\n   1. w\n   x\n2. b\n')
    expect(getText(runCommand(toggleList('ordered'), off))).toBe('1. a\n   1. w\n   2. x\n2. b\n')
    const bulletOff = runCommand(toggleList('bullet'), stateWithCursor('- a\n  - w\n  - |x\n'))
    expect(getText(runCommand(toggleList('bullet'), bulletOff))).toBe('- a\n  - w\n  - x\n')
  })

  it('turning a list off makes its items lines right below each other', () => {
    const state = createState('- one\n- two\n- three\n').update({ selection: { anchor: 0, head: 19 } }).state
    expect(getText(runCommand(toggleList('bullet'), state))).toBe('one\ntwo\nthree\n')
    const nested = createState('- a\n  - x\n  - y\n').update({ selection: { anchor: 4, head: 15 } }).state
    expect(getText(runCommand(toggleList('bullet'), nested))).toBe('- a\n  x\n  y\n')
  })

  it('turns a Shift+Enter line of an item into a sub-item of it', () => {
    expect(run(toggleList('bullet'), '- a\n  mo|re\n')).toBe('- a\n  - more\n')
    expect(run(toggleList('ordered'), '1. one\n   1. x\n      y|\n')).toBe('1. one\n   1. x\n      1. y\n')
  })

  it('turns a line whose mark was taken off back into an item at its old level', () => {
    expect(run(toggleList('bullet'), '- one\n  - sub a\n  sub| b\n  - sub c\n')).toBe('- one\n  - sub a\n  - sub b\n  - sub c\n')
    expect(run(toggleList('ordered'), '1. one\ntw|o\n')).toBe('1. one\n2. two\n')
  })

  it('shifts sub-items that are switched too', () => {
    const state = createState('- a\n  - x\n').update({ selection: { anchor: 0, head: 9 } }).state
    expect(getText(runCommand(toggleList('ordered'), state))).toBe('1. a\n   1. x\n')
  })
})

describe('switching a sub-list between bullets and numbers', () => {
  it('keeps the item nested and counts numbers again', () => {
    expect(run(toggleList('bullet'), '1. a\n   1. b|\n')).toBe('1. a\n   - b\n')
    expect(run(toggleList('ordered'), '1. a\n   - b\n   - c|\n')).toBe('1. a\n   - b\n   1. c\n')
    expect(run(toggleList('ordered'), '- a\n  - x\n  - b|\n')).toBe('- a\n  - x\n  1. b\n')
  })
})

describe('Cmd+Enter: tasks', () => {
  it('ticks and unticks a task', () => {
    expect(run(toggleTask, '- [ ] to|do\n')).toBe('- [x] todo\n')
    expect(run(toggleTask, '- [X] do|ne\n')).toBe('- [ ] done\n')
    expect(run(toggleTask, '1. [ ] st|ep\n')).toBe('1. [x] step\n')
  })

  it('makes a list item or a paragraph an open task', () => {
    expect(run(toggleTask, '- it|em\n')).toBe('- [ ] item\n')
    expect(run(toggleTask, '  1. ne|sted\n')).toBe('  1. [ ] nested\n')
    expect(run(toggleTask, 'a para|graph\n')).toBe('- [ ] a paragraph\n')
  })

  // the whole text selected (runOnSelection's [ ] would clash with the boxes)
  const onAll = text => getText(runCommand(toggleTask, createState(text).update({ selection: { anchor: 0, head: text.length - 1 } }).state))

  it('ticks all selected tasks, or unticks them when all are ticked', () => {
    expect(onAll('- [ ] a\n- [x] b\n')).toBe('- [x] a\n- [x] b\n')
    expect(onAll('- [x] a\n- [x] b\n')).toBe('- [ ] a\n- [ ] b\n')
  })

  it('makes the other selected lines tasks and leaves tasks as they are', () => {
    expect(onAll('- [x] a\n- b\n')).toBe('- [x] a\n- [ ] b\n')
  })
})
