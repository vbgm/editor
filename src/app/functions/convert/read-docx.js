// Word (.docx) → simple HTML (for to-markdown.js), with mammoth, which follows Word's styles and
// numbering. Headings are Word's heading styles or "Title" / "Subtitle"; quotes, code and rules
// the styles this app's export writes (Pandoc's names: "Source Code", "Verbatim Char") or Word's
// own ("Quote", "HTML Preformatted"…). Footnotes come at the end, as mammoth writes them.
//
// A document without heading styles (TextEdit's) has its headings told by size and bold, and
// list items typed as text ('•⇥', '3⇥') made lists. Runs in a monospace font are code. List
// start numbers come from Word's numbering (mammoth numbers every list from 1).
//
// mammoth leaves out fonts, sizes, colours and the like silently, so the document is looked
// through for them: what has no Markdown form is named in `lost`.

// npm packages
import mammoth from 'mammoth'
import { unzipSync, strFromU8 } from 'fflate'
// local functions
import { guessHeadings, mostCommon, typedMarker, fontFamily } from './guess.js'

const monospace = /courier|mono|menlo|monaco|consolas|inconsolata|code|fixed|typewriter|lucida console|andale|sf mono|hack/i

const styleMap = [
  'p[style-name=\'Title\'] => h1:fresh',
  'p[style-name=\'Subtitle\'] => h2:fresh',
  'p[style-name=\'Quote\'] => blockquote > p:fresh',
  'p[style-name=\'Intense Quote\'] => blockquote > p:fresh',
  'p[style-name=\'Block Text\'] => blockquote > p:fresh',
  'p[style-name=\'Source Code\'] => pre:separator(\'\\n\')',
  'p[style-name=\'HTML Preformatted\'] => pre:separator(\'\\n\')',
  'p[style-name=\'Plain Text\'] => pre:separator(\'\\n\')',
  'p[style-name=\'Code\'] => pre:separator(\'\\n\')',
  'p[style-name=\'Horizontal Rule\'] => hr:fresh',
  'r[style-name=\'Verbatim Char\'] => code',
  'r[style-name=\'HTML Code\'] => code',
  'r[style-name=\'Code Char\'] => code',
  'r[style-name=\'Source Text\'] => code',
  // set by structure() below
  ...[1, 2, 3, 4, 5, 6].map(level => `p[style-name='Guessed Heading ${level}'] => h${level}:fresh`)
]

export default async function readDocx (bytes) {
  let files
  try {
    files = unzipSync(bytes, { filter: file => /^word\/(?:document|numbering|header\d*|footer\d*|comments)\.xml$/.test(file.name) })
  } catch {
    throw { kind: 'notDocument', message: 'It is not a Word document.' }
  }
  if (!files['word/document.xml']) throw { kind: 'notDocument', message: 'It is not a Word document.' }
  const xml = strFromU8(files['word/document.xml'])
  const lost = new Set()
  lostFormatting(xml, lost)
  for (const name of Object.keys(files)) {
    if (/header|footer/.test(name) && /<w:t[ >][^<]*\S/.test(strFromU8(files[name]))) lost.add('headers and footers')
  }
  if (/<w:commentReference/.test(xml)) lost.add('comments')

  // the browser's mammoth takes arrayBuffer, Node's (the tests) buffer; both take an ArrayBuffer
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  // the start numbers of lists typed as text (null: from Word's numbering), in order
  let starts = []
  const result = await mammoth.convertToHtml({ arrayBuffer: data, buffer: data }, {
    styleMap,
    includeDefaultStyleMap: true,
    ignoreEmptyParagraphs: true,
    transformDocument: document => {
      starts = structure(document, lost)
      return document
    },
    convertImage: mammoth.images.imgElement(() => {
      lost.add('images')
      return { src: '' }
    })
  })

  const document = globalThis.document.implementation.createHTMLDocument('')
  document.body.innerHTML = result.value
  const body = document.body
  // the lists' numbers, those from Word's numbering in order, where they all line up
  const numbered = files['word/numbering.xml'] ? numberStarts(xml, strFromU8(files['word/numbering.xml'])) : []
  if (numbered.length == starts.filter(start => start == null).length) starts = starts.map(start => start ?? numbered.shift())
  const lists = body.querySelectorAll('ol')
  if (lists.length == starts.length) {
    lists.forEach((list, index) => {
      if (starts[index] != null && starts[index] != 1) list.setAttribute('start', starts[index])
    })
  }
  return { body, lost }
}

