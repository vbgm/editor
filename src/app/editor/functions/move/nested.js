// npm packages
import { EditorSelection, Text } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { isolateHistory } from '@codemirror/commands'

// Moving nested list items (Alt+↑/↓ with the cursor in a sub-item); top-level blocks are moved
// by index.js. A sub-item (with its own sub-items, or every selected sibling):
// - swaps with the sibling next to it, keeping its depth
// - at the edge of its sub-list goes into the neighbouring parent item: the first sub-item moving
//   up becomes the last sub-item of the item above its parent, the last one moving down the first
//   sub-item of the item below; its lines are indented for the new parent's mark ('1.' vs '10.')
// - at the edge of the whole list it stays
// Returns a transaction spec, null when the sub-item cannot move, undefined when the selection is
// not in a sub-item.

const itemStart = /^([ \t]*)((?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$))/
const lineBreak = '\n'

export default function nestedMoveSpec (state, direction) {
  const { main } = state.selection
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) || syntaxTree(state)
  let item = null
  // from where the cursor line's text starts: at the end of a line the position after the cursor
  // already belongs to the outer item
  const cursorLine = state.doc.lineAt(main.head)
  const textStart = cursorLine.from + /^[ \t]*/.exec(cursorLine.text)[0].length
  for (let node = tree.resolveInner(textStart, 1); node; node = node.parent) {
    if (node.name == 'ListItem') {
      item = node
      break
    }
  }
  if (!item || item.parent?.parent?.name != 'ListItem') return undefined

  const { doc } = state
  // the selected siblings
  let last = item
  for (let next = item.nextSibling; next && next.from <= doc.lineAt(main.to).to; next = next.nextSibling) {
    if (next.name == 'ListItem') last = next
  }
  const span = { from: doc.lineAt(item.from), to: lastLineOf(doc, last) }
  const parent = item.parent.parent

  if (direction < 0) {
    const previous = sibling(item, -1)
    if (previous) return swap(state, unitOf(doc, previous), span, span)
    const parentAbove = sibling(parent, -1)
    if (!parentAbove) return null
    // after everything the item above holds, before the parent's own line
    const into = lastLineOf(doc, parentAbove)
    const parentText = doc.sliceString(doc.lineAt(parent.from).from, span.from.from - 1)
    const delta = contentColumn(doc, parentAbove) - contentColumn(doc, parent)
    return rewrite(state, span, delta, {
      from: into.to,
      to: span.to.to,
      before: lineBreak,
      after: doc.sliceString(into.to, doc.lineAt(parent.from).from) + parentText
    })
  }

  const next = sibling(last, 1)
  if (next) return swap(state, span, unitOf(doc, next), span)
  const parentBelow = sibling(parent, 1)
  if (!parentBelow) return null
  // after the parent's own lines below, before its sub-items
  const ownEnd = ownLinesEnd(doc, parentBelow)
  const delta = contentColumn(doc, parentBelow) - contentColumn(doc, parent)
  return rewrite(state, span, delta, {
    from: doc.line(span.from.number - 1).to,
    to: ownEnd.to,
    before: doc.sliceString(span.to.to, ownEnd.to) + lineBreak,
    after: ''
  })
}

function sibling (item, direction) {
  let node = direction < 0 ? item.prevSibling : item.nextSibling
  while (node && node.name != 'ListItem') node = direction < 0 ? node.prevSibling : node.nextSibling
  return node
}

// the last line of a node (a node may end right after a line break)
function lastLineOf (doc, node) {
  const line = doc.lineAt(node.to)
  return line.from == node.to && node.to > node.from ? doc.lineAt(node.to - 1) : line
}

function unitOf (doc, item) {
  return { from: doc.lineAt(item.from), to: lastLineOf(doc, item) }
}

// the last line of an item's own text, before its sub-list
function ownLinesEnd (doc, item) {
  for (let child = item.firstChild; child; child = child.nextSibling) {
    if (/List$/.test(child.name)) return doc.line(doc.lineAt(child.from).number - 1)
  }
  return lastLineOf(doc, item)
}

// where an item's text starts: its indentation and its mark with the space after it
function contentColumn (doc, item) {
  const mark = itemStart.exec(doc.lineAt(item.from).text)
  return mark ? mark[1].length + Math.max(mark[2].length, mark[2].trimEnd().length + 1) : 0
}

// first and second are adjacent units (first above); moved is the one the selection is in
function swap (state, first, second, moved) {
  const { doc } = state
  const firstText = doc.sliceString(first.from.from, first.to.to)
  const secondText = doc.sliceString(second.from.from, second.to.to)
  const between = doc.sliceString(first.to.to, second.from.from)
  const insert = secondText + between + firstText
  const movedStart = moved == first ? first.from.from + secondText.length + between.length : first.from.from
  return spec(state, first.from.from, second.to.to, insert, moved, movedStart, 0)
}

// moves span (indented by delta) to replace from..to, between before and after
function rewrite (state, span, delta, { from, to, before, after }) {
  const text = reindent(state.doc.sliceString(span.from.from, span.to.to), delta)
  return spec(state, from, to, before + text + after, span, from + before.length, delta)
}

function reindent (text, delta) {
  if (!delta) return text
  return text.split(lineBreak).map(line => {
    if (/^[ \t]*$/.test(line)) return line
    return delta > 0 ? ' '.repeat(delta) + line : line.slice(Math.min(-delta, /^[ \t]*/.exec(line)[0].length))
  }).join(lineBreak)
}

function spec (state, from, to, insert, moved, movedStart, delta) {
  const { doc } = state
  // the selection stays on the same text: same line of the moved span, column shifted by delta
  const map = position => {
    const line = doc.lineAt(position)
    let start = movedStart
    for (let number = moved.from.number; number < line.number; number++) {
      start += reindent(doc.line(number).text, delta).length + 1
    }
    const length = reindent(line.text, delta).length
    return start + Math.min(Math.max(position - line.from + (/^[ \t]*$/.test(line.text) ? 0 : delta), 0), length)
  }
  const { anchor, head } = state.selection.main
  return {
    changes: { from, to, insert: Text.of(insert.split(lineBreak)) },
    selection: EditorSelection.single(map(anchor), map(head)),
    scrollIntoView: true,
    userEvent: 'move.block',
    annotations: isolateHistory.of('full')
  }
}
