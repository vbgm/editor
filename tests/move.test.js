// npm packages
import { describe, it, expect } from 'vitest'
// local
import { stateWithCursor, runCommand, undoOnce, getText, createState } from './helpers.js'
import { moveBlockUp, moveBlockDown, moveSpec } from '/src/app/editor/functions/move/index.js'
import { getBlocks } from '/src/app/editor/functions/blocks/index.js'
import shiftHeading from '/src/app/editor/functions/move/shift-heading.js'

const up = text => getText(runCommand(moveBlockUp, stateWithCursor(text)))
const down = text => getText(runCommand(moveBlockDown, stateWithCursor(text)))

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
