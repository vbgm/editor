// The document tree (markdown-tree.js) as an OpenDocument text (.odt: XML in a zip), for
// LibreOffice, Pages and Word.
//
// Uses LibreOffice's own style names: "Heading 1"…, "Quotations", "Preformatted Text",
// "Horizontal Line", "Source Text" and "Internet link", so it reads there as if written there.
// Lists nest as in Markdown; one list style per top-level list.

// npm packages
import { zipSync, strToU8 } from 'fflate'
// local functions
import { unchecked, checked } from './flatten.js'
import { escapeXml } from './write-docx.js'

const namespaces = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"'
].join(' ')

const bullets = ['•', '◦', '▪']
const headingSizes = ['20pt', '16pt', '14pt', '12pt', '11pt', '10pt']

export default function writeOdt ({ blocks }, title) {
  // automatic styles: text formats (T…), list styles (L…), quote depths (Q…)
  const textStyles = new Map()
  const listStyles = []
  const quoteDepths = new Set()
  let tables = 0

  function textStyle (run) {
    const key = `${+run.isBold}${+run.isItalic}${+run.isStrike}${+(run.isCode && !!run.link)}`
    if (key == '0000') return null
    if (!textStyles.has(key)) textStyles.set(key, `T${textStyles.size + 1}`)
    return textStyles.get(key)
  }

  const runs = list => list.map((run, index) => {
    if (run.isBreak) return '<text:line-break/>'
    let xml = text(run.text, index == 0)
    if (run.isCode && !run.link) xml = `<text:span text:style-name="Source_20_Text">${xml}</text:span>`
    const style = textStyle(run)
    if (style) xml = `<text:span text:style-name="${style}">${xml}</text:span>`
    if (run.link) xml = `<text:a xlink:type="simple" xlink:href="${escapeXml(run.link)}" text:style-name="Internet_20_link" text:visited-style-name="Visited_20_Internet_20_Link">${xml}</text:a>`
    return xml
  }).join('')

  const paragraphStyle = (quote, fallback) => {
    if (!quote) return fallback
    if (quote > 1) quoteDepths.add(quote)
    return quote > 1 ? `Q${quote}` : 'Quotations'
  }

  // each depth's kind is that of its first list
  function listLevels (list, depth = 0, levels = []) {
    levels[depth] ??= { isOrdered: list.isOrdered }
    for (const item of list.items) {
      for (const block of item.blocks) if (block.type == 'list') listLevels(block, depth + 1, levels)
    }
    return levels
  }

  function block (node, quote, isInList) {
    switch (node.type) {
      case 'heading':
        return `<text:h text:style-name="Heading_20_${node.level}" text:outline-level="${node.level}">${runs(node.runs)}</text:h>`
      case 'paragraph':
        return `<text:p text:style-name="${paragraphStyle(quote, isInList ? 'List_20_Contents' : 'Text_20_body')}">${runs(node.runs)}</text:p>`
      case 'quote':
        return node.blocks.map(inner => block(inner, quote + 1, isInList)).join('')
      case 'code': {
        const lines = node.text.split('\n').map(line => text(line, true)).join('<text:line-break/>')
        return `<text:p text:style-name="${quote ? paragraphStyle(quote) : 'Preformatted_20_Text'}">${quote ? `<text:span text:style-name="Source_20_Text">${lines}</text:span>` : lines}</text:p>`
      }
      case 'rule':
        return '<text:p text:style-name="Horizontal_20_Line"/>'
      case 'table':
        // a list item cannot hold a table: its rows as lines
        if (isInList) return node.rows.map(row => `<text:p text:style-name="List_20_Contents">${row.map(cell => runs(cell)).join('<text:tab/>')}</text:p>`).join('')
        return table(node)
      case 'list':
        return list(node, quote, null)
    }
    return ''
  }

  function list (node, quote, styleName) {
    let style = ''
    if (!styleName) {
      listStyles.push(listLevels(node))
      styleName = `L${listStyles.length}`
      style = ` text:style-name="${styleName}"`
    }
    const items = node.items.map((item, index) => {
      const start = index == 0 && node.isOrdered && node.start != 1 ? ` text:start-value="${node.start}"` : ''
      let [first, ...rest] = item.blocks
      if (item.task != null) {
        const box = { text: `${item.task ? checked : unchecked} `, isBold: false, isItalic: false, isStrike: false, isCode: false, link: null }
        if (first?.type == 'paragraph') first = { ...first, runs: [box, ...first.runs] }
        else {
          rest = item.blocks
          first = { type: 'paragraph', runs: [box] }
        }
      }
      const content = [first, ...rest].filter(Boolean).map(inner => inner.type == 'list'
        ? list(inner, quote, styleName)
        : block(inner, quote, true)).join('')
      return `<text:list-item${start}>${content || '<text:p text:style-name="List_20_Contents"/>'}</text:list-item>`
    }).join('')
    return `<text:list${style}>${items}</text:list>`
  }

  function table ({ align, rows }) {
    tables++
    const [header, ...body] = rows
    const cell = (cellRuns, index, isHeader) => {
      const alignment = { center: 'Center', right: 'Right' }[align[index]] ?? ''
      const styleName = `Table_20_${isHeader ? 'Heading' : 'Contents'}${alignment ? `_${alignment}` : ''}`
      return `<table:table-cell table:style-name="Cell" office:value-type="string"><text:p text:style-name="${styleName}">${runs(cellRuns)}</text:p></table:table-cell>`
    }
    return `<table:table table:name="Table${tables}" table:style-name="Table">` +
      `<table:table-column table:number-columns-repeated="${align.length}"/>` +
      `<table:table-header-rows><table:table-row>${header.map((c, i) => cell(c, i, true)).join('')}</table:table-row></table:table-header-rows>` +
      body.map(row => `<table:table-row>${row.map((c, i) => cell(c, i, false)).join('')}</table:table-row>`).join('') +
      '</table:table>'
  }

  const body = blocks.map(node => block(node, 0, false)).join('\n')

  const automatic = [
    ...[...textStyles].map(([key, name]) => {
      const [bold, italic, strike, code] = key.split('').map(Number)
      return `<style:style style:name="${name}" style:family="text"><style:text-properties` +
        (bold ? ' fo:font-weight="bold"' : '') + (italic ? ' fo:font-style="italic"' : '') +
        (strike ? ' style:text-line-through-style="solid" style:text-line-through-type="single"' : '') +
        (code ? ' style:font-name="Courier New"' : '') + '/></style:style>'
    }),
    ...[...quoteDepths].map(depth => `<style:style style:name="Q${depth}" style:family="paragraph" style:parent-style-name="Quotations"><style:paragraph-properties fo:margin-left="${0.4 * depth}in"/></style:style>`),
    ...['Center', 'Right'].flatMap(alignment => ['Heading', 'Contents'].map(kind =>
      `<style:style style:name="Table_20_${kind}_${alignment}" style:family="paragraph" style:parent-style-name="Table_20_${kind}"><style:paragraph-properties fo:text-align="${alignment == 'Right' ? 'end' : 'center'}"/></style:style>`)),
    '<style:style style:name="Table" style:family="table"><style:table-properties style:width="6.5in" table:align="margins"/></style:style>',
    '<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.04in" fo:border="0.5pt solid #000000"/></style:style>',
    ...listStyles.map((levels, index) => `<text:list-style style:name="L${index + 1}">${Array.from({ length: 10 }, (_, depth) => {
      const level = depth + 1
      const position = `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${0.25 * (depth + 2)}in" fo:text-indent="-0.25in" fo:margin-left="${0.25 * (depth + 2)}in"/></style:list-level-properties>`
      return levels[depth]?.isOrdered
        ? `<text:list-level-style-number text:level="${level}" style:num-suffix="." style:num-format="1">${position}</text:list-level-style-number>`
        : `<text:list-level-style-bullet text:level="${level}" text:bullet-char="${bullets[depth % bullets.length]}">${position}</text:list-level-style-bullet>`
    }).join('')}</text:list-style>`)
  ].join('\n')

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${namespaces} office:version="1.3">
<office:font-face-decls>${fontFaces}</office:font-face-decls>
<office:automatic-styles>
${automatic}
</office:automatic-styles>
<office:body><office:text>
${body}
</office:text></office:body>
</office:document-content>`

  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${namespaces} office:version="1.3"><office:meta><dc:title>${escapeXml(title)}</dc:title><meta:creation-date>${new Date().toISOString().replace(/\.\d+Z$/, '')}</meta:creation-date></office:meta></office:document-meta>`

  return zipSync({
    // first and not compressed, so the file's type can be read from its first bytes
    mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
    'META-INF/manifest.xml': strToU8(manifest),
    'content.xml': strToU8(content),
    'styles.xml': strToU8(styles),
    'meta.xml': strToU8(meta)
  })
}

// ODF collapses spaces as HTML does: runs of them, and one at the start, as <text:s/>
function text (value, isStart) {
  return value.split('\t').map((part, index) => escapeXml(part).replace(/ {2,}|^ /g, (spaces, offset) => {
    const isLeading = offset == 0 && (isStart || index > 0)
    if (spaces.length == 1) return isLeading ? '<text:s/>' : ' '
    return isLeading ? `<text:s text:c="${spaces.length}"/>` : ` <text:s text:c="${spaces.length - 1}"/>`
  })).join('<text:tab/>')
}

const fontFaces = '<style:font-face style:name="Courier New" svg:font-family="\'Courier New\'" style:font-family-generic="modern" style:font-pitch="fixed"/>' +
  '<style:font-face style:name="Liberation Sans" svg:font-family="\'Liberation Sans\', Helvetica, Arial" style:font-family-generic="swiss" style:font-pitch="variable"/>'

const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`

