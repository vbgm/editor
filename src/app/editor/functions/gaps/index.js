// npm packages
import { StateField, RangeSet, EditorState, EditorSelection } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
// local functions
import { getBlocksInRange } from '../blocks/index.js'

// Hides the blank lines between blocks while Markdown is hidden. They stay in the file
// (Markdown needs them to separate paragraphs), but on screen the blocks sit right below each
// other, and the cursor jumps over the gap: → at the end of a block goes straight to the start of
// the next one.
//
// A run of blank lines between block A and block B is hidden by merging it into A's last line
// (from the end of A up to the end of the last blank line); the line break before B stays, so B
// keeps its own line and line classes. The cursor skips the whole gap, both line breaks included
// (atomic range from the end of A to the start of B). Blank lines at the very start of the file
// are merged into the first block's line instead.
//
// The blank line with the cursor (a new, still empty block after Enter) stays visible. A deletion
// that leaves the cursor on a blank line between blocks (deleting a whole block) moves it to the
// end of the block above instead, so no empty line appears.
// More than two blank lines between blocks show room: every two blank lines beyond the first
// show as one empty paragraph ('cm-empty-paragraph', the line in the middle of each pair). One
// Enter adds two line breaks, so an Enter left empty stays as an empty paragraph, while files
// with two blank lines between paragraphs look as usual. Markdown itself treats any number of
// blank lines as one; other viewers show a normal gap there.
// Blank lines between the paragraphs of one list item (a sub-item turned into text, written so
// in the file) are hidden as well, and the paragraph after them is spaced like a list item
// ('cm-item-paragraph'). Blank lines in code are content and stay visible.
//
// Hiding line breaks changes the layout, so CodeMirror needs these ranges from the state, for
// the whole document. They are computed once, and after that only for the lines an edit touched
// (plus any blocks the parser changed because of it, such as everything after a new '```'),
// so typing costs the same in a short or a long file.

const hidden = Decoration.replace({})
const skip = Decoration.mark({})
// the cursor's blank line: spaced like a paragraph, it is a new block still to be typed
const newBlock = Decoration.line({ class: 'cm-new-block' })
const emptyParagraph = Decoration.line({ class: 'cm-empty-paragraph' })

// the lines of a run of blank lines (runStart..runEnd, line numbers) that show as empty
// paragraphs. At the end of the file the empty line after its last line break counts like the
// blank line after an Enter: a file ending with one or two line breaks shows none, an Enter left
// empty at the end shows one.
function emptyParagraphLines (doc, runStart, runEnd) {
  const lines = []
  for (let number = runStart + 1; number + 1 <= runEnd; number += 2) lines.push(number)
  return lines
}
// a paragraph of a list item after hidden blank lines: spaced like the item's lines
const itemParagraph = Decoration.line({ class: 'cm-item-paragraph' })
const code = ['FencedCode', 'CodeBlock', 'HTMLBlock', 'CommentBlock']

function isInCode (state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (code.includes(node.name)) return true
  }
  return false
}
// the cursor's blank line right under a block's text (Shift+Enter): a further line of that
// block still to be typed, spaced as one
const newLine = Decoration.line({ class: 'cm-new-line' })

const isBlank = text => /^[ \t]*$/.test(text)