// mammoth's document before it is HTML: headings guessed, typed list items made lists, monospace
// runs code, the fonts and sizes left out noted. Returns the start number of each numbered list
// as mammoth will make them (null where it comes from Word's numbering).
function structure (document, lost) {
  const paragraphs = []
  const walk = (element, isInTable) => {
    if (element.type == 'paragraph') paragraphs.push({ paragraph: element, isInTable, runs: runsOf(element) })
    else if (element.type == 'table') paragraphs.push({ table: true })
    for (const child of element.children ?? []) walk(child, isInTable || element.type == 'table')
    if (element.type == 'table') paragraphs.push({ table: true })
  }
  walk(document, false)
  const all = paragraphs.filter(entry => entry.paragraph)
  const runs = all.flatMap(entry => entry.runs)
  const textRuns = runs.filter(run => run.text.trim() && !isMono(run.run))
  const bodySize = mostCommon(textRuns.filter(run => run.run.fontSize != null), run => run.run.fontSize, run => run.text.length)
  const bodyFont = mostCommon(textRuns.filter(run => run.run.font != null), run => fontFamily(run.run.font), run => run.text.length)

  // monospace runs as code, whole monospace paragraphs as code blocks
  for (const { run } of runs) {
    if (isMono(run) && !run.styleName) run.styleName = 'Verbatim Char'
  }
  for (const entry of all) {
    const text = entry.runs.filter(run => run.text.trim())
    if (!entry.paragraph.styleName && !entry.paragraph.numbering && text.length && text.every(run => isMono(run.run))) entry.paragraph.styleName = 'Source Code'
  }

  const isHeadingStyle = p => /^(?:heading \d|title|subtitle)$/i.test(p.styleName ?? '') || /^Heading\d$/.test(p.styleId ?? '')
  // list items typed as text, when the document has no lists of its own around them
  for (const entry of all) {
    const p = entry.paragraph
    if (p.numbering || entry.isInTable || isHeadingStyle(p)) continue
    const marker = typedMarker(entry.runs.map(run => run.text).join(''))
    if (!marker) continue
    removeStart(entry.runs, marker.length)
    const indent = Number(p.indent.start ?? 0)
    const level = Math.max(0, Math.round(indent / 720) - 1)
    p.numbering = { level: String(level), isOrdered: marker.isOrdered }
    entry.typed = marker
  }

  if (bodySize != null && !all.some(entry => isHeadingStyle(entry.paragraph))) {
    const levels = guessHeadings(all.map(entry => {
      const text = entry.runs.filter(run => run.text.trim())
      const sizes = new Set(text.map(run => run.run.fontSize))
      return {
        text: text.map(run => run.text).join(''),
        size: sizes.size == 1 ? [...sizes][0] : null,
        isAllBold: text.every(run => run.run.isBold),
        isCandidate: !entry.isInTable && !entry.paragraph.numbering && !entry.paragraph.styleName &&
          !entry.runs.some(run => run.text.includes('\n') || run.link || isMono(run.run))
      }
    }), bodySize)
    all.forEach((entry, index) => {
      if (levels[index]) entry.paragraph.styleName = `Guessed Heading ${levels[index]}`
    })
  }

  // fonts and sizes other than the body's, outside headings and code
  for (const entry of all) {
    const p = entry.paragraph
    if (isHeadingStyle(p) || /^(?:Guessed Heading|Source Code)/.test(p.styleName ?? '')) continue
    for (const { run, text } of entry.runs) {
      if (!text.trim() || isMono(run)) continue
      if (run.fontSize != null && bodySize != null && run.fontSize != bodySize) lost.add('font sizes')
      if (run.font != null && bodyFont != null && fontFamily(run.font) != bodyFont) lost.add('fonts')
    }
  }

  // the numbered lists as mammoth makes them: a list item at a deeper level opens a list, one of
  // another kind at the same level ends one; a paragraph with text ends them all (empty ones are
  // left out)
  const starts = []
  let open = []
  for (const entry of paragraphs) {
    if (entry.table) {
      open = []
      continue
    }
    const numbering = entry.paragraph.numbering
    if (!numbering) {
      if (entry.runs.some(run => run.text.trim())) open = []
      continue
    }
    const level = Number(numbering.level)
    while (open.length && open.at(-1).level > level) open.pop()
    if (open.length && open.at(-1).level == level && open.at(-1).isOrdered != numbering.isOrdered) open.pop()
    if (!open.length || open.at(-1).level < level) {
      open.push({ level, isOrdered: numbering.isOrdered })
      if (numbering.isOrdered) starts.push(entry.typed ? entry.typed.number : null)
    }
  }
  return starts
}

