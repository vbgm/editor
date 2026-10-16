// npm packages
import { syntaxTree } from '@codemirror/language'
// local functions
import renumber from '../move/renumber.js'

// Line formats for the selected lines: heading level, plain paragraph, bullet or numbered list.
// Each command is one transaction (one undo step). Blank lines and lines in code are left alone.
// A list line keeps its indentation, so a sub-item stays a sub-item when it switches between
// bullet and number; numbered lists around it are counted again (move/renumber.js). When an
// item's mark gets wider or narrower ('- ' → '1. '), its further lines and sub-items shift with
// it, so they stay in the item.

const indentation = /^[ \t]*/
const headingMarker = /^[ \t]{0,3}#{1,6}(?:[ \t]+|$)/
const bulletMarker = /^([ \t]*)[-*+][ \t]+(?:\[[ xX]\][ \t]+)?/
const orderedMarker = /^([ \t]*)\d{1,9}[.)][ \t]+/
const itemStart = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]*/
const itemLine = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/
const setextUnderline = /^ {0,3}(=+|-+)[ \t]*$/

const isBlank = text => /^[ \t]*$/.test(text)

function isInNode (state, pos, test) {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (test(node.name)) return true
  }
  return false
}

const isInCode = (state, pos) => isInNode(state, pos, name => name == 'FencedCode' || name == 'CodeBlock' || name == 'Frontmatter')

// the selected lines that can be formatted
function selectedLines (state) {
  const lines = []
  const seen = new Set()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let number = first; number <= last; number++) {
      if (seen.has(number)) continue
      seen.add(number)
      const line = state.doc.line(number)
      if (isBlank(line.text) || setextUnderline.test(line.text) && number > 1 || isInCode(state, line.from)) continue
      lines.push(line)
    }
  }
  return lines
}

// the text of a line without heading or list markers and without indentation
function content (text) {
  return text.replace(headingMarker, '').replace(bulletMarker, '').replace(orderedMarker, '').replace(indentation, '')
}

// the last line of a node (a node may end right after a line break)
function lastLineOf (doc, node) {
  const line = doc.lineAt(node.to)
  return line.from == node.to && node.to > node.from ? doc.lineAt(node.to - 1) : line
}

// the list item starting on line
function itemAt (state, line) {
  for (let node = syntaxTree(state).resolveInner(line.from + indentation.exec(line.text)[0].length, 1); node; node = node.parent) {
    if (node.name == 'ListItem') return node.from >= line.from ? node : null
  }
  return null
}

// whether line is a further line of a list item (in an item, but not where one starts)
function isItemContinuation (state, line) {
  if (itemAt(state, line)) return false
  return isInNode(state, line.from + indentation.exec(line.text)[0].length, name => name == 'ListItem')
}

// the innermost list item line is in
function itemOf (state, line) {
  for (let node = syntaxTree(state).resolveInner(line.from + indentation.exec(line.text)[0].length, 1); node; node = node.parent) {
    if (node.name == 'ListItem') return node
  }
  return null
}

// list items turned off: each becomes a further line of the text right above it (drawn lined
// up under that text, syntax/index.js, with no space between), keeping its own indentation in
// the file: shallower than a Shift+Enter line, which is indented to the item's text. Turned on
// again it is an item at its old level (linesToItems). Its own lines and sub-items move along.
export function itemsToLines (state, lines) {
  const { doc } = state
  const changes = []
  const selected = new Set(lines.map(line => line.number))
  for (const line of lines) {
    const item = itemAt(state, line)
    if (!item) continue
    const oldColumn = line.text.length - content(line.text).length
    const column = indentation.exec(line.text)[0].length
    changes.push({ from: line.from + column, to: line.from + oldColumn })
    const delta = column - oldColumn
    for (let number = line.number + 1; number <= lastLineOf(doc, item).number; number++) {
      const further = doc.line(number)
      if (isBlank(further.text) || selected.has(number)) continue
      changes.push({ from: further.from, to: further.from + Math.min(-delta, indentation.exec(further.text)[0].length) })
    }
  }
  return changes
}

// further lines of items turned into items: a line indented to its item's text (Shift+Enter)
// becomes a sub-item of that item; a shallower one (an item whose mark was taken off) an item at
// its own indentation again, the level it had. Blank lines between it and the item go.
function linesToItems (state, lines, kind) {
  const { doc } = state
  const changes = []
  const removed = new Set()
  const removeBlank = number => {
    if (removed.has(number)) return
    removed.add(number)
    const blank = doc.line(number)
    changes.push({ from: blank.from - 1, to: blank.to })
  }
  for (const line of lines) {
    const item = itemOf(state, line)
    if (!item) continue
    const itemFirst = doc.lineAt(item.from)
    const itemColumn = itemStart.exec(itemFirst.text)?.[0].length ?? 0
    const own = indentation.exec(line.text)[0].length
    const isNested = own >= itemColumn
    const column = isNested ? itemColumn : own
    for (let above = line.number - 1; above > itemFirst.number && isBlank(doc.line(above).text); above--) removeBlank(above)
    // back at the item's level, a number follows the item's own
    const number = !isNested && indentation.exec(itemFirst.text)[0].length == own && /^[ \t]*(\d+)([.)])/.exec(itemFirst.text)
    const mark = kind == 'bullet' ? '- ' : number ? `${Number(number[1]) + 1}${number[2]} ` : '1. '
    changes.push({ from: line.from, to: line.from + own, insert: ' '.repeat(column) + mark })
  }
  return changes
}

