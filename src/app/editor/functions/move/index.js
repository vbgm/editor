// npm packages
import { EditorSelection, Text } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
// local functions
import { getBlocks, blockIndexAt } from '../blocks/index.js'
import shiftHeading from './shift-heading.js'
import renumber from './renumber.js'
import nestedMoveSpec, { nestedLines } from './nested.js'
import { movedLines, dispatchMove, bump } from './animate.js'

// Every move is a swap of two adjacent spans of blocks, done as one transaction
// (one undo step). The text of each span moves as it is, including the blank lines inside it;
// only the gaps at the changed junctions may get a blank line added, so that a moved
// paragraph does not merge into a list or a list item into a paragraph.
//
// Keyboard moves:
// - a body block (paragraph, list item, …) swaps with the block next to it, whatever it is;
//   moving it past a heading moves it into the neighbouring section
// - a heading moves together with everything it owns, and only swaps with a sibling heading
//   of the same level (changing its parent is done by dragging in the outline)
// Numbered lists the move touched are renumbered in the same transaction (renumber.js).
// A sub-item of a list moves among its siblings and into the neighbouring items (nested.js).

// last index of the unit starting at index: a heading owns everything up to the next
// heading of the same or a higher level
export function unitEnd (blocks, index) {
  const level = blocks[index].level
  if (!level) return index
  let end = index
  while (end + 1 < blocks.length && !(blocks[end + 1].level && blocks[end + 1].level <= level)) end++
  return end
}

export function moveBlockUp (view) {
  return run(view, 'up')
}

export function moveBlockDown (view) {
  return run(view, 'down')
}

// view: the editor view, or { state, dispatch } in tests; a drawn view slides the move, and bumps
// the block when it cannot move (animate.js)
function run (view, direction) {
  const { state } = view
  const nested = nestedMoveSpec(state, direction == 'up' ? -1 : 1)
  if (nested !== undefined) {
    if (nested) dispatchMove(view, withRenumbering(state, nested))
    else bump(view, nestedLines(state), direction)
    return true
  }
  const blocks = getBlocks(state, { complete: true })
  const spec = direction == 'up' ? specUp(state, blocks) : specDown(state, blocks)
  if (spec) dispatchMove(view, withRenumbering(state, spec))
  else bump(view, blockLines(state, blocks), direction)
  // handled even when nothing moved, so the default Alt-Shift-Arrow (copy line) does not run
  return true
}

// the move, and the numbered lists it touched counted up in order again, as one transaction
export function withRenumbering (state, spec) {
  const moved = state.update(spec)
  const { from, insert } = spec.changes
  const changes = renumber(moved.state, from, from + insert.length)
  return changes.length ? state.update(spec, { changes, sequential: true }) : moved
}

// the span under the selection: the block at the cursor, or all blocks the selection touches
function selectedSpan (state, blocks) {
  const { from, to } = state.selection.main
  const first = blockIndexAt(blocks, from)
  if (first < 0) return null
  const last = Math.max(first, blockIndexAt(blocks, to))
  return { first, last: Math.max(unitEnd(blocks, first), unitEnd(blocks, last)) }
}

// the line numbers a block move would move
function blockLines (state, blocks) {
  const span = selectedSpan(state, blocks)
  if (!span) return null
  return { from: state.doc.lineAt(blocks[span.first].from).number, to: state.doc.lineAt(blocks[span.last].to).number }
}

function specUp (state, blocks) {
  const span = selectedSpan(state, blocks)
  if (!span || blocks[span.first].type == 'frontmatter') return null
  const block = blocks[span.first]

  let target = span.first - 1
  if (block.level) {
    // previous heading of the same or a higher level; deeper ones belong to the previous sibling
    while (target >= 0 && !(blocks[target].level && blocks[target].level <= block.level)) target--
    if (target < 0 || blocks[target].level != block.level) return null
  }
  if (target < 0 || blocks[target].type == 'frontmatter') return null

  return moveSpec(state, blocks, { from: span.first, to: span.last, before: target })
}

function specDown (state, blocks) {
  const span = selectedSpan(state, blocks)
  if (!span || blocks[span.first].type == 'frontmatter') return null
  const block = blocks[span.first]

  const next = span.last + 1
  if (next >= blocks.length) return null
  if (block.level && blocks[next].level != block.level) return null

  // moving down = moving the next unit up, before this one
  const nextEnd = block.level ? unitEnd(blocks, next) : next
  return moveSpec(state, blocks, { from: next, to: nextEnd, before: span.first, moving: 'other' })
}

