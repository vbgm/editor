// npm packages
import { EditorSelection } from '@codemirror/state'
// local functions
import { getBlocksInRange, blockIndexAt } from './index.js'
import { textStart } from '../syntax/index.js'
import markdownShown from '../markdown-shown.js'
import { isEmptyParagraphLine } from '../gaps/index.js'

// Shift+↑ / Shift+↓ select within the block first: on the block's first (or last) line they
// extend the selection to the block's start (or end). At the block's start (or end), the next
// press selects the whole block above (or below), as in block editors. Inside a block they move
// by line as usual.
// Selections cover whole bullet lines: Shift+↑ goes to a line's real start, and Shift+↓ from
// where a bullet's text starts begins the selection before the bullet (Document mode, where the
// bullet's mark is hidden).
// The selection goes to a block's real line start, so a bullet (drawn instead of its hidden
// mark) is selected with its line. But the cursor counts as at the block's start already where
// the text starts, behind a hidden heading, quote or bullet mark: from there the next press
// selects the block above, instead of selecting just the hidden mark.

// the block above or below, past any hidden blank lines between them; an empty paragraph on the
// way (gaps/index.js) is a step of its own
function neighbour (state, block, forward) {
  const { doc } = state
  let number = doc.lineAt(forward ? block.to : block.from).number
  do {
    number += forward ? 1 : -1
    if (number < 1 || number > doc.lines) return null
    const line = doc.line(number)
    if (isEmptyParagraphLine(state, line)) return { from: line.from, to: line.to }
  } while (/^[ \t]*$/.test(doc.line(number).text))
  const pos = doc.line(number).from
  const blocks = getBlocksInRange(state, pos, pos)
  const found = blocks[blockIndexAt(blocks, pos)]
  return found && found.from <= pos && pos <= found.to && found.from != block.from ? found : null
}

// where a line's text starts: behind its hidden mark in Document mode, the line start in
// Markdown mode, where the marks are visible text
function contentStart (state, lineFrom) {
  return state.facet(markdownShown) ? lineFrom : textStart(state, lineFrom)
}

function selectToBlockEdge (forward) {
  return view => {
    const { state } = view
    if (state.selection.ranges.length > 1) return false
    const range = state.selection.main
    const blocks = getBlocksInRange(state, Math.max(0, range.head - 1), Math.min(state.doc.length, range.head + 1))
    let block = blocks[blockIndexAt(blocks, range.head)]
    if (!block || range.head < block.from || range.head > block.to) {
      // on an empty paragraph: it is a block of one empty line
      const line = state.doc.lineAt(range.head)
      if (!isEmptyParagraphLine(state, line)) return false
      block = { from: line.from, to: line.to }
    }

    const edge = forward ? block.to : block.from
    const isAtEdge = forward ? range.head >= block.to : range.head <= contentStart(state, block.from)
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
      if (anchor == contentStart(state, line.from) && anchor > line.from) anchor = line.from
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
