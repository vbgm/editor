// npm packages
import { RangeSetBuilder } from '@codemirror/state'
import { ViewPlugin, Decoration } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
// local functions
import { getBlocksInRange, blockIndexAt, granularity } from './index.js'

// Draws blocks as cards with line decorations, only for the visible part of the document.
// Line classes: 'cm-block' on every line of a block, plus '-first' / '-last' on its edges,
// '--<type>' and '--level-<n>' for headings.
// The block with the cursor gets 'cm-block--active' from a separate, much smaller plugin,
// so moving the cursor does not rebuild the cards.

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

const structureChanged = update => update.docChanged ||
  syntaxTree(update.state) != syntaxTree(update.startState) ||
  update.state.facet(granularity) != update.startState.facet(granularity)

const cards = ViewPlugin.fromClass(class {
  constructor (view) {
    this.decorations = build(view)
  }

  update (update) {
    if (update.viewportChanged || structureChanged(update)) this.decorations = build(update.view)
  }
}, {
  decorations: plugin => plugin.decorations
})

const activeDecoration = Decoration.line({ class: 'cm-block--active' })

// the block at the cursor: in a gap between blocks, the block before it
function activeBlock (state) {
  const head = state.selection.main.head
  const blocks = getBlocksInRange(state, head, head)
  return blocks[blockIndexAt(blocks, head)] || null
}

const active = ViewPlugin.fromClass(class {
  constructor (view) {
    this.set(view.state)
  }

  set (state) {
    const block = this.block = activeBlock(state)
    const builder = new RangeSetBuilder()
    if (block) {
      for (let line = state.doc.lineAt(block.from); ; line = state.doc.line(line.number + 1)) {
        builder.add(line.from, line.from, activeDecoration)
        if (line.to >= block.to) break
      }
    }
    this.decorations = builder.finish()
  }

  update (update) {
    if (structureChanged(update)) return this.set(update.state)
    if (!update.selectionSet) return
    // the cursor moved within the same block (or the same gap after it): nothing to redraw
    const head = update.state.selection.main.head
    const block = activeBlock(update.state)
    if (block?.from == this.block?.from && block?.to == this.block?.to && head >= (block?.from ?? 0)) return
    this.set(update.state)
  }
}, {
  decorations: plugin => plugin.decorations
})

export default [cards, active]
