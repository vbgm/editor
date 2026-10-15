// npm packages
import { Facet } from '@codemirror/state'
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language'

// Blocks are derived from the Markdown syntax tree; nothing is stored in the file.
// A block is a whole-line range { from, to, type, level }:
// - from/to cover the block's first and last line (no surrounding blank lines)
// - level is the heading level (1–6) for headings, 0 for everything else
//
// Granularity (still to be decided by measurement):
// - 'item':    every top-level element, and every top-level list item separately (Notion-like)
// - 'element': every top-level element (a whole list is one block)
// - 'section': a heading together with its body up to the next heading

export const granularities = ['item', 'element', 'section']

export const granularity = Facet.define({
  combine: values => values[0] || 'item'
})

const types = {
  Paragraph: 'paragraph',
  BulletList: 'list',
  OrderedList: 'list',
  ListItem: 'listItem',
  FencedCode: 'code',
  CodeBlock: 'code',
  Blockquote: 'quote',
  Table: 'table',
  HorizontalRule: 'rule',
  HTMLBlock: 'html',
  CommentBlock: 'html',
  LinkReference: 'reference',
  Frontmatter: 'frontmatter'
}

// trees are immutable, so blocks can be cached per tree and granularity
const cache = new WeakMap()

// complete: parse the whole document first (needed for moves; decorations only need the viewport)
export function getBlocks (state, { complete = false } = {}) {
  const tree = (complete && ensureSyntaxTree(state, state.doc.length, 5000)) || syntaxTree(state)
  const mode = state.facet(granularity)

  let byMode = cache.get(tree)
  if (!byMode) cache.set(tree, byMode = {})
  if (!byMode[mode]) byMode[mode] = parse(state.doc, tree, mode)
  return byMode[mode]
}

// index of the block at pos; in a gap between blocks, the block before it
export function blockIndexAt (blocks, pos) {
  let low = 0
  let high = blocks.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (blocks[middle].from <= pos) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found == -1 && blocks.length ? 0 : found
}

// Blocks overlapping from..to, without parsing further than the current syntax tree.
// Cheap enough to run on every keystroke: decorations only need the visible part.
// mode: a granularity other than the editor's (the blank lines between blocks are always
// found with 'item', whatever the cards show)
// tree: tests pass a fully parsed tree, since there is no view parsing in the background
export function getBlocksInRange (state, from, to, { mode = state.facet(granularity), tree = syntaxTree(state) } = {}) {
  return parse(state.doc, tree, mode, from, to)
}

const startsSection = name => name == 'Frontmatter' || headingLevel(name) > 0

function parse (doc, tree, mode, from = 0, to = doc.length) {
  const elements = []
  let node = (from > 0 && tree.topNode.childBefore(from)) || tree.topNode.firstChild
  // a section starts at its heading, which may be above the range
  if (mode == 'section') while (node?.prevSibling && !startsSection(node.name)) node = node.prevSibling

  for (; node; node = node.nextSibling) {
    // a section runs on past the range until the next heading
    if (node.from > to && (mode != 'section' || startsSection(node.name))) break
    const name = node.name
    if (mode == 'item' && (name == 'BulletList' || name == 'OrderedList')) {
      for (let item = node.firstChild; item; item = item.nextSibling) {
        if (item.name == 'ListItem') elements.push(createBlock(doc, item.from, item.to, 'listItem', 0))
      }
    } else {
      const level = headingLevel(name)
      const type = level ? 'heading' : (types[name] || 'other')
      elements.push(createBlock(doc, node.from, node.to, type, level))
    }
  }

  const blocks = mergeOverlapping(elements)
  return mode == 'section' ? groupSections(blocks) : blocks
}

function headingLevel (name) {
  const match = /^(?:ATX|Setext)Heading(\d)$/.exec(name)
  return match ? Number(match[1]) : 0
}

function createBlock (doc, from, to, type, level) {
  const first = doc.lineAt(from)
  let last = doc.lineAt(to)
  // a node ending right after a line break belongs to the line before
  if (last.from == to && to > from) last = doc.lineAt(to - 1)
  return { from: first.from, to: last.to, type, level }
}

// two elements on the same line (should not happen in valid block structure) become one block
function mergeOverlapping (elements) {
  const blocks = []
  for (const element of elements) {
    const previous = blocks[blocks.length - 1]
    if (previous && element.from <= previous.to) {
      previous.to = Math.max(previous.to, element.to)
    } else {
      blocks.push(element)
    }
  }
  return blocks
}

function groupSections (elements) {
  const sections = []
  let current = null
  for (const element of elements) {
    const startsNew = !current || element.type == 'heading' || element.type == 'frontmatter' || current.type == 'frontmatter'
    if (startsNew) {
      current = {
        from: element.from,
        to: element.to,
        type: element.type == 'frontmatter' ? 'frontmatter' : 'section',
        level: element.level
      }
      sections.push(current)
    } else {
      current.to = element.to
    }
  }
  return sections
}
