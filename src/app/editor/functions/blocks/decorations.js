// npm packages
import { RangeSet, RangeSetBuilder } from '@codemirror/state'
import { ViewPlugin, Decoration } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
// local functions
import { getBlocksInRange, blockIndexAt } from './index.js'

// Marks the lines of blocks, only for the visible part of the document.
// Line classes: 'cm-block' on every line of a block, plus '-first' / '-last' on its edges,
// '--<type>' and '--level-<n>' for headings. A block's first line also names the block above
// ('cm-after--<type>'), its last line the block below ('cm-before--<type>'), so the space between
// two blocks can depend on both (list items sit close together, a list's edges are spaced like
// a paragraph). They set the space between blocks (index.vue).

const decorationCache = new Map()

function lineDecoration (className) {
  let decoration = decorationCache.get(className)
  if (!decoration) decorationCache.set(className, decoration = Decoration.line({ class: className }))
  return decoration
}

// the neighbour's type as seen from block: an item of another list (a numbered list right after a
// bullet list) is 'otherList', so the two lists are spaced apart like paragraphs
function neighbourType (block, neighbour) {
  return neighbour.type == 'listItem' && block.type == 'listItem' && neighbour.list != block.list ? 'otherList' : neighbour.type
}

// the end of the first line with text below the line at pos (past blank lines)
function nextTextLineEnd (doc, pos) {
  let number = doc.lineAt(pos).number + 1
  while (number <= doc.lines && /^[ \t]*$/.test(doc.line(number).text)) number++
  return number <= doc.lines ? doc.line(number).to : doc.length
}

function build (view) {
  const { state } = view
  const builder = new RangeSetBuilder()

  for (const { from, to } of view.visibleRanges) {
    // one block further than the visible part, to know the block below the last visible one
    const blocks = getBlocksInRange(state, from, nextTextLineEnd(state.doc, to))
    let index = Math.max(blockIndexAt(blocks, from), 0)
    for (; index < blocks.length && blocks[index].from <= to; index++) {
      const block = blocks[index]
      if (block.to < from) continue

      let base = `cm-block cm-block--${block.type}`
      if (block.level) base += ` cm-block--level-${block.level}`
      const after = index > 0 ? ` cm-after--${neighbourType(block, blocks[index - 1])}` : ''
      const before = index < blocks.length - 1 ? ` cm-before--${neighbourType(block, blocks[index + 1])}` : ''

      const firstLine = state.doc.lineAt(Math.max(block.from, from)).number
      const lastLine = state.doc.lineAt(Math.min(block.to, to)).number
      const blockFirst = state.doc.lineAt(block.from).number
      const blockLast = state.doc.lineAt(block.to).number
      for (let number = firstLine; number <= lastLine; number++) {
        let className = base
        if (number == blockFirst) className += ' cm-block-first' + after
        if (number == blockLast) className += ' cm-block-last' + before
        builder.add(state.doc.line(number).from, state.doc.line(number).from, lineDecoration(className))
      }
    }
  }
  return builder.finish()
}

// Typing must never wait for the line marks. An edit within one line (typing a letter, deleting
// one) only shifts the existing marks along with the text, which is cheap; the blocks are
// checked again once the browser is idle, and redrawn only if they changed (for example after
// typing '# ' or '- ' at the start of a line). Edits across lines rebuild right away, so the
// spacing never jumps.

// Runs check when the browser is idle, or right after the next paint where there is no
// requestIdleCallback (Safari), so it never delays the frame that shows a key press.
// Several requests before it runs become one.
function idleScheduler (check) {
  let isScheduled = false
  return () => {
    if (isScheduled) return
    isScheduled = true
    const run = () => {
      isScheduled = false
      check()
    }
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 150 })
    else requestAnimationFrame(() => setTimeout(run, 0))
  }
}

// an edit that is not within one line (a line break typed, deleted or moved, as in a block
// move): the line classes cannot just be shifted along with the text
function linesChanged (update) {
  if (!update.docChanged) return false
  if (update.state.doc.lines != update.startState.doc.lines) return true
  let isMultiLine = false
  update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    if (inserted.lines > 1 || update.startState.doc.lineAt(fromA).to < toA) isMultiLine = true
  })
  return isMultiLine
}
const treeChanged = update => syntaxTree(update.state) != syntaxTree(update.startState)

export const blockLines = ViewPlugin.fromClass(class {
  constructor (view) {
    this.view = view
    this.decorations = build(view)
    // decorations found by the idle check, applied by the update it dispatches
    this.next = null
    this.scheduleCheck = idleScheduler(() => this.check())
  }

  update (update) {
    if (this.next) {
      this.decorations = this.next
      this.next = null
    } else if (update.viewportChanged || linesChanged(update)) {
      this.decorations = build(update.view)
    } else if (update.docChanged) {
      this.decorations = this.decorations.map(update.changes)
      this.scheduleCheck()
    } else if (treeChanged(update)) {
      this.scheduleCheck()
    }
  }

  check () {
    if (this.isDestroyed) return
    const decorations = build(this.view)
    if (RangeSet.eq([this.decorations], [decorations])) return
    this.next = decorations
    this.view.dispatch({})
  }

  destroy () {
    this.isDestroyed = true
  }
}, {
  decorations: plugin => plugin.decorations
})
