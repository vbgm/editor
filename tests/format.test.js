// npm packages
import { describe, it, expect } from 'vitest'
import { EditorSelection } from '@codemirror/state'
// local
import { createState, stateWithCursor, runCommand, undoOnce, getText } from './helpers.js'
import { setHeading, toggleList } from '/src/app/editor/functions/format/lines.js'
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
  })

  it('numbers lists and switches between list kinds', () => {
    expect(runOnSelection(toggleList('ordered'), '[- one\n- two]\n').text).toBe('1. one\n2. two\n')
  })

  it('keeps the indentation of nested items', () => {
    expect(runOnSelection(toggleList('ordered'), '[- one\n  - two]\n').text).toBe('1. one\n  2. two\n')
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