// Moves blocks[from..to] so that it starts where blocks[before] starts (before may be
// blocks.length for the end). levelDelta shifts every heading inside the moved span.
// Returns a transaction spec, or null when nothing changes.
// moving: 'span' keeps the selection on the moved span, 'other' on the span it jumped over
export function moveSpec (state, blocks, { from, to, before, levelDelta = 0, moving = 'span' }) {
  if (before >= from && before <= to + 1) return null
  if (blocks[before]?.type == 'frontmatter' || blocks[from].type == 'frontmatter') return null

  // the move as a swap of two adjacent spans: first ends right before second starts
  const moved = { from, to }
  const other = before < from ? { from: before, to: from - 1 } : { from: to + 1, to: before - 1 }
  const [first, second] = before < from ? [other, moved] : [moved, other]

  // work in document positions, where every line break counts as one character '\n'
  // (CRLF files are written back with CRLF by the editor state)
  const lineBreak = '\n'
  const doc = (a, b) => state.doc.sliceString(a, b)
  const spanText = span => {
    if (span != moved || !levelDelta) return doc(blocks[span.from].from, blocks[span.to].to)
    let text = ''
    for (let index = span.from; index <= span.to; index++) {
      const block = blocks[index]
      text += block.level ? shiftHeading(doc(block.from, block.to), block.level, levelDelta, lineBreak) : doc(block.from, block.to)
      if (index < span.to) text += doc(block.to, blocks[index + 1].from)
    }
    return text
  }

  // the region includes the gaps on both sides, since the blocks next to them change
  const previous = blocks[first.from - 1]
  const next = blocks[second.to + 1]
  const regionFrom = previous ? previous.to : blocks[first.from].from
  const regionTo = next ? next.from : blocks[second.to].to

  // each gap: its text, the pair of blocks it separated, the pair it separates now
  const junction = (gap, oldPair, newPair) => junctionGap(state.doc, gap, oldPair, newPair, lineBreak)
  const gapBefore = previous ? junction(doc(previous.to, blocks[first.from].from), [previous, blocks[first.from]], [previous, blocks[second.from]]) : ''
  const gapMiddle = junction(doc(blocks[first.to].to, blocks[second.from].from), [blocks[first.to], blocks[second.from]], [blocks[second.to], blocks[first.from]])
  const gapAfter = next ? junction(doc(blocks[second.to].to, next.from), [blocks[second.to], next], [blocks[first.to], next]) : ''

  const secondText = spanText(second)
  const firstText = spanText(first)
  const insert = gapBefore + secondText + gapMiddle + firstText + gapAfter

  // keep the selection where it was inside the span it belongs to
  const secondStart = regionFrom + gapBefore.length
  const firstStart = secondStart + secondText.length + gapMiddle.length
  const kept = moving == 'span' ? moved : other
  const keptStart = kept == first ? firstStart : secondStart
  const keptLength = kept == first ? firstText.length : secondText.length
  const oldStart = blocks[kept.from].from
  const mapPosition = position => keptStart + Math.min(Math.max(position - oldStart, 0), keptLength)
  const { anchor, head } = state.selection.main

  // the swapped lines, for the slide: where each span was and where it starts now
  const lineOf = pos => state.doc.lineAt(pos).number
  const lineBreaks = text => text.split(lineBreak).length - 1
  const secondLine = lineOf(regionFrom) + lineBreaks(gapBefore)
  const lines = span => ({ from: lineOf(blocks[span.from].from), to: lineOf(blocks[span.to].to) })
  const swapped = {
    above: { ...lines(first), newFrom: secondLine + lineBreaks(secondText + gapMiddle) },
    below: { ...lines(second), newFrom: secondLine }
  }

  return {
    changes: { from: regionFrom, to: regionTo, insert: Text.of(insert.split(lineBreak)) },
    selection: EditorSelection.single(mapPosition(anchor), mapPosition(head)),
    scrollIntoView: true,
    userEvent: 'move.block',
    // each move is its own undo step, even when moving fast
    annotations: [isolateHistory.of('full'), movedLines.of(swapped)]
  }
}

// Gap between two blocks that are now next to each other.
// - list items of the same kind (both bullets, or both numbered): a blank line between them only
//   if there was one between list items before, so a paragraph moving through a tight list does
//   not leave it loose
// - anything else, also a bullet item next to a numbered one: at least one blank line, so the
//   second block cannot merge into the first (a numbered item other than '1.' right under a
//   bullet item would become a line of its text)
function junctionGap (doc, gap, [oldBefore, oldAfter], [before, after], lineBreak) {
  const isItems = (a, b) => a.type == 'listItem' && b.type == 'listItem' && isNumbered(doc, a) == isNumbered(doc, b)
  if (isItems(before, after)) return isItems(oldBefore, oldAfter) ? gap : lineBreak
  const hasBlankLine = gap.split(lineBreak).length > 2
  return hasBlankLine ? gap : lineBreak + lineBreak
}

function isNumbered (doc, block) {
  return /^[ \t]*\d/.test(doc.lineAt(block.from).text)
}
