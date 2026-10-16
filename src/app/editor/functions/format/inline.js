// npm packages
import { EditorSelection } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

// Inline formats for each selection range: bold, italic, inline code, strikethrough, link.
// Toggling wraps the selection in the marker, or removes the marker when the selection is
// already wrapped (markers just outside or just inside the selection). Without a selection
// the markers are inserted with the cursor between them; with the cursor inside text that has
// the format (between its marks), the marks are removed, so a lit toolbar button turns it off.

// the syntax node of each marker
const nodeNames = { '**': 'StrongEmphasis', '*': 'Emphasis', '~~': 'Strikethrough', '`': 'InlineCode' }

// the innermost node named name with pos between its edges
function nodeAround (state, pos, name) {
  for (let node = syntaxTree(state).resolveInner(pos, 0); node; node = node.parent) {
    if (node.name == name && node.from < pos && pos < node.to) return node
  }
  return null
}

// the marker at text's edge, but not as part of a longer run of the same character
// ('*' in '**bold**' is not an italic marker)
function hasMarker (text, marker, atStart) {
  const edge = atStart ? text.slice(0, marker.length) : text.slice(text.length - marker.length)
  if (edge != marker) return false
  const beyond = atStart ? text[marker.length] : text[text.length - marker.length - 1]
  // '***' is bold and italic together, so a single '*' can still be removed from it
  const run = atStart ? /^\*+/.exec(text)?.[0].length : /\*+$/.exec(text)?.[0].length
  return beyond != marker[0] || (marker == '*' && run == 3)
}

export function toggleInline (marker) {
  return ({ state, dispatch }) => {
    const length = marker.length
    const transaction = state.changeByRange(range => {
      const { from, to } = range
      const before = state.sliceDoc(Math.max(0, from - length - 2), from)
      const after = state.sliceDoc(to, to + length + 2)
      const selected = state.sliceDoc(from, to)

      const node = range.empty && nodeAround(state, from, nodeNames[marker])
      const first = node?.firstChild
      const last = node?.lastChild
      if (first && last && first.from != last.from) {
        const changes = state.changes([{ from: first.from, to: first.to }, { from: last.from, to: last.to }])
        return { changes, range: EditorSelection.cursor(changes.mapPos(from)) }
      }
      if (hasMarker(before, marker, false) && hasMarker(after, marker, true)) {
        return {
          changes: [{ from: from - length, to: from }, { from: to, to: to + length }],
          range: EditorSelection.range(from - length, to - length)
        }
      }
      if (selected.length >= length * 2 && hasMarker(selected, marker, true) && hasMarker(selected, marker, false)) {
        return {
          changes: [{ from, to: from + length }, { from: to - length, to }],
          range: EditorSelection.range(from, to - length * 2)
        }
      }
      return {
        changes: [{ from, insert: marker }, { from: to, insert: marker }],
        range: EditorSelection.range(from + length, to + length)
      }
    })
    dispatch(state.update(transaction, { scrollIntoView: true, userEvent: 'format.inline' }))
    return true
  }
}

// '[text](url)': the selection becomes the link text and the cursor goes to the url. With the
// cursor inside a link, the link becomes its text.
export function insertLink ({ state, dispatch }) {
  const transaction = state.changeByRange(({ from, to, empty }) => {
    const link = empty && nodeAround(state, from, 'Link')
    const marks = link ? link.getChildren('LinkMark') : []
    if (marks.length >= 2) {
      const changes = state.changes({ from: link.from, to: link.to, insert: state.sliceDoc(marks[0].to, marks[1].from) })
      const cursor = Math.min(Math.max(from - 1, link.from), link.from + marks[1].from - marks[0].to)
      return { changes, range: EditorSelection.cursor(cursor) }
    }
    const text = state.sliceDoc(from, to)
    const insert = `[${text}]()`
    // without a selection the cursor goes into the brackets for the text first
    const cursor = text ? from + insert.length - 1 : from + 1
    return { changes: { from, to, insert }, range: EditorSelection.cursor(cursor) }
  })
  dispatch(state.update(transaction, { scrollIntoView: true, userEvent: 'format.link' }))
  return true
}
