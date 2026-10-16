// npm packages
import { EditorState, EditorSelection, Annotation } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { isolateHistory } from '@codemirror/commands'
// local functions
import { getBlocks, blockIndexAt } from '../blocks/index.js'
import { unitEnd, moveBlockUp, moveBlockDown } from '../move/index.js'
import markdown from '../markdown/index.js'

// Where a dragged block can be dropped, and the drop itself. A drag goes exactly where Alt+↑/↓
// would take the block: slot k (k < 0 up, k > 0 down) is where |k| presses put it, and dropping
// there gives the same file as those presses, as one undo step.
// - a paragraph, top-level list item, quote, … moves block by block, past headings into other
//   sections
// - a heading moves with everything it owns, among its sibling headings of the same level
// - a sub-item moves among its siblings and into the other items around its parent (nested.js)
// What is dragged is what Alt+↑/↓ would move with the cursor in the block next to the handle,
// or the selection when that block is part of a selection over several blocks.
//
// A slot says which lines of the current layout move aside while the block is over it (shift,
// line numbers) and where the block then sits (cut: the top or bottom edge of a line).

const isBlank = text => /^[ \t]*$/.test(text)

// on a drop: the first line number of the dropped lines after it
export const droppedAt = Annotation.define()

function treeOf (state) {
  return ensureSyntaxTree(state, state.doc.length, 1000) || syntaxTree(state)
}

// the innermost list item whose lines hold pos
function itemAt (state, pos) {
  const line = state.doc.lineAt(pos)
  const textStart = line.from + /^[ \t]*/.exec(line.text)[0].length
  for (let node = treeOf(state).resolveInner(textStart, 1); node; node = node.parent) {
    if (node.name == 'ListItem') return node
  }
  return null
}

const isNested = item => item?.parent?.parent?.name == 'ListItem'

// the last line of a node (a node may end right after a line break)
function lastLine (doc, node) {
  const line = doc.lineAt(node.to)
  return line.from == node.to && node.to > node.from ? doc.lineAt(node.to - 1) : line
}

// What a drag from the handle next to pos moves: { selection, from, to, blocks }, with from/to the
// first and last line numbers of the dragged lines, the selection that makes Alt+↑/↓ move them,
// and for top-level blocks their indexes ({ first, last }; none for sub-items).
// Null where nothing can be dragged (front matter, an empty document).
export function dragSource (state, pos) {
  const { doc } = state
  const { main } = state.selection
  const touches = (from, to) => !main.empty && main.from <= to && main.to >= from

  const item = itemAt(state, pos)
  if (isNested(item)) {
    // the selected siblings, when the selection covers this one
    if (touches(item.from, item.to)) {
      const first = itemAt(state, main.from)
      if (first && first.parent == item.parent && isNested(first)) {
        let last = first
        for (let next = first.nextSibling; next && next.from <= doc.lineAt(main.to).to; next = next.nextSibling) {
          if (next.name == 'ListItem') last = next
        }
        return { selection: EditorSelection.single(main.anchor, main.head), from: doc.lineAt(first.from).number, to: lastLine(doc, last).number }
      }
    }
    const line = doc.lineAt(item.from)
    return { selection: EditorSelection.single(line.to), from: line.number, to: lastLine(doc, item).number }
  }

  const blocks = getBlocks(state, { complete: true })
  const index = blockIndexAt(blocks, pos)
  if (index < 0 || blocks[index].type == 'frontmatter') return null
  let first = index
  let last = unitEnd(blocks, index)
  let selection = EditorSelection.single(blocks[index].from)
  if (touches(blocks[index].from, blocks[last].to)) {
    const selectedFirst = blockIndexAt(blocks, main.from)
    const selectedLast = Math.max(selectedFirst, blockIndexAt(blocks, main.to))
    if (selectedFirst != selectedLast && blocks[selectedFirst].type != 'frontmatter') {
      first = selectedFirst
      last = Math.max(unitEnd(blocks, selectedFirst), unitEnd(blocks, selectedLast))
      selection = EditorSelection.single(main.anchor, main.head)
    }
  }
  return { selection, from: doc.lineAt(blocks[first].from).number, to: doc.lineAt(blocks[last].to).number, blocks: { first, last } }
}

