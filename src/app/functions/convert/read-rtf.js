// RTF → simple HTML (for to-markdown.js), from TextEdit, Word, WordPad, Pages, LibreOffice and
// this app's own export.
//
// Reads the part of RTF that has a Markdown form: paragraphs, line breaks, bold, italic,
// strikethrough, monospace text (code), links (HYPERLINK fields), lists (by the markers written
// out in \listtext or \pntext, so "3." starts a list at 3), tables, a bottom border on an empty
// paragraph (a rule), and headings: by style name ("heading 1", "Title"…) or outline level, and,
// in a document with neither (TextEdit's), by size: a short paragraph in larger text, or all in
// bold, is a heading, the largest size level 1. Text in a code page (\'hh) is decoded with the
// font's or the document's code page.
//
// What has no Markdown form is left out and named in `lost`: fonts, font sizes, colours,
// highlighting, underlining, alignment, images, footnotes, comments, headers and footers.

// local functions
import { guessHeadings, mostCommon, fontFamily } from './guess.js'

const codePages = {
  0: 'windows-1252', 77: 'macintosh', 128: 'shift_jis', 129: 'euc-kr', 134: 'gbk', 136: 'big5',
  161: 'windows-1253', 162: 'windows-1254', 163: 'windows-1258', 177: 'windows-1255',
  178: 'windows-1256', 186: 'windows-1257', 204: 'windows-1251', 222: 'windows-874', 238: 'windows-1250'
}

// left out, their text with them
const skipped = new Set([
  'info', 'pict', 'object', 'nonshppict', 'shppict', 'listtable', 'listoverridetable', 'rsidtbl',
  'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore',
  'mmathPr', 'pgdsctbl', 'revtbl', 'filetbl', 'pn', 'bkmkstart', 'bkmkend', 'xe', 'tc', 'txe',
  'fontemb', 'fontfile', 'userprops', 'docvar', 'template', 'operator', 'title', 'subject',
  'author', 'keywords', 'comment', 'doccomm', 'company', 'category', 'expandedcolortbl',
  'listpicture', 'blipuid', 'passwordhash', 'protusertbl', 'wgrffmtfilter', 'pnseclvl', 'falt',
  'panose', 'tcn', 'fldtype', 'formfield', 'sp', 'sv', 'sn', 'shpinst', 'shptxt', 'do'
])
// left out, but said to be
const asides = {
  footnote: 'footnotes', annotation: 'comments', atnid: 'comments', atnauthor: 'comments',
  header: 'headers and footers', headerl: 'headers and footers', headerr: 'headers and footers', headerf: 'headers and footers',
  footer: 'headers and footers', footerl: 'headers and footers', footerr: 'headers and footers', footerf: 'headers and footers'
}
const symbols = {
  emdash: '—', endash: '–', bullet: '•', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”',
  emspace: ' ', enspace: ' ', qmspace: ' ', zwj: '‍', zwnj: '‌',
  ltrmark: '', rtlmark: ''
}
const monospace = /courier|mono|menlo|monaco|consolas|inconsolata|code|fixed|typewriter|lucida console|andale|sf mono|hack/i
const headingNames = /^(?:heading|überschrift|titre|kop|titolo|título|encabezado|rubrik|заголовок|nagłówek|otsikko|overskrift|nadpis)\s*(\d)$/i

