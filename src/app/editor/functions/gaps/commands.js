// npm packages
import { EditorSelection } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

// Editing across blocks while the blank lines between them are hidden:
// - Enter in a paragraph or heading starts a new block (a blank line, then the cursor on a new
//   line); in lists, quotes and code the Markdown keymap handles Enter as before
// - Backspace at the start of a paragraph joins it to the end of the block above, Delete at the
//   end of a block joins the paragraph below to it; both remove the whole hidden gap at once
// Headings, list items and quotes are not joined: Backspace at their start removes their hidden
// mark first (syntax/index.js), which turns them into a paragraph.
// - Backspace at the start of a list item's text turns it into a paragraph of its own, outside
//   the list: blank lines around it split it off (Markdown would otherwise read it as a further
//   line of the item above). Nested items keep the Markdown behaviour (outdenting).

// blocks where Enter and joining keep their usual Markdown behaviour
const containers = ['ListItem', 'Blockquote', 'FencedCode', 'CodeBlock', 'HTMLBlock', 'Table', 'Frontmatter', 'CommentBlock']

function isInContainer (state, pos, side) {
  for (let node = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
    if (containers.includes(node.name)) return true
  }
  return false
}

// whether pos (the start or end of a line) is in a top-level paragraph
function isInParagraph (state, pos) {
  const side = pos == state.doc.lineAt(pos).from ? 1 : -1
  for (let node = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
    if (node.name == 'Paragraph') return node.parent?.name == 'Document'
  }
  return false
}

const isBlank = text => /^[ \t]*$/.test(text)

export function insertNewBlock ({ state, dispatch }) {
  const { main } = state.selection
  if (state.selection.ranges.length > 1 || isInContainer(state, main.head, -1)) return false
  dispatch(state.update({
    changes: { from: main.from, to: main.to, insert: state.lineBreak + state.lineBreak },
    // in document positions every line break counts as one character
    selection: EditorSelection.cursor(main.from + 2),
    scrollIntoView: true,
    userEvent: 'input'
  }))
  return true
}

const listMark = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]*(?:\[[ xX]\][ \t]?)?/

// the top-level list item starting on the line at lineFrom
function topLevelListItem (state, lineFrom) {
  for (let node = syntaxTree(state).resolveInner(lineFrom, 1); node; node = node.parent) {
    if (node.from < lineFrom) return null
    if (node.name == 'ListItem') return node.parent?.parent?.name == 'Document' ? node : null
  }
  return null
}

export function listItemToParagraph ({ state, dispatch }) {
  const { main } = state.selection
  if (state.selection.ranges.length > 1 || !main.empty) return false
  const { doc } = state
  const line = doc.lineAt(main.head)
  const item = topLevelListItem(state, line.from)
  if (!item) return false
  // behind the bullet or number, and a task box
  const contentStart = line.from + listMark.exec(line.text)[0].length
  if (main.head != contentStart) return false

  let last = doc.lineAt(item.to)
  if (last.from == item.to && item.to > item.from) last = doc.lineAt(item.to - 1)
  const isBlankAbove = line.number == 1 || isBlank(doc.line(line.number - 1).text)
  const isBlankBelow = last.number == doc.lines || isBlank(doc.line(last.number + 1).text)
  const breakAbove = isBlankAbove ? '' : state.lineBreak
  const changes = [{ from: line.from, to: contentStart, insert: breakAbove }]
  if (!isBlankBelow) changes.push({ from: last.to, insert: state.lineBreak })

  dispatch(state.update({
    changes,
    // in document positions every line break counts as one character
    selection: EditorSelection.cursor(line.from + (breakAbove ? 1 : 0)),
    // not a deletion: the cursor stays on the new (maybe still empty) block, as after Enter,
    // instead of leaving the blank line (gaps/index.js)
    userEvent: 'input'
  }))
  return true
}

export function joinBackward ({ state, dispatch }) {
  const { main } = state.selection
  if (!main.empty) return false
  const { doc } = state
  const line = doc.lineAt(main.head)
  if (main.head != line.from || line.number == 1 || isBlank(line.text)) return false

  // the blank lines above, and the block they separate this one from
  let number = line.number - 1
  while (number >= 1 && isBlank(doc.line(number).text)) number--
  if (number == line.number - 1) return false
  if (!isInParagraph(state, main.head) || isInContainer(state, main.head, 1)) return false

  const from = number >= 1 ? doc.line(number).to : 0
  dispatch(state.update({
    changes: { from, to: main.head },
    selection: EditorSelection.cursor(from),
    userEvent: 'delete.backward'
  }))
  return true
}

export function joinForward ({ state, dispatch }) {
  const { main } = state.selection
  if (!main.empty) return false
  const { doc } = state
  const line = doc.lineAt(main.head)
  if (main.head != line.to || line.number == doc.lines || isBlank(line.text)) return false

  let number = line.number + 1
  while (number <= doc.lines && isBlank(doc.line(number).text)) number++
  if (number == line.number + 1 || number > doc.lines) return false
  const next = doc.line(number)
  if (!isInParagraph(state, next.from) || isInContainer(state, next.from, 1)) return false

  dispatch(state.update({
    changes: { from: main.head, to: next.from },
    userEvent: 'delete.forward'
  }))
  return true
}
