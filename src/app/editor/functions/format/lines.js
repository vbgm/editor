// npm packages
import { syntaxTree } from '@codemirror/language'

// Line formats for the selected lines: heading level, plain paragraph, bullet or numbered list.
// Each command is one transaction (one undo step). Blank lines and lines in code are left alone.

const indentation = /^[ \t]*/
const headingMarker = /^[ \t]{0,3}#{1,6}(?:[ \t]+|$)/
const bulletMarker = /^([ \t]*)[-*+][ \t]+(?:\[[ xX]\][ \t]+)?/
const orderedMarker = /^([ \t]*)\d{1,9}[.)][ \t]+/
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

// changes that replace each line's start (markers and indentation) with a new prefix,
// keeping the cursor where it was in the content
function replacePrefixes (state, lines, prefixOf) {
  const changes = []
  for (const [index, line] of lines.entries()) {
    const rest = content(line.text)
    const oldPrefixLength = line.text.length - rest.length
    changes.push({ from: line.from, to: line.from + oldPrefixLength, insert: prefixOf(line, index) })
    // a setext heading's underline goes away, it is an ATX heading or a paragraph now
    const next = line.number < state.doc.lines && state.doc.line(line.number + 1)
    if (next && setextUnderline.test(next.text) && isInNode(state, line.from, name => /^SetextHeading/.test(name))) {
      changes.push({ from: line.to, to: next.to })
    }
  }
  return changes
}

function dispatchChanges ({ state, dispatch }, changes, userEvent) {
  if (!changes.length) return true
  const changeSet = state.changes(changes)
  dispatch(state.update({
    changes: changeSet,
    selection: state.selection.map(changeSet, 1),
    scrollIntoView: true,
    userEvent
  }))
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

// kind: 'bullet' or 'ordered'. Turns the lines into a list, or back into paragraphs when they
// all are already that kind of list.
export function toggleList (kind) {
  const marker = kind == 'bullet' ? bulletMarker : orderedMarker
  return view => {
    const { state } = view
    const lines = selectedLines(state)
    if (!lines.length) return true
    const isList = lines.every(line => marker.test(line.text))
    const keepIndentation = line => indentation.exec(line.text)[0]
    const prefixOf = isList
      ? line => keepIndentation(line)
      : (line, index) => keepIndentation(line) + (kind == 'bullet' ? '- ' : `${index + 1}. `)
    return dispatchChanges(view, replacePrefixes(state, lines, prefixOf), 'format.list')
  }
}
