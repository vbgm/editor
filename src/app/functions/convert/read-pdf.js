// PDF → simple HTML (for to-markdown.js), read with pdf.js (Mozilla's, Apache 2.0).
//
// A PDF made here (write-pdf.js) carries its Markdown as an attached file, which is given back
// as it is. Other PDFs hold text placed on pages:
//
// - A tagged PDF (Word's, Pages', Google Docs', a browser's Save as PDF) says what its text is,
//   for screen readers: headings, paragraphs, lists, tables. Those tags are followed; what they
//   leave out (headers, footers, page numbers) is left out.
// - Otherwise the structure is guessed: lines from the text's baselines, paragraphs from the
//   space between lines (a short line followed at the usual distance is a line of its own),
//   lines repeated at the top or bottom of the pages left out.
//
// Either way, headings without tags are told by size and bold (guess.js, as for TextEdit's
// documents), list items without tags by the marker typed at their start ('•', '1.'), nested by
// how far in it is; monospace text is code, bold and italic come from the fonts' names, links
// from the link annotations, and a word hyphenated at a line's end is joined again.
//
// What has no Markdown form is left out and named in `lost`: fonts, font sizes, images, headers
// and footers. Text in several columns may come out in the wrong order, and an untagged table as
// lines. A PDF with no text (scanned pages) is not read: `notDocument`.

// npm packages
// (the legacy build: the other needs JavaScript newer than Linux's WebKitGTK has)
import { getDocument, GlobalWorkerOptions, OPS, PasswordException } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
// local functions
import { guessHeadings, mostCommon, fontFamily, typedMarker } from './guess.js'

// the character maps of Japanese, Chinese and Korean PDFs whose fonts are not in them, each
// loaded when a PDF needs it
const cMaps = import.meta.glob('/node_modules/pdfjs-dist/cmaps/*.bcmap', { query: '?url', import: 'default' })

