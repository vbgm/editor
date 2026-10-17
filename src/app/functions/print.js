// Print… on Windows and Linux (and in the browser): the document laid out for paper as the PDF
// export lays it out (convert/write-pdf.js), with the same fonts, sizes and spacing, in a box of
// its own (#print) that only printing shows. The fonts are loaded before the print dialog opens:
// the print layout does not wait for them. (macOS prints the PDF itself: WebKit's printing drops
// the CSS page's top margin.)
//
//   preparePrint (text, title)   fills the box; resolves once its fonts are loaded

// app functions
import markdownTree from './convert/markdown-tree.js'
import { bodyHtml } from './convert/write-html.js'
import { fontUrl, regionsOf, paragraphRegions, paperSize } from './convert/fonts.js'

const cjkRange = 'U+2E80-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF'
const cjk = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/

// [family, file, weight, style, unicode range]
const faces = [
  ['Textflow Text', 'Inter-Regular', 400, 'normal'],
  ['Textflow Text', 'Inter-Bold', 700, 'normal'],
  ['Textflow Text', 'Inter-Italic', 400, 'italic'],
  ['Textflow Text', 'Inter-BoldItalic', 700, 'italic'],
  ['Textflow Code', 'SourceCodePro-Regular', 400, 'normal'],
  ['Textflow Code', 'SourceCodePro-Bold', 700, 'normal'],
  ['Textflow Code', 'SourceCodePro-Italic', 400, 'italic'],
  ['Textflow Code', 'SourceCodePro-BoldItalic', 700, 'italic'],
  ...['JP', 'SC', 'TC'].flatMap(region => [
    [`Textflow ${region}`, `NotoSans${region}-Regular`, 400, 'normal', cjkRange],
    [`Textflow ${region}`, `NotoSans${region}-Bold`, 700, 'normal', cjkRange]
  ])
]

let fontFaces = null

export default async function preparePrint (text, title) {
  const box = printBox()
  box.lang = navigator.language
  box.innerHTML = bodyHtml(markdownTree(text))
  document.title = title

  // each paragraph's Japanese and Chinese in the fonts that suit it
  const order = regionsOf(box.textContent)
  const used = new Set()
  for (const element of box.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, td, th, pre')) {
    const regions = paragraphRegions(element.textContent, order)
    element.style.setProperty('--cjk', regions.map(region => `'Textflow ${region}'`).join(', '))
    if (cjk.test(element.textContent)) used.add(regions[0])
  }

  // the faces the text needs, loaded (the browser's `family` may come back quoted: ours are kept)
  fontFaces ??= faces.map(([family, file, weight, style, range]) => {
    const face = new FontFace(family, `url(${fontUrl(file)})`, { weight: String(weight), style, unicodeRange: range ?? 'U+0-10FFFF' })
    document.fonts.add(face)
    return { family, face }
  })
  const hasCode = !!box.querySelector('code')
  const isNeeded = family => family == 'Textflow Text' || (family == 'Textflow Code' && hasCode) || [...used].some(region => family == `Textflow ${region}`)
  await Promise.all(fontFaces.filter(({ family }) => isNeeded(family)).map(({ face }) => face.load().catch(() => null)))
}

function printBox () {
  let box = document.getElementById('print')
  if (box) return box
  const style = document.createElement('style')
  style.textContent = css()
  document.head.append(style)
  box = document.createElement('div')
  box.id = 'print'
  document.body.append(box)
  return box
}

// the PDF's look (write-pdf.js), in points
function css () {
  const ink = '#1b1e24'
  const grey = '#6b7280'
  const line = '#d1d5db'
  const tint = '#f3f4f6'
  const check = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><polyline points='2.5,5.3 4.4,7.2 7.7,2.9' fill='none' stroke='${ink}' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/></svg>`)}")`
  return `
#print { display: none; }
@media print {
  @page { size: ${paperSize() == 'LETTER' ? 'letter' : 'A4'}; margin: 64pt; }
  html, body { height: auto !important; overflow: visible !important; background: white !important; }
  body > :not(#print) { display: none !important; }
  #print {
    display: block;
    font-family: 'Textflow Text', var(--cjk, 'Textflow SC'), sans-serif;
    font-size: 11pt;
    line-height: 1.35;
    color: ${ink};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #print * { font-family: inherit; }
  #print h1, #print h2, #print h3, #print h4, #print h5, #print h6, #print p, #print li, #print td, #print th, #print pre {
    font-family: 'Textflow Text', var(--cjk), sans-serif;
  }
  #print h1, #print h2, #print h3, #print h4, #print h5, #print h6 { font-weight: 700; line-height: 1.2; break-after: avoid; }
  #print h1 { font-size: 22pt; margin: 14pt 0 6pt; }
  #print h2 { font-size: 17pt; margin: 14pt 0 6pt; }
  #print h3 { font-size: 14pt; margin: 10pt 0 4pt; }
  #print h4 { font-size: 12pt; margin: 10pt 0 4pt; }
  #print h5 { font-size: 11pt; margin: 10pt 0 4pt; }
  #print h6 { font-size: 11pt; margin: 10pt 0 4pt; color: ${grey}; }
  #print > :first-child { margin-top: 0; }
  #print p { margin: 0 0 8pt; }
  #print li > p { margin: 0 0 2pt; }
  #print ul, #print ol { margin: 0 0 8pt; padding-left: 13pt; }
  #print li ul, #print li ol { margin: 2pt 0 0; }
  #print li { margin: 0 0 2pt; }
  #print li.task { list-style: none; }
  #print li.task > input {
    appearance: none; -webkit-appearance: none; box-sizing: border-box;
    width: 9pt; height: 9pt; margin: 0 4pt 0 -13pt; vertical-align: -1pt;
    border: 0.9pt solid ${grey}; border-radius: 1.5pt; background: transparent no-repeat center / 100%;
  }
  #print li.task > input:checked { background-image: ${check}; }
  #print code { font-family: 'Textflow Code', var(--cjk), monospace; font-size: 0.9em; background: ${tint}; }
  #print pre { margin: 0 0 8pt; padding: 8pt 10pt; background: ${tint}; white-space: pre-wrap; line-height: 1.25; }
  #print pre code { background: none; font-size: 9.9pt; }
  #print blockquote { margin: 0 0 8pt; padding-left: 12pt; border-left: 3pt solid ${line}; color: ${grey}; }
  #print blockquote > :last-child { margin-bottom: 0; }
  #print hr { border: none; border-top: 0.75pt solid ${line}; margin: 4pt 0 12pt; }
  #print table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0 0 8pt; }
  #print th, #print td { border: 0.75pt solid ${line}; padding: 3pt 6pt; text-align: left; vertical-align: top; }
  #print thead { display: table-header-group; }
  #print tr { break-inside: avoid; }
  #print a { color: #0057d9; text-decoration: none; }
  #print del { text-decoration: line-through; }
}
`
}
