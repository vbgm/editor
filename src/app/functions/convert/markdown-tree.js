// Markdown → a small document tree, for the exporters (write-*.js). Read with the same parser
// the editor uses (GFM plus front matter), so a document exports as it is shown.
//
//   block:  { type: 'heading', level, runs }
//           { type: 'paragraph', runs }
//           { type: 'list', isOrdered, start, items: [{ task: null | true | false, blocks }] }
//           { type: 'quote', blocks }
//           { type: 'code', text }
//           { type: 'rule' }
//           { type: 'table', align: ['left' | 'center' | 'right' | null], rows: [[runs]] }
//                            (the first row is the header)
//   run:    { text, isBold, isItalic, isStrike, isCode, link (a URL or null) }
//           { isBreak: true }
//
// A line break inside a paragraph is a break: the editor shows every line as a line. Front
// matter, HTML comments and images are left out (an image keeps its alt text).

// npm packages
import { parser, GFM } from '@lezer/markdown'
// app functions
import frontmatter from '/src/app/editor/functions/markdown/frontmatter.js'

const markdownParser = parser.configure([GFM, frontmatter])

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

const plain = { isBold: false, isItalic: false, isStrike: false, isCode: false, link: null }

export default function markdownTree (text) {
  const tree = markdownParser.parse(text)
  const slice = node => text.slice(node.from, node.to)
  const children = node => {
    const list = []
    for (let child = node.firstChild; child; child = child.nextSibling) list.push(child)
    return list
  }
  const child = (node, name) => children(node).find(c => c.name == name)

  // [label]: url, for reference links
  const references = new Map()
  tree.iterate({
    enter (ref) {
      if (ref.name != 'LinkReference') return
      const label = child(ref.node, 'LinkLabel')
      const url = child(ref.node, 'URL')
      if (label && url) references.set(normalizeLabel(slice(label)), unbracket(slice(url)))
      return false
    }
  })

  function blocks (node) {
    return children(node).flatMap(block)
  }

  function block (node) {
    const name = node.name
    const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name)
    if (heading) {
      const marks = children(node).filter(c => c.name == 'HeaderMark')
      // ATX: after the opening #s, before any closing ones; setext: before the underline
      const from = name.startsWith('ATX') ? marks[0].to : node.from
      const to = name.startsWith('ATX') ? (marks.length > 1 ? marks.at(-1).from : node.to) : marks.at(-1).from
      return [{ type: 'heading', level: Number(heading[1]), runs: trimRuns(inline(node, from, to)) }]
    }
    switch (name) {
      case 'Paragraph':
        return [{ type: 'paragraph', runs: trimRuns(inline(node, node.from, node.to)) }]
      case 'Blockquote':
        return [{ type: 'quote', blocks: blocks(node) }]
      case 'BulletList':
      case 'OrderedList':
        return [list(node)]
      case 'FencedCode':
      case 'CodeBlock':
        return [{ type: 'code', text: codeText(node) }]
      case 'HorizontalRule':
        return [{ type: 'rule' }]
      case 'Table':
        return [table(node)]
      case 'HTMLBlock':
        return [{ type: 'paragraph', runs: lines(slice(node)) }]
      default:
        // front matter, link references, comments, processing instructions; marks
        return []
    }
  }

  function list (node) {
    const isOrdered = node.name == 'OrderedList'
    const items = children(node).filter(c => c.name == 'ListItem')
    const first = items[0] && child(items[0], 'ListMark')
    const start = isOrdered && first ? parseInt(slice(first), 10) : 1
    return {
      type: 'list',
      isOrdered,
      start,
      items: items.map(item => {
        const task = child(item, 'Task')
        if (!task) return { task: null, blocks: blocks(item) }
        const marker = child(task, 'TaskMarker')
        const rest = children(item).filter(c => c != task)
        return {
          task: /x/i.test(slice(marker)),
          blocks: [{ type: 'paragraph', runs: trimRuns(inline(task, marker.to, task.to)) }, ...rest.flatMap(block)]
        }
      })
    }
  }

  // the code's lines without the fences, the indentation of the list or quote it is in, or an
  // indented block's 4 spaces
  function codeText (node) {
    const lineStart = text.lastIndexOf('\n', node.from - 1) + 1
    const prefix = text.slice(lineStart, node.from)
    const quotes = (prefix.match(/>/g) ?? []).length
    const indent = prefix.replace(/>/g, ' ').length
    let body
    if (node.name == 'FencedCode') {
      const codeText = child(node, 'CodeText')
      if (!codeText) return ''
      body = text.slice(text.lastIndexOf('\n', codeText.from - 1) + 1, codeText.to)
    } else {
      body = text.slice(lineStart, node.to)
    }
    const strip = node.name == 'CodeBlock' ? indent + 4 : indent
    return body.split('\n').map((line, index) => {
      if (index > 0 || node.name == 'FencedCode') for (let i = 0; i < quotes; i++) line = line.replace(/^ {0,3}> ?/, '')
      else line = line.slice(prefix.length - indent)
      return line.replace(new RegExp(`^ {0,${strip}}`), '')
    }).join('\n')
  }

  function table (node) {
    const rowNodes = children(node).filter(c => c.name == 'TableHeader' || c.name == 'TableRow')
    const delimiter = children(node).find(c => c.name == 'TableDelimiter')
    const align = delimiter
      ? slice(delimiter).replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(cell => {
        cell = cell.trim()
        const left = cell.startsWith(':')
        const right = cell.endsWith(':')
        return left && right ? 'center' : right ? 'right' : left ? 'left' : null
      })
      : []
    const columns = Math.max(align.length, ...rowNodes.map(row => children(row).filter(c => c.name == 'TableCell').length))
    const rows = rowNodes.map(row => {
      const cells = children(row).filter(c => c.name == 'TableCell').map(cell => trimRuns(inline(cell, cell.from, cell.to)))
      while (cells.length < columns) cells.push([])
      return cells.slice(0, columns)
    })
    while (align.length < columns) align.push(null)
    return { type: 'table', align, rows }
  }

  // the runs of node's text between from and to, child nodes formatting their part
  function inline (node, from, to, marks = plain) {
    const runs = []
    let at = from
    const addText = value => runs.push(...lines(value, marks))
    for (const c of children(node)) {
      if (c.to <= from || c.from >= to) continue
      if (c.from > at) addText(text.slice(at, c.from))
      at = Math.max(at, c.to)
      switch (c.name) {
        case 'Emphasis':
          runs.push(...inner(c, 'EmphasisMark', { ...marks, isItalic: true }))
          break
        case 'StrongEmphasis':
          runs.push(...inner(c, 'EmphasisMark', { ...marks, isBold: true }))
          break
        case 'Strikethrough':
          runs.push(...inner(c, 'StrikethroughMark', { ...marks, isStrike: true }))
          break
        case 'InlineCode': {
          const codeMarks = children(c).filter(m => m.name == 'CodeMark')
          let value = text.slice(codeMarks[0].to, codeMarks.at(-1).from).replace(/\n/g, ' ')
          if (/^ .*[^ ].* $/.test(value)) value = value.slice(1, -1)
          runs.push({ ...marks, text: value, isCode: true })
          break
        }
        case 'Link':
        case 'Image': {
          const linkMarks = children(c).filter(m => m.name == 'LinkMark')
          const close = linkMarks.find(m => slice(m) == ']')
          const contentFrom = linkMarks[0].to
          const contentTo = close ? close.from : c.to
          const url = child(c, 'URL')
          const label = child(c, 'LinkLabel')
          const href = url
            ? unbracket(slice(url))
            : references.get(normalizeLabel(label ? slice(label) : text.slice(contentFrom, contentTo))) ?? null
          if (c.name == 'Image') addText(text.slice(contentFrom, contentTo))
          else runs.push(...inline(c, contentFrom, contentTo, { ...marks, link: href ?? marks.link }))
          break
        }
        case 'Autolink': {
          const url = child(c, 'URL')
          const value = url ? slice(url) : slice(c).slice(1, -1)
          runs.push({ ...marks, text: value, link: /^[\w.+-]+@[\w-]+\./.test(value) && !value.includes(':') ? `mailto:${value}` : value })
          break
        }
        case 'URL': {
          const value = slice(c)
          runs.push({ ...marks, text: value, link: /^www\./i.test(value) ? `http://${value}` : value })
          break
        }
        case 'Escape':
          runs.push({ ...marks, text: slice(c).slice(1) })
          break
        case 'Entity':
          runs.push({ ...marks, text: decodeEntity(slice(c)) })
          break
        case 'HardBreak':
          runs.push({ isBreak: true })
          break
        case 'HTMLTag':
          if (/^<br\s*\/?>$/i.test(slice(c))) runs.push({ isBreak: true })
          break
        case 'QuoteMark':
        case 'TaskMarker':
        case 'HeaderMark':
        case 'ListMark':
        case 'EmphasisMark':
        case 'LinkMark':
        case 'CodeMark':
        case 'Comment':
          break
        default:
          runs.push(...inline(c, c.from, c.to, marks))
      }
    }
    if (at < to) addText(text.slice(at, to))
    return joinLines(runs)
  }

  // the content of a node between its first and last mark
  function inner (node, markName, marks) {
    const nodeMarks = children(node).filter(m => m.name == markName)
    return inline(node, nodeMarks[0].to, nodeMarks.at(-1).from, marks)
  }

  return { blocks: blocks(tree.topNode) }
}

