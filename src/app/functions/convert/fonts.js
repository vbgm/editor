// What the PDF export (write-pdf.js) and Print (../print.js) share: the bundled fonts (fonts/,
// written by .claude/make-fonts.py), which of Noto Sans JP, SC and TC to use for Japanese and
// Chinese, and the paper size.
//
//   fontUrl (name)                  where a font's file is served ('Inter-Bold' → its URL)
//   regionsOf (text)                the CJK fonts to try, the best first: ['JP', 'SC', 'TC']…
//   paragraphRegions (text, order)  the same for a paragraph of a document whose order is given
//   regionOf (code, order)          the first of order whose font has the character, or null
//   paperSize ()                    'LETTER' or 'A4'

// local functions
import { from as cjkFrom, jp, sc, tc } from './fonts/cjk.js'

const coverage = { JP: bitsOf(jp), SC: bitsOf(sc), TC: bitsOf(tc) }
const kana = /[぀-ヿ]/

export function fontUrl (name) {
  return new URL(`./fonts/${name}.ttf`, import.meta.url).href
}

// Japanese where there is kana, otherwise the Chinese font that has more of the text's
// characters, the system's language deciding a tie
export function regionsOf (text) {
  if (kana.test(text)) return ['JP', 'SC', 'TC']
  let simplified = 0
  let traditional = 0
  for (const character of text) {
    const code = character.codePointAt(0)
    if (code < cjkFrom) continue
    if (has(coverage.SC, code)) simplified++
    if (has(coverage.TC, code)) traditional++
  }
  const language = globalThis.navigator?.language ?? ''
  if (traditional > simplified || (traditional == simplified && /^zh-(?:Hant|TW|HK|MO)/i.test(language))) return ['TC', 'SC', 'JP']
  if (traditional == simplified && /^ja/i.test(language)) return ['JP', 'SC', 'TC']
  return ['SC', 'TC', 'JP']
}

// a paragraph's own: Japanese where it has kana, Chinese where it has characters Japanese does
// not, the document's otherwise (a Japanese heading all in kanji)
export function paragraphRegions (text, order) {
  if (kana.test(text)) return ['JP', ...order.filter(r => r != 'JP')]
  for (const character of text) {
    const code = character.codePointAt(0)
    if (code >= cjkFrom && !has(coverage.JP, code) && (has(coverage.SC, code) || has(coverage.TC, code))) return [...order.filter(r => r != 'JP'), 'JP']
  }
  return order
}

export function regionOf (code, order) {
  return order.find(region => has(coverage[region], code)) ?? null
}

// Letter in the United States and Canada, A4 elsewhere
export function paperSize () {
  const language = globalThis.navigator?.language ?? ''
  return /-(?:US|CA)$/i.test(language) ? 'LETTER' : 'A4'
}

function bitsOf (base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

function has (bits, code) {
  const index = code - cjkFrom
  if (index < 0 || index >= bits.length * 8) return false
  return (bits[index >> 3] & (1 << (index & 7))) != 0
}
