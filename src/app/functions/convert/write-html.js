// The document tree (markdown-tree.js) as a standalone HTML page.

export default function writeHtml ({ blocks }, title) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { max-width: 42rem; margin: 2rem auto; padding: 0 1rem; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  code, pre { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.9em; }
  pre { padding: 0.75rem 1rem; background: #f5f5f5; overflow-x: auto; }
  blockquote { margin-left: 0; padding-left: 1rem; border-left: 3px solid #ddd; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 0.25rem 0.5rem; }
  li.task { list-style: none; }
  li.task > input { margin-left: -1.4em; width: 1em; }
</style>
</head>
<body>
${bodyHtml({ blocks })}
</body>
</html>
`
}

// the document's blocks as HTML, also what Print lays out (../print.js)
export function bodyHtml ({ blocks }) {
  return blocks.map(block).join('\n')
}

function block (node) {
  switch (node.type) {
    case 'heading':
      return `<h${node.level}>${runs(node.runs)}</h${node.level}>`
    case 'paragraph':
      return `<p>${runs(node.runs)}</p>`
    case 'quote':
      return `<blockquote>\n${node.blocks.map(block).join('\n')}\n</blockquote>`
    case 'code':
      return `<pre><code>${escapeHtml(node.text)}</code></pre>`
    case 'rule':
      return '<hr>'
    case 'list': {
      const tag = node.isOrdered ? 'ol' : 'ul'
      const start = node.isOrdered && node.start != 1 ? ` start="${node.start}"` : ''
      const items = node.items.map(item => {
        const [first, ...rest] = item.blocks
        // a tight item's first paragraph without <p>
        const head = first?.type == 'paragraph' ? runs(first.runs) : first ? block(first) : ''
        const tail = rest.map(block).join('\n')
        const box = item.task == null ? '' : `<input type="checkbox" disabled${item.task ? ' checked' : ''}> `
        return `<li${item.task == null ? '' : ' class="task"'}>${box}${head}${tail ? '\n' + tail : ''}</li>`
      })
      return `<${tag}${start}>\n${items.join('\n')}\n</${tag}>`
    }
    case 'table': {
      const cell = (tag, cellRuns, index) => {
        const align = node.align[index]
        return `<${tag}${align ? ` style="text-align: ${align}"` : ''}>${runs(cellRuns)}</${tag}>`
      }
      const [header, ...rows] = node.rows
      return `<table>\n<thead>\n<tr>${header.map((c, i) => cell('th', c, i)).join('')}</tr>\n</thead>\n<tbody>\n${
        rows.map(row => `<tr>${row.map((c, i) => cell('td', c, i)).join('')}</tr>`).join('\n')
      }\n</tbody>\n</table>`
    }
  }
  return ''
}

function runs (list) {
  return list.map(run => {
    if (run.isBreak) return '<br>\n'
    let html = escapeHtml(run.text)
    if (run.isCode) html = `<code>${html}</code>`
    if (run.isStrike) html = `<del>${html}</del>`
    if (run.isItalic) html = `<em>${html}</em>`
    if (run.isBold) html = `<strong>${html}</strong>`
    if (run.link) html = `<a href="${escapeHtml(run.link)}">${html}</a>`
    return html
  }).join('')
}

export function escapeHtml (text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
