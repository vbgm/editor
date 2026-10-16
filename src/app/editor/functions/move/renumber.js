// npm packages
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'

// After a move or an indent, numbered lists count up in order again: a move swaps text as it is,
// so the numbers would travel with their items ('1. a', '3. c', '2. b').
// - a top-level list keeps its lowest number as its start (usually 1; a list continuing its
//   numbering after a paragraph stays as it is), since after a move any item may be first;
//   a nested list always counts from 1
// - each item keeps its '.' or ')'
// - a list whose items all have the same number ('1.' '1.' '1.', a common way of writing
//   Markdown) is left as it is
// Top-level lists touching from..to are looked at, with the lists nested in them: the region a
// move rewrote, with the gaps on both sides, so a list an item left or joined is renumbered too.
// Returns the changes, in positions of state.

const listMark = /^(\d{1,9})([.)])$/

export default function renumber (state, from, to) {
  const tree = ensureSyntaxTree(state, Math.min(state.doc.length, to + 1), 1000) || syntaxTree(state)
  const changes = []
  for (let list = tree.topNode.firstChild; list; list = list.nextSibling) {
    if (list.from > to) break
    if (/List$/.test(list.name) && list.to >= from) renumberList(state, list, false, changes)
  }
  return changes.sort((a, b) => a.from - b.from)
}

function renumberList (state, list, isNested, changes) {
  const marks = []
  for (let item = list.firstChild; item; item = item.nextSibling) {
    if (item.name != 'ListItem') continue
    const mark = item.firstChild
    const match = list.name == 'OrderedList' && mark && listMark.exec(state.sliceDoc(mark.from, mark.to))
    if (match) marks.push({ from: mark.from, to: mark.to, number: Number(match[1]), delimiter: match[2] })
    for (let child = item.firstChild; child; child = child.nextSibling) {
      if (/List$/.test(child.name)) renumberList(state, child, true, changes)
    }
  }
  if (!marks.length) return
  // the same number everywhere is left alone, except a single item of a sub-list ('2.' → '1.')
  if (marks.every(mark => mark.number == marks[0].number) && (marks.length > 1 || !isNested)) return

  const start = isNested ? 1 : Math.min(...marks.map(mark => mark.number))
  marks.forEach((mark, index) => {
    if (mark.number != start + index) changes.push({ from: mark.from, to: mark.to, insert: `${start + index}${mark.delimiter}` })
  })
}
