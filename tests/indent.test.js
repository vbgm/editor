// npm packages
import { describe, it, expect } from 'vitest'
// local
import { stateWithCursor, runCommand, undoOnce, getText } from './helpers.js'
import { indentBlock, outdentBlock, quoteBackspace } from '/src/app/editor/functions/indent/index.js'

const tab = text => getText(runCommand(indentBlock, stateWithCursor(text)))
const shiftTab = text => getText(runCommand(outdentBlock, stateWithCursor(text)))

describe('Tab in a list', () => {
  it('nests an item under the item above, as wide as its mark', () => {
    expect(tab('- a\n- b|\n')).toBe('- a\n  - b\n')
    expect(tab('10. a\n11. b|\n')).toBe('10. a\n    1. b\n')
    expect(tab('- a\n  - x\n- b|\n')).toBe('- a\n  - x\n  - b\n')
  })

  it('takes the sub-items and further lines along', () => {
    expect(tab('- a\n- b|\n  more\n  - c\n')).toBe('- a\n  - b\n    more\n    - c\n')
  })

  it('does not nest the first item', () => {
    expect(tab('- a|\n- b\n')).toBe('- a\n- b\n')
    expect(tab('para\n\n- a|\n')).toBe('para\n\n- a\n')
  })

  it('nests the first item under the last item of a list of another kind right above', () => {
    expect(tab('1. one\n2. two\n- point|\n- more\n')).toBe('1. one\n2. two\n   - point\n- more\n')
    expect(tab('- a\n1. step|\n')).toBe('- a\n  1. step\n')
  })

  it('counts numbered lists again: a sub-list from 1', () => {
    expect(tab('1. a\n2. b|\n3. c\n')).toBe('1. a\n   1. b\n2. c\n')
    expect(tab('1. a\n   1. x\n2. b|\n')).toBe('1. a\n   1. x\n   2. b\n')
  })

  it('nests every selected item', () => {
    let state = stateWithCursor('- a\n- b\n- c\n')
    state = state.update({ selection: { anchor: 5, head: 10 } }).state
    expect(getText(runCommand(indentBlock, state))).toBe('- a\n  - b\n  - c\n')
  })
})

describe('Shift+Tab in a list', () => {
  it('moves an item out one level', () => {
    expect(shiftTab('- a\n  - b|\n')).toBe('- a\n- b\n')
    expect(shiftTab('- a\n  - b\n    - c|\n')).toBe('- a\n  - b\n  - c\n')
  })

  it('counts numbered lists again', () => {
    expect(shiftTab('1. a\n   1. b|\n2. c\n')).toBe('1. a\n2. b\n3. c\n')
  })

  it('leaves a top-level item as it is', () => {
    expect(shiftTab('- a|\n')).toBe('- a\n')
  })
})

describe('Tab on a paragraph', () => {
  it('quotes it, one level more each time, on every line', () => {
    expect(tab('one|\ntwo\n')).toBe('> one\n> two\n')
    expect(tab('> one|\n')).toBe('> > one\n')
  })

  it('Shift+Tab removes one level', () => {
    expect(shiftTab('> > one|\n> > two\n')).toBe('> one\n> two\n')
    expect(shiftTab('> one|\n')).toBe('one\n')
    expect(shiftTab('one|\n')).toBe('one\n')
  })

  it('keeps the cursor behind the new mark when it was at the start of the paragraph', () => {
    const state = runCommand(indentBlock, stateWithCursor('# Title\n\n|Intro\n'))
    expect(state.selection.main.head).toBe('# Title\n\n> '.length)
  })

  it('only touches the selected paragraph', () => {
    expect(tab('one|\n\ntwo\n')).toBe('> one\n\ntwo\n')
  })
})

describe('Backspace in a quote', () => {
  const backspace = text => getText(runCommand(quoteBackspace, stateWithCursor(text)))

  it('removes one level from the whole quote where its text starts', () => {
    expect(backspace('Intro\n\n> |First\n> second\n')).toBe('Intro\n\nFirst\nsecond\n')
    expect(backspace('> > |One\n> > two\n')).toBe('> One\n> two\n')
  })

  it('joins a further line of the quote to the line above', () => {
    expect(backspace('> one\n> |two\n')).toBe('> onetwo\n')
  })

  it('does nothing elsewhere', () => {
    expect(quoteBackspace({ state: stateWithCursor('> on|e\n'), dispatch: () => {} })).toBe(false)
    expect(quoteBackspace({ state: stateWithCursor('one\n|two\n'), dispatch: () => {} })).toBe(false)
  })
})

describe('Tab elsewhere', () => {
  it('leaves headings as they are, indents in code', () => {
    expect(tab('# Title|\n')).toBe('# Title\n')
    expect(tab('```\na|\n```\n')).toBe('```\na  \n```\n')
  })

  it('is one undo step', () => {
    const state = runCommand(indentBlock, stateWithCursor('1. a\n2. b|\n3. c\n'))
    expect(getText(undoOnce(state))).toBe('1. a\n2. b\n3. c\n')
  })
})
