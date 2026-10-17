// The document tree (markdown-tree.js) as a PDF, laid out by pdfmake with the bundled fonts
// (fonts/, written by .claude/make-fonts.py): Inter for text, Source Code Pro for code, and Noto
// Sans JP, SC or TC for Japanese and Chinese. Only the fonts a document uses are loaded.
//
// The Markdown goes in as an attached file (`Title.md`), so opening the PDF here again gives back
// the same Markdown (read-pdf.js); other readers show it under the PDF's attachments.

// npm packages
import pdfMake from 'pdfmake/build/pdfmake.js'
// local functions
import { fontUrl, regionsOf, paragraphRegions, regionOf, paperSize } from './fonts.js'

const size = 11
const leading = 1.35
const headingSizes = [22, 17, 14, 12, 11, 11]
const ink = '#1b1e24'
const grey = '#6b7280'
const line = '#d1d5db'
const tint = '#f3f4f6'
const linkColor = '#0057d9'
const bullets = ['•', '◦', '▪']

const families = {
  Inter: { normal: 'Inter-Regular', bold: 'Inter-Bold', italics: 'Inter-Italic', bolditalics: 'Inter-BoldItalic' },
  Mono: { normal: 'SourceCodePro-Regular', bold: 'SourceCodePro-Bold', italics: 'SourceCodePro-Italic', bolditalics: 'SourceCodePro-BoldItalic' },
  // CJK fonts have no italics
  ...Object.fromEntries(['JP', 'SC', 'TC'].map(region => {
    const regular = `NotoSans${region}-Regular`
    const bold = `NotoSans${region}-Bold`
    return [`Noto${region}`, { normal: regular, bold, italics: regular, bolditalics: bold }]
  }))
}

export default async function writePdf (tree, title, markdown) {
  const order = regionsOf(treeText(tree))
  const used = new Set(['Inter'])
  const content = tree.blocks.flatMap(block => blockOf(block, { order, used }))

  // the fonts' files, into pdfmake's virtual file system
  const files = [...used].flatMap(family => [...new Set(Object.values(families[family]))])
  const bytes = await Promise.all(files.map(loadFont))
  files.forEach((file, index) => pdfMake.virtualfs.writeFileSync(file, bytes[index]))
  pdfMake.setFonts(Object.fromEntries([...used].map(family => [family, families[family]])))
  // nothing is fetched: the fonts are in the virtual file system, the Markdown in a data URL
  pdfMake.setUrlAccessPolicy(() => false)

  const name = `${title}.md`
  const definition = {
    info: { title, creator: 'Textflow', producer: 'Textflow' },
    pageSize: paperSize(),
    pageMargins: [64, 64, 64, 64],
    defaultStyle: { font: 'Inter', fontSize: size, lineHeight: leading, color: ink },
    content,
    // a heading is not left at the foot of a page
    pageBreakBefore: (node, { getFollowingNodesOnPage, getNodesOnNextPage }) =>
      node.headlineLevel != null && getFollowingNodesOnPage().length == 0 && getNodesOnNextPage().length > 0,
    files: { [name]: { src: `data:text/markdown;base64,${base64Of(new TextEncoder().encode(markdown))}`, name, type: 'text/markdown', description: 'The document as Markdown' } }
  }
  return new Uint8Array(await pdfMake.createPdf(definition).getBuffer())
}