// The slots a drag of source can go to, nearest first: { up: [...], down: [...] }, where up[i]
// is slot -(i + 1) and down[i] slot i + 1. Each slot: { cut: { line, edge }, shift: { from, to } }.
export function dropSlots (state, dragged) {
  return dragged.blocks ? blockSlots(state, dragged) : nestedSlots(state, dragged)
}

// top-level blocks: worked out from the blocks, without moving anything
function blockSlots (state, dragged) {
  const { doc } = state
  const blocks = getBlocks(state, { complete: true })
  const { first, last } = dragged.blocks
  const level = blocks[first].level
  const lineOf = pos => doc.lineAt(pos).number
  const up = []
  const down = []

  // up: block by block, or from sibling heading to sibling heading
  let target = first - 1
  while (target >= 0 && blocks[target].type != 'frontmatter') {
    if (level) {
      while (target >= 0 && !(blocks[target].level && blocks[target].level <= level)) target--
      if (target < 0 || blocks[target].level != level) break
    }
    const line = lineOf(blocks[target].from)
    up.push({ cut: { line, edge: 'top' }, shift: { from: line, to: dragged.from - 1 }, before: target })
    target--
  }

  // down: the next block, or the next sibling heading with what it owns
  let next = last + 1
  while (next < blocks.length) {
    if (level && blocks[next].level != level) break
    const end = level ? unitEnd(blocks, next) : next
    const line = lineOf(blocks[end].to)
    down.push({ cut: { line, edge: 'bottom' }, shift: { from: dragged.to + 1, to: line }, before: end + 1 })
    next = end + 1
  }
  return { up, down }
}

// Moves are replayed on a copy of the region of the document they change: blocks lo..hi, one
// more block on each side (the gaps next to them change too) and whole lists at the edges (they
// are renumbered), as a state with only the Markdown parser. A move there costs as much as the
// region is long, not the document (8 ms per step on 10k lines).
function regionOf (state, lo, hi, selection) {
  const blocks = getBlocks(state, { complete: true })
  lo = Math.max(lo - 1, 0)
  hi = Math.min(hi + 1, blocks.length - 1)
  const isSameList = (a, b) => a.list != null && a.list == b.list
  while (lo > 0 && isSameList(blocks[lo - 1], blocks[lo])) lo--
  while (hi < blocks.length - 1 && isSameList(blocks[hi + 1], blocks[hi])) hi++
  const from = blocks[lo].from
  const to = blocks[hi].to
  const { anchor, head } = selection.main
  return {
    from,
    to,
    lineOffset: state.doc.lineAt(from).number - 1,
    state: EditorState.create({
      doc: state.doc.sliceString(from, to),
      selection: EditorSelection.single(anchor - from, head - from),
      extensions: [markdown()]
    })
  }
}

// one Alt+↑/↓ press (direction -1 or 1) in a region; null when nothing moves
function press (state, direction) {
  let next = null
  const command = direction < 0 ? moveBlockUp : moveBlockDown
  command({ state, dispatch: transaction => { next = transaction.state } })
  return next
}

// the region a drop of top-level blocks at slot steps changes
function blockRegion (state, dragged, steps) {
  const slots = dropSlots(state, dragged)
  const slot = (steps < 0 ? slots.up : slots.down)[Math.abs(steps) - 1]
  if (!slot) return null
  const { first, last } = dragged.blocks
  return regionOf(state, Math.min(first, slot.before), Math.max(last, slot.before - 1), dragged.selection)
}

// a sub-item moves within its top-level list
function listRegion (state, dragged) {
  const blocks = getBlocks(state, { complete: true })
  const index = blockIndexAt(blocks, state.doc.line(dragged.from).from)
  return regionOf(state, index, index, dragged.selection)
}

// sub-items: by moving them step by step, as Alt+↑/↓ does; the lines they jumped over are the
// lines of the other items, which keep their order (only blank lines between them can change)
const maxSteps = 500