const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${namespaces} office:version="1.3">
<office:font-face-decls>${fontFaces}</office:font-face-decls>
<office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0in" fo:margin-bottom="0.08in"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="12pt" fo:language="en" fo:country="US"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-bottom="0.08in" fo:line-height="115%"/></style:style>
<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="text"><style:paragraph-properties fo:margin-top="0.17in" fo:margin-bottom="0.08in" fo:keep-with-next="always"/><style:text-properties fo:font-weight="bold"/></style:style>
${headingSizes.map((size, i) => `<style:style style:name="Heading_20_${i + 1}" style:display-name="Heading ${i + 1}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Text_20_body" style:default-outline-level="${i + 1}" style:class="text"><style:text-properties fo:font-size="${size}" fo:font-weight="bold"/></style:style>`).join('\n')}
<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-left="0.4in" fo:margin-bottom="0.08in"/><style:text-properties fo:color="#595959"/></style:style>
<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-bottom="0.08in"/><style:text-properties style:font-name="Courier New" fo:font-size="10pt"/></style:style>
<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="html"><style:paragraph-properties fo:margin-bottom="0.1in" fo:border-bottom="0.75pt solid #808080" fo:padding="0in"/><style:text-properties fo:font-size="6pt"/></style:style>
<style:style style:name="List_20_Contents" style:display-name="List Contents" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-bottom="0.03in"/></style:style>
<style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"/>
<style:style style:name="Table_20_Heading" style:display-name="Table Heading" style:family="paragraph" style:parent-style-name="Table_20_Contents" style:class="extra"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Source_20_Text" style:display-name="Source Text" style:family="text"><style:text-properties style:font-name="Courier New"/></style:style>
<style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="#000080" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
<style:style style:name="Visited_20_Internet_20_Link" style:display-name="Visited Internet Link" style:family="text"><style:text-properties fo:color="#800000" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
</office:styles>
<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="8.5in" fo:page-height="11in" fo:margin-top="1in" fo:margin-bottom="1in" fo:margin-left="1in" fo:margin-right="1in"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>
</office:document-styles>`
