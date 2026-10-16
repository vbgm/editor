// npm packages
import { describe, it, expect } from 'vitest'
// local
import { createState, getText } from './helpers.js'

// types the characters one by one at pos, as the keyboard does, and returns the file
function typeAt (text, pos, characters, options = { isLiteral: true }) {
  let state = createState(text, options)
  for (const character of characters) {
    const transaction = state.update({
      changes: { from: pos, insert: character },
      selection: { anchor: pos + 1 },
      userEvent: 'input.type'
    })
    state = transaction.state
    pos = state.selection.main.head
  }
  return { text: getText(state), head: state.selection.main.head }
}

const typed = (...args) => typeAt(...args).text

describe('Literal: typed text stays as typed', () => {
  it('escapes a lone # at the start of a line, keeps a hashtag readable', () => {
    expect(typed('a\n\n', 3, '#')).toBe('a\n\n\\#')
    expect(typed('a\n\n', 3, '#idea')).toBe('a\n\n\\#idea')
    expect(typed('a\n\n', 3, '# Title')).toBe('a\n\n\\# Title')
  })

  it('leaves a hashtag inside text alone', () => {
    expect(typed('a\n', 1, ' #idea')).toBe('a #idea\n')
  })

  it('escapes list, quote and numbered list marks at the start of a line', () => {
    expect(typed('a\n\n', 3, '- x')).toBe('a\n\n\\- x')
    expect(typed('a\n\n', 3, '> x')).toBe('a\n\n\\> x')
    expect(typed('a\n\n', 3, '1. x')).toBe('a\n\n1\\. x')
  })

  it('escapes the mark that closes emphasis', () => {
    expect(typed('a \n', 2, '*b*')).toBe('a *b\\*\n')
    expect(typed('a \n', 2, '~~b~~')).toBe('a ~~b~\\~\n')
  })

  it('leaves ordinary punctuation alone', () => {
    expect(typed('a\n', 1, ' snake_case a * b (c)')).toBe('a snake_case a * b (c)\n')
  })

  it('escapes the opening backtick of inline code (escapes do not work inside it)', () => {
    expect(typed('a \n', 2, '`x`')).toBe('a \\`x`\n')
  })

  it('escapes the bracket that would make a link (Document mode hides link brackets)', () => {
    expect(typed('a \n', 2, '[b](c)')).toBe('a [b\\](c)\n')
  })

  it('escapes a typed backslash that would hide the next character', () => {
    expect(typed('a *b\n', 2, '\\')).toBe('a \\\\*b\n')
  })

  it('keeps the cursor after the typed character', () => {
    expect(typeAt('a\n\n', 3, '#')).toEqual({ text: 'a\n\n\\#', head: 5 })
  })

  it('does not escape inside code', () => {
    expect(typed('```\nx\n```\n', 5, '# *a*')).toBe('```\nx# *a*\n```\n')
  })

  it('does not escape in Markdown mode', () => {
    expect(typed('a\n\n', 3, '# T', { isLiteral: true, isMarkdownShown: true })).toBe('a\n\n# T')
  })
})

describe('Literal: several characters typed at once', () => {
  const typeAtOnce = (text, pos, inserted) => getText(createState(text, { isLiteral: true }).update({
    changes: { from: pos, insert: inserted },
    selection: { anchor: pos + inserted.length },
    userEvent: 'input.type'
  }).state)

  it('are escaped as if typed one by one', () => {
    expect(typeAtOnce('a \n', 2, '*b*')).toBe('a *b\\*\n')
    expect(typeAtOnce('a\n\n', 3, '# T')).toBe('a\n\n\\# T')
    expect(typeAtOnce('a \n', 2, 'no marks')).toBe('a no marks\n')
  })
})

describe('Literal off (the default)', () => {
  it('typing Markdown formats', () => {
    expect(typed('a\n\n', 3, '# T', {})).toBe('a\n\n# T')
    expect(typed('a \n', 2, '*b*', {})).toBe('a *b*\n')
  })
})
