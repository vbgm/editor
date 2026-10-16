// npm packages
import { syntaxTree } from '@codemirror/language'

// In Document mode, Markdown that has nothing to format yet stays as typed: '#' or '## ' at the
// start of a line shows as it is, and becomes a heading only once text follows the space; '-',
// '- ' or '1. ' likewise become a list only with text after the space. Such a line is a plain
// paragraph everywhere: shown raw (syntax/index.js), spaced and moved as one (blocks/index.js),
// and the cursor is not pushed behind its marks.
// An empty item inside a list (the next item after Enter) keeps its bullet: only a list that is
// still nothing but one empty item is raw.

const emptyHeading = /^[ \t]*#{1,6}(?:[ \t]+#*)?[ \t]*$/

// node: an ATXHeading1…6
export function isEmptyHeading (doc, node) {
  return emptyHeading.test(doc.sliceString(node.from, node.to))
}

// node: a ListItem; empty when it holds nothing but its mark, and alone in its list
export function isLoneEmptyItem (node) {
  if (node.firstChild?.nextSibling) return false
  const list = node.parent
  if (!list) return false
  let items = 0
  for (let child = list.firstChild; child; child = child.nextSibling) {
    if (child.name == 'ListItem') items++
  }
  return items == 1
}

// whether the line starting at lineFrom is an empty heading or lone empty list item
export function isRawLine (state, lineFrom) {
  const line = state.doc.lineAt(lineFrom)
  const indent = /^[ \t]*/.exec(line.text)[0].length
  if (indent == line.text.length) return false
  for (let node = syntaxTree(state).resolveInner(line.from + indent, 1); node; node = node.parent) {
    if (node.from < line.from) return false
    if (/^ATXHeading/.test(node.name)) return isEmptyHeading(state.doc, node)
    if (node.name == 'ListItem') return isLoneEmptyItem(node)
  }
  return false
}
