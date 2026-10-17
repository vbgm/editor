// The readers' HTML (read-*.js) → Markdown, written as the editor writes it: '- ' bullets, items'
// further lines indented as wide as their mark, '**bold**', '*italic*', '~~strikethrough~~',
// fenced code, '- [ ] ' tasks. A line break is a line of its own, as the editor shows lines.
// Characters are escaped only where they would otherwise become Markdown.

// npm packages
import TurndownService from 'turndown'
import { tables } from 'turndown-plugin-gfm'

const boxes = { '☐': ' ', '☑': 'x', '☒': 'x', '✓': 'x', '✔': 'x' }

export default function toMarkdown (body) {
  prepare(body)
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    br: ''
  })
  service.use(tables)
  service.escape = escape
  service.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: content => content.trim() ? `~~${content}~~` : content
  })
  service.addRule('listItem', {
    filter: 'li',
    replacement (content, node) {
      const parent = node.parentNode
      let prefix = '- '
      if (parent.nodeName == 'OL') {
        const start = Number(parent.getAttribute('start') || 1)
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `
      }
      content = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n(?=.)/g, '\n' + ' '.repeat(prefix.length))
      return prefix + content + (node.nextSibling && !content.endsWith('\n') ? '\n' : '')
    }
  })
  service.addRule('checkbox', {
    filter: node => node.nodeName == 'INPUT' && node.getAttribute('type') == 'checkbox',
    replacement: (content, node) => node.hasAttribute('checked') ? '[x] ' : '[ ] '
  })
  service.addRule('image', {
    filter: 'img',
    replacement: () => ''
  })
  // anchors without a link (bookmarks) are their text
  service.addRule('anchor', {
    filter: node => node.nodeName == 'A' && !node.getAttribute('href'),
    replacement: content => content
  })

  let markdown = service.turndown(body)
  markdown = markdown
    // the lines of tasks: '☐' and '☑' at an item's or a line's start
    .replace(/^( *)((?:[-*+]|\d+[.)]) )?([☐☑☒✓✔])[ \t ]*/gm, (_, indent, mark, box) => `${indent}${mark ?? '- '}[${boxes[box]}] `)
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return markdown ? markdown + '\n' : ''
}

// what turndown's tables and code blocks need, and nothing the Markdown cannot hold
function prepare (body) {
  const document = body.ownerDocument
  // a table's first row is its header
  for (const table of body.querySelectorAll('table')) {
    const first = table.querySelector('tr')
    if (!first) {
      table.remove()
      continue
    }
    for (const cell of first.querySelectorAll(':scope > td')) {
      const th = document.createElement('th')
      th.append(...cell.childNodes)
      cell.replaceWith(th)
    }
    // a cell is one line: its paragraphs and breaks become spaces, its lists their text
    for (const cell of table.querySelectorAll('td, th')) {
      for (const br of cell.querySelectorAll('br')) br.replaceWith(document.createTextNode(' '))
      for (const block of cell.querySelectorAll('p, ul, ol, li, h1, h2, h3, h4, h5, h6, pre, blockquote')) {
        block.replaceWith(document.createTextNode(' '), ...block.childNodes, document.createTextNode(' '))
      }
      cell.normalize()
      const text = cell.textContent
      if (text.includes('|')) {
        const walker = document.createTreeWalker(cell, 4)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) node.data = node.data.replace(/\|/g, '\\|')
      }
    }
    // rows as wide as the widest
    const rows = [...table.querySelectorAll('tr')]
    const width = Math.max(...rows.map(row => row.children.length))
    rows.forEach((row, index) => {
      while (row.children.length < width) row.append(document.createElement(index == 0 ? 'th' : 'td'))
    })
  }
  // code blocks as <pre><code>
  for (const pre of body.querySelectorAll('pre')) {
    for (const br of pre.querySelectorAll('br')) br.replaceWith(document.createTextNode('\n'))
    if (pre.children.length == 1 && pre.firstElementChild.nodeName == 'CODE' && pre.firstChild == pre.firstElementChild) continue
    const code = document.createElement('code')
    code.textContent = pre.textContent
    pre.replaceChildren(code)
  }
  // a heading's or a header cell's bold is its own
  for (const strong of body.querySelectorAll(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'th'].flatMap(tag => [`${tag} strong`, `${tag} b`]).join(', '))) {
    strong.replaceWith(...strong.childNodes)
  }
  // a heading or a list item is one line in Markdown: its breaks are spaces
  for (const br of body.querySelectorAll('h1 br, h2 br, h3 br, h4 br, h5 br, h6 br')) br.replaceWith(document.createTextNode(' '))
  // an inline code with formatting around it keeps only the code
  for (const code of body.querySelectorAll('code')) {
    if (code.closest('pre')) continue
    code.textContent = code.textContent.replace(/\n/g, ' ')
  }
}

// escapes only what would become Markdown in the editor: emphasis and code marks, the start of a
// heading, list, quote or rule, links, and HTML
function escape (text) {
  return text
    .replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\')
    .replace(/[*`]/g, '\\$&')
    .replace(/~~/g, '\\~\\~')
    // an underscore inside a word is not emphasis
    .replace(/(^|[^\p{L}\p{N}])_|_(?=$|[^\p{L}\p{N}])/gu, (match, before) => before != null ? `${before}\\_` : '\\_')
    .replace(/\[([^\]]*)\](?=[([:])/g, '\\[$1\\]')
    .replace(/<(?=[a-zA-Z/!?])/g, '\\<')
    .replace(/^(\s*)([-+] )/gm, '$1\\$2')
    .replace(/^(\s*)(#{1,6}(?: |$))/gm, '$1\\$2')
    .replace(/^(\s*)>/gm, '$1\\>')
    .replace(/^(\s*\d+)([.)] )/gm, '$1\\$2')
    .replace(/^(\s*)(=+|-+)\s*$/gm, '$1\\$2')
}