// text with line breaks as runs and breaks; the indentation after a break is not text
function lines (value, marks = plain) {
  const runs = []
  value.split('\n').forEach((line, index) => {
    if (index > 0) runs.push({ isBreak: true })
    // trailing spaces are a hard break's, or nothing
    if (line) runs.push({ ...marks, text: line })
  })
  return runs
}

// the spaces after a break are indentation (or a quote's), not text; consecutive runs with the
// same formatting are one
function joinLines (runs) {
  const joined = []
  let isLineStart = false
  for (const run of runs) {
    if (run.isBreak) {
      // a hard break's spaces and backslash are not text
      const last = joined.at(-1)
      if (last && !last.isBreak && !last.isCode) last.text = last.text.replace(/(?: {2,}|\\)$/, '').replace(/[ \t]+$/, '')
      if (last && !last.isBreak && !last.text) joined.pop()
      // two breaks in a row are one: a hard break's own line break
      if (!joined.at(-1)?.isBreak || !isLineStart || run.isHard) joined.push(run)
      isLineStart = true
      continue
    }
    let text = run.text
    if (isLineStart && !run.isCode) text = text.replace(/^[ \t>]+/, '')
    if (!text) continue
    isLineStart = false
    const last = joined.at(-1)
    if (last && !last.isBreak && sameMarks(last, run)) last.text += text
    else joined.push({ ...run, text })
  }
  return joined
}

