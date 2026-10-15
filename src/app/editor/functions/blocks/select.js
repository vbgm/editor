// npm packages
import { EditorSelection } from '@codemirror/state'
// local functions
import { getBlocksInRange, blockIndexAt } from './index.js'

// Shift+↑ / Shift+↓ select within the block first: on the block's first (or last) line they
// extend the selection to the block's start (or end), and only the next press goes on into the
// block above (or below), as in block editors. Inside a block they move by line as usual.

function blockAt (state, pos) {
  const blocks = getBlocksInRange(state, pos, pos)
  const block = blocks[blockIndexAt(blocks, pos)]
  return block && pos >= block.from && pos <= block.to ? block : null
}

function selectToBlockEdge (forward) {
  return view => {
    const { state } = view
    const range = state.selection.main
    if (state.selection.ranges.length > 1) return false
    const block = blockAt(state, range.head)
    if (!block) return false
    const edge = forward ? block.to : block.from
    if (range.head == edge) return false
    // would the usual move leave the block?
    const moved = view.moveVertically(range, forward)
    if (forward ? moved.head <= block.to : moved.head >= block.from) return false
    view.dispatch({
      selection: EditorSelection.range(range.anchor, edge),
      scrollIntoView: true,
      userEvent: 'select'
    })
    return true
  }
}

export const selectBlockUp = selectToBlockEdge(false)
export const selectBlockDown = selectToBlockEdge(true)
