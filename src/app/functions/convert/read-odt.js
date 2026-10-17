// OpenDocument text (.odt) → simple HTML (for to-markdown.js), from LibreOffice, Pages, Word,
// Google Docs and this app's own export.
//
// Headings are text:h (their outline level) or paragraphs in a "Title" / "Subtitle" style;
// quotes, code and rules are LibreOffice's "Quotations", "Preformatted Text" and "Horizontal
// Line" styles (or styles based on them); bold, italic, strikethrough and monospace text come
// from the text's style, whether named or automatic. Lists are numbered or not by their list
// style, and start where text:start-value says. Footnotes are added at the end. A document
// without headings (TextEdit's) has them told by size and bold.
//
// What has no Markdown form is left out and named in `lost`: fonts, font sizes, colours,
// highlighting, underlining, alignment, images, comments, headers and footers.

// npm packages
import { unzipSync, strFromU8 } from 'fflate'
// local functions
import { guessHeadings, mostCommon, fontFamily } from './guess.js'

const ns = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0'
}
const monospace = /courier|mono|menlo|monaco|consolas|inconsolata|code|fixed|typewriter|lucida console|andale|sf mono|hack/i

export default function readOdt (bytes) {
  let files
  try {
    files = unzipSync(bytes, { filter: file => ['content.xml', 'styles.xml'].includes(file.name) })
  } catch {
    throw { kind: 'notDocument', message: 'It is not an OpenDocument text.' }
  }
  if (!files['content.xml']) throw { kind: 'notDocument', message: 'It is not an OpenDocument text.' }
  const parse = name => files[name] ? new DOMParser().parseFromString(strFromU8(files[name]), 'application/xml') : null
  const content = parse('content.xml')
  const stylesDocument = parse('styles.xml')
  const lost = new Set()

  // styles by family and name, from both files: { parent, properties: { … }, displayName }
  const styles = { paragraph: new Map(), text: new Map() }
  const defaultStyles = { paragraph: {}, text: {} }
  const listStyles = new Map()
  const fontFamilies = new Map()
  for (const xml of [stylesDocument, content]) {
    if (!xml) continue
    for (const face of xml.getElementsByTagNameNS(ns.style, 'font-face')) {
      fontFamilies.set(face.getAttributeNS(ns.style, 'name'), {
        family: face.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0', 'font-family') ?? '',
        isFixed: face.getAttributeNS(ns.style, 'font-pitch') == 'fixed'
      })
    }
    for (const style of xml.getElementsByTagNameNS(ns.style, 'default-style')) {
      const family = style.getAttributeNS(ns.style, 'family')
      if (!defaultStyles[family]) continue
      for (const child of style.children) {
        for (const attribute of child.attributes) defaultStyles[family][attribute.localName] = attribute.value
      }
    }
    for (const style of xml.getElementsByTagNameNS(ns.style, 'style')) {
      const family = style.getAttributeNS(ns.style, 'family')
      if (!styles[family]) continue
      const properties = {}
      for (const child of style.children) {
        for (const attribute of child.attributes) properties[attribute.localName] = attribute.value
      }
      styles[family].set(style.getAttributeNS(ns.style, 'name'), {
        parent: style.getAttributeNS(ns.style, 'parent-style-name'),
        displayName: style.getAttributeNS(ns.style, 'display-name') || style.getAttributeNS(ns.style, 'name').replace(/_20_/g, ' '),
        listStyle: style.getAttributeNS(ns.style, 'list-style-name'),
        properties
      })
    }
    for (const listStyle of xml.getElementsByTagNameNS(ns.text, 'list-style')) {
      const levels = []
      for (const level of listStyle.children) {
        levels[Number(level.getAttributeNS(ns.text, 'level')) - 1] = {
          isOrdered: level.localName == 'list-level-style-number' && level.getAttributeNS(ns.style, 'num-format') != '',
          start: level.getAttributeNS(ns.text, 'start-value') || null
        }
      }
      listStyles.set(listStyle.getAttributeNS(ns.style, 'name'), levels)
    }
  }

  // a style's property, or its parents', or the default style's (a paragraph's text is the
  // paragraph default's)
  function property (family, name, key) {
    for (let style = styles[family].get(name), depth = 0; style && depth < 20; style = styles[family].get(style.parent), depth++) {
      if (style.properties[key] != null) return style.properties[key]
    }
    return defaultStyles[family][key] ?? (family == 'text' ? defaultStyles.paragraph[key] : null) ?? null
  }
  // the names of a style and its parents
  function lineage (family, name) {
    const names = []
    for (let style = styles[family].get(name), depth = 0; style && depth < 20; style = styles[family].get(style.parent), depth++) {
      names.push(style.displayName)
    }
    return names
  }
  const hasLineage = (family, name, pattern) => lineage(family, name).some(n => pattern.test(n))

  const isMonoFont = fontName => {
    if (!fontName) return false
    const face = fontFamilies.get(fontName)
    return face?.isFixed || monospace.test(fontName) || monospace.test(face?.family ?? '')
  }
  const textFormat = (family, name) => ({
    isBold: /^(?:bold|[6-9]00)$/.test(property(family, name, 'font-weight') ?? ''),
    isItalic: /^(?:italic|oblique)$/.test(property(family, name, 'font-style') ?? ''),
    isStrike: !!property(family, name, 'text-line-through-style') && property(family, name, 'text-line-through-style') != 'none',
    isMono: isMonoFont(property(family, name, 'font-name')) || hasLineage(family, name, /^(?:source text|teletype|verbatim char|code)$/i),
    isUnderline: !!property(family, name, 'text-underline-style') && property(family, name, 'text-underline-style') != 'none',
    color: property(family, name, 'color'),
    background: property(family, name, 'background-color'),
    size: property(family, name, 'font-size'),
    font: property(family, name, 'font-name')
  })

  // what a text style sets itself or through its named parents, not the defaults
  function ownFormat (name) {
    const own = {}
    for (const key of ['text-underline-style', 'background-color', 'color', 'font-size', 'font-name']) {
      for (let style = styles.text.get(name), depth = 0; style && depth < 20; style = styles.text.get(style.parent), depth++) {
        if (style.properties[key] != null) {
          own[key] = style.properties[key]
          break
        }
      }
    }
    return {
      isUnderline: !!own['text-underline-style'] && own['text-underline-style'] != 'none',
      background: own['background-color'],
      color: own.color,
      size: own['font-size'],
      font: own['font-name']
    }
  }

  // a paragraph's text in pieces with their look: { text, size (in points), font, isBold, isMono,
  // isLink, isBreak }
  function segments (paragraph) {
    const pieces = []
    const own = textFormat('paragraph', paragraph.getAttributeNS(ns.text, 'style-name'))
    const walk = (node, format) => {
      for (const child of node.childNodes) {
        if (child.nodeType == 3) pieces.push({ ...format, text: child.data })
        else if (child.nodeType != 1 || child.namespaceURI != ns.text) continue
        else if (child.localName == 'span') {
          const styleName = child.getAttributeNS(ns.text, 'style-name')
          const span = textFormat('text', styleName)
          // only a size or font the span sets itself: otherwise the paragraph's
          const own = ownFormat(styleName)
          walk(child, {
            ...format,
            size: points(own.size) ?? format.size,
            font: own.font ?? format.font,
            isBold: format.isBold || span.isBold,
            isMono: format.isMono || span.isMono
          })
        } else if (child.localName == 'a') walk(child, { ...format, isLink: true })
        else if (child.localName == 'line-break') pieces.push({ ...format, text: '', isBreak: true })
        else if (child.localName == 's' || child.localName == 'tab') pieces.push({ ...format, text: ' ' })
        else if (!['note', 'annotation'].includes(child.localName)) walk(child, format)
      }
    }
    walk(paragraph, { size: points(own.size), font: own.font, isBold: own.isBold, isMono: own.isMono, isLink: false, isBreak: false })
    return pieces
  }

  // the body text's look, to tell what differs from it: the size and font with the most text
  const officeText = content.getElementsByTagNameNS(ns.office, 'text')[0]
  if (!officeText) throw { kind: 'notDocument', message: 'It is not an OpenDocument text.' }
  const allPieces = [...officeText.getElementsByTagNameNS(ns.text, 'p')].flatMap(segments).filter(piece => piece.text.trim() && !piece.isMono)
  const defaults = {
    size: mostCommon(allPieces.filter(piece => piece.size != null), piece => piece.size, piece => piece.text.length),
    font: mostCommon(allPieces.filter(piece => piece.font != null), piece => fontFamily(piece.font), piece => piece.text.length)
  }

  // headings by size and bold, where the document has none of its own
  const guessed = new Map()
  const hasHeadings = officeText.getElementsByTagNameNS(ns.text, 'h').length > 0 ||
    [...officeText.getElementsByTagNameNS(ns.text, 'p')].some(p => hasLineage('paragraph', p.getAttributeNS(ns.text, 'style-name'), /^(?:title|subtitle)$/i))
  if (!hasHeadings && defaults.size != null) {
    const candidates = [...officeText.children].filter(node => node.namespaceURI == ns.text && node.localName == 'p')
    const levels = guessHeadings(candidates.map(paragraph => {
      const pieces = segments(paragraph)
      const text = pieces.filter(piece => piece.text.trim())
      const sizes = new Set(text.map(piece => piece.size))
      return {
        text: text.map(piece => piece.text).join(''),
        size: sizes.size == 1 ? [...sizes][0] : null,
        isAllBold: text.every(piece => piece.isBold),
        isCandidate: !pieces.some(piece => piece.isBreak || piece.isLink || piece.isMono)
      }
    }), defaults.size)
    candidates.forEach((paragraph, index) => {
      if (levels[index]) guessed.set(paragraph, levels[index])
    })
  }
  const notes = []
  const document = globalThis.document.implementation.createHTMLDocument('')
  const body = document.body
  const element = tag => document.createElement(tag)

  function noteLost (format, isHeadingOrLink) {
    if (format.isUnderline && !isHeadingOrLink) lost.add('underlining')
    if (format.background && !/^(?:transparent|#ffffff)$/i.test(format.background)) lost.add('highlighting')
    if (isHeadingOrLink) return
    if (format.color && !/^#(?:000000|[0-2][0-9a-f][0-2][0-9a-f][0-2][0-9a-f])$/i.test(format.color)) lost.add('colours')
    if (points(format.size) != null && defaults.size != null && points(format.size) != defaults.size) lost.add('font sizes')
    if (format.font && !isMonoFont(format.font) && defaults.font && fontFamily(format.font) != defaults.font) lost.add('fonts')
  }

  // the inline content of a paragraph or span into parent
  function inline (source, parent, format, isHeading) {
    for (const node of source.childNodes) {
      if (node.nodeType == 3) {
        appendText(parent, node.data.replace(/[\t\n\r ]+/g, ' '), format, isHeading)
        continue
      }
      if (node.nodeType != 1) continue
      const name = node.localName
      if (node.namespaceURI == ns.text) {
        if (name == 's') appendText(parent, ' '.repeat(Number(node.getAttributeNS(ns.text, 'c') || 1)), format, isHeading)
        else if (name == 'tab') appendText(parent, '\t', format, isHeading)
        else if (name == 'line-break') parent.append(element('br'))
        else if (name == 'span') {
          const styleName = node.getAttributeNS(ns.text, 'style-name')
          const own = textFormat('text', styleName)
          noteLost(ownFormat(styleName), isHeading || !!format.link || own.isMono)
          inline(node, parent, {
            ...format,
            isBold: format.isBold || own.isBold,
            isItalic: format.isItalic || own.isItalic,
            isStrike: format.isStrike || own.isStrike,
            isMono: format.isMono || own.isMono
          }, isHeading)
        } else if (name == 'a') {
          const href = node.getAttributeNS(ns.xlink, 'href')
          inline(node, parent, { ...format, link: href && !href.startsWith('#') ? href : format.link }, isHeading)
        } else if (name == 'note') {
          const citation = node.getElementsByTagNameNS(ns.text, 'note-citation')[0]?.textContent ?? String(notes.length + 1)
          appendText(parent, `[${citation}]`, format, isHeading)
          notes.push({ citation, body: node.getElementsByTagNameNS(ns.text, 'note-body')[0] })
        } else if (name == 'annotation') {
          lost.add('comments')
        } else if (!['bookmark', 'bookmark-start', 'bookmark-end', 'reference-mark', 'reference-mark-start', 'reference-mark-end', 'soft-page-break', 'change-start', 'change-end', 'tracked-changes', 'sequence-decls', 'alphabetical-index-mark', 'toc-mark', 'annotation-end'].includes(name)) {
          // fields (dates, page numbers, references): their text
          inline(node, parent, format, isHeading)
        }
      } else if (node.namespaceURI == ns.draw) {
        if (node.getElementsByTagNameNS(ns.draw, 'image').length) lost.add('images')
        // a text box's text
        for (const box of node.getElementsByTagNameNS(ns.draw, 'text-box')) {
          for (const p of box.children) inline(p, parent, format, isHeading)
        }
      }
    }
  }

  function appendText (parent, value, format, isHeading) {
    if (!value) return
    if (!value.trim()) return parent.append(document.createTextNode(value))
    let node = document.createTextNode(value)
    const wrap = tag => {
      const wrapper = element(tag)
      wrapper.append(node)
      node = wrapper
    }
    if (format.isMono) wrap('code')
    if (format.isStrike) wrap('s')
    if (format.isItalic) wrap('em')
    if (format.isBold && !isHeading) wrap('strong')
    if (format.link) {
      const link = element('a')
      link.setAttribute('href', format.link)
      link.append(node)
      node = link
    }
    parent.append(node)
  }

  // the paragraph's own look (bold paragraphs, a monospace paragraph style)
  function paragraphFormat (styleName) {
    const format = textFormat('paragraph', styleName)
    return { isBold: format.isBold, isItalic: format.isItalic, isStrike: format.isStrike, isMono: false, link: null }
  }

  function blocks (source, parent, listContext) {
    let quote = null
    let pre = null
    for (const node of source.children) {
      const name = node.localName
      if (node.namespaceURI == ns.text && name == 'h') {
        quote = pre = null
        const level = Math.min(6, Math.max(1, Number(node.getAttributeNS(ns.text, 'outline-level') || 1)))
        const heading = element(`h${level}`)
        inline(node, heading, paragraphFormat(node.getAttributeNS(ns.text, 'style-name')), true)
        if (heading.textContent.trim()) parent.append(heading)
        continue
      }
      if (node.namespaceURI == ns.text && name == 'p') {
        const styleName = node.getAttributeNS(ns.text, 'style-name')
        const align = property('paragraph', styleName, 'text-align')
        if (align && !['start', 'left', 'justify'].includes(align) && !hasLineage('paragraph', styleName, /^table/i)) lost.add('alignment')
        if (align == 'justify') lost.add('alignment')
        if (guessed.has(node) || hasLineage('paragraph', styleName, /^title$/i) || hasLineage('paragraph', styleName, /^subtitle$/i)) {
          quote = pre = null
          const heading = element(guessed.has(node) ? `h${guessed.get(node)}` : hasLineage('paragraph', styleName, /^title$/i) ? 'h1' : 'h2')
          inline(node, heading, paragraphFormat(styleName), true)
          if (heading.textContent.trim()) parent.append(heading)
          continue
        }
        if (hasLineage('paragraph', styleName, /^horizontal line$/i) && !node.textContent.trim()) {
          quote = pre = null
          parent.append(element('hr'))
          continue
        }
        const textOnly = [...node.childNodes].every(child => child.nodeType == 3 || (child.namespaceURI == ns.text && ['s', 'tab', 'line-break', 'soft-page-break'].includes(child.localName)))
        const isMonoParagraph = isMonoFont(property('paragraph', styleName, 'font-name'))
        if (hasLineage('paragraph', styleName, /^(?:preformatted text|source code|code)$/i) || (isMonoParagraph && textOnly && node.textContent.trim())) {
          quote = null
          const lines = codeText(node)
          if (pre) pre.firstChild.textContent += '\n' + lines
          else {
            pre = element('pre')
            const code = element('code')
            code.textContent = lines
            pre.append(code)
            parent.append(pre)
          }
          continue
        }
        pre = null
        const isQuote = hasLineage('paragraph', styleName, /^(?:quotations|quote|intense quote|block text)$/i)
        noteLost(textFormat('paragraph', styleName), isQuote || hasLineage('paragraph', styleName, /^table heading$/i))
        const paragraph = element(listContext ? 'span' : 'p')
        inline(node, paragraph, paragraphFormat(styleName), false)
        if (!paragraph.textContent.trim() && !paragraph.querySelector('br')) {
          quote = null
          continue
        }
        if (listContext) {
          if (parent.childNodes.length) parent.append(element('br'))
          parent.append(...paragraph.childNodes)
          continue
        }
        if (isQuote) {
          if (!quote) {
            quote = element('blockquote')
            parent.append(quote)
          }
          quote.append(paragraph)
          continue
        }
        quote = null
        parent.append(paragraph)
        continue
      }
      quote = pre = null
      if (node.namespaceURI == ns.text && name == 'list') {
        parent.append(list(node, listContext))
        continue
      }
      if (node.namespaceURI == ns.table && name == 'table') {
        parent.append(table(node))
        continue
      }
      if (node.namespaceURI == ns.text && (name == 'section' || name == 'index-body')) {
        blocks(node, parent, listContext)
        continue
      }
      if (node.namespaceURI == ns.text && /^(?:table-of-content|illustration-index|alphabetical-index|user-index|bibliography)$/.test(name)) {
        const indexBody = node.getElementsByTagNameNS(ns.text, 'index-body')[0]
        if (indexBody) blocks(indexBody, parent, listContext)
      }
    }
  }

  function codeText (node) {
    let value = ''
    const walk = source => {
      for (const child of source.childNodes) {
        if (child.nodeType == 3) value += child.data
        else if (child.localName == 's') value += ' '.repeat(Number(child.getAttributeNS(ns.text, 'c') || 1))
        else if (child.localName == 'tab') value += '\t'
        else if (child.localName == 'line-break') value += '\n'
        else if (child.nodeType == 1) walk(child)
      }
    }
    walk(node)
    return value
  }

  // context: { styleName, level } of the list this one is in
  function list (node, context) {
    const own = node.getAttributeNS(ns.text, 'style-name')
    // a list without a style of its own takes its paragraphs' (Word) or the outer list's
    let styleName = own || context?.styleName
    if (!styleName) {
      const firstParagraph = node.getElementsByTagNameNS(ns.text, 'p')[0]
      const paragraphStyle = firstParagraph?.getAttributeNS(ns.text, 'style-name')
      for (let style = styles.paragraph.get(paragraphStyle), depth = 0; style && depth < 20; style = styles.paragraph.get(style.parent), depth++) {
        if (style.listStyle) {
          styleName = style.listStyle
          break
        }
      }
    }
    const level = context ? context.level + 1 : 0
    const levelStyle = listStyles.get(styleName)?.[level]
    const isOrdered = levelStyle?.isOrdered ?? false
    const listNode = element(isOrdered ? 'ol' : 'ul')
    const items = [...node.children].filter(child => child.localName == 'list-item' || child.localName == 'list-header')
    const start = items[0]?.getAttributeNS(ns.text, 'start-value') || levelStyle?.start
    if (isOrdered && start && start != '1') listNode.setAttribute('start', start)
    for (const item of items) {
      const li = element('li')
      blocks(item, li, { styleName, level })
      listNode.append(li)
    }
    return listNode
  }

  function table (node) {
    const tableNode = element('table')
    for (const row of rows(node)) {
      const tr = element('tr')
      for (const cell of row.children) {
        if (cell.localName != 'table-cell') continue
        const td = element('td')
        blocks(cell, td, { styleName: null, level: -1 })
        tr.append(td)
      }
      tableNode.append(tr)
    }
    return tableNode
  }

  // a table's own rows, also those in header and row groups (not those of tables in its cells)
  function rows (node) {
    return [...node.children].flatMap(child => {
      if (child.namespaceURI != ns.table) return []
      if (child.localName == 'table-row') return [child]
      if (/^table-(?:header-rows|rows|row-group)$/.test(child.localName)) return rows(child)
      return []
    })
  }

  blocks(officeText, body, null)

  if (stylesDocument) {
    for (const tag of ['header', 'footer', 'header-left', 'footer-left', 'header-first', 'footer-first']) {
      for (const part of stylesDocument.getElementsByTagNameNS(ns.style, tag)) {
        if (part.textContent.trim()) lost.add('headers and footers')
      }
    }
  }

  for (const note of notes) {
    if (!note.body) continue
    const holder = element('div')
    blocks(note.body, holder, null)
    const first = holder.firstElementChild
    if (first?.localName == 'p') first.prepend(document.createTextNode(`[${note.citation}] `))
    body.append(...holder.childNodes)
  }

  return { body, lost }
}

// a font size in points ('12pt', '12.0pt', '0.5cm'); null for none or a percentage
function points (size) {
  const match = /^([\d.]+)(pt|px|in|cm|mm|pc)$/.exec(size ?? '')
  if (!match) return null
  const factor = { pt: 1, px: 0.75, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, pc: 12 }[match[2]]
  return Math.round(Number(match[1]) * factor * 10) / 10
}
