// npm packages
import { markdown as markdownSupport, markdownLanguage } from '@codemirror/lang-markdown'
// local functions
import frontmatter from './frontmatter.js'

// GFM (tables, task lists, strikethrough) plus front matter
export default function markdown () {
  return markdownSupport({
    base: markdownLanguage,
    extensions: [frontmatter]
  })
}