export default function readRtf (bytes) {
  const source = latin1(bytes)
  if (!source.startsWith('{\\rtf')) throw { kind: 'notDocument', message: 'It is not an RTF file.' }
  const lost = new Set()

  const fonts = {}
  const colors = []
  const styles = {}
  let defaultFont = 0
  let documentCodePage = 'windows-1252'

  // what comes out: paragraphs and tables, in order
  const items = []
  let table = null
  let row = []
  let cell = []

  const newParagraph = () => ({ style: 0, ls: 0, ilvl: 0, isInTable: false, outline: null, hasBorder: false, align: null })
  let paragraph = newParagraph()
  let runs = []
  let listText = null

  const plain = () => ({ isBold: false, isItalic: false, isStrike: false, isUnderline: false, font: defaultFont, size: 24, color: 0, isHighlight: false, isHidden: false })
  let state = { destination: 'body', ...plain(), uc: 1, link: null, field: null, entry: null }
  const stack = []
  let isGroupStart = false
  let isIgnorable = false
  let skip = 0
  let pendingBytes = []

  function codePageOf (font) {
    const charset = fonts[font]?.charset
    if (charset == 2) return 'symbol'
    return charset != null && codePages[charset] ? codePages[charset] : documentCodePage
  }

  function flushBytes () {
    if (!pendingBytes.length) return
    const codePage = codePageOf(state.font)
    const data = Uint8Array.from(pendingBytes)
    pendingBytes = []
    let value
    if (codePage == 'symbol') value = [...data].map(b => b == 0xb7 ? '•' : String.fromCharCode(b)).join('')
    else {
      try {
        value = new TextDecoder(codePage).decode(data)
      } catch {
        value = new TextDecoder('windows-1252').decode(data)
      }
    }
    addText(value)
  }

  function addText (value) {
    if (!value) return
    const destination = state.destination
    if (destination == 'body' || destination == 'result') {
      if (state.isHidden) return
      const font = fonts[state.font]
      const run = {
        text: value,
        isBold: state.isBold,
        isItalic: state.isItalic,
        isStrike: state.isStrike,
        isUnderline: state.isUnderline,
        isMono: !!font && (font.isModern || monospace.test(font.name)),
        font: font?.name ?? '',
        size: state.size,
        color: state.color,
        isHighlight: state.isHighlight,
        link: state.link
      }
      const last = runs.at(-1)
      if (last && !last.isBreak && sameRun(last, run)) last.text += value
      else runs.push(run)
    } else if (destination == 'listtext') {
      listText = (listText ?? '') + value
    } else if (destination == 'instruction') {
      state.field.instruction += value
    } else if (destination == 'fonttbl') {
      if (state.entry) state.entry.name += value
    } else if (destination == 'colortbl') {
      for (const char of value) {
        if (char == ';') {
          colors.push(state.entry ?? null)
          state.entry = null
        }
      }
    } else if (destination == 'stylesheet') {
      if (state.entry) state.entry.name += value
    } else if (asides[destination] && value.trim()) {
      lost.add(asides[destination])
    }
  }

  function endParagraph () {
    const ended = { ...paragraph, runs, listText }
    runs = []
    listText = null
    if (paragraph.isInTable) cell.push(ended)
    else {
      table = null
      items.push(ended)
    }
  }

  function endCell () {
    if (runs.length || listText) endParagraph()
    row.push(cell)
    cell = []
  }

  function endRow () {
    if (runs.length) endCell()
    if (row.length) {
      if (!table) {
        table = { isTable: true, rows: [] }
        items.push(table)
      }
      table.rows.push(row)
    }
    row = []
  }

  function controlWord (word, parameter) {
    const value = parameter ?? 1
    const destination = state.destination

    // a group's first word may make it a destination
    if (isGroupStart) {
      isGroupStart = false
      const ignorable = isIgnorable
      isIgnorable = false
      if (word == 'fonttbl' || word == 'colortbl' || word == 'stylesheet') return void (state.destination = word)
      if (word == 'listtext' || word == 'pntext') return void (state.destination = 'listtext')
      if (word == 'fldinst') return void (state.destination = 'instruction')
      if (word == 'fldrslt') {
        state.destination = 'result'
        state.link = hyperlink(state.field?.instruction ?? '') ?? state.link
        return
      }
      if (word == 'field') {
        state.field = { instruction: '' }
        return
      }
      if (asides[word]) return void (state.destination = word)
      if (word == 'pict' || word == 'object' || word == 'shppict' || word == 'shp') lost.add('images')
      if (skipped.has(word) || word == 'shp' || (ignorable && !['cs', 'ds', 'ts', 'listtext', 'pntext'].includes(word))) return void (state.destination = 'skip')
      if (destination == 'stylesheet' && (word == 'cs' || word == 'ds' || word == 'ts')) {
        state.entry = { name: '', isParagraph: false }
        return
      }
    }

    if (destination == 'skip') return
    if (destination == 'fonttbl') {
      if (word == 'f') state.entry = fonts[value] = { name: '', charset: null, isModern: false }
      else if (word == 'fmodern' && state.entry) state.entry.isModern = true
      else if (word == 'fcharset' && state.entry) state.entry.charset = value
      return
    }
    if (destination == 'colortbl') {
      state.entry ??= { red: 0, green: 0, blue: 0 }
      if (word == 'red' || word == 'green' || word == 'blue') state.entry[word] = value
      return
    }
    if (destination == 'stylesheet') {
      if (word == 's' && state.entry?.isParagraph) state.entry.index = value
      return
    }

    switch (word) {
      // the document
      case 'ansicpg':
        documentCodePage = codePages[{ 1252: 0, 10000: 77, 932: 128, 949: 129, 936: 134, 950: 136, 1253: 161, 1254: 162, 1258: 163, 1255: 177, 1256: 178, 1257: 186, 1251: 204, 874: 222, 1250: 238 }[value]] ?? 'windows-1252'
        return
      case 'mac':
        documentCodePage = 'macintosh'
        return
      case 'deff':
        defaultFont = value
        state.font = value
        return
      case 'uc':
        state.uc = value
        return
      case 'u':
        flushBytes()
        addText(String.fromCharCode(value < 0 ? value + 0x10000 : value))
        skip = state.uc
        return
      // paragraphs
      case 'par':
      case 'sect':
        flushBytes()
        if (destination == 'body' || destination == 'result') endParagraph()
        return
      case 'line':
        flushBytes()
        if (destination == 'body' || destination == 'result') runs.push({ isBreak: true })
        return
      case 'tab':
        addText('\t')
        return
      case 'cell':
      case 'nestcell':
        flushBytes()
        endCell()
        return
      case 'row':
      case 'nestrow':
        flushBytes()
        endRow()
        return
      case 'pard':
        paragraph = newParagraph()
        return
      case 's':
        paragraph.style = value
        return
      case 'ls':
        paragraph.ls = value
        return
      case 'ilvl':
        paragraph.ilvl = value
        return
      case 'intbl':
        paragraph.isInTable = true
        return
      case 'outlinelevel':
        paragraph.outline = value
        return
      case 'brdrb':
        paragraph.hasBorder = true
        return
      case 'qc':
      case 'qr':
      case 'qj':
        paragraph.align = word
        return
      case 'ql':
        paragraph.align = null
        return
      // text
      case 'plain':
        Object.assign(state, plain())
        return
      case 'b':
        state.isBold = value != 0
        return
      case 'i':
        state.isItalic = value != 0
        return
      case 'strike':
      case 'striked':
        state.isStrike = value != 0
        return
      case 'ulnone':
        state.isUnderline = false
        return
      case 'f':
        state.font = value
        return
      case 'fs':
        state.size = value
        return
      case 'cf':
        state.color = value
        return
      case 'highlight':
      case 'cb':
      case 'chcbpat':
        state.isHighlight = value != 0
        return
      case 'v':
        state.isHidden = value != 0
        return
    }
    if (/^ul(?:d|dash|dashd|dashdd|db|hwave|ldash|th|thd|thdash|thdashd|thdashdd|thldash|ululdbwave|w|wave)?$/.test(word)) {
      state.isUnderline = value != 0
      return
    }
    if (symbols[word] != null) addText(symbols[word])
  }

  // the tokens
  const length = source.length
  let at = 0
  while (at < length) {
    const char = source[at]
    if (char == '{') {
      flushBytes()
      skip = 0
      stack.push(state)
      state = { ...state }
      if (state.destination == 'stylesheet') state.entry = { name: '', isParagraph: true, index: 0 }
      isGroupStart = true
      at++
      continue
    }
    if (char == '}') {
      flushBytes()
      skip = 0
      if (state.destination == 'stylesheet' && state.entry && stack.at(-1)?.destination == 'stylesheet' && state.entry.isParagraph) {
        styles[state.entry.index] = state.entry.name.replace(/;\s*$/, '').trim()
      }
      state = stack.pop() ?? state
      isGroupStart = false
      at++
      continue
    }
    if (char == '\\') {
      const next = source[at + 1]
      if (/[a-zA-Z]/.test(next ?? '')) {
        let end = at + 1
        while (end < length && /[a-zA-Z]/.test(source[end])) end++
        const word = source.slice(at + 1, end)
        let parameter = null
        const number = /^-?\d+/.exec(source.slice(end, end + 12))
        if (number) {
          parameter = Number(number[0])
          end += number[0].length
        }
        if (source[end] == ' ') end++
        at = end
        if (word != 'u') flushBytes()
        if (word != 'u') skip = 0
        controlWord(word, parameter)
        continue
      }
      at += 2
      if (next == '\'') {
        const byte = parseInt(source.slice(at, at + 2), 16)
        at += 2
        if (skip > 0) {
          skip--
          continue
        }
        if (!Number.isNaN(byte) && (state.destination != 'skip')) pendingBytes.push(byte)
        continue
      }
      flushBytes()
      if (next == '*') {
        isIgnorable = true
        continue
      }
      isGroupStart = false
      if (next == '\\' || next == '{' || next == '}') addText(next)
      else if (next == '~') addText(' ')
      else if (next == '_') addText('‑')
      else if (next == '\n' || next == '\r') controlWord('par', null)
      else if (next == '\t') addText('\t')
      // \- (an optional hyphen), \: and others: nothing
      continue
    }
    if (char == '\r' || char == '\n') {
      at++
      continue
    }
    // plain text up to the next special character
    let end = at
    while (end < length && !'{}\\\r\n'.includes(source[end])) end++
    let value = source.slice(at, end)
    at = end
    isGroupStart = false
    if (skip > 0) {
      const dropped = Math.min(skip, value.length)
      value = value.slice(dropped)
      skip -= dropped
    }
    if (!value) continue
    flushBytes()
    // text in the file's own 8-bit bytes (rare outside \'hh)
    if (/[\x80-\xff]/.test(value) && state.destination != 'skip') {
      pendingBytes.push(...[...value].map(c => c.charCodeAt(0)))
      flushBytes()
    } else addText(value)
  }
  flushBytes()
  if (runs.some(run => run.isBreak || run.text.trim())) endParagraph()

  // a font table without a group per font (TextEdit's) runs the names together: "Helvetica;"
  for (const font of Object.values(fonts)) font.name = font.name.replace(/;[\s\S]*$/, '').trim()
  for (const run of items.flatMap(item => item.isTable ? item.rows.flat(2) : [item]).flatMap(p => p.runs)) {
    if (!run.isBreak) run.font = run.font.replace(/;[\s\S]*$/, '').trim()
  }
  return build(items, { colors, styles, lost })
}

