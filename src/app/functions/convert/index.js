// Documents in other formats: opened as a new Markdown document (import), and the document
// written as one (export). The converters are loaded when first used, so they cost nothing at
// startup.
//
//   isImportable (name)               RTF, Word, OpenDocument or PDF, by the file's extension
//   importDocument (bytes, name)      { text (Markdown), lost (what was left out, in words) }
//   exportDocument (text, extension, title)   the file's bytes
//
// Errors thrown are { kind: 'notDocument', message }.

// the open dialog's and the export's formats; the first export format is the default
export const importFormats = [
  { name: 'Rich Text', extensions: ['rtf'] },
  { name: 'Word', extensions: ['docx'] },
  { name: 'OpenDocument Text', extensions: ['odt'] },
  { name: 'PDF', extensions: ['pdf'] }
]

export const exportFormats = [
  { name: 'Word', extensions: ['docx'] },
  { name: 'Rich Text', extensions: ['rtf'] },
  { name: 'OpenDocument Text', extensions: ['odt'] },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'HTML', extensions: ['html'] }
]

export const exportTypes = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  pdf: 'application/pdf',
  html: 'text/html'
}

export function extensionOf (name) {
  const match = /\.([^./\\]+)$/.exec(name ?? '')
  return match ? match[1].toLowerCase() : ''
}

export function isImportable (name) {
  return importFormats.some(format => format.extensions.includes(extensionOf(name)))
}

export async function importDocument (bytes, name) {
  const format = formatOf(bytes) ?? extensionOf(name)
  const [{ default: toMarkdown }, { default: read }] = await Promise.all([
    import('./to-markdown.js'),
    { rtf: () => import('./read-rtf.js'), docx: () => import('./read-docx.js'), odt: () => import('./read-odt.js'), pdf: () => import('./read-pdf.js') }[format]()
  ])
  // a PDF made here gives back its own Markdown
  const { body, markdown, lost } = await read(bytes)
  return { text: markdown ?? toMarkdown(body), lost: listLost(lost) }
}

export async function exportDocument (text, extension, title) {
  const [{ default: markdownTree }, { default: write }] = await Promise.all([
    import('./markdown-tree.js'),
    { docx: () => import('./write-docx.js'), rtf: () => import('./write-rtf.js'), odt: () => import('./write-odt.js'), pdf: () => import('./write-pdf.js'), html: () => import('./write-html.js') }[extension]()
  ])
  const written = await write(markdownTree(text), title, text)
  return typeof written == 'string' ? new TextEncoder().encode(written) : written
}

// what the first bytes say the file is, whatever its name: RTF starts with {\rtf, a PDF with
// %PDF- (a little later in some), an ODT is a zip whose first file, uncompressed, is its type,
// and a Word document is another zip
function formatOf (bytes) {
  const head = String.fromCharCode(...bytes.subarray(0, 100))
  if (head.startsWith('{\\rtf')) return 'rtf'
  if (!head.startsWith('PK') && String.fromCharCode(...bytes.subarray(0, 1024)).includes('%PDF-')) return 'pdf'
  if (!head.startsWith('PK')) return null
  return head.includes('mimetypeapplication/vnd.oasis.opendocument.text') ? 'odt' : 'docx'
}

// 'font sizes, colours and images'
function listLost (lost) {
  const order = ['fonts', 'font sizes', 'colours', 'highlighting', 'underlining', 'alignment', 'images', 'footnotes', 'comments', 'headers and footers']
  const names = order.filter(name => lost.has(name))
  if (names.length < 2) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
