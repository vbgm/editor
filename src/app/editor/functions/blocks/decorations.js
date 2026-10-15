// npm packages
import { RangeSetBuilder } from '@codemirror/state'
import { ViewPlugin, Decoration } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
// local functions
import { getBlocksInRange, blockIndexAt, granularity } from './index.js'

// Draws blocks as cards with line decorations, only for the visible part of the document.
// Line classes: 'cm-block' on every line of a block, plus '-first' / '-last' on its edges,
// '--<type>', '--level-<n>' for headings and '--active' for the block with the cursor.

const decorationCache = new Map()

function lineDecoration (className) {
  let decoration = decorationCache.get(className)
  if (!decoration) decorationCache.set(className, decoration = Decoration.line({ class: className }))
  return decoration
}

function build (view) {
  const { state } = view
  const head = state.selection.main.head
  const builder = new RangeSetBuilder()

  for (const { from, to } of view.visibleRanges) {
    const blocks = getBlocksInRange(state, from, to)
    const activeIndex = blockIndexAt(blocks, head)
    let index = Math.max(blockIndexAt(blocks, from), 0)
    for (; index < blocks.length && blocks[index].from <= to; index++) {
      const block = blocks[index]
      if (block.to < from) continue

      let base = `cm-block cm-block--${block.type}`
      if (block.level) base += ` cm-block--level-${block.level}`
      // the cursor may be outside this range; then no block here is active
      const isActive = index == activeIndex && head <= (blocks[index + 1]?.from ?? to)
      if (isActive) base += ' cm-block--active'

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

export default ViewPlugin.fromClass(class {
  constructor (view) {
    this.decorations = build(view)
  }

  update (update) {
    const changed = update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      syntaxTree(update.state) != syntaxTree(update.startState) ||
      update.state.facet(granularity) != update.startState.facet(granularity)
    if (changed) this.decorations = build(update.view)
  }
}, {
  decorations: plugin => plugin.decorations
})