// a paragraph's runs, also those in links, with their text ('\t' for tabs, '\n' for breaks)
function runsOf (element, link = null) {
  const runs = []
  for (const child of element.children ?? []) {
    if (child.type == 'run') {
      const text = child.children.map(part => part.type == 'text' ? part.value : part.type == 'tab' ? '\t' : part.type == 'break' ? '\n' : '').join('')
      runs.push({ run: child, text, link })
    } else if (child.type == 'hyperlink') runs.push(...runsOf(child, child.href ?? child.anchor ?? true))
    else if (child.children) runs.push(...runsOf(child, link))
  }
  return runs
}

// the first `length` characters of the runs' text, gone
function removeStart (runs, length) {
  for (const entry of runs) {
    const parts = entry.run.children
    while (length > 0 && parts.length) {
      const part = parts[0]
      if (part.type == 'text') {
        if (part.value.length <= length) {
          length -= part.value.length
          parts.shift()
        } else {
          part.value = part.value.slice(length)
          length = 0
        }
      } else if (part.type == 'tab' || part.type == 'break') {
        length--
        parts.shift()
      } else parts.shift()
    }
    if (!length) return
  }
}

function isMono (run) {
  return !!run.font && monospace.test(run.font)
}

// direct formatting mammoth leaves out (fonts and sizes: structure())
function lostFormatting (xml, lost) {
  // only runs' and paragraphs' own properties: styles are Word's (headings are bigger)
  const runProperties = xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/g) ?? []
  for (const properties of runProperties) {
    if (/<w:rStyle w:val="(?:Hyperlink|VerbatimChar)"/.test(properties)) continue
    if (/<w:color w:val="(?!auto|000000)[0-9A-Fa-f]{6}"/.test(properties) && !/<w:color w:val="(?:[0-2][0-9A-Fa-f]){3}"/.test(properties)) lost.add('colours')
    if (/<w:highlight w:val="(?!none)/.test(properties) || /<w:shd [^>]*w:fill="(?!auto|FFFFFF)[0-9A-Fa-f]{6}"/.test(properties)) lost.add('highlighting')
    if (/<w:u w:val="(?!none)/.test(properties)) lost.add('underlining')
  }
  if (/<w:jc w:val="(?:center|right|end|both|distribute)"/.test(xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, ''))) lost.add('alignment')
  if (/<w:drawing>|<w:pict>|<w:object/.test(xml)) lost.add('images')
}

// mammoth numbers every list from 1: the numbers lists start at, from Word's numbering, by
// following the document's list paragraphs as mammoth makes lists of them (numbering by
// paragraph style is not followed: then the lists do not line up, and keep mammoth's numbers)
function numberStarts (xml, numberingXml) {
  const abstracts = new Map()
  for (const [, id, content] of numberingXml.matchAll(/<w:abstractNum [^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const levels = []
    for (const [, level, levelContent] of content.matchAll(/<w:lvl [^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
      levels[level] = {
        isOrdered: !/<w:numFmt w:val="(?:bullet|none)"/.test(levelContent),
        start: Number(/<w:start w:val="(\d+)"/.exec(levelContent)?.[1] ?? 1)
      }
    }
    abstracts.set(id, levels)
  }
  const nums = new Map()
  for (const [, id, content] of numberingXml.matchAll(/<w:num [^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const levels = (abstracts.get(/<w:abstractNumId w:val="(\d+)"/.exec(content)?.[1]) ?? []).map(level => level && { ...level })
    for (const [, level, override] of content.matchAll(/<w:lvlOverride [^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvlOverride>/g)) {
      const start = /<w:startOverride w:val="(\d+)"/.exec(override)
      if (start && levels[level]) levels[level].start = Number(start[1])
    }
    nums.set(id, levels)
  }

  const starts = []
  let open = []
  for (const [token] of xml.matchAll(/<w:tbl>|<\/w:tbl>|<w:tc>|<\/w:tc>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    if (!token.startsWith('<w:p')) {
      open = []
      continue
    }
    const numId = /<w:numId w:val="(\d+)"/.exec(token)?.[1]
    const level = Number(/<w:ilvl w:val="(\d+)"/.exec(token)?.[1] ?? 0)
    const definition = numId && numId != '0' ? nums.get(numId)?.[level] : null
    if (!definition) {
      // mammoth leaves empty paragraphs out: they do not end a list
      if (/<w:t[ >][^<]*\S/.test(token)) open = []
      continue
    }
    while (open.length && open.at(-1).level > level) open.pop()
    if (open.length && open.at(-1).level == level && open.at(-1).isOrdered != definition.isOrdered) open.pop()
    if (!open.length || open.at(-1).level < level) {
      open.push({ level, isOrdered: definition.isOrdered })
      if (definition.isOrdered) starts.push(definition.start)
    }
  }
  return starts
}
