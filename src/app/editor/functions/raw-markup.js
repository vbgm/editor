// npm packages
import { syntaxTree } from '@codemirror/language'

// In Document mode, a heading or list mark being typed stays as typed until the space after it:
// '#' or '##' at the start of a line shows as it is and becomes a heading with the space ('# ');
// '-' or '1.' likewise become a list with the space. Such a line is a plain paragraph everywhere:
// shown raw (syntax/index.js), spaced and moved as one (blocks/index.js), and the cursor is not
// pushed behind its marks.
// A bare item inside a list keeps its bullet: only a list that is still nothing but one bare item
// is raw.

const bareHeading = /^[ \t]*#{1,6}$/
const bareListMark = /^[ \t]*(?:[-*+]|\d{1,9}[.)])$/

// node: an ATXHeading1…6; bare when it is only its '#' marks, no space after them yet
export function isBareHeading (doc, node) {
  return bareHeading.test(doc.sliceString(node.from, node.to))
}

// node: a ListItem; bare when it is only its mark, no space after it yet, and alone in its list
export function isBareListItem (doc, node) {
  if (node.firstChild?.nextSibling) return false
  if (!bareListMark.test(doc.lineAt(node.from).text)) return false
  const list = node.parent
  if (!list) return false
  let items = 0
  for (let child = list.firstChild; child; child = child.nextSibling) {
    if (child.name == 'ListItem') items++
  }
  return items == 1
}

// whether the line starting at lineFrom is a bare heading or list mark
export function isRawLine (state, lineFrom) {
  const line = state.doc.lineAt(lineFrom)
  const indent = /^[ \t]*/.exec(line.text)[0].length
  if (indent == line.text.length) return false
  for (let node = syntaxTree(state).resolveInner(line.from + indent, 1); node; node = node.parent) {
    if (node.from < line.from) return false
    if (/^ATXHeading/.test(node.name)) return isBareHeading(state.doc, node)
    if (node.name == 'ListItem') return isBareListItem(state.doc, node)
  }
  return false
}