// changes that replace each line's start (markers and indentation) with a new prefix,
// keeping the cursor where it was in the content; shift: also move the lines of a list item
// whose mark changes width, so they stay in the item
function replacePrefixes (state, lines, prefixOf, shift = false) {
  const { doc } = state
  const changes = []
  // how far each line moves because an item it belongs to got a wider or narrower mark
  const shifts = new Map()
  const prefixes = lines.map((line, index) => prefixOf(line, index))
  if (shift) {
    for (const [index, line] of lines.entries()) {
      const item = itemAt(state, line)
      const delta = item && prefixes[index].length - (line.text.length - content(line.text).length)
      if (!delta) continue
      for (let number = line.number + 1; number <= lastLineOf(doc, item).number; number++) {
        shifts.set(number, (shifts.get(number) ?? 0) + delta)
      }
    }
  }
  const selected = new Set(lines.map(line => line.number))
  for (const [number, delta] of shifts) {
    if (selected.has(number) || !delta) continue
    const line = doc.line(number)
    if (isBlank(line.text)) continue
    if (delta > 0) changes.push({ from: line.from, insert: ' '.repeat(delta) })
    else changes.push({ from: line.from, to: line.from + Math.min(-delta, indentation.exec(line.text)[0].length) })
  }
  for (const [index, line] of lines.entries()) {
    const rest = content(line.text)
    const oldPrefixLength = line.text.length - rest.length
    let prefix = prefixes[index]
    const delta = shifts.get(line.number) ?? 0
    if (delta > 0) prefix = ' '.repeat(delta) + prefix
    else if (delta < 0) prefix = prefix.slice(Math.min(-delta, indentation.exec(prefix)[0].length))
    changes.push({ from: line.from, to: line.from + oldPrefixLength, insert: prefix })
    // a setext heading's underline goes away, it is an ATX heading or a paragraph now
    const next = line.number < state.doc.lines && state.doc.line(line.number + 1)
    if (next && setextUnderline.test(next.text) && isInNode(state, line.from, name => /^SetextHeading/.test(name))) {
      changes.push({ from: line.to, to: next.to })
    }
  }
  return changes
}

function dispatchChanges ({ state, dispatch }, changes, userEvent, isRenumbered = false) {
  if (!changes.length) return true
  const changeSet = state.changes(changes)
  const spec = { changes: changeSet, selection: state.selection.map(changeSet, 1), scrollIntoView: true, userEvent }
  if (!isRenumbered) {
    dispatch(state.update(spec))
    return true
  }
  const changed = state.update(spec)
  let from = changed.state.doc.length
  let to = 0
  changeSet.iterChangedRanges((fromA, toA, fromB, toB) => {
    from = Math.min(from, fromB)
    to = Math.max(to, toB)
  })
  dispatch(state.update(spec, { changes: renumber(changed.state, from, to), sequential: true }))
  return true
}

// level 1–6: heading of that level; 0: plain paragraph
export function setHeading (level) {
  return view => {
    const lines = selectedLines(view.state)
    const prefix = level ? '#'.repeat(level) + ' ' : ''
    return dispatchChanges(view, replacePrefixes(view.state, lines, () => prefix), 'format.heading')
  }
}

// Cmd+Enter: ticks or unticks the tasks among the selected lines (all ticked: untick them, else
// tick them all); any other selected line becomes an open task: a list item gets a box after its
// bullet or number, a paragraph becomes '- [ ] ' with its text.
const taskStart = /^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\]/
const listItemStart = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/

export function toggleTask (view) {
  const { state } = view
  const lines = selectedLines(state).filter(line => !isItemContinuation(state, line))
  if (!lines.length) return true
  const changes = []
  if (lines.every(line => taskStart.test(line.text))) {
    const isChecked = lines.every(line => /x/i.test(taskStart.exec(line.text)[2]))
    for (const line of lines) {
      const box = line.from + taskStart.exec(line.text)[1].length + 1
      changes.push({ from: box, to: box + 1, insert: isChecked ? ' ' : 'x' })
    }
    return dispatchChanges(view, changes, 'input.toggle')
  }
  for (const line of lines) {
    if (taskStart.test(line.text)) continue
    const item = listItemStart.exec(line.text)
    if (item) changes.push({ from: line.from + item[0].length, insert: '[ ] ' })
    else changes.push(...replacePrefixes(state, [line], () => indentation.exec(line.text)[0] + '- [ ] '))
  }
  return dispatchChanges(view, changes, 'format.list', true)
}

// kind: 'bullet' or 'ordered'. Turns the lines into a list, or back into paragraphs when they
// all are already that kind of list.
export function toggleList (kind) {
  const marker = kind == 'bullet' ? bulletMarker : orderedMarker
  return view => {
    const { state } = view
    // a further line of a list item (Shift+Enter, a mark taken off) is part of the item, not an
    // item; when only such lines are selected, they become items (linesToItems)
    const selected = selectedLines(state)
    const lines = selected.filter(line => !isItemContinuation(state, line))
    if (!lines.length) return dispatchChanges(view, linesToItems(state, selected, kind), 'format.list', true)
    const isList = lines.every(line => marker.test(line.text))
    if (isList) return dispatchChanges(view, itemsToLines(state, lines), 'format.list', true)
    const keepIndentation = line => indentation.exec(line.text)[0]
    const prefixOf = (line, index) => keepIndentation(line) + (kind == 'bullet' ? '- ' : `${index + 1}. `)
    const changes = replacePrefixes(state, lines, prefixOf, true)
    // paragraphs becoming one list: the blank lines between them go, so the list is tight
    for (let index = 1; index < lines.length; index++) {
      for (let number = lines[index - 1].number + 1; number < lines[index].number; number++) {
        const blank = state.doc.line(number)
        if (isBlank(blank.text)) changes.push({ from: blank.from - 1, to: blank.to })
      }
    }
    return dispatchChanges(view, changes, 'format.list', true)
  }
}