function blockOf (node, context, inList = false) {
  const gap = 8
  switch (node.type) {
    case 'heading': {
      const level = node.level
      return [{
        text: inlines(node.runs, context),
        fontSize: headingSizes[level - 1],
        bold: true,
        color: level == 6 ? grey : ink,
        lineHeight: 1.2,
        margin: [0, level <= 2 ? 14 : 10, 0, level <= 2 ? 6 : 4],
        headlineLevel: level
      }]
    }
    case 'paragraph':
      return [{ text: inlines(node.runs, context), margin: [0, 0, 0, inList ? 2 : gap] }]
    case 'quote':
      return [{
        table: { widths: ['*'], body: [[{ stack: withoutLastGap(node.blocks.flatMap(inner => blockOf(inner, context))), color: grey }]] },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: index => index == 0 ? 3 : 0,
          vLineColor: () => line,
          paddingLeft: () => 12,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0
        },
        margin: [0, 0, 0, gap]
      }]
    case 'code':
      return [{
        table: { widths: ['*'], body: [[{ text: inlines([{ text: node.text, isCode: true }], context), preserveLeadingSpaces: true, lineHeight: 1.25 }]] },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          fillColor: () => tint,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 8,
          paddingBottom: () => 8
        },
        margin: [0, 0, 0, gap]
      }]
    case 'rule':
      return [{
        table: { widths: ['*'], body: [['']] },
        layout: { hLineWidth: index => index == 1 ? 0.75 : 0, vLineWidth: () => 0, hLineColor: () => line, paddingTop: () => 0, paddingBottom: () => 0 },
        margin: [0, 4, 0, gap + 4]
      }]
    case 'list': {
      // markers are text (bullets, numbers, ☐ and ☑), so a copy of the PDF made by printing it
      // still reads back as lists (read-pdf.js); boxes are Source Code Pro's, Inter has none
      const depth = context.depth ?? 0
      const last = node.isOrdered ? `${node.start + node.items.length - 1}.` : ''
      const width = node.items.some(item => item.task != null) ? 10 : node.isOrdered ? last.length * 6.2 : 7
      const items = node.items.map((item, index) => {
        const isTask = item.task != null
        const marker = isTask ? (item.task ? '☑' : '☐') : node.isOrdered ? `${node.start + index}.` : bullets[depth % bullets.length]
        if (isTask) context.used.add('Mono')
        const blocks = item.blocks.flatMap(inner => blockOf(inner, { ...context, depth: depth + 1 }, true))
        return {
          columns: [
            { width, text: marker, alignment: node.isOrdered && !isTask ? 'right' : 'left', ...(isTask ? { font: 'Mono', color: grey } : {}) },
            { width: '*', stack: blocks }
          ],
          columnGap: 6
        }
      })
      return [{ stack: items, margin: [0, 0, 0, inList ? 2 : gap] }]
    }
    case 'table': {
      const [header, ...rows] = node.rows
      const cell = (cellRuns, index, isHeader) => ({ text: inlines(cellRuns, context), bold: isHeader, alignment: node.align[index] ?? 'left' })
      return [{
        table: {
          headerRows: 1,
          widths: header.map(() => '*'),
          body: [header.map((c, i) => cell(c, i, true)), ...rows.map(row => header.map((_, i) => cell(row[i] ?? [], i, false)))]
        },
        layout: {
          hLineWidth: () => 0.75,
          vLineWidth: () => 0.75,
          hLineColor: () => line,
          vLineColor: () => line,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 3,
          paddingBottom: () => 3
        },
        margin: [0, 0, 0, gap]
      }]
    }
  }
  return []
}

// the space after a quote's last paragraph is the quote's own
function withoutLastGap (blocks) {
  const last = blocks.at(-1)
  if (last?.margin) blocks[blocks.length - 1] = { ...last, margin: [...last.margin.slice(0, 3), 0] }
  return blocks
}

// runs as pdfmake's text pieces, each piece of Japanese or Chinese in a CJK font
function inlines (list, context) {
  const order = paragraphRegions(list.map(run => run.text ?? '').join(''), context.order)
  return list.flatMap(run => {
    if (run.isBreak) return [{ text: '\n' }]
    const style = {}
    if (run.isBold) style.bold = true
    if (run.isItalic) style.italics = true
    if (run.isStrike) style.decoration = 'lineThrough'
    if (run.isCode) Object.assign(style, { font: 'Mono', fontSize: size * 0.9, background: run.link ? undefined : tint })
    if (run.link) Object.assign(style, { link: run.link, color: linkColor })
    if (run.isCode) context.used.add('Mono')
    return pieces(run.text, order).map(({ text, region }) => {
      if (!region) return { text, ...style }
      context.used.add(`Noto${region}`)
      return { text, ...style, font: `Noto${region}`, fontSize: run.isCode ? size * 0.9 : undefined }
    })
  })
}

// text split where it moves in and out of the CJK fonts: [{ text, region (null: Inter or Mono) }]
function pieces (text, order) {
  const result = []
  for (const character of text) {
    const code = character.codePointAt(0)
    const region = regionOf(code, order)
    const last = result.at(-1)
    if (last && last.region == region) last.text += character
    else result.push({ text: character, region })
  }
  return result
}

function treeText ({ blocks }) {
  const ofRuns = runs => runs.map(run => run.text ?? '').join('')
  const ofBlock = block => {
    switch (block.type) {
      case 'heading':
      case 'paragraph': return ofRuns(block.runs)
      case 'quote': return block.blocks.map(ofBlock).join('')
      case 'list': return block.items.flatMap(item => item.blocks.map(ofBlock)).join('')
      case 'code': return block.text
      case 'table': return block.rows.flat().map(ofRuns).join('')
    }
    return ''
  }
  return blocks.map(ofBlock).join('')
}

function base64Of (bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

// the font's bytes, from the file Vite serves (or bundles) next to this module
async function loadFont (name) {
  const response = await fetch(fontUrl(name))
  if (!response.ok) throw new Error(`The font ${name} could not be loaded.`)
  return new Uint8Array(await response.arrayBuffer())
}
