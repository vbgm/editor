// npm packages
import { RangeSet, RangeSetBuilder } from '@codemirror/state'
import { ViewPlugin, Decoration } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
// local functions
import { getBlocksInRange, blockIndexAt, granularity } from './index.js'

// Marks the lines of blocks, only for the visible part of the document.
// Line classes: 'cm-block' on every line of a block, plus '-first' / '-last' on its edges,
// '--<type>' and '--level-<n>' for headings. They only set layout (the space between cards)
// and text style; the cards themselves are drawn as boxes behind the text (card-layers.js),
// so no line has to be repainted when a card changes.
// A separate, much smaller plugin tracks the block with the cursor.

const decorationCache = new Map()

function lineDecoration (className) {
  let decoration = decorationCache.get(className)
  if (!decoration) decorationCache.set(className, decoration = Decoration.line({ class: className }))
  return decoration
}

function build (view) {
  const { state } = view
  const builder = new RangeSetBuilder()

  for (const { from, to } of view.visibleRanges) {
    const blocks = getBlocksInRange(state, from, to)
    let index = Math.max(blockIndexAt(blocks, from), 0)
    for (; index < blocks.length && blocks[index].from <= to; index++) {
      const block = blocks[index]
      if (block.to < from) continue

      let base = `cm-block cm-block--${block.type}`
      if (block.level) base += ` cm-block--level-${block.level}`

      const firstLine = state.doc.lineAt(Math.max(block.from, from)).number
      const lastLine = state.doc.lineAt(Math.min(block.to, to)).number
      const blockFirst = state.doc.lineAt(block.from).number
      const blockLast = state.doc.lineAt(block.to).number
      for (let number = firstLine; number <= lastLine; number++) {
        let className = base
        if (number == blockFirst) className += ' cm-block-first'
        if (number == blockLast) className += ' cm-block-last'
        builder.add(state.doc.line(number).from, state.doc.line(number).from, lineDecoration(className))
      }
    }
  }
  return builder.finish()
}

// Typing must never wait for the cards. An edit that keeps the number of lines (typing a
// letter, deleting one) only shifts the existing decorations along with the text, which is
// cheap; the blocks are checked again once the browser is idle, and redrawn only if they
// changed (for example after typing '# ' or '- ' at the start of a line).
// Edits that add or remove lines rebuild right away, so a new line never shows without its card.

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

const granularityChanged = update => update.state.facet(granularity) != update.startState.facet(granularity)
const linesChanged = update => update.docChanged && update.state.doc.lines != update.startState.doc.lines
const treeChanged = update => syntaxTree(update.state) != syntaxTree(update.startState)

export const cards = ViewPlugin.fromClass(class {
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
    } else if (update.viewportChanged || granularityChanged(update) || linesChanged(update)) {
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

// the block at the cursor: in a gap between blocks, the block before it
function activeBlock (state) {
  const head = state.selection.main.head
  const blocks = getBlocksInRange(state, head, head)
  return blocks[blockIndexAt(blocks, head)] || null
}

const sameBlock = (a, b) => a?.from == b?.from && a?.to == b?.to

// block: { from, to, type, level } of the block with the cursor, or null
export const active = ViewPlugin.fromClass(class {
  constructor (view) {
    this.view = view
    this.block = activeBlock(view.state)
    this.scheduleCheck = idleScheduler(() => this.check())
  }

  update (update) {
    if (update.docChanged && !linesChanged(update)) {
      // typing: the cursor stays in its block, which only grows or shrinks
      const { changes } = update
      if (this.block) this.block = { ...this.block, from: changes.mapPos(this.block.from), to: changes.mapPos(this.block.to, 1) }
      this.scheduleCheck()
    } else if (update.docChanged || granularityChanged(update)) {
      this.block = activeBlock(update.state)
    } else if (update.selectionSet) {
      // the cursor moved within the same block (or the gap after it): keep the same object
      const block = activeBlock(update.state)
      if (!sameBlock(block, this.block)) this.block = block
    } else if (treeChanged(update)) {
      this.scheduleCheck()
    }
  }

  check () {
    if (this.isDestroyed) return
    const block = activeBlock(this.view.state)
    if (sameBlock(block, this.block)) return
    this.block = block
    this.view.dispatch({})
  }

  destroy () {
    this.isDestroyed = true
  }
})
