// npm packages
import { EditorSelection, Text } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { isolateHistory } from '@codemirror/commands'
// local functions
import { movedLines } from './animate.js'

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
  const selected = selectedItems(state)
  if (!selected) return undefined
  const { doc } = state
  const { item, last, span } = selected
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
    // the item goes up past its parent's own lines
    const parentLine = doc.lineAt(parent.from).number
    const spanLines = span.to.number - span.from.number + 1
    return rewrite(state, span, delta, {
      from: into.to,
      to: span.to.to,
      before: lineBreak,
      after: doc.sliceString(into.to, doc.lineAt(parent.from).from) + parentText
    }, {
      above: { from: parentLine, to: span.from.number - 1, newFrom: parentLine + spanLines },
      below: { from: span.from.number, to: span.to.number, newFrom: into.number + 1 }
    })
  }

  const next = sibling(last, 1)
  if (next) return swap(state, span, unitOf(doc, next), span)
  const parentBelow = sibling(parent, 1)
  if (!parentBelow) return null
  // after the parent's own lines below, before its sub-items
  const ownEnd = ownLinesEnd(doc, parentBelow)
  const delta = contentColumn(doc, parentBelow) - contentColumn(doc, parent)
  // the item goes down past the lines up to the next item's own lines
  const jumped = ownEnd.number - span.to.number
  return rewrite(state, span, delta, {
    from: doc.line(span.from.number - 1).to,
    to: ownEnd.to,
    before: doc.sliceString(span.to.to, ownEnd.to) + lineBreak,
    after: ''
  }, {
    above: { from: span.from.number, to: span.to.number, newFrom: span.from.number + jumped },
    below: { from: span.to.number + 1, to: ownEnd.number, newFrom: span.from.number }
  })
}

// The sub-item at the cursor and the selected siblings after it: { item, last, span } with span
// the first and last line; null when the selection is not in a sub-item
function selectedItems (state) {
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
  if (!item || item.parent?.parent?.name != 'ListItem') return null

  const { doc } = state
  let last = item
  for (let next = item.nextSibling; next && next.from <= doc.lineAt(main.to).to; next = next.nextSibling) {
    if (next.name == 'ListItem') last = next
  }
  return { item, last, span: { from: doc.lineAt(item.from), to: lastLineOf(doc, last) } }
}

// the line numbers a sub-item move would move (for the bump when it cannot move, animate.js)
export function nestedLines (state) {
  const selected = selectedItems(state)
  return selected && { from: selected.span.from.number, to: selected.span.to.number, kind: 'listItem' }
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
  const secondLines = second.to.number - second.from.number
  const swapped = {
    above: { from: first.from.number, to: first.to.number, newFrom: first.from.number + secondLines + between.split(lineBreak).length - 1 },
    below: { from: second.from.number, to: second.to.number, newFrom: first.from.number }
  }
  return spec(state, first.from.from, second.to.to, insert, moved, movedStart, 0, swapped)
}

// moves span (indented by delta) to replace from..to, between before and after
function rewrite (state, span, delta, { from, to, before, after }, swapped) {
  const text = reindent(state.doc.sliceString(span.from.from, span.to.to), delta)
  return spec(state, from, to, before + text + after, span, from + before.length, delta, swapped)
}

// A numbered sub-item that ends up first in its sub-list gets '1.' (its '.' or ')' kept): right
// under text, Markdown reads a numbered line as more of that text unless it is '1.', so it would
// not be a list item, and renumbering would not see it. First: the line above (the last non-blank
// one) is less indented (the parent's line), or as indented but not an item (the parent's further
// line). The rest of the list is counted by renumber.js.
const numbered = /^([ \t]*)\d{1,9}([.)])(?=[ \t]|$)/

function firstItemsFromOne (doc, from, insert) {
  const indent = text => /^[ \t]*/.exec(text)[0].length
  const startLine = doc.lineAt(from)
  // the text before the region on its first line, and the last non-blank line above that
  const prefix = doc.sliceString(startLine.from, from)
  let previous = null
  for (let number = startLine.number - (prefix.trim() ? 0 : 1); number >= 1 && previous == null; number--) {
    const text = number == startLine.number ? prefix : doc.line(number).text
    if (text.trim()) previous = text
  }
  const lines = insert.split(lineBreak)
  for (let index = 0; index < lines.length; index++) {
    // a region starting after text continues that line, which does not move
    const text = index ? lines[index] : prefix + lines[0]
    const match = !(index == 0 && prefix) && numbered.exec(text)
    if (match && previous != null && !/^1[.)]/.test(text.slice(match[1].length))) {
      const isFirst = indent(previous) < match[1].length || (indent(previous) == match[1].length && !itemStart.test(previous))
      if (isFirst) lines[index] = `${match[1]}1${match[2]}${text.slice(match[0].length)}`
    }
    if (text.trim()) previous = text
  }
  return lines.join(lineBreak)
}

function reindent (text, delta) {
  if (!delta) return text
  return text.split(lineBreak).map(line => {
    if (/^[ \t]*$/.test(line)) return line
    return delta > 0 ? ' '.repeat(delta) + line : line.slice(Math.min(-delta, /^[ \t]*/.exec(line)[0].length))
  }).join(lineBreak)
}

// swapped: the lines that changed places, for the slide (animate.js)
function spec (state, from, to, insert, moved, movedStart, delta, swapped) {
  const { doc } = state
  // the line after the region too: an item there may now be first in its sub-list (the first
  // sub-item moving up leaves the next one first)
  const toLine = doc.lineAt(to)
  if (to == toLine.to && toLine.number < doc.lines) {
    const next = doc.line(toLine.number + 1)
    insert += lineBreak + next.text
    to = next.to
  }
  insert = firstItemsFromOne(doc, from, insert)
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
    annotations: [isolateHistory.of('full'), movedLines.of(swapped)]
  }
}
