// npm packages
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'

// After a move, numbered lists count up in order again: a move swaps text as it is, so the
// numbers would travel with their items ('1. a', '3. c', '2. b').
// - a list keeps its lowest number as its start (usually 1; a list starting at 5 stays at 5),
//   since after a move any item may be first
// - each item keeps its '.' or ')'
// - a list whose items all have the same number ('1.' '1.' '1.', a common way of writing
//   Markdown) is left as it is
// Only top-level lists touching from..to are looked at: the region a move rewrote, with the
// gaps on both sides, so a list an item left or joined is renumbered too.
// Returns the changes, in positions of state.

const listMark = /^(\d{1,9})([.)])$/

export default function renumber (state, from, to) {
  const tree = ensureSyntaxTree(state, Math.min(state.doc.length, to + 1), 1000) || syntaxTree(state)
  const changes = []
  for (let list = tree.topNode.firstChild; list; list = list.nextSibling) {
    if (list.from > to) break
    if (list.name != 'OrderedList' || list.to < from) continue

    const marks = []
    for (let item = list.firstChild; item; item = item.nextSibling) {
      const mark = item.name == 'ListItem' && item.firstChild
      const match = mark && listMark.exec(state.sliceDoc(mark.from, mark.to))
      if (match) marks.push({ from: mark.from, to: mark.to, number: Number(match[1]), delimiter: match[2] })
    }
    if (marks.every(mark => mark.number == marks[0].number)) continue

    const start = Math.min(...marks.map(mark => mark.number))
    marks.forEach((mark, index) => {
      if (mark.number != start + index) changes.push({ from: mark.from, to: mark.to, insert: `${start + index}${mark.delimiter}` })
    })
  }
  return changes
}