// Ranges for lines first..last (line numbers), widened to whole runs of blank lines and the
// blocks around them. headLine: the cursor's line, kept visible if it is a blank line.
function computeLines (state, first, last, headLine) {
  const { doc } = state
  while (first > 1 && isBlank(doc.line(first - 1).text)) first--
  if (first > 1) first--
  while (last < doc.lines && isBlank(doc.line(last + 1).text)) last++
  if (last < doc.lines) last++

  const from = doc.line(first).from
  const to = doc.line(last).to
  const blocks = getBlocksInRange(state, from, to)
  const hide = []
  const atomic = []
  let kept = null

  const addSegment = (start, end) => {
    const lastLine = doc.line(end)
    // the cursor skips up to the start of the next line
    const next = end < doc.lines ? doc.line(end + 1).from : lastLine.to
    if (start > 1) {
      const lineEnd = doc.line(start - 1).to
      hide.push(hidden.range(lineEnd, lastLine.to))
      atomic.push(skip.range(lineEnd, next))
    } else if (next > 0) {
      hide.push(hidden.range(0, next))
      atomic.push(skip.range(0, next))
    }
  }

  let blockIndex = 0
  let runStart = null
  let isInItem = false
  for (let number = first; number <= last + 1; number++) {
    let isGap = false
    if (number <= last) {
      const line = doc.line(number)
      if (isBlank(line.text)) {
        while (blockIndex < blocks.length && blocks[blockIndex].to < line.from) blockIndex++
        const block = blocks[blockIndex]
        const isInBlock = block && block.from <= line.from && line.to <= block.to
        // between the paragraphs of a list item, not in code
        const isItemGap = isInBlock && block.type == 'listItem' && !isInCode(state, line.from)
        isGap = !isInBlock || isItemGap
        if (isItemGap && runStart == null) isInItem = true
      }
    }
    if (isGap) {
      if (runStart == null) runStart = number
      continue
    }
    if (runStart != null) {
      const runEnd = number - 1
      if (isInItem && number <= last) hide.push(itemParagraph.range(doc.line(number).from))
      // the lines that stay visible: empty paragraphs, and the cursor's blank line
      const visible = new Map()
      if (!isInItem) for (const line of emptyParagraphLines(doc, runStart, runEnd)) visible.set(line, emptyParagraph)
      if (headLine >= runStart && headLine <= runEnd && !visible.has(headLine)) {
        kept = doc.line(headLine).from
        const isNewLine = headLine == runStart && headLine > 1
        visible.set(headLine, isNewLine ? newLine : newBlock)
      }
      // hide the rest, each stretch merged into the line above it
      let stretch = null
      for (let line = runStart; line <= runEnd + 1; line++) {
        if (line <= runEnd && !visible.has(line)) {
          stretch ??= line
          continue
        }
        if (stretch != null) addSegment(stretch, line - 1)
        stretch = null
      }
      for (const [line, decoration] of visible) hide.push(decoration.range(doc.line(line).from))
      runStart = null
    }
    isInItem = false
  }
  return { from, to, hide, atomic, kept }
}

function computeAll (state) {
  const headLine = state.doc.lineAt(state.selection.main.head).number
  const { hide, atomic, kept } = computeLines(state, 1, state.doc.lines, headLine)
  return { decorations: RangeSet.of(hide, true), atomicRanges: RangeSet.of(atomic, true), kept }
}

// Where the top-level blocks of the new tree differ from the old one around an edit:
// [from, to] in the new document, or null. Usually just the edited block; after typing '```'
// it reaches to the end of what has been parsed.
function changedBlocks (startState, state, changes) {
  const oldTree = syntaxTree(startState)
  const newTree = syntaxTree(state)
  if (oldTree == newTree) return null
  let editFromA = Infinity
  let editFromB = Infinity
  let editToB = 0
  changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    editFromA = Math.min(editFromA, fromA)
    editFromB = Math.min(editFromB, fromB)
    editToB = Math.max(editToB, toB)
  })
  let oldNode = oldTree.topNode.childBefore(editFromA) || oldTree.topNode.firstChild
  let newNode = newTree.topNode.childBefore(editFromB) || newTree.topNode.firstChild
  const from = Math.min(newNode ? newNode.from : editFromB, editFromB)
  let to = editToB
  while (oldNode || newNode) {
    const oldFrom = oldNode && changes.mapPos(oldNode.from, 1)
    const oldTo = oldNode && changes.mapPos(oldNode.to, -1)
    // the same block at the same place, past the edit: the rest is unchanged
    if (oldNode && newNode && oldFrom == newNode.from && oldTo == newNode.to && oldNode.name == newNode.name && newNode.from > editToB) break
    if (newNode && (!oldNode || newNode.from <= oldFrom)) {
      to = Math.max(to, newNode.to)
      newNode = newNode.nextSibling
    } else {
      to = Math.max(to, oldTo)
      oldNode = oldNode.nextSibling
    }
  }
  return [from, Math.min(to, state.doc.length)]
}

