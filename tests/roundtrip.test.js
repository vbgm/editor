// npm packages
import { describe, it, expect } from 'vitest'
// local
import { fixtureNames, readFixture, createState, getText, runCommand, undoOnce, stateWithCursor } from './helpers.js'
import { moveBlockUp, moveBlockDown } from '/src/app/editor/functions/move/index.js'
import { lineBreakOf } from '/src/app/editor/functions/create-state.js'

// load → save must give back the same bytes
describe('round-trip', () => {
  for (const name of fixtureNames()) {
    it(name, () => {
      const bytes = readFixture(name)
      const state = createState(bytes.toString('utf8'))
      expect(Buffer.from(getText(state), 'utf8').equals(bytes)).toBe(true)
    })
  }

  it('moving a block down and back up restores the file', () => {
    for (const name of fixtureNames()) {
      const text = readFixture(name).toString('utf8')
      const state = createState(text)
      const moved = runCommand(moveBlockDown, state)
      expect(getText(undoOnce(moved))).toBe(text)
    }
  })

  it('keeps CRLF line breaks when moving', () => {
    const state = stateWithCursor('# A\r\n\r\npara| one\r\n\r\npara two\r\n')
    const moved = runCommand(moveBlockDown, state)
    expect(getText(moved)).toBe('# A\r\n\r\npara two\r\n\r\npara one\r\n')
  })
})

describe('line breaks', () => {
  it('detects CRLF only when every line break is CRLF', () => {
    expect(lineBreakOf('a\r\nb\r\n')).toBe('\r\n')
    expect(lineBreakOf('a\nb\n')).toBe(null)
    // mixed files are normalized to LF (known, accepted loss)
    expect(lineBreakOf('a\r\nb\n')).toBe(null)
  })
})
