// npm packages
import { EditorSelection } from '@codemirror/state'
// local functions
import { getBlocksInRange, blockIndexAt } from './index.js'
import markdownShown from '../markdown-shown.js'
import { textStart } from '../syntax/index.js'

// Shift+↑ / Shift+↓ select within the block first: on the block's first (or last) line they
// extend the selection to the block's start (or end). At the block's start (or end), the next
// press selects the whole block above (or below), as in block editors. Inside a block they move
// by line as usual.
// With Markdown hidden, a block starts where its text starts, behind a hidden heading, quote or
// bullet mark: selecting up to the real line start would select nothing visible.

function blockStart (state, block) {
  return state.facet(markdownShown) ? block.from : textStart(state, block.from)
}

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

    const edge = forward ? block.to : blockStart(state, block)
    let target
    if (forward ? range.head >= edge : range.head <= edge) {
      // at the edge: the whole block above or below
      const next = neighbour(state, block, forward)
      if (!next) return false
      target = forward ? next.to : blockStart(state, next)
    } else {
      // the usual move stays inside the block: let it happen
      const moved = view.moveVertically(range, forward)
      if (forward ? moved.head <= block.to : moved.head >= block.from) return false
      target = edge
    }
    view.dispatch({
      selection: EditorSelection.range(range.anchor, target),
      scrollIntoView: true,
      userEvent: 'select'
    })
    return true
  }
}

export const selectBlockUp = selectToBlockEdge(false)
export const selectBlockDown = selectToBlockEdge(true)