const monospace = /courier|mono|menlo|monaco|consolas|inconsolata|code|fixed|typewriter|lucida console|andale|sf mono|hack/i
const cjk = /[⺀-鿿豈-﫿＀-￯]/
const sentenceEnd = /[.!?:;。！？：；]["'”’)]?$/

// tags whose text is one block; tags that hold blocks
const textTags = /^(?:P|H[1-6]?|Title|Caption|Code|Lbl|TH|TD)$/
const blockTags = /^(?:P|H[1-6]?|Title|L|LI|LBody|Table|THead|TBody|TFoot|TR|Figure|Formula|Div|Sect|Part|Art|Document|BlockQuote|TOC|TOCI|Index|Caption|Code|Note)$/

class BundledData {
  async fetch ({ kind, filename }) {
    const load = kind == 'cMapUrl' && cMaps[`/node_modules/pdfjs-dist/cmaps/${filename}`]
    if (!load) throw new Error(`No ${filename}`)
    const response = await fetch(await load())
    return new Uint8Array(await response.arrayBuffer())
  }
}

// pdf.js reads a page's text with `for await` over a stream, which WebKit's streams (the macOS
// app's, Linux's) cannot do yet: they are given the way to
if (typeof ReadableStream != 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function * () {
    const reader = this.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
}

let isWorkerSet = false

async function setWorker () {
  if (isWorkerSet) return
  isWorkerSet = true
  // a worker of its own in the app; in the tests (no Worker) pdf.js runs on the main thread, its
  // worker's module named in a variable so the app's build leaves it out
  if (typeof Worker != 'undefined') GlobalWorkerOptions.workerPort = new Worker(workerUrl, { type: 'module' })
  else {
    const worker = 'pdfjs-dist/legacy/build/pdf.worker.mjs'
    globalThis.pdfjsWorker = await import(/* @vite-ignore */ worker)
  }
}

export default async function readPdf (bytes) {
  await setWorker()
  let task
  let pdf
  try {
    task = getDocument({
      data: bytes.slice(),
      BinaryDataFactory: BundledData,
      cMapUrl: '/',
      cMapPacked: true,
      useWorkerFetch: false,
      fontExtraProperties: true,
      disableFontFace: true,
      isEvalSupported: false,
      verbosity: 0
    })
    pdf = await task.promise
  } catch (error) {
    task?.destroy()
    if (error instanceof PasswordException) throw { kind: 'notDocument', message: 'It is protected with a password.' }
    throw { kind: 'notDocument', message: 'It is not a PDF document.' }
  }
  try {
    const markdown = await ownMarkdown(pdf)
    if (markdown != null) return { markdown, lost: new Set() }
    return await readPages(pdf)
  } finally {
    task.destroy()
  }
}

// the Markdown a PDF made here carries
async function ownMarkdown (pdf) {
  const { info } = await pdf.getMetadata()
  if (info?.Creator != 'Textflow') return null
  const attachments = await pdf.getAttachments()
  const id = [...(attachments ?? new Map())].find(([, entry]) => /\.md$/i.test(entry.filename))?.[0]
  if (id == null) return null
  const content = await pdf.getAttachmentContent(id)
  return content ? new TextDecoder().decode(content) : null
}

async function readPages (pdf) {
  const lost = new Set()
  const pages = []
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number)
    const [content, operators, annotations, tree] = await Promise.all([
      page.getTextContent({ includeMarkedContent: true }),
      // also loads the fonts, for their names
      page.getOperatorList(),
      page.getAnnotations(),
      page.getStructTree().catch(() => null)
    ])
    if (operators.fnArray.some(op => op == OPS.paintImageXObject || op == OPS.paintInlineImageXObject)) lost.add('images')
    const fonts = new Map()
    const fontOf = name => {
      if (!fonts.has(name)) fonts.set(name, page.commonObjs.has(name) ? page.commonObjs.get(name) : null)
      return fonts.get(name)
    }
    // the link as written (pdf.js gives `url` only for safe ones, but tidied: a slash added)
    const links = annotations.filter(a => a.subtype == 'Link' && a.url).map(a => ({ rect: a.rect, url: a.unsafeUrl ?? a.url }))
    const [, , width, height] = page.view
    pages.push({ number, width, height, pieces: piecesOf(content.items, fontOf, links), tree })
    page.cleanup()
  }

  if (!pages.some(page => page.pieces.some(piece => piece.text.trim()))) {
    throw { kind: 'notDocument', message: 'It has no text to read: its pages may be scans or pictures.' }
  }
  const isTagged = pages.some(page => page.tree && contentIds(page.tree).length)
  const blocks = isTagged ? taggedBlocks(pages, lost) : untaggedBlocks(pages, lost)

  const runsOf = block => block.kind == 'table' ? block.rows.flat(2) : block.runs ?? []
  const textRuns = blocks.flatMap(runsOf).filter(run => !run.isBreak && !run.isMono && run.text.trim())
  const bodySize = mostCommon(textRuns, run => run.size, run => run.text.length) ?? 10
  const bodyFont = mostCommon(textRuns, run => fontFamily(run.font), run => run.text.length)
  classify(blocks, bodySize, !blocks.some(block => block.kind == 'heading'))

  for (const block of blocks) {
    if (block.kind != 'paragraph' && block.kind != 'item') continue
    for (const run of block.runs) {
      if (run.isBreak || run.isMono || !run.text.trim()) continue
      if (run.size != bodySize) lost.add('font sizes')
      // Japanese and Chinese are in fonts of their own
      if (bodyFont != null && fontFamily(run.font) != bodyFont && !cjk.test(run.text)) lost.add('fonts')
    }
  }
  return { body: htmlOf(blocks), lost }
}

// The blocks, from either kind of PDF:
//   { kind: 'heading', level, runs }
//   { kind: 'paragraph', runs, x, lineCount }      (may turn into a heading or an item)
//   { kind: 'item', depth, isOrdered, number, runs }
//   { kind: 'code', text }
//   { kind: 'table', rows: [[runs]] }
// run: { text, size, font, isBold, isItalic, isMono, link } or { isBreak: true, text: '' }

