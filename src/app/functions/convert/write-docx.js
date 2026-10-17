// The document tree (markdown-tree.js) as a Word document (.docx: Office Open XML in a zip).
//
// Headings are Word's own "Heading 1"… styles, quotes "Quote", code blocks "Source Code" and
// inline code "Verbatim Char" (Pandoc's names, so Pandoc and this app's import read them back),
// links "Hyperlink". Lists are real lists, one numbering definition per top-level list.

// npm packages
import { zipSync, strToU8 } from 'fflate'
// local functions
import flatten from './flatten.js'

const indentStep = 720
const textWidth = 9360
const bullets = ['•', '◦', '▪']
const mono = 'Courier New'
const namespaces = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

export default function writeDocx (tree, title) {
  const { paragraphs, lists } = flatten(tree)
  const links = []
  const linkId = url => {
    let index = links.indexOf(url)
    if (index < 0) index = links.push(url) - 1
    return `rIdLink${index + 1}`
  }

  const runs = list => list.map(run => {
    if (run.isBreak) return '<w:r><w:br/></w:r>'
    let props = ''
    if (run.link) props += '<w:rStyle w:val="Hyperlink"/>'
    else if (run.isCode) props += '<w:rStyle w:val="VerbatimChar"/>'
    if (run.isBold) props += '<w:b/>'
    if (run.isItalic) props += '<w:i/>'
    if (run.isStrike) props += '<w:strike/>'
    if (run.isCode && run.link) props += `<w:rFonts w:ascii="${mono}" w:hAnsi="${mono}" w:cs="${mono}"/>`
    const xml = `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${text(run.text)}</w:r>`
    return run.link ? `<w:hyperlink r:id="${linkId(run.link)}" w:history="1">${xml}</w:hyperlink>` : xml
  }).join('')

  const body = paragraphs.map(paragraph => {
    switch (paragraph.type) {
      case 'heading':
        return `<w:p><w:pPr><w:pStyle w:val="Heading${paragraph.level}"/></w:pPr>${runs(paragraph.runs)}</w:p>`
      case 'paragraph': {
        const style = paragraph.quote ? 'Quote' : paragraph.list ? 'ListParagraph' : null
        const left = indentStep * (paragraph.indent + paragraph.quote)
        let props = style ? `<w:pStyle w:val="${style}"/>` : ''
        if (paragraph.list) props += `<w:numPr><w:ilvl w:val="${paragraph.list.depth}"/><w:numId w:val="${paragraph.list.id + 1}"/></w:numPr>`
        if (paragraph.list && paragraph.quote) props += `<w:ind w:left="${left}" w:hanging="360"/>`
        else if (!paragraph.list && left) props += `<w:ind w:left="${left}"/>`
        return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${runs(paragraph.runs)}</w:p>`
      }
      case 'code': {
        const left = indentStep * (paragraph.indent + paragraph.quote)
        const lines = paragraph.text.split('\n').map(line => text(line)).join('<w:br/>')
        return `<w:p><w:pPr><w:pStyle w:val="SourceCode"/>${left ? `<w:ind w:left="${left}"/>` : ''}</w:pPr><w:r>${lines}</w:r></w:p>`
      }
      case 'rule':
        return '<w:p><w:pPr><w:pStyle w:val="HorizontalRule"/></w:pPr></w:p>'
      case 'table':
        return table(paragraph, runs)
    }
    return ''
  }).join('\n')

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${namespaces}><w:body>
${body}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body></w:document>`

  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${links.map((url, i) => `<Relationship Id="rIdLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(url)}" TargetMode="External"/>`).join('\n')}
</Relationships>`

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(packageRelationships),
    'docProps/core.xml': strToU8(core(title)),
    'word/document.xml': strToU8(document),
    'word/_rels/document.xml.rels': strToU8(relationships),
    'word/styles.xml': strToU8(styles),
    'word/numbering.xml': strToU8(numbering(lists))
  })
}

function table ({ align, rows }, runs) {
  const width = Math.floor(textWidth / Math.max(1, align.length))
  const border = side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
  const grid = align.map(() => `<w:gridCol w:w="${width}"/>`).join('')
  const rowsXml = rows.map((row, rowIndex) => {
    const cells = row.map((cell, i) => {
      const jc = { center: 'center', right: 'right' }[align[i]]
      const cellRuns = rowIndex == 0 ? cell.map(run => run.isBreak ? run : { ...run, isBold: true }) : cell
      return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr><w:p>${jc ? `<w:pPr><w:jc w:val="${jc}"/></w:pPr>` : ''}${runs(cellRuns)}</w:p></w:tc>`
    }).join('')
    return `<w:tr>${rowIndex == 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells}</w:tr>`
  }).join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>` +
    `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${rowsXml}</w:tbl><w:p/>`
}

function numbering (lists) {
  const abstracts = lists.map(({ levels, starts }, index) => {
    const levelsXml = Array.from({ length: 9 }, (_, depth) => {
      const isOrdered = levels[depth] ?? false
      const indent = `<w:pPr><w:ind w:left="${indentStep * (depth + 1)}" w:hanging="360"/></w:pPr>`
      return isOrdered
        ? `<w:lvl w:ilvl="${depth}"><w:start w:val="${starts[depth] ?? 1}"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${depth + 1}."/><w:lvlJc w:val="left"/>${indent}</w:lvl>`
        : `<w:lvl w:ilvl="${depth}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${bullets[depth % bullets.length]}"/><w:lvlJc w:val="left"/>${indent}</w:lvl>`
    }).join('')
    return `<w:abstractNum w:abstractNumId="${index + 1}"><w:multiLevelType w:val="hybridMultilevel"/>${levelsXml}</w:abstractNum>`
  }).join('\n')
  const nums = lists.map((_, index) => `<w:num w:numId="${index + 1}"><w:abstractNumId w:val="${index + 1}"/></w:num>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${namespaces}>
${abstracts}
${nums}
</w:numbering>`
}

function text (value) {
  // tabs are their own element; spaces kept as they are
  return value.split('\t').map(part => part ? `<w:t xml:space="preserve">${escapeXml(part)}</w:t>` : '').join('<w:tab/>')
}

export function escapeXml (value) {
  // characters XML 1.0 does not allow are left out
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function core (title) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${escapeXml(title)}</dc:title>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>
</cp:coreProperties>`
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`

const packageRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`

const headingSizes = [40, 32, 28, 24, 22, 20]

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${namespaces}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${headingSizes.map((size, i) => `<w:style w:type="paragraph" w:styleId="Heading${i + 1}"><w:name w:val="heading ${i + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${i}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`).join('\n')}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:color w:val="595959"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="SourceCode"><w:name w:val="Source Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="${mono}" w:hAnsi="${mono}" w:cs="${mono}"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="HorizontalRule"><w:name w:val="Horizontal Rule"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr><w:rPr><w:sz w:val="8"/></w:rPr></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>
<w:style w:type="character" w:customStyle="1" w:styleId="VerbatimChar"><w:name w:val="Verbatim Char"/><w:rPr><w:rFonts w:ascii="${mono}" w:hAnsi="${mono}" w:cs="${mono}"/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`
