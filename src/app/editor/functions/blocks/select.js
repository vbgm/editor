// npm packages
import { EditorSelection } from '@codemirror/state'
// local functions
import { getBlocksInRange, blockIndexAt } from './index.js'
import { textStart } from '../syntax/index.js'

// Shift+↑ / Shift+↓ select within the block first: on the block's first (or last) line they
// extend the selection to the block's start (or end). At the block's start (or end), the next
// press selects the whole block above (or below), as in block editors. Inside a block they move
// by line as usual.
// Selections cover whole bullet lines: Shift+↑ goes to a line's real start, and Shift+↓ from
// where a bullet's text starts begins the selection before the bullet.
// The selection goes to a block's real line start, so a bullet (drawn instead of its hidden
// mark) is selected with its line. But the cursor counts as at the block's start already where
// the text starts, behind a hidden heading, quote or bullet mark: from there the next press
// selects the block above, instead of selecting just the hidden mark.

// the block above or below, past any blank lines between them
function neighbour (state, block, forward) {
  const { doc } = state
  let number = doc.lineAt(forward ? block.to : block.from).number
  do number += forward ? 1 : -1
  while (number >= 1 && number <= doc.lines && /^[ \t]*$/.test(doc.line(number).text))
  if (number < 1 || number > doc.lines) return null
  const pos = doc.line(number).from
  const blocks = getBlocksInRange(state, pos, pos)
  const found = blocks[blockIndexAt(blocks, pos)]
  return found && found.from <= pos && pos <= found.to && found.from != block.from ? found : null
}

function selectToBlockEdge (forward) {
  return view => {
    const { state } = view
    if (state.selection.ranges.length > 1) return false
    const range = state.selection.main
    const blocks = getBlocksInRange(state, Math.max(0, range.head - 1), Math.min(state.doc.length, range.head + 1))
    const index = blockIndexAt(blocks, range.head)
    const block = blocks[index]
    if (!block || range.head < block.from || range.head > block.to) return false

    const edge = forward ? block.to : block.from
    const isAtEdge = forward ? range.head >= block.to : range.head <= textStart(state, block.from)
    let target
    // keeps the column for the next vertical move, as the usual move does
    let goalColumn
    if (isAtEdge) {
      // at the edge: the whole block above or below
      const next = neighbour(state, block, forward)
      if (!next) return false
      target = forward ? next.to : next.from
    } else {
      // the usual move by line, but not out of the block
      const moved = view.moveVertically(range, forward)
      const staysInBlock = forward ? moved.head <= block.to : moved.head >= block.from
      target = staysInBlock ? moved.head : edge
      if (staysInBlock) goalColumn = moved.goalColumn
    }

    // a selection going down from where a line's text starts (behind its bullet or other hidden
    // mark) starts at the real line start, so the bullet is selected with its line
    let anchor = range.anchor
    if (forward && target > anchor) {
      const line = state.doc.lineAt(anchor)
      if (anchor == textStart(state, line.from) && anchor > line.from) anchor = line.from
    }

    view.dispatch({
      selection: EditorSelection.range(anchor, target, goalColumn),
      scrollIntoView: true,
      userEvent: 'select'
    })
    return true
  }
}

export const selectBlockUp = selectToBlockEdge(false)
export const selectBlockDown = selectToBlockEdge(true)