// the text pdf.js gives, as pieces: { text, x, y (the baseline, from the page's foot), width,
// size, font, isBold, isItalic, isMono, link, id (the tagged content it is in, or null) }
function piecesOf (items, fontOf, links) {
  const pieces = []
  const ids = []
  for (const item of items) {
    if (item.type == 'beginMarkedContentProps' || item.type == 'beginMarkedContent') {
      ids.push(item.id ?? null)
      continue
    }
    if (item.type == 'endMarkedContent') {
      ids.pop()
      continue
    }
    if (!item.str) continue
    // some fonts (Hiragino's, PingFang's in Chrome's PDFs) name ideographs by the radicals that
    // look the same: 長 written as ⾧
    const str = item.str.replace(/[\u2e80-\u2fdf]/g, character => character.normalize('NFKC'))
    const [a, b, c, d, x, y] = item.transform
    const size = round(Math.hypot(c, d))
    // turned text (a watermark, a label up the margin) is left out
    if (!size || Math.abs(b) > Math.abs(a) * 0.05) continue
    const font = fontOf(item.fontName)
    const name = (font?.name ?? '').replace(/^[A-Z]{6}\+/, '')
    const style = {
      y,
      size,
      font: name,
      isBold: !!(font?.bold || font?.black) || /bold|black|heavy|semibold|demi/i.test(name),
      isItalic: !!font?.italic || /italic|oblique/i.test(name),
      isMono: monospace.test(name) && !cjk.test(str),
      id: ids.findLast(id => id != null) ?? null
    }
    // a link may be part of a piece: its characters are the ones over the link's area, each
    // taken as wide as the piece's average
    const characters = [...str]
    const step = item.width / characters.length
    const middle = y + size / 3
    characters.forEach((character, index) => {
      const at = x + step * (index + 0.5)
      const link = links.find(({ rect: [x1, y1, x2, y2] }) => at >= x1 && at <= x2 && middle >= y1 && middle <= y2)?.url ?? null
      const last = pieces.at(-1)
      if (index > 0 && last.link == link) {
        last.text += character
        last.width += step
      } else {
        pieces.push({ ...style, text: character, x: x + step * index, width: step, link })
      }
    })
  }
  return pieces
}

// pieces as lines, top to bottom: { x, right, y, size, runs, text }. Pieces on one baseline
// (within half a line) are a line, with a space where there is a gap between them, a tab where
// it is wide (after a list's marker, between a table's columns).
function linesOf (pieces) {
  const lines = []
  for (const piece of pieces) {
    const line = lines.at(-1)
    if (line && Math.abs(line.y - piece.y) <= Math.max(line.size, piece.size) * 0.5) {
      line.pieces.push(piece)
      line.size = Math.max(line.size, piece.size)
    } else {
      lines.push({ y: piece.y, size: piece.size, pieces: [piece] })
    }
  }
  return lines.map(line => {
    const sorted = line.pieces.sort((p, q) => p.x - q.x)
    const runs = []
    // the last piece with text: pdf.js fills gaps with spaces as wide as they are
    let previous = null
    sorted.forEach(piece => {
      let text = piece.text
      if (previous && text.trim()) {
        const gap = piece.x - (previous.x + previous.width)
        const isCjk = cjk.test(previous.text.trimEnd().at(-1)) && cjk.test(text[0])
        const run = runs.at(-1)
        if (!isCjk && gap > piece.size * 0.8) {
          run.text = run.text.trimEnd()
          text = '\t' + text.trimStart()
        } else if (!isCjk && gap > piece.size * 0.15 && !/\s$/.test(run.text) && !/^\s/.test(text)) text = ' ' + text
      }
      addRun(runs, { text, size: piece.size, font: piece.font, isBold: piece.isBold, isItalic: piece.isItalic, isMono: piece.isMono, link: piece.link })
      if (text.trim()) previous = piece
    })
    const last = sorted.at(-1)
    return { x: sorted[0].x, right: last.x + last.width, y: line.y, size: line.size, runs, text: runs.map(run => run.text).join('') }
  }).filter(line => line.text.trim())
}

function addRun (runs, run) {
  const previous = runs.at(-1)
  if (previous && !previous.isBreak && !run.isBreak && previous.size == run.size && previous.isBold == run.isBold &&
    previous.isItalic == run.isItalic && previous.isMono == run.isMono && previous.link == run.link &&
    fontFamily(previous.font) == fontFamily(run.font)) previous.text += run.text
  else runs.push({ ...run })
}

// ---- tagged PDFs

function contentIds (node, ids = []) {
  if (node.type == 'content') ids.push(node.id)
  for (const child of node.children ?? []) contentIds(child, ids)
  return ids
}

