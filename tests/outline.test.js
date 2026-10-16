// npm packages
import { describe, it, expect } from 'vitest'
// local
import { createState, getText, stateWithCursor, undoOnce } from './helpers.js'
import { getOutline, activeIndex, dropLevel, outlineMove } from '/src/app/editor/functions/outline/index.js'
import { target, positionIn } from '/foundation/dnd/target.js'

const outlineOf = text => getOutline(createState(text), { complete: true })

// drops the heading at outline index from at { index, position }; the text after it, or null
function drop (text, from, index, position) {
  const state = createState(text)
  const transaction = outlineMove(state, getOutline(state, { complete: true }), from, { index, position })
  return transaction ? getText(transaction.state) : null
}

describe('outline', () => {
  it('lists headings with their levels and titles without Markdown', () => {
    const outline = outlineOf('intro\n\n# One **bold** `code`\n\ntext\n\n## [Link](http://x.y "t") \\# two ##\n\nTitle\non two lines\n---\n')
    expect(outline.map(({ title, level }) => [title, level])).toEqual([
      ['One bold code', 1],
      ['Link # two', 2],
      ['Title on two lines', 2]
    ])
  })

  it('skips a bare # and front matter', () => {
    const outline = outlineOf('---\ntitle: x\n---\n\n#\n\n# Real\n')
    expect(outline.map(entry => entry.title)).toEqual(['Real'])
  })

  it('gives repeated titles their own ids', () => {
    expect(outlineOf('# A\n\n## Notes\n\n# B\n\n## Notes\n').map(entry => entry.id)).toEqual(['A', 'Notes', 'B', 'Notes 2'])
  })

  it('finds the section of the cursor', () => {
    const state = stateWithCursor('intro\n\n# A\n\na|\n\n# B\n')
    const outline = getOutline(state, { complete: true })
    expect(activeIndex(outline, state.selection.main.head)).toBe(0)
    expect(activeIndex(outline, 0)).toBe(-1)
  })

  it('lists the sample\'s headings', () => {
    const outline = outlineOf('# Editor sample\n\n## Lists\n\n### Bullet\n\n### Numbered\n\n## Quotes\n\n### Typing\n\n## Ideas\n')
    expect(outline.map(entry => entry.level)).toEqual([1, 2, 3, 3, 2, 3, 2])
  })
})

describe('dropping in the outline', () => {
  const text = '# A\n\na\n\n## A1\n\na1\n\n# B\n\nb\n'

  it('moves a section before a heading, at its level', () => {
    expect(drop(text, 2, 1, 'before')).toBe('# A\n\na\n\n## B\n\nb\n\n## A1\n\na1\n')
  })

  it('moves a section after a heading\'s whole section', () => {
    expect(drop(text, 1, 2, 'after')).toBe('# A\n\na\n\n# B\n\nb\n\n# A1\n\na1\n')
  })

  it('nests a section onto a heading, after its text, before its subheadings', () => {
    expect(drop(text, 2, 0, 'onto')).toBe('# A\n\na\n\n## B\n\nb\n\n## A1\n\na1\n')
    expect(drop('# A\n\na\n\n# B\n\nb\n', 1, 0, 'onto')).toBe('# A\n\na\n\n## B\n\nb\n')
  })

  it('takes the level of the first subheading when nesting', () => {
    expect(drop('# A\n\n### A1\n\n# B\n', 2, 0, 'onto')).toBe('# A\n\n### B\n\n### A1\n')
  })

  it('shifts the headings inside the moved section by the same amount', () => {
    expect(drop('# A\n\n# B\n\n## B1\n', 1, 0, 'onto')).toBe('# A\n\n## B\n\n### B1\n')
  })

  it('changes only the levels where the section already is', () => {
    expect(drop('# A\n\na\n\n# B\n\nb\n', 1, 0, 'after')).toBe(null)
  })

  it('is one undo step', () => {
    const state = createState(text)
    const transaction = outlineMove(state, getOutline(state, { complete: true }), 2, { index: 0, position: 'before' })
    expect(getText(undoOnce(transaction.state))).toBe(text)
  })

  it('is refused onto itself, into its own section, and deeper than ######', () => {
    const outline = outlineOf(text)
    expect(dropLevel(outline, 0, { index: 0, position: 'onto' })).toBe(null)
    expect(dropLevel(outline, 0, { index: 1, position: 'after' })).toBe(null)
    expect(dropLevel(outline, 2, { index: 1, position: 'onto' })).toBe(3)
    const deep = outlineOf('##### A\n\n# B\n\n## B1\n')
    expect(dropLevel(deep, 1, { index: 0, position: 'onto' })).toBe(null)
    expect(dropLevel(deep, 1, { index: 0, position: 'before' })).toBe(5)
    expect(dropLevel(deep, 2, { index: 0, position: 'onto' })).toBe(6)
  })
})

describe('target mode', () => {
  const rows = [{ top: 0, bottom: 30 }, { top: 30, bottom: 60 }]

  it('splits a row into before, onto and after by height', () => {
    expect(positionIn(rows[0], 2)).toBe('before')
    expect(positionIn(rows[0], 15)).toBe('onto')
    expect(positionIn(rows[0], 28)).toBe('after')
  })

  it('keeps edges at least 5 px', () => {
    expect(positionIn({ top: 0, bottom: 10 }, 4)).toBe('before')
  })

  it('gives no slot outside the rows or where a drop is not allowed', () => {
    const mode = target({ rows, isAllowed: index => index != 1 })
    expect(mode.slotAt(0, 0, 15)).toEqual({ index: 0, position: 'onto' })
    expect(mode.slotAt(0, 0, 45)).toBe(null)
    expect(mode.slotAt(0, 0, 90)).toBe(null)
    expect(mode.isSame({ index: 0, position: 'onto' }, { index: 0, position: 'onto' })).toBe(true)
  })
})
