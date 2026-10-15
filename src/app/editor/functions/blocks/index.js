// npm packages
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language'

// Blocks are derived from the Markdown syntax tree; nothing is stored in the file.
// A block is a whole-line range { from, to, type, level }:
// - from/to cover the block's first and last line (no surrounding blank lines)
// - level is the heading level (1–6) for headings, 0 for everything else
// Every top-level element is a block, and every top-level list item is a block of its own
// (as in Notion). A heading owns the blocks below it up to the next heading of the same or a
// higher level, which moves with it (move/index.js).
// (Bigger blocks, a whole list or a whole section, were tried and dropped.)

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

// trees are immutable, so blocks can be cached per tree
const cache = new WeakMap()

// complete: parse the whole document first (needed for moves; decorations only need the viewport)
export function getBlocks (state, { complete = false } = {}) {
  const tree = (complete && ensureSyntaxTree(state, state.doc.length, 5000)) || syntaxTree(state)
  if (!cache.has(tree)) cache.set(tree, parse(state.doc, tree))
  return cache.get(tree)
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
// tree: tests pass a fully parsed tree, since there is no view parsing in the background
export function getBlocksInRange (state, from, to, { tree = syntaxTree(state) } = {}) {
  return parse(state.doc, tree, from, to)
}

function parse (doc, tree, from = 0, to = doc.length) {
  const elements = []
  let node = (from > 0 && tree.topNode.childBefore(from)) || tree.topNode.firstChild

  for (; node; node = node.nextSibling) {
    if (node.from > to) break
    const name = node.name
    if (name == 'BulletList' || name == 'OrderedList') {
      for (let item = node.firstChild; item; item = item.nextSibling) {
        if (item.name == 'ListItem') elements.push(createBlock(doc, item.from, item.to, 'listItem', 0))
      }
    } else {
      const level = headingLevel(name)
      const type = level ? 'heading' : (types[name] || 'other')
      elements.push(createBlock(doc, node.from, node.to, type, level))
    }
  }

  return mergeOverlapping(elements)
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
