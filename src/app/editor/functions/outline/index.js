// npm packages
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language'
import { isolateHistory } from '@codemirror/commands'
// local functions
import { getBlocks } from '../blocks/index.js'
import { isBareHeading } from '../raw-markup.js'
import { moveSpec, unitEnd, withRenumbering } from '../move/index.js'
import shiftHeading from '../move/shift-heading.js'

// The outline (the TOC sidebar) is the document's headings: { id, title, level, from }.
// - title: the heading's text as Document mode shows it, without Markdown ('#', '**', link
//   addresses, backslashes of escapes)
// - id: the title and which heading of that title it is (the second 'Notes' is 'Notes 2'), so it
//   stays the same through edits elsewhere and through moves: the sidebar remembers which
//   headings are closed by it
// - from: where the heading's line starts
// A '#' with no space after it yet is a paragraph, as it is shown (raw-markup.js).
//
// Dropping a heading in the outline moves it with everything it owns (outlineMoveSpec), and its
// headings shift by as many levels as the heading's own level changes, so the section keeps its
// shape. Levels are taken from the place it lands:
// - before / after a heading: that heading's level (after: after its whole section)
// - onto a heading: its first child, at the level of the heading's first subheading if it has one
//   (a '#' with a '###' under it), else one deeper; it goes after the heading's own text
// A drop is refused onto the heading itself or into its own section, and where a heading would
// end up deeper than '######'.

const hiddenNodes = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'StrikethroughMark', 'LinkMark', 'URL', 'LinkTitle', 'LinkLabel'])

// complete: parse the whole document first; otherwise the outline goes as far as the parser has
// got (it parses on in the background, and the outline follows)
export function getOutline (state, { complete = false } = {}) {
  const tree = (complete && ensureSyntaxTree(state, state.doc.length, 5000)) || syntaxTree(state)
  const { doc } = state
  const outline = []
  const counts = new Map()
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const match = /^(ATX|Setext)Heading(\d)$/.exec(node.name)
    if (!match || (match[1] == 'ATX' && isBareHeading(doc, node))) continue
    const title = headingTitle(doc, tree, node)
    const count = (counts.get(title) || 0) + 1
    counts.set(title, count)
    outline.push({ id: count > 1 ? `${title} ${count}` : title, title, level: Number(match[2]), from: doc.lineAt(node.from).from })
  }
  return outline
}

// the heading's text without its marks; line breaks of a setext heading become spaces
function headingTitle (doc, tree, node) {
  const hidden = []
  tree.iterate({
    from: node.from,
    to: node.to,
    enter: inner => {
      if (inner.from < node.from || inner.to > node.to) return
      if (hiddenNodes.has(inner.name)) hidden.push([inner.from, inner.to])
      // an escape's backslash
      else if (inner.name == 'Escape') hidden.push([inner.from, inner.from + 1])
    }
  })
  let text = ''
  let at = node.from
  for (const [from, to] of hidden.sort((a, b) => a[0] - b[0])) {
    if (from > at) text += doc.sliceString(at, from)
    at = Math.max(at, to)
  }
  if (node.to > at) text += doc.sliceString(at, node.to)
  return text.replace(/\s+/g, ' ').trim()
}

// index of the heading the cursor is in (its section), or -1 above the first heading
export function activeIndex (outline, pos) {
  let found = -1
  for (let index = 0; index < outline.length && outline[index].from <= pos; index++) found = index
  return found
}

// The level the dragged heading (outline index from) gets dropped at slot { index, position },
// or null when that drop is not allowed (onto itself or into its own section, or deeper than
// '######'). Works on the outline alone, so the sidebar can ask it while dragging.
export function dropLevel (outline, from, { index, position }) {
  const dragged = outline[from]
  const target = outline[index]
  if (!dragged || !target) return null
  const end = sectionEnd(outline, from)
  if (index >= from && index <= end) return null
  let level = target.level
  if (position == 'onto') {
    const child = outline[index + 1]
    level = child && child.level > target.level ? child.level : target.level + 1
  }
  let deepest = dragged.level
  for (let next = from + 1; next <= end; next++) deepest = Math.max(deepest, outline[next].level)
  return deepest + level - dragged.level <= 6 ? level : null
}

// last outline index of the section starting at index
function sectionEnd (outline, index) {
  let end = index
  while (end + 1 < outline.length && outline[end + 1].level > outline[index].level) end++
  return end
}

// The move for dropping the heading at outline index from at slot, as one transaction spec, or
// null when it is not allowed or changes nothing. The outline must be the state's own.
export function outlineMoveSpec (state, outline, from, slot) {
  const level = dropLevel(outline, from, slot)
  if (level == null) return null
  const blocks = getBlocks(state, { complete: true })
  const blockAt = pos => blocks.findIndex(block => block.from == pos)
  const first = blockAt(outline[from].from)
  const target = blockAt(outline[slot.index].from)
  if (first < 0 || target < 0) return null
  const last = unitEnd(blocks, first)
  const levelDelta = level - blocks[first].level

  let before = target
  if (slot.position == 'after') before = unitEnd(blocks, target) + 1
  if (slot.position == 'onto') {
    // after the heading's own text, before its first subheading
    before = target + 1
    while (before <= unitEnd(blocks, target) && !blocks[before].level) before++
  }

  // landing where it is: only the levels change
  if (before >= first && before <= last + 1) return levelDelta ? shiftSpec(state, blocks, first, last, levelDelta) : null
  return { ...moveSpec(state, blocks, { from: first, to: last, before, levelDelta }), isMove: true }
}

// every heading of blocks[first..last] shifted by levelDelta, in place
function shiftSpec (state, blocks, first, last, levelDelta) {
  const changes = []
  for (let index = first; index <= last; index++) {
    const block = blocks[index]
    if (!block.level) continue
    // in document positions, where every line break is '\n' (as in moveSpec)
    const insert = shiftHeading(state.doc.sliceString(block.from, block.to), block.level, levelDelta, '\n')
    changes.push({ from: block.from, to: block.to, insert: state.toText(insert) })
  }
  return {
    changes,
    selection: state.selection.map(state.changes(changes), 1),
    userEvent: 'move.block',
    annotations: isolateHistory.of('full')
  }
}

// The drop as a transaction: the move, numbered lists counted again, one undo step. The editor
// stays where it is scrolled to (moveSpec scrolls to the cursor, which may be anywhere).
export function outlineMove (state, outline, from, slot) {
  const spec = outlineMoveSpec(state, outline, from, slot)
  if (!spec) return null
  const { isMove, ...rest } = spec
  const unscrolled = { ...rest, scrollIntoView: false }
  return isMove ? withRenumbering(state, unscrolled) : state.update(unscrolled)
}

// where the heading's text starts (behind its '#' marks)
export function headingTextStart (state, entry) {
  const line = state.doc.lineAt(entry.from)
  const marks = /^ {0,3}#{1,6}[ \t]+/.exec(line.text)
  return line.from + (marks ? marks[0].length : 0)
}