export const gaps = StateField.define({
  create: computeAll,

  update (value, transaction) {
    const { state, startState, changes } = transaction
    const treeChanged = syntaxTree(state) != syntaxTree(startState)
    // the parser got further on its own (after opening the file): check everything once more
    if (!transaction.docChanged && treeChanged) return computeAll(state)

    const { doc } = state
    const head = state.selection.main.head
    const headLine = doc.lineAt(head)
    const kept = value.kept != null ? changes.mapPos(value.kept, -1) : null

    // positions in the new document to compute again
    const regions = []
    if (transaction.docChanged) {
      changes.iterChangedRanges((fromA, toA, fromB, toB) => regions.push([fromB, toB]))
      const changed = changedBlocks(startState, state, changes)
      if (changed) regions.push(changed)
    }
    // the cursor went to a blank line, or left the one that was kept visible
    const isHeadBlank = isBlank(headLine.text)
    if (kept != null && doc.lineAt(kept).number != headLine.number) regions.push([kept, kept])
    if (isHeadBlank && (kept == null || doc.lineAt(kept).number != headLine.number)) regions.push([head, head])
    if (!regions.length) return value

    let decorations = value.decorations.map(changes)
    let atomicRanges = value.atomicRanges.map(changes)
    let newKept = kept != null && isBlank(doc.lineAt(kept).text) ? kept : null
    regions.sort((a, b) => a[0] - b[0])
    for (const [from, to] of regions) {
      const result = computeLines(state, doc.lineAt(from).number, doc.lineAt(to).number, headLine.number)
      // replace the ranges that start in the computed lines; one starting at their very end
      // belongs to the run below them, which was not computed
      const filter = start => start < result.from || start >= result.to
      decorations = decorations.update({ filter, filterFrom: result.from, filterTo: result.to, add: result.hide, sort: true })
      atomicRanges = atomicRanges.update({ filter, filterFrom: result.from, filterTo: result.to, add: result.atomic, sort: true })
      if (newKept != null && newKept >= result.from && newKept <= result.to) newKept = null
      if (result.kept != null) newKept = result.kept
    }
    return { decorations, atomicRanges, kept: newKept }
  },

  provide: field => [
    EditorView.decorations.from(field, value => value.decorations),
    EditorView.atomicRanges.of(view => view.state.field(field).atomicRanges)
  ]
})

// whether the line is a blank line between blocks (not inside code or a list item)
function isGapLine (state, line) {
  if (!isBlank(line.text)) return false
  return !getBlocksInRange(state, line.from, line.to)
    .some(block => block.from <= line.from && line.to <= block.to)
}

// whether line is a blank line between blocks that shows as an empty paragraph
export function isEmptyParagraphLine (state, line) {
  if (!isGapLine(state, line)) return false
  const { doc } = state
  let runStart = line.number
  while (runStart > 1 && isBlank(doc.line(runStart - 1).text)) runStart--
  let runEnd = line.number
  while (runEnd < doc.lines && isBlank(doc.line(runEnd + 1).text)) runEnd++
  return emptyParagraphLines(doc, runStart, runEnd).includes(line.number)
}

const cursorOffGapsAfterDelete = EditorState.transactionFilter.of(transaction => {
  if (!transaction.docChanged || !(transaction.isUserEvent('delete') || transaction.isUserEvent('cut'))) return transaction
  const { state } = transaction
  const { main } = state.selection
  if (!main.empty) return transaction
  const line = state.doc.lineAt(main.head)
  // an empty paragraph is a place for the cursor (deleting a block's text leaves one)
  if (!isGapLine(state, line) || isEmptyParagraphLine(state, line)) return transaction

  // the end of the block above, or the start of the block below at the top of the file
  let number = line.number
  while (number > 1 && isBlank(state.doc.line(number).text)) number--
  if (isBlank(state.doc.line(number).text)) {
    number = line.number
    while (number < state.doc.lines && isBlank(state.doc.line(number).text)) number++
    if (isBlank(state.doc.line(number).text)) return transaction
    return [transaction, { selection: EditorSelection.cursor(state.doc.line(number).from), sequential: true }]
  }
  return [transaction, { selection: EditorSelection.cursor(state.doc.line(number).to), sequential: true }]
})

// Where the cursor goes when switching to Document mode: from a blank line between blocks, which
// is hidden there, to the end of the block above (or the start of the one below at the top)
export function cursorForDocument (state) {
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  if (!isGapLine(state, line) || isEmptyParagraphLine(state, line)) return head
  let number = line.number
  while (number > 1 && isBlank(state.doc.line(number).text)) number--
  if (!isBlank(state.doc.line(number).text)) return state.doc.line(number).to
  while (number < state.doc.lines && isBlank(state.doc.line(number).text)) number++
  return isBlank(state.doc.line(number).text) ? head : state.doc.line(number).from
}

