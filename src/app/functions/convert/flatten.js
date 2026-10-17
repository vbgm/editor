// The document tree (markdown-tree.js) as the flat run of paragraphs that RTF, DOCX and ODT
// write, each knowing the list and quote it is in:
//
//   { type: 'heading', level, runs }
//   { type: 'paragraph', runs, quote, list, indent }
//   { type: 'code', text, quote, indent }
//   { type: 'rule' }
//   { type: 'table', align, rows }
//
// quote: how many quotes deep. list: the first paragraph of a list item, { id, depth,
// isOrdered, number }; its other paragraphs have list null and indent, the item's depth + 1.
// Lists are numbered per top-level list (id); `lists` holds, for each, whether each depth is
// numbered and the numbers it starts at. A task's paragraph starts with ☐ or ☑.

export const unchecked = '☐'
export const checked = '☑'

export default function flatten ({ blocks }) {
  const paragraphs = []
  const lists = []

  function add (block, quote, indent, list) {
    switch (block.type) {
      case 'heading':
      case 'rule':
      case 'table':
        paragraphs.push(block)
        break
      case 'paragraph':
        paragraphs.push({ type: 'paragraph', runs: block.runs, quote, list, indent })
        break
      case 'code':
        paragraphs.push({ type: 'code', text: block.text, quote, indent })
        break
      case 'quote':
        block.blocks.forEach(inner => add(inner, quote + 1, indent, null))
        break
      case 'list': {
        const depth = list?.depth != null ? list.depth + 1 : indent
        const top = list?.top ?? (lists.push({ levels: [], starts: [] }) - 1)
        const definition = lists[top]
        // a depth's kind is that of its first list in the top-level list
        definition.levels[depth] ??= block.isOrdered
        definition.starts[depth] ??= block.start
        block.items.forEach((item, index) => {
          const marker = { id: top, top, depth, isOrdered: block.isOrdered, number: block.start + index }
          let [first, ...rest] = item.blocks
          if (item.task != null) {
            const box = { text: `${item.task ? checked : unchecked} `, isBold: false, isItalic: false, isStrike: false, isCode: false, link: null }
            first = first?.type == 'paragraph' ? { ...first, runs: [box, ...first.runs] } : { type: 'paragraph', runs: [box] }
            if (item.blocks[0]?.type != 'paragraph' && item.blocks[0]) rest = item.blocks
          }
          if (!first) return add({ type: 'paragraph', runs: [] }, quote, depth + 1, marker)
          if (first.type == 'paragraph') add(first, quote, depth + 1, marker)
          else {
            add({ type: 'paragraph', runs: [] }, quote, depth + 1, marker)
            rest = [first, ...rest]
          }
          // nested lists keep counting the top-level list's levels
          rest.forEach(inner => add(inner, quote, depth + 1, inner.type == 'list' ? { ...marker } : null))
        })
        break
      }
    }
  }

  blocks.forEach(block => add(block, 0, 0, null))
  // only an item's first paragraph carries a marker
  return {
    paragraphs: paragraphs.map(p => p.list ? { ...p, list: { id: p.list.id, depth: p.list.depth, isOrdered: p.list.isOrdered, number: p.list.number } } : p),
    lists: lists.map(({ levels, starts }) => ({ levels, starts }))
  }
}