function taggedBlocks (pages, lost) {
  const blocks = []
  for (const page of pages) {
    if (!page.tree) continue
    const byId = new Map()
    for (const piece of page.pieces) {
      if (piece.id != null) (byId.get(piece.id) ?? byId.set(piece.id, []).get(piece.id)).push(piece)
    }
    const referenced = new Set(contentIds(page.tree))
    // text outside the tags is the pages' furniture
    if (page.pieces.some(piece => piece.text.trim() && !referenced.has(piece.id))) lost.add('headers and footers')

    const piecesUnder = node => contentIds(node).flatMap(id => byId.get(id) ?? [])
    // a node's text as one paragraph's runs, and its lines (for code)
    const textOf = node => {
      const lines = linesOf(piecesUnder(node))
      const p = { runs: [] }
      lines.forEach((line, index) => index == 0 ? line.runs.forEach(run => addRun(p.runs, run)) : join(p, line, false))
      return { runs: p.runs, lines }
    }
    const first = blocks.length

    function walk (node, depth) {
      const role = node.role
      if (node.type) return
      const heading = /^H([1-6]?)$/.exec(role)
      if (heading || role == 'Title') {
        const { runs } = textOf(node)
        if (hasText(runs)) blocks.push({ kind: 'heading', level: heading?.[1] ? Number(heading[1]) : 1, runs, isTagged: true })
        return
      }
      if (role == 'L') {
        for (const child of node.children ?? []) walk(child, child.role == 'L' ? depth + 1 : depth)
        return
      }
      if (role == 'LI') {
        const children = node.children ?? []
        const label = children.filter(child => child.role == 'Lbl').map(child => textOf(child).runs.map(run => run.text).join('')).join('').trim()
        // the item's own text, then lists nested in it
        const nested = []
        const own = []
        const collect = list => list.forEach(child => {
          if (child.role == 'Lbl') return
          if (child.role == 'L') nested.push(child)
          else if (child.role == 'LBody') collect(child.children ?? [])
          else own.push(child)
        })
        collect(children)
        const runs = []
        own.forEach(child => {
          const text = textOf(child).runs
          if (!hasText(text)) return
          if (hasText(runs)) addRun(runs, { isBreak: true, text: '' })
          text.forEach(run => addRun(runs, run))
        })
        // a label of digits, or letters and Roman numerals, numbers the list
        const number = /^\(?(\d+)[.)]?$/.exec(label)
        const isOrdered = !!number || /^\(?(?:[a-z]|[ivxlc]+)[.)]$/i.test(label)
        blocks.push({ kind: 'item', depth, isOrdered, number: number ? Number(number[1]) : 1, runs: trimStart(runs) })
        nested.forEach(list => walk(list, depth + 1))
        return
      }
      if (role == 'Table') {
        const rows = []
        const findRows = n => (n.children ?? []).forEach(child => {
          if (child.role == 'TR') rows.push((child.children ?? []).filter(cell => cell.role == 'TH' || cell.role == 'TD').map(cell => textOf(cell).runs.map(run => run.isBreak ? { ...run, isBreak: false, text: ' ' } : run)))
          else if (!child.type) findRows(child)
        })
        findRows(node)
        if (rows.length) blocks.push({ kind: 'table', rows })
        return
      }
      if (role == 'Figure') return
      const children = node.children ?? []
      if (!textTags.test(role) && children.some(child => blockTags.test(child.role))) {
        // a container: its blocks, and the text between them as paragraphs
        let loose = []
        const flush = () => {
          if (loose.length) paragraph({ children: loose })
          loose = []
        }
        for (const child of children) {
          if (blockTags.test(child.role)) {
            flush()
            walk(child, depth)
          } else loose.push(child)
        }
        flush()
        return
      }
      paragraph(node, role == 'Code')
    }

    function paragraph (node, isCode) {
      const { runs, lines } = textOf(node)
      if (!hasText(runs)) return
      if (isCode || runs.every(run => run.isMono || !run.text.trim())) blocks.push({ kind: 'code', text: codeText(lines) })
      else blocks.push({ kind: 'paragraph', runs, x: lines[0].x, lineCount: lines.length })
    }

    walk(page.tree, 0)

    // a paragraph going on from the page before
    const before = blocks[first - 1]
    const after = blocks[first]
    if (first > 0 && before?.kind == 'paragraph' && after?.kind == 'paragraph' && !sentenceEnd.test(textOfRuns(before.runs).trim()) && /^\p{Ll}/u.test(textOfRuns(after.runs))) {
      const p = { runs: before.runs }
      join(p, { runs: after.runs }, false)
      before.lineCount += after.lineCount
      blocks.splice(first, 1)
    }
  }
  return blocks
}

// ---- untagged PDFs