export { computeAll }
// The hidden blank lines sit at the end of the line above them, so a click to the right of that
// line's text lands in the gap, and the cursor would be pushed on to the next block. Clicks and
// drags that land in a gap go to the end of the line above instead.
// pos inside a gap ([end of the line above, start of the next block)) → the end of the line above
function outOfGap (state, pos) {
  let result = pos
  state.field(gaps).atomicRanges.between(pos, pos, (from, to) => {
    if (pos > from && pos < to) result = from
  })
  return result
}

const clicksBesideLines = EditorView.mouseSelectionStyle.of((view, event) => {
  // double and triple clicks select words and lines as usual
  if (event.button != 0 || event.detail > 1 || event.shiftKey || event.altKey) return null
  const pointAt = mouseEvent => view.posAtCoords({ x: mouseEvent.clientX, y: mouseEvent.clientY }, false)
  const start = pointAt(event)
  if (outOfGap(view.state, start) == start) return null
  let anchor = outOfGap(view.state, start)
  return {
    get: mouseEvent => EditorSelection.single(anchor, outOfGap(view.state, pointAt(mouseEvent))),
    update: update => {
      if (update.docChanged) anchor = update.changes.mapPos(anchor)
      return false
    }
  }
})

// The hidden blank lines at the end of the file (it usually ends with a line break) are not a place
// for the cursor: a click below the text, Cmd+↓ or ↓ on the last line go to the last empty
// paragraph there, or else to the end of the text. Enter at the end still opens a new block.
const cursorOffFileEnd = EditorState.transactionFilter.of(transaction => {
  if (!transaction.selection || transaction.docChanged) return transaction
  const { state } = transaction
  const { main } = transaction.selection
  if (!main.empty) return transaction
  const { doc } = state
  const line = doc.lineAt(main.head)
  if (!isBlank(line.text) || isEmptyParagraphLine(state, line)) return transaction
  for (let number = line.number + 1; number <= doc.lines; number++) {
    if (!isBlank(doc.line(number).text)) return transaction
  }
  let number = line.number
  while (number > 1 && isBlank(doc.line(number).text)) {
    if (isEmptyParagraphLine(state, doc.line(number))) return [transaction, { selection: EditorSelection.cursor(doc.line(number).from), sequential: true }]
    number--
  }
  if (isBlank(doc.line(number).text)) return transaction
  return [transaction, { selection: EditorSelection.cursor(doc.line(number).to), sequential: true }]
})

// An empty paragraph inside a selection shows selected (it has no text the browser could
// highlight): 'cm-selected-empty', a selection-coloured block where its text would start. In both
// modes: in Markdown mode on the blank line that stands for it (every second one), not on each.
const selectedEmpty = Decoration.line({ class: 'cm-selected-empty' })

// The browser's own selection would draw a sliver on every blank line; on selected blank lines it
// is hidden ('cm-selected-blank', index.vue), so in Markdown mode only the lines standing for empty
// paragraphs show selected, one per empty paragraph.
const selectedBlank = Decoration.line({ class: 'cm-selected-blank' })

export const selectedEmptyParagraphs = ViewPlugin.fromClass(class {
  constructor (view) {
    this.decorations = this.build(view)
  }

  update (update) {
    if (update.selectionSet || update.docChanged || update.viewportChanged) this.decorations = this.build(update.view)
  }

  build (view) {
    const { state } = view
    const { from, to } = state.selection.main
    if (from == to) return Decoration.none
    const ranges = []
    for (const visible of view.visibleRanges) {
      const start = Math.max(from, visible.from)
      const end = Math.min(to, visible.to)
      if (start > end) continue
      for (let number = state.doc.lineAt(start).number; number <= state.doc.lineAt(end).number; number++) {
        const line = state.doc.line(number)
        if (line.from < from || line.from > to || !isBlank(line.text)) continue
        ranges.push((isEmptyParagraphLine(state, line) ? selectedEmpty : selectedBlank).range(line.from))
      }
    }
    return Decoration.set(ranges, true)
  }
}, {
  decorations: plugin => plugin.decorations
})

export default [gaps, cursorOffGapsAfterDelete, cursorOffFileEnd, clicksBesideLines]
