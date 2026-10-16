// npm packages
import { describe, it, expect } from 'vitest'
// local
import { stateWithCursor, runCommand, undoOnce, getText, createState } from './helpers.js'
import { moveBlockUp, moveBlockDown, moveSpec } from '/src/app/editor/functions/move/index.js'
import { getBlocks } from '/src/app/editor/functions/blocks/index.js'
import shiftHeading from '/src/app/editor/functions/move/shift-heading.js'

const up = text => getText(runCommand(moveBlockUp, stateWithCursor(text)))
const down = text => getText(runCommand(moveBlockDown, stateWithCursor(text)))

describe('numbered lists after a move', () => {
  it('count up in order again', () => {
    expect(up('1. a\n2. b\n3. c|\n')).toBe('1. a\n2. c\n3. b\n')
    expect(down('1. a|\n2. b\n3. c\n')).toBe('1. b\n2. a\n3. c\n')
  })

  it('keep their start and their delimiter', () => {
    expect(up('5) a\n6) b|\n')).toBe('5) b\n6) a\n')
  })

  it('stay as they are when every item has the same number', () => {
    expect(up('1. a\n1. b|\n')).toBe('1. b\n1. a\n')
  })

  it('number the list an item joins', () => {
    const once = runCommand(moveBlockDown, stateWithCursor('1. x\n2. y|\n\npara\n\n1. p\n2. q\n'))
    expect(getText(once)).toBe('1. x\n\npara\n\n1. y\n2. p\n3. q\n')
    expect(getText(runCommand(moveBlockDown, once))).toBe('1. x\n\npara\n\n1. p\n2. y\n3. q\n')
  })

  it('renumber in the same undo step as the move', () => {
    const state = stateWithCursor('1. a\n2. b|\n')
    expect(getText(undoOnce(runCommand(moveBlockUp, state)))).toBe('1. a\n2. b\n')
  })
  it('keep a blank line between a bullet item and a numbered one', () => {
    // right under a bullet item, '2. b' would be a line of its text
    expect(down('- x|\n\n1. a\n2. b\n')).toBe('1. a\n\n- x\n\n2. b\n')
  })
})

describe('moving nested list items', () => {
  const list = '- A\n  - a1\n  - a2\n- B\n  - b1\n'

  it('swap with their siblings, keeping their depth', () => {
    expect(down('- A\n  - a1|\n  - a2\n- B\n')).toBe('- A\n  - a2\n  - a1\n- B\n')
    expect(up('- A\n  - a1\n  - a2|\n')).toBe('- A\n  - a2\n  - a1\n')
  })

  it('go into the neighbouring item at the edge of their sub-list', () => {
    expect(down(list.replace('a2', 'a2|'))).toBe('- A\n  - a1\n- B\n  - a2\n  - b1\n')
    expect(up(list.replace('b1', 'b1|'))).toBe('- A\n  - a1\n  - a2\n  - b1\n- B\n')
    // an item without sub-items gets them
    expect(down('- A\n  - a1|\n- B\n')).toBe('- A\n- B\n  - a1\n')
  })

  it('take their own sub-items along', () => {
    expect(down('- A\n  - a1|\n    - deep\n- B\n')).toBe('- A\n- B\n  - a1\n    - deep\n')
  })

  it('stay at the edge of the whole list', () => {
    expect(up('- A\n  - a1|\n')).toBe('- A\n  - a1\n')
    expect(down('- A\n- B\n  - b1|\n')).toBe('- A\n- B\n  - b1\n')
  })

  it('are indented for the new parent and renumbered', () => {
    expect(down('9. A\n   1. x\n   2. y|\n10. B\n')).toBe('9. A\n   1. x\n10. B\n    1. y\n')
  })

  it('keep the cursor in the moved item', () => {
    const state = runCommand(moveBlockDown, stateWithCursor(list.replace('a2', 'a|2')))
    expect(state.sliceDoc(state.selection.main.head - 5, state.selection.main.head)).toBe('  - a')
  })

  it('leave top-level items moving as a whole', () => {
    expect(down('- A|\n  - a1\n- B\n')).toBe('- B\n- A\n  - a1\n')
  })
})