function untaggedBlocks (pages, lost) {
  for (const page of pages) page.lines = linesOf(page.pieces)
  if (dropRepeated(pages)) lost.add('headers and footers')
  markTables(pages)
  const lines = pages.flatMap(page => page.lines)
  const bodySize = mostCommon(lines, line => line.size, line => line.text.length)
  return paragraphsOf(pages, bodySize).map(p => p.rows
    ? { kind: 'table', rows: p.rows }
    : p.isCode
      ? { kind: 'code', text: codeText(p.lines) }
      : { kind: 'paragraph', runs: p.runs, x: p.x, lineCount: p.lineCount })
}

// a table: two or more lines in a row, one under the other, each with as many cells (their text
// apart by wide gaps, which linesOf made tabs), at least two; each such line gets `table`, the
// table's number
function markTables (pages) {
  let table = 0
  for (const page of pages) {
    let group = []
    const close = () => {
      if (group.length >= 2) {
        table++
        group.forEach(line => { line.table = table })
      }
      group = []
    }
    for (const line of page.lines) {
      const count = cellsOf(line.runs).length
      const isRow = count >= 2 && !markerOf(line.text) && !line.runs.every(run => run.isMono || !run.text.trim())
      const last = group.at(-1)
      if (isRow && last && cellsOf(last.runs).length == count && last.y - line.y > 0 && last.y - line.y <= line.size * 2.5) group.push(line)
      else {
        close()
        if (isRow) group.push(line)
      }
    }
    close()
  }
}

// a line's runs split at its tabs
function cellsOf (runs) {
  const cells = [[]]
  for (const run of runs) {
    run.text.split('\t').forEach((part, index) => {
      if (index > 0) cells.push([])
      if (part) cells.at(-1).push({ ...run, text: part })
    })
  }
  return cells.map(cell => trimStart(cell)).filter(cell => hasText(cell))
}

