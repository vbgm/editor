// npm packages
import { styleTags, tags } from '@lezer/highlight'

// YAML front matter at the very start of the file ('---' ... '---' or '...').
// Without this, lezer reads it as a horizontal rule followed by a setext heading,
// which would put 'title: …' into the outline.
// The second line must look like 'key:' so that a file starting with a plain '---' rule
// is not swallowed (the parser cannot look further than one line ahead).

export default {
  defineNodes: [
    { name: 'Frontmatter', block: true }
  ],
  props: [
    styleTags({ Frontmatter: tags.meta })
  ],
  parseBlock: [{
    name: 'Frontmatter',
    before: 'HorizontalRule',
    parse (cx, line) {
      if (cx.lineStart != 0 || line.text.trimEnd() != '---') return false
      if (!/^[\w-]+\s*:/.test(cx.peekLine())) return false

      const from = cx.lineStart
      while (cx.nextLine()) {
        const text = line.text.trimEnd()
        if (text == '---' || text == '...') {
          const to = cx.lineStart + line.text.length
          cx.nextLine()
          cx.addElement(cx.elt('Frontmatter', from, to))
          return true
        }
      }
      // never closed: everything up to the end of the file is front matter
      cx.addElement(cx.elt('Frontmatter', from, cx.prevLineEnd()))
      return true
    }
  }]
}