describe('keyboard moves', () => {
  it('swaps paragraphs', () => {
    expect(down('one|\n\ntwo\n\nthree\n')).toBe('two\n\none\n\nthree\n')
    expect(up('one\n\ntwo\n\nthree|\n')).toBe('one\n\nthree\n\ntwo\n')
  })

  it('swaps list items in a tight list', () => {
    expect(down('- a|\n- b\n- c\n')).toBe('- b\n- a\n- c\n')
  })

  it('adds a blank line when a list item leaves its list', () => {
    expect(down('- a\n- b|\n\npara\n')).toBe('- a\n\npara\n\n- b\n')
    expect(up('- a\n- b\n\npara|\n')).toBe('- a\n\npara\n\n- b\n')
  })

  it('keeps a tight list tight when a paragraph moves through it', () => {
    const once = runCommand(moveBlockDown, stateWithCursor('para|\n\n- a\n- b\n'))
    expect(getText(once)).toBe('- a\n\npara\n\n- b\n')
    expect(getText(runCommand(moveBlockDown, once))).toBe('- a\n- b\n\npara\n')
  })

  it('moves a nested list together with its parent item', () => {
    expect(down('- a|\n  - a1\n- b\n')).toBe('- b\n- a\n  - a1\n')
  })

  it('moves a paragraph past a heading into the next section', () => {
    expect(down('# A\n\npara|\n\n# B\n\nb\n')).toBe('# A\n\n# B\n\npara\n\nb\n')
  })

  it('moves a heading with everything it owns past its sibling', () => {
    const text = '# A\n\n## One|\n\none\n\n### Deep\n\ndeep\n\n## Two\n\ntwo\n'
    expect(down(text)).toBe('# A\n\n## Two\n\ntwo\n\n## One\n\none\n\n### Deep\n\ndeep\n')
  })

  it('moves a heading up past a sibling that has children', () => {
    const text = '## One\n\none\n\n### Deep\n\ndeep\n\n## Two|\n\ntwo\n'
    expect(up(text)).toBe('## Two\n\ntwo\n\n## One\n\none\n\n### Deep\n\ndeep\n')
  })

  it('does not move a first child heading out of its parent', () => {
    const text = '# A\n\nintro\n\n## One|\n\none\n'
    expect(up(text)).toBe(text.replace('|', ''))
  })

  it('does not move anything above front matter', () => {
    const text = '---\ntitle: x\n---\n\npara|\n'
    expect(up(text)).toBe(text.replace('|', ''))
  })

  it('keeps the cursor in the moved block', () => {
    const state = runCommand(moveBlockDown, stateWithCursor('on|e\n\ntwo\n'))
    expect(state.selection.main.head).toBe('two\n\non'.length)
  })

  it('one move is one undo step, even when fast', () => {
    const start = stateWithCursor('one|\n\ntwo\n\nthree\n')
    const twice = runCommand(moveBlockDown, runCommand(moveBlockDown, start))
    expect(getText(twice)).toBe('two\n\nthree\n\none\n')
    expect(getText(undoOnce(twice))).toBe('two\n\none\n\nthree\n')
  })

  it('moves a heading with all its paragraphs past its sibling', () => {
    const state = stateWithCursor('## A|\n\na1\n\na2\n\n## B\n\nb\n')
    expect(getText(runCommand(moveBlockDown, state))).toBe('## B\n\nb\n\n## A\n\na1\n\na2\n')
  })
})

describe('outline moves with level change', () => {
  it('moves a section under another heading one level deeper', () => {
    const state = createState('# A\n\na\n\n# B\n\nb\n\n## B1\n\nb1\n')
    const blocks = getBlocks(state, { complete: true })
    // move '# B' (index 2) with its subtree (to index 5) to the start, one level deeper
    const spec = moveSpec(state, blocks, { from: 2, to: 5, before: 0, levelDelta: 1 })
    expect(getText(state.update(spec).state)).toBe('## B\n\nb\n\n### B1\n\nb1\n\n# A\n\na\n')
  })
})

describe('shiftHeading', () => {
  it('changes ATX levels within 1–6', () => {
    expect(shiftHeading('## Title', 2, 1, '\n')).toBe('### Title')
    expect(shiftHeading('# Title', 1, -1, '\n')).toBe('# Title')
    expect(shiftHeading('###### Title', 6, 1, '\n')).toBe('###### Title')
  })

  it('turns setext headings into ATX', () => {
    expect(shiftHeading('Title\n=====\n\nbody', 1, 1, '\n')).toBe('## Title\n\nbody')
  })
})

describe('moves in Markdown mode', () => {
  it('move blocks the same way', () => {
    const state = stateWithCursor('one|\n\ntwo\n\nthree\n', { isMarkdownShown: true })
    expect(getText(runCommand(moveBlockDown, state))).toBe('two\n\none\n\nthree\n')
  })
})