// headers, footers and page numbers: lines at a page's top or bottom whose text (numbers aside)
// is on most pages, and lone page numbers there. Returns whether any were left out.
function dropRepeated (pages) {
  const key = line => line.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase()
  const isEdge = (line, page) => line.y > page.height * 0.9 || line.y < page.height * 0.1
  const counts = new Map()
  for (const page of pages) {
    for (const k of new Set(page.lines.filter(line => isEdge(line, page)).map(key))) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const isRepeated = k => pages.length >= 3 && counts.get(k) >= Math.max(2, pages.length * 0.5)
  const isPageNumber = k => /^(?:page |seite |p\. ?|- ?)?#(?: ?(?:of|von|\/) ?#)?(?: ?-)?$/.test(k)
  let isDropped = false
  for (const page of pages) {
    page.lines = page.lines.filter(line => {
      if (!isEdge(line, page)) return true
      const k = key(line)
      if (!isRepeated(k) && !isPageNumber(k)) return true
      isDropped = true
      return false
    })
  }
  return isDropped
}

// lines → paragraphs: { runs, lineCount, isCode, lines, x }
function paragraphsOf (pages, bodySize) {
  const paragraphs = []
  // the usual distance between baselines, per size
  const spacing = new Map()
  for (const page of pages) {
    page.lines.forEach((line, index) => {
      const next = page.lines[index + 1]
      if (!next || next.size != line.size) return
      const distance = line.y - next.y
      if (distance > 0 && distance < line.size * 3) (spacing.get(line.size) ?? spacing.set(line.size, []).get(line.size)).push(distance)
    })
  }
  const usual = size => median(spacing.get(size)) ?? size * 1.2

  for (const page of pages) {
    // the text's right edge, to tell a paragraph's short last line
    const right = Math.max(...page.lines.filter(line => line.size == bodySize).map(line => line.right), 0)
    page.lines.forEach((line, index) => {
      const p = paragraphs.at(-1)
      if (line.table) {
        if (p?.table == line.table) p.rows.push(cellsOf(line.runs))
        else paragraphs.push({ table: line.table, rows: [cellsOf(line.runs)], lines: [line] })
        return
      }
      const isCode = line.runs.every(run => run.isMono || !run.text.trim())
      const how = p && continues(p, line, { page, index, right, isCode, usual })
      if (how) {
        if (!isCode) join(p, line, how == 'break')
        p.lines.push(line)
        p.lastPage = page.number
        p.lineCount++
        return
      }
      paragraphs.push({ runs: line.runs.map(run => ({ ...run })), lines: [line], isCode, x: line.x, lastPage: page.number, lineCount: 1, marker: markerOf(line.text) })
    })
  }
  return paragraphs
}

// whether a line goes on its paragraph: 'join' (the paragraph's text runs on), 'break' (a line of
// its own in it: the line before ends short), or false (a new paragraph)
function continues (p, line, { page, index, right, isCode, usual }) {
  if (p.rows) return false
  const last = p.lines.at(-1)
  if (p.isCode != isCode || Math.abs(last.size - line.size) > 0.5) return false
  if (markerOf(line.text)) return false
  if (p.lastPage != page.number) {
    // on from the foot of the page before: when its last line runs to the edge
    return index == 0 && !isCode && last.right >= right - last.size * 4 && !sentenceEnd.test(last.text.trim()) && 'join'
  }
  const distance = last.y - line.y
  if (distance <= 0 || distance > usual(line.size) * 1.3) return false
  if (isCode) return 'join'
  const isShort = last.right < right - last.size * 4
  // in line with the paragraph, or a list item's further lines in line with its text
  const indent = p.marker ? textStart(p) : p.x
  if (Math.abs(line.x - indent) < line.size * 1.5) return isShort ? 'break' : 'join'
  // a paragraph's first line may be indented (where paragraphs have no space between them)
  return !p.marker && p.lineCount == 1 && line.x < p.x && !isShort && 'join'
}

// where a list item's text starts, after its marker
function textStart (p) {
  const first = p.lines[0]
  const ratio = (first.right - first.x) / Math.max(first.text.length, 1)
  return first.x + ratio * p.marker.length
}

// ---- both

// a line onto its paragraph, after a break or running on: a word hyphenated at the end joined
// again, Japanese and Chinese without a space
function join (p, line, isBreak) {
  const run = p.runs.findLast(r => !r.isBreak)
  const next = line.runs.map(r => ({ ...r }))
  if (!run || !next.length) return next.forEach(r => addRun(p.runs, r))
  const end = run.text.trimEnd()
  if (isBreak) {
    run.text = end
    p.runs.push({ isBreak: true, text: '' })
  } else if (/\p{L}-$/u.test(end) && /^\p{Ll}/u.test(next[0].text)) run.text = end.slice(0, -1)
  else if (cjk.test(end.at(-1)) && cjk.test(next[0].text.trimStart()[0])) run.text = end
  else if (!/\s$/.test(run.text) && !/^\s/.test(next[0].text)) run.text += ' '
  next.forEach(r => addRun(p.runs, r))
}

// paragraphs into headings (by size and bold, where the PDF has no heading tags) and list items
// (by their typed markers, nested by how far in they are)
function classify (blocks, bodySize, isGuessingHeadings) {
  const paragraphs = blocks.filter(block => block.kind == 'paragraph')
  const levels = isGuessingHeadings ? guessHeadings(paragraphs.map(p => {
    const runs = p.runs.filter(run => !run.isBreak && run.text.trim())
    const sizes = new Set(runs.map(run => run.size))
    return {
      text: textOfRuns(runs),
      size: sizes.size == 1 ? [...sizes][0] : null,
      isAllBold: runs.length > 0 && runs.every(run => run.isBold),
      isCandidate: p.lineCount <= 2 && !markerOf(textOfRuns(p.runs)) && !p.runs.some(run => run.isBreak || run.link)
    }
  }), bodySize) : []
  const levelOf = new Map(paragraphs.map((p, index) => [p, levels[index] ?? null]))

  // the markers' distances in, outermost first
  let indents = []
  blocks.forEach((block, index) => {
    if (block.kind != 'paragraph') {
      indents = []
      return
    }
    const marker = markerOf(textOfRuns(block.runs))
    if (marker) {
      const near = x => Math.abs(x - block.x) < bodySize
      while (indents.length && !near(indents.at(-1)) && indents.at(-1) > block.x) indents.pop()
      if (!indents.length || !near(indents.at(-1))) indents.push(block.x)
      let runs = withoutMarker(block.runs, marker.length)
      // a task keeps its box, as plain text: to-markdown.js makes it '[ ]' or '[x]'
      if (marker.box) runs = [{ ...runs[0], text: `${marker.box} `, isMono: false, isBold: false, isItalic: false, link: null }, ...runs]
      blocks[index] = { kind: 'item', depth: indents.length - 1, isOrdered: marker.isOrdered, number: marker.number, runs }
      return
    }
    indents = []
    const level = levelOf.get(block)
    if (level) blocks[index] = { kind: 'heading', level, runs: block.runs }
  })
}

// code's lines, their indents from how far in they start
function codeText (lines) {
  const left = Math.min(...lines.map(line => line.x))
  return lines.map(line => {
    const width = (line.right - line.x) / Math.max(line.text.length, 1)
    return ' '.repeat(Math.max(0, Math.round((line.x - left) / width))) + line.text
  }).join('\n')
}

function htmlOf (blocks) {
  const document = globalThis.document.implementation.createHTMLDocument('')
  const body = document.body
  const element = tag => document.createElement(tag)

  function inline (parent, runs, isHeading) {
    for (const run of runs) {
      if (run.isBreak) {
        parent.append(element('br'))
        continue
      }
      if (!run.text.trim()) {
        parent.append(document.createTextNode(run.text.replace(/\t/g, ' ')))
        continue
      }
      let node = document.createTextNode(run.text.replace(/\t/g, ' '))
      const wrap = tag => {
        const wrapper = element(tag)
        wrapper.append(node)
        node = wrapper
      }
      if (run.isMono) wrap('code')
      if (run.isItalic) wrap('em')
      if (run.isBold && !isHeading) wrap('strong')
      if (run.link) {
        const link = element('a')
        link.setAttribute('href', run.link)
        link.append(node)
        node = link
      }
      parent.append(node)
    }
  }

  // open lists, outermost first: { isOrdered, node }
  let lists = []
  let code = null
  for (const block of blocks) {
    if (block.kind == 'item') {
      code = null
      const depth = Math.min(block.depth, lists.length)
      lists = lists.slice(0, depth + 1)
      if (lists[depth] && lists[depth].isOrdered != block.isOrdered) lists = lists.slice(0, depth)
      if (!lists[depth]) {
        const list = element(block.isOrdered ? 'ol' : 'ul')
        if (block.isOrdered && block.number != 1) list.setAttribute('start', block.number)
        ;(lists.at(-1)?.node.lastElementChild ?? body).append(list)
        lists.push({ isOrdered: block.isOrdered, node: list })
      }
      const li = element('li')
      inline(li, block.runs)
      lists[depth].node.append(li)
      continue
    }
    lists = []
    if (block.kind == 'code') {
      if (code) code.textContent += '\n\n' + block.text
      else {
        const pre = element('pre')
        code = element('code')
        code.textContent = block.text
        pre.append(code)
        body.append(pre)
      }
      continue
    }
    code = null
    if (block.kind == 'heading') {
      const heading = element(`h${block.level}`)
      inline(heading, block.runs, true)
      body.append(heading)
    } else if (block.kind == 'table') {
      const table = element('table')
      for (const cells of block.rows) {
        const row = element('tr')
        for (const runs of cells) {
          const cell = element('td')
          inline(cell, runs)
          row.append(cell)
        }
        table.append(row)
      }
      body.append(table)
    } else {
      const paragraph = element('p')
      inline(paragraph, block.runs)
      body.append(paragraph)
    }
  }
  return body
}

// a list item's marker typed at its start (guess.js), or a task's box: '☐ ', '☑ '
function markerOf (text) {
  const box = /^[\t ]*([\u2610\u2611\u2612])[\t \u00a0]+/.exec(text)
  if (box) return { isOrdered: false, number: 1, length: box[0].length, box: box[1] == '\u2610' ? '\u2610' : '\u2611' }
  return typedMarker(text)
}

function withoutMarker (runs, length) {
  const result = runs.map(run => ({ ...run }))
  let left = length
  while (left > 0 && result.length) {
    const run = result[0]
    if (run.text.length <= left) {
      left -= run.text.length
      result.shift()
    } else {
      run.text = run.text.slice(left)
      left = 0
    }
  }
  return trimStart(result)
}

function trimStart (runs) {
  while (runs.length && !runs[0].isBreak && !runs[0].text.trim()) runs.shift()
  if (runs[0] && !runs[0].isBreak) runs[0] = { ...runs[0], text: runs[0].text.trimStart() }
  return runs
}

function hasText (runs) {
  return runs.some(run => !run.isBreak && run.text.trim())
}

function textOfRuns (runs) {
  return runs.map(run => run.isBreak ? '\n' : run.text).join('')
}

function median (values) {
  if (!values?.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// sizes to a quarter point, so one size set in two ways is one size
function round (value) {
  return Math.round(value * 4) / 4
}
