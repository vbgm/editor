// npm packages
import { readFileSync, readdirSync } from 'node:fs'
import { EditorSelection } from '@codemirror/state'
import { undo } from '@codemirror/commands'
// app functions
import { createState, getText } from '/src/app/editor/functions/create-state.js'
import { getBlocks } from '/src/app/editor/functions/blocks/index.js'

const fixturesDir = new URL('./fixtures/', import.meta.url)

export function fixtureNames () {
  return readdirSync(fixturesDir).filter(name => name.endsWith('.md')).sort()
}

export function readFixture (name) {
  return readFileSync(new URL(name, fixturesDir))
}

// '|' in text marks the cursor and is removed
export function stateWithCursor (text, options) {
  const cursor = text.indexOf('|')
  const state = createState(cursor < 0 ? text : text.slice(0, cursor) + text.slice(cursor + 1), options)
  return cursor < 0 ? state : state.update({ selection: EditorSelection.cursor(cursor) }).state
}

// runs a command like a key press would; returns the new state (or the same one)
export function runCommand (command, state) {
  let result = state
  command({ state, dispatch: transaction => { result = transaction.state } })
  return result
}

export function undoOnce (state) {
  return runCommand(undo, state)
}

export function blocksOf (state) {
  return getBlocks(state, { complete: true }).map(block => ({
    type: block.type,
    level: block.level,
    text: state.sliceDoc(block.from, block.to)
  }))
}

export { createState, getText }
