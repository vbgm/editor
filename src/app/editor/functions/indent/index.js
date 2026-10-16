// npm packages
import { syntaxTree, indentUnit } from '@codemirror/language'
// local functions
import renumber from '../move/renumber.js'

// Tab and Shift+Tab in Document mode indent by block, the Markdown way:
// - a list item (with its sub-items, and every selected item) is nested under the item above,
//   indented as wide as that item's mark ('- ' 2 spaces, '1. ' 3); Shift+Tab moves it out one
//   level. The first item of a list nests under the last item of a list of another kind right
//   above it (bullet points under a numbered step); otherwise it cannot be nested. Numbered lists
//   are counted again (move/renumber.js: a sub-list counts from 1).
// - a paragraph becomes a quote ('> '), Tab again quotes it one level deeper ('> > '); Shift+Tab
//   removes one level. Every line of the block gets the mark, so no line falls out of the quote.
// - in code Tab inserts indentation; a heading stays as it is.
// - Backspace where a quote's text starts removes one level from the whole quote, as Shift+Tab
//   (Markdown's own Backspace would take the mark off that one line, breaking the quote apart);
//   on a further line of the quote it joins the line to the one above.
// Tab never leaves the editor (the browser would move the focus on).

const itemStart = /^([ \t]*)((?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$))/
const code = new Set(['FencedCode', 'CodeBlock', 'HTMLBlock', 'Frontmatter', 'CommentBlock', 'Table'])
const leading = text => /^[ \t]*/.exec(text)[0].length
const isBlank = text => /^[ \t]*$/.test(text)

export function indentBlock (view) {
  return run(view, 1)
}

export function outdentBlock (view) {
  return run(view, -1)
}

function run ({ state, dispatch }, direction) {
  if (state.selection.ranges.length > 1) return true
  const { main } = state.selection
  const first = state.doc.lineAt(main.from)
  const last = state.doc.lineAt(main.to)

  // what the first selected line is in: the innermost list item or quote decides
  for (let node = syntaxTree(state).resolveInner(first.from + leading(first.text), 1); node; node = node.parent) {
    if (code.has(node.name)) {
      if (direction > 0) dispatch(state.update(state.replaceSelection(state.facet(indentUnit)), { scrollIntoView: true, userEvent: 'input' }))
      return true
    }
    if (/Heading/.test(node.name)) return true
    if (node.name == 'ListItem') return indentItems(state, dispatch, node, last, direction)
    if (node.name == 'Blockquote') break
  }
  return quoteLines(state, dispatch, first, last, direction)
}

// the last line of a node (a node may end right after a line break)
function lastLineOf (doc, node) {
  const line = doc.lineAt(node.to)
  return line.from == node.to && node.to > node.from ? doc.lineAt(node.to - 1) : line
}

function indentItems (state, dispatch, item, lastSelected, direction) {
  const { doc } = state
  // the selected items: siblings from this one to the last one the selection reaches
  let lastItem = item
  for (let next = item.nextSibling; next && next.from <= lastSelected.to; next = next.nextSibling) {
    if (next.name == 'ListItem') lastItem = next
  }
  const firstLine = doc.lineAt(item.from)
  const own = leading(firstLine.text)

  let delta
  if (direction > 0) {
    let previous = item.prevSibling
    while (previous && previous.name != 'ListItem') previous = previous.prevSibling
    // the first item: under the last item of the list right above, a list of another kind
    if (!previous && /List$/.test(item.parent?.prevSibling?.name)) {
      previous = item.parent.prevSibling.lastChild
      while (previous && previous.name != 'ListItem') previous = previous.prevSibling
    }
    if (!previous) return true
    const mark = itemStart.exec(doc.lineAt(previous.from).text)
    if (!mark) return true
    delta = mark[1].length + Math.max(mark[2].length, mark[2].trimEnd().length + 1) - own
  } else {
    const parent = item.parent?.parent
    if (parent?.name != 'ListItem') return true
    delta = leading(doc.lineAt(parent.from).text) - own
  }
  if (!delta) return true

  const changes = []
  for (let number = firstLine.number; number <= lastLineOf(doc, lastItem).number; number++) {
    const line = doc.line(number)
    if (isBlank(line.text)) continue
    if (delta > 0) changes.push({ from: line.from, insert: ' '.repeat(delta) })
    else changes.push({ from: line.from, to: line.from + Math.min(-delta, leading(line.text)) })
  }
  const indented = state.update(withCursorBehind(state, changes))
  const from = indented.changes.mapPos(firstLine.from)
  const to = indented.changes.mapPos(lastLineOf(doc, lastItem).to)
  const renumbering = renumber(indented.state, from, to)
  dispatch(state.update(
    { ...withCursorBehind(state, changes), scrollIntoView: true, userEvent: 'input.indent' },
    { changes: renumbering, sequential: true }
  ))
  return true
}

const quoteMark = /^(?:[ \t]*>[ \t]?)+/

export function quoteBackspace ({ state, dispatch }) {
  const { main } = state.selection
  if (state.selection.ranges.length > 1 || !main.empty) return false
  const line = state.doc.lineAt(main.head)
  const mark = quoteMark.exec(line.text)
  if (!mark || main.head != line.from + mark[0].length) return false
  for (let node = syntaxTree(state).resolveInner(main.head, -1); node; node = node.parent) {
    if (code.has(node.name)) return false
  }
  const previous = line.number > 1 && state.doc.line(line.number - 1)
  if (previous && quoteMark.test(previous.text) && !isBlank(previous.text.replace(quoteMark, ''))) {
    dispatch(state.update({ changes: { from: previous.to, to: main.head }, userEvent: 'delete.backward' }))
    return true
  }
  return quoteLines(state, dispatch, line, line, -1)
}

function quoteLines (state, dispatch, first, last, direction) {
  const { doc } = state
  // whole blocks: every line of the paragraphs or quotes the selection touches
  let from = first.number
  let to = last.number
  while (from > 1 && !isBlank(doc.line(from).text) && !isBlank(doc.line(from - 1).text)) from--
  while (to < doc.lines && !isBlank(doc.line(to).text) && !isBlank(doc.line(to + 1).text)) to++

  const changes = []
  for (let number = from; number <= to; number++) {
    const line = doc.line(number)
    if (direction > 0) {
      if (!isBlank(line.text) || from == to) changes.push({ from: line.from, insert: '> ' })
    } else {
      const mark = /^([ \t]*)>[ \t]?/.exec(line.text)
      if (mark) changes.push({ from: line.from + mark[1].length, to: line.from + mark[0].length })
    }
  }
  if (changes.length) dispatch(state.update({ ...withCursorBehind(state, changes), scrollIntoView: true, userEvent: 'input.indent' }))
  return true
}

// the changes, with the cursor kept behind what they insert at its place (a mark or indentation
// inserted right where the cursor is goes in front of it, never behind it)
function withCursorBehind (state, changes) {
  const changeSet = state.changes(changes)
  return { changes: changeSet, selection: state.selection.map(changeSet, 1) }
}