function sameMarks (a, b) {
  return a.isBold == b.isBold && a.isItalic == b.isItalic && a.isStrike == b.isStrike && a.isCode == b.isCode && a.link == b.link
}

// no breaks or spaces at either end
export function trimRuns (runs) {
  runs = runs.slice()
  while (runs[0]?.isBreak) runs.shift()
  while (runs.at(-1)?.isBreak) runs.pop()
  if (runs[0] && !runs[0].isCode) runs[0] = { ...runs[0], text: runs[0].text.replace(/^\s+/, '') }
  const last = runs.length - 1
  if (runs[last] && !runs[last].isCode) runs[last] = { ...runs[last], text: runs[last].text.replace(/\s+$/, '') }
  return runs.filter(run => run.isBreak || run.text)
}

function normalizeLabel (label) {
  return label.replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function unbracket (url) {
  return url.startsWith('<') && url.endsWith('>') ? url.slice(1, -1) : url
}

function decodeEntity (entity) {
  const numeric = /^&#(x?)([0-9a-f]+);$/i.exec(entity)
  if (numeric) {
    const code = parseInt(numeric[2], numeric[1] ? 16 : 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�'
  }
  return entities[entity.slice(1, -1)] ?? entity
}

// plain text of runs (for names, alt text)
export function runsText (runs) {
  return runs.map(run => run.isBreak ? '\n' : run.text).join('')
}
