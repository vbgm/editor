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
// - after a move, that is decided without the moved item (moved: { from, to, wasSame }, its range
//   in state, and whether the list it came from was written that way): a list whose other items
//   all have the same number (at least two of them, or one when the moved item came from such a
//   list) is written that way, and the moved item gets that number too; otherwise the list counts
//   up ('1. x' joined by '1. a' from a counted list is just the move's duplicate)
// Top-level lists touching from..to are looked at, with the lists nested in them: the region a
// move rewrote, with the gaps on both sides, so a list an item left or joined is renumbered too.
// Returns the changes, in positions of state.

const listMark = /^(\d{1,9})([.)])$/

export default function renumber (state, from, to, moved = null) {
  const tree = ensureSyntaxTree(state, Math.min(state.doc.length, to + 1), 1000) || syntaxTree(state)
  const changes = []
  for (let list = tree.topNode.firstChild; list; list = list.nextSibling) {
    if (list.from > to) break
    if (/List$/.test(list.name) && list.to >= from) renumberList(state, list, false, changes, moved)
  }
  return changes.sort((a, b) => a.from - b.from)
}

// Was the list holding the item on line number written with one number for every item ('1.'
// '1.'), with at least two items?
export function isSameNumberList (state, number) {
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) || syntaxTree(state)
  const line = state.doc.line(number)
  let node = tree.resolveInner(line.from + /^[ \t]*/.exec(line.text)[0].length, 1)
  while (node && node.name != 'ListItem') node = node.parent
  const list = node?.parent
  if (!list || list.name != 'OrderedList') return false
  const numbers = []
  for (let item = list.firstChild; item; item = item.nextSibling) {
    const match = item.name == 'ListItem' && item.firstChild && listMark.exec(state.sliceDoc(item.firstChild.from, item.firstChild.to))
    if (match) numbers.push(Number(match[1]))
  }
  return numbers.length > 1 && numbers.every(value => value == numbers[0])
}

function renumberList (state, list, isNested, changes, moved) {
  const marks = []
  for (let item = list.firstChild; item; item = item.nextSibling) {
    if (item.name != 'ListItem') continue
    const mark = item.firstChild
    const match = list.name == 'OrderedList' && mark && listMark.exec(state.sliceDoc(mark.from, mark.to))
    if (match) marks.push({ from: mark.from, to: mark.to, number: Number(match[1]), delimiter: match[2] })
    for (let child = item.firstChild; child; child = child.nextSibling) {
      if (/List$/.test(child.name)) renumberList(state, child, true, changes, moved)
    }
  }
  if (!marks.length) return
  const isSame = list => list.every(mark => mark.number == list[0].number)
  const others = moved ? marks.filter(mark => mark.from < moved.from || mark.from > moved.to) : marks
  if (others.length < marks.length) {
    // the list had a moved item: written with one number if its other items are
    if (others.length > (moved.wasSame ? 0 : 1) && isSame(others)) {
      for (const mark of marks) {
        if (mark.number != others[0].number) changes.push({ from: mark.from, to: mark.to, insert: `${others[0].number}${mark.delimiter}` })
      }
      return
    }
  } else if (isSame(marks) && (marks.length > 1 || !isNested)) {
    // the same number everywhere is left alone, except a single item of a sub-list ('2.' → '1.')
    return
  }

  const start = isNested ? 1 : Math.min(...marks.map(mark => mark.number))
  marks.forEach((mark, index) => {
    if (mark.number != start + index) changes.push({ from: mark.from, to: mark.to, insert: `${start + index}${mark.delimiter}` })
  })
}