function nestedSlots (state, dragged) {
  const region = listRegion(state, dragged)
  const offset = region.lineOffset
  const others = otherLines(region.state.doc, dragged.from - offset, dragged.to - offset)
  const slots = { up: [], down: [] }
  for (const direction of [-1, 1]) {
    let current = region.state
    for (let step = 0; step < maxSteps; step++) {
      current = press(current, direction)
      if (!current) break
      // the other lines now above the dragged ones
      const start = draggedStart(current, dragged, state, offset) - offset
      let above = 0
      for (let number = 1; number < start; number++) {
        if (!isBlank(current.doc.line(number).text)) above++
      }
      if (direction < 0) {
        const line = others[above] + offset
        slots.up.push({ cut: { line, edge: 'top' }, shift: { from: line, to: dragged.from - 1 } })
      } else {
        const line = others[above - 1] + offset
        slots.down.push({ cut: { line, edge: 'bottom' }, shift: { from: dragged.to + 1, to: line } })
      }
    }
  }
  return slots
}

// line numbers of the non-blank lines outside the dragged ones, in order
function otherLines (doc, from, to) {
  const lines = []
  for (let number = 1; number <= doc.lines; number++) {
    if ((number < from || number > to) && !isBlank(doc.line(number).text)) lines.push(number)
  }
  return lines
}

// first line of the dragged lines in a moved region, as a line of the whole document: the
// selection stays on the same line of them
function draggedStart (moved, dragged, original, lineOffset) {
  const selectionLine = original.doc.lineAt(dragged.selection.main.from).number - dragged.from
  return moved.doc.lineAt(moved.selection.main.from).number + lineOffset - selectionLine
}

// The transaction spec dropping the dragged lines at slot steps: the file Alt+↑ (steps < 0) or
// Alt+↓ (steps > 0) pressed as often would give; null for 0 or out of range. The selection stays
// on the text it was on.
export function dropSpec (state, dragged, steps) {
  if (!steps) return null
  const region = dragged.blocks ? blockRegion(state, dragged, steps) : listRegion(state, dragged)
  if (!region) return null
  let moved = region.state
  for (let step = 0; step < Math.abs(steps); step++) {
    moved = press(moved, Math.sign(steps))
    if (!moved) return null
  }

  // the smallest change that turns the region into the moved one
  const oldText = region.state.doc.toString()
  const newText = moved.doc.toString()
  let from = 0
  while (from < oldText.length && from < newText.length && oldText[from] == newText[from]) from++
  let oldTo = oldText.length
  let newTo = newText.length
  while (oldTo > from && newTo > from && oldText[oldTo - 1] == newText[newTo - 1]) {
    oldTo--
    newTo--
  }
  const changes = { from: region.from + from, to: region.from + oldTo, insert: moved.doc.slice(from, newTo) }

  const newDoc = state.update({ changes }).state.doc
  const start = draggedStart(moved, dragged, state, region.lineOffset)
  const map = mapByLines(state.doc, newDoc, dragged, start)
  const { anchor, head } = state.selection.main
  return {
    changes,
    selection: EditorSelection.single(map(anchor), map(head)),
    userEvent: 'move.drop',
    annotations: [isolateHistory.of('full'), droppedAt.of(start)]
  }
}

// Maps positions of the old document to the new one by line: the dragged lines are at newStart,
// every other non-blank line is the same line as before, in the same order; a column keeps its
// place in the line's text when its indentation changed. A blank line maps to the end of the line
// above it.
function mapByLines (oldDoc, newDoc, dragged, newStart) {
  const newEnd = newStart + (dragged.to - dragged.from)
  const others = otherLines(newDoc, newStart, newEnd)
  const ordinal = new Map(otherLines(oldDoc, dragged.from, dragged.to).map((line, index) => [line, index]))

  const newLineOf = number => {
    if (number >= dragged.from && number <= dragged.to) return newStart + number - dragged.from
    return others[ordinal.get(number)]
  }
  const indent = text => /^[ \t]*/.exec(text)[0].length

  return position => {
    let line = oldDoc.lineAt(position)
    let column = position - line.from
    while (isBlank(line.text) && !(line.number >= dragged.from && line.number <= dragged.to)) {
      if (line.number == 1) return 0
      line = oldDoc.line(line.number - 1)
      column = line.length
    }
    const newLine = newDoc.line(newLineOf(line.number))
    const shifted = column >= indent(line.text) ? column + indent(newLine.text) - indent(line.text) : column
    return newLine.from + Math.min(Math.max(shifted, 0), newLine.length)
  }
}