// the paragraphs read, as HTML; what was left out, named in lost
function build (items, { colors, styles, lost }) {
  const document = globalThis.document.implementation.createHTMLDocument('')
  const body = document.body
  const paragraphs = items.flatMap(item => item.isTable ? item.rows.flat(2) : [item])
  const allRuns = paragraphs.flatMap(p => p.runs).filter(run => !run.isBreak && run.text.trim())

  // the body text's size and font: the ones with the most characters
  const textRuns = allRuns.filter(run => !run.isMono)
  const bodySize = mostCommon(textRuns, run => run.size, run => run.text.length) ?? 24
  const bodyFont = mostCommon(textRuns, run => fontFamily(run.font), run => run.text.length)

  const styleName = p => styles[p.style] ?? ''
  const hasHeadingStyles = paragraphs.some(p => headingNames.test(styleName(p)) || /^title$/i.test(styleName(p)) || (p.outline != null && p.outline < 9))
  // TextEdit's headings: by size and bold
  const topLevel = items.filter(item => !item.isTable)
  const guessed = new Map()
  if (!hasHeadingStyles) {
    const levels = guessHeadings(topLevel.map(p => {
      const runs = p.runs.filter(run => !run.isBreak && run.text.trim())
      const sizes = new Set(runs.map(run => run.size))
      return {
        text: runs.map(run => run.text).join(''),
        size: sizes.size == 1 ? [...sizes][0] : null,
        isAllBold: runs.every(run => run.isBold),
        isCandidate: p.listText == null && !p.ls && !p.runs.some(run => run.isBreak) && !runs.some(run => run.isMono || run.link)
      }
    }), bodySize)
    topLevel.forEach((p, index) => guessed.set(p, levels[index]))
  }

  function headingLevel (p) {
    const name = styleName(p)
    const named = headingNames.exec(name)
    if (named) return Math.min(6, Math.max(1, Number(named[1])))
    if (/^title$/i.test(name)) return 1
    if (/^subtitle$/i.test(name)) return 2
    if (p.outline != null && p.outline < 9) return Math.min(6, p.outline + 1)
    return guessed.get(p) ?? null
  }

  const isCode = p => {
    const textRuns = p.runs.filter(run => !run.isBreak && run.text.trim())
    return /^(?:source code|preformatted text|html preformatted|plain text|code)$/i.test(styleName(p)) ||
      (textRuns.length > 0 && textRuns.every(run => run.isMono))
  }

  // what is left out
  for (const p of paragraphs) {
    const isHeading = headingLevel(p) != null
    const isQuote = /quot|zitat|citation|cita/i.test(styleName(p))
    if (p.align && !p.isInTable) lost.add('alignment')
    for (const run of p.runs) {
      if (run.isBreak || !run.text.trim()) continue
      if (run.isHighlight) lost.add('highlighting')
      if (run.isUnderline && !run.link) lost.add('underlining')
      if (isHeading || run.link || isQuote) continue
      const color = colors[run.color]
      if (color && (color.red > 40 || color.green > 40 || color.blue > 40)) lost.add('colours')
      if (!run.isMono && run.size != bodySize && !isCode(p)) lost.add('font sizes')
      if (!run.isMono && bodyFont != null && fontFamily(run.font) != bodyFont) lost.add('fonts')
    }
  }

  const element = (tag, attributes = {}) => {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
    return node
  }

  // runs as inline HTML; a heading's bold is the heading's own
  function inline (parent, runList, { isHeading = false } = {}) {
    for (const run of runList) {
      if (run.isBreak) {
        parent.append(element('br'))
        continue
      }
      // formatting on spaces only is lost on the way to Markdown: spaces stay spaces
      if (!run.text.trim()) {
        parent.append(document.createTextNode(run.text))
        continue
      }
      let node = document.createTextNode(run.text)
      const wrap = tag => {
        const wrapper = element(tag)
        wrapper.append(node)
        node = wrapper
      }
      if (run.isMono) wrap('code')
      if (run.isStrike) wrap('s')
      if (run.isItalic) wrap('em')
      if (run.isBold && !isHeading) wrap('strong')
      if (run.link) {
        const link = element('a', { href: run.link })
        link.append(node)
        node = link
      }
      parent.append(node)
    }
  }

  // open lists, outermost first: { level, isOrdered, node }
  let lists = []
  let quote = null
  let code = null

  for (const item of items) {
    if (item.isTable) {
      lists = []
      quote = code = null
      const tableNode = element('table')
      for (const rowCells of item.rows) {
        const tr = element('tr')
        for (const cellParagraphs of rowCells) {
          const td = element('td')
          cellParagraphs.forEach((p, index) => {
            if (index > 0) td.append(element('br'))
            inline(td, p.runs)
          })
          tr.append(td)
        }
        tableNode.append(tr)
      }
      body.append(tableNode)
      continue
    }

    const p = item
    const text = p.runs.map(run => run.isBreak ? '\n' : run.text).join('')
    if (!text.trim() && p.listText == null) {
      if (p.hasBorder) {
        body.append(element('hr'))
        lists = []
      }
      // an empty paragraph ends a quote or code, not a list (TextEdit puts them between items)
      quote = code = null
      continue
    }

    if (p.listText != null || p.ls > 0) {
      quote = code = null
      // '3.', '(3)', or TextEdit's bare '3'
      const marker = /^\s*\(?(\d+)[.)]?\s*$/.exec(p.listText ?? '')
      const isOrdered = !!marker
      const level = p.ilvl
      while (lists.length && lists.at(-1).level > level) lists.pop()
      if (lists.length && lists.at(-1).level == level && lists.at(-1).isOrdered != isOrdered) lists.pop()
      if (!lists.length || lists.at(-1).level < level) {
        const listNode = element(isOrdered ? 'ol' : 'ul')
        if (marker && Number(marker[1]) != 1) listNode.setAttribute('start', marker[1])
        const parent = lists.at(-1)?.node.lastElementChild ?? body
        parent.append(listNode)
        lists.push({ level, isOrdered, node: listNode })
      }
      const li = element('li')
      inline(li, trimLeading(p.runs))
      lists.at(-1).node.append(li)
      continue
    }
    lists = []

    const level = headingLevel(p)
    if (level) {
      quote = code = null
      const heading = element(`h${level}`)
      inline(heading, p.runs, { isHeading: true })
      body.append(heading)
      continue
    }
    if (isCode(p)) {
      quote = null
      const lines = p.runs.map(run => run.isBreak ? '\n' : run.text).join('')
      if (code) code.textContent += '\n' + lines
      else {
        const pre = element('pre')
        code = element('code')
        code.textContent = lines
        pre.append(code)
        body.append(pre)
      }
      continue
    }
    code = null
    const paragraphNode = element('p')
    inline(paragraphNode, p.runs)
    if (/quot|zitat|citation|cita/i.test(styleName(p))) {
      if (!quote) {
        quote = element('blockquote')
        body.append(quote)
      }
      quote.append(paragraphNode)
      continue
    }
    quote = null
    body.append(paragraphNode)
  }
  return { body, lost }
}

// a list item's own tab or spaces after the marker
function trimLeading (runs) {
  const [first, ...rest] = runs
  if (!first || first.isBreak) return runs
  return [{ ...first, text: first.text.replace(/^[\s\t]+/, '') }, ...rest]
}

function sameRun (a, b) {
  return a.isBold == b.isBold && a.isItalic == b.isItalic && a.isStrike == b.isStrike && a.isUnderline == b.isUnderline &&
    a.isMono == b.isMono && a.font == b.font && a.size == b.size && a.color == b.color && a.isHighlight == b.isHighlight && a.link == b.link
}

// HYPERLINK "url" (a link within the document, \l, is not a link here)
function hyperlink (instruction) {
  const match = /^\s*HYPERLINK\s+(?:"([^"]*)"|(\S+))/i.exec(instruction)
  if (!match || /\\l/.test(instruction.slice(0, match.index + match[0].length))) return null
  const url = (match[1] ?? match[2]).trim()
  return url || null
}

function latin1 (bytes) {
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(at, at + 0x8000))
  return text
}
