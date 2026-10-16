// npm packages
import { syntaxTree } from '@codemirror/language'

// The formats of the text with the main cursor or selection, for the toolbar's buttons:
// { heading: 0–6, bold, italic, strikethrough, code, link, bullet, ordered, task }.
// An inline format is on when the cursor is inside it (not right before or after its marks), or
// when the whole selection is in it. A list is the innermost one the cursor's line is in.

const inlineNames = {
  StrongEmphasis: 'bold',
  Emphasis: 'italic',
  Strikethrough: 'strikethrough',
  InlineCode: 'code',
  Link: 'link'
}

const headingName = /^(?:ATX|Setext)Heading(\d)$/

export function activeFormats (state) {
  const { from, to, empty } = state.selection.main
  const formats = { heading: 0, bold: false, italic: false, strikethrough: false, code: false, link: false, bullet: false, ordered: false, task: false }
  let item = null
  syntaxTree(state).iterate({
    from,
    to,
    enter: node => {
      const inline = inlineNames[node.name]
      if (inline) {
        if (empty ? node.from < from && to < node.to : node.from <= from && to <= node.to) formats[inline] = true
        return
      }
      if (node.from > from || node.to < to) return
      const heading = headingName.exec(node.name)
      if (heading) formats.heading = Number(heading[1])
      // the outer ones come first: the last is the innermost
      else if (node.name == 'ListItem') item = node.node
    }
  })
  if (item) {
    formats.bullet = item.parent?.name == 'BulletList'
    formats.ordered = item.parent?.name == 'OrderedList'
    formats.task = !!item.getChild('Task')
  }
  return formats
}
