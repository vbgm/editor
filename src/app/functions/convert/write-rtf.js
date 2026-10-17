// The document tree (markdown-tree.js) as RTF, readable by TextEdit, Word, Pages and LibreOffice.
//
// Headings are styles named "heading 1"… with an outline level, quotes a "Quote" style, code a
// "Source Code" style in Courier New, lists real lists (one definition per top-level list) with
// their markers also written out (\listtext) for readers without lists. Text outside ASCII is
// written as \u escapes, so the file is plain ASCII.

// local functions
import flatten from './flatten.js'

const bodySize = 24
const headingSizes = [40, 32, 28, 24, 22, 20]
const indentStep = 720
// a page's text width at 1" margins on US Letter / A4, in twips
const textWidth = 9360
const bullets = ['\\u8226 ?', '\\u9702 ?', '\\u9642 ?']

export default function writeRtf (tree) {
  const { paragraphs, lists } = flatten(tree)
  const out = []
  out.push('{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1')
  out.push('{\\fonttbl{\\f0\\fswiss\\fcharset0 Helvetica{\\*\\falt Arial};}{\\f1\\fmodern\\fcharset0 Courier New;}}')
  out.push('{\\colortbl;\\red0\\green0\\blue0;\\red5\\green99\\blue193;\\red110\\green110\\blue110;}')
  out.push('{\\stylesheet{\\s0\\f0\\fs24 Normal;}' +
    headingSizes.map((size, i) => `{\\s${i + 1}\\sbasedon0\\snext0\\outlinelevel${i}\\sb240\\sa120\\keepn\\b\\f0\\fs${size} heading ${i + 1};}`).join('') +
    '{\\s7\\sbasedon0\\snext7\\li720\\cf3\\f0\\fs24 Quote;}' +
    '{\\s8\\sbasedon0\\snext0\\f1\\fs20 Source Code;}' +
    '{\\s9\\sbasedon0\\snext0\\brdrb\\brdrs\\brdrw10\\brsp20 Horizontal Rule;}' +
    '{\\*\\cs10\\additive\\f1 Verbatim Char;}' +
    '{\\*\\cs11\\additive\\ul\\cf2 Hyperlink;}}')
  if (lists.length) {
    out.push('{\\*\\listtable' + lists.map((list, index) => listDefinition(list, index + 1)).join('') + '}')
    out.push('{\\*\\listoverridetable' + lists.map((_, index) => `{\\listoverride\\listid${index + 1}\\listoverridecount0\\ls${index + 1}}`).join('') + '}')
  }
  out.push('\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440\\widowctrl')

  for (const paragraph of paragraphs) {
    switch (paragraph.type) {
      case 'heading':
        out.push(`\\pard\\plain\\s${paragraph.level}\\outlinelevel${paragraph.level - 1}\\sb240\\sa120\\keepn\\b\\f0\\fs${headingSizes[paragraph.level - 1]} ${runs(paragraph.runs)}\\par`)
        break
      case 'paragraph': {
        const left = indentStep * (paragraph.indent + paragraph.quote)
        const style = paragraph.quote ? '\\s7\\cf3' : '\\s0'
        if (paragraph.list) {
          const { id, depth, isOrdered, number } = paragraph.list
          const marker = isOrdered ? `${number}.` : bullets[depth % bullets.length]
          out.push(`\\pard\\plain${style}\\ls${id + 1}\\ilvl${depth}\\li${left}\\fi-360\\sa60\\f0\\fs24 {\\listtext\\f0 ${marker}\\tab}${runs(paragraph.runs)}\\par`)
        } else {
          out.push(`\\pard\\plain${style}\\li${left}\\sa120\\f0\\fs24 ${runs(paragraph.runs)}\\par`)
        }
        break
      }
      case 'code': {
        const left = indentStep * (paragraph.indent + paragraph.quote)
        out.push(`\\pard\\plain\\s8\\li${left}\\sa120\\f1\\fs20 ${paragraph.text.split('\n').map(escapeRtf).join('\\line ')}\\par`)
        break
      }
      case 'rule':
        out.push('\\pard\\plain\\s9\\brdrb\\brdrs\\brdrw10\\brsp20\\sa120\\fs8 \\par')
        break
      case 'table':
        out.push(table(paragraph))
        break
    }
  }
  out.push('}')
  return out.join('\n') + '\n'
}

function listDefinition ({ levels, starts }, id) {
  let text = `{\\list\\listtemplateid${id}\\listhybrid`
  for (let depth = 0; depth < 9; depth++) {
    const isOrdered = levels[depth] ?? false
    const left = indentStep * (depth + 1)
    if (isOrdered) {
      // "%1." : the level's number, then a dot
      text += `{\\listlevel\\levelnfc0\\levelnfcn0\\leveljc0\\levelstartat${starts[depth] ?? 1}\\levelfollow0` +
        `{\\leveltext\\'02\\'0${depth}.;}{\\levelnumbers\\'01;}\\fi-360\\li${left}}`
    } else {
      text += `{\\listlevel\\levelnfc23\\levelnfcn23\\leveljc0\\levelstartat1\\levelfollow0` +
        `{\\leveltext\\'01${bullets[depth % bullets.length]};}{\\levelnumbers;}\\fi-360\\li${left}}`
    }
  }
  return text + `\\listid${id}}`
}

function table ({ align, rows }) {
  const width = Math.floor(textWidth / Math.max(1, align.length))
  const cells = align.map((_, i) => `\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10\\cellx${width * (i + 1)}`).join('')
  return rows.map((row, rowIndex) => {
    const header = rowIndex == 0 ? '\\trhdr' : ''
    const content = row.map((cell, i) => {
      const alignment = { center: '\\qc', right: '\\qr' }[align[i]] ?? '\\ql'
      return `\\pard\\plain\\intbl${alignment}\\f0\\fs24 ${rowIndex == 0 ? '\\b ' : ''}${runs(cell)}\\cell`
    }).join('\n')
    return `\\trowd\\trgaph108\\trleft0${header}${cells}\n${content}\n\\row`
  }).join('\n') + '\n\\pard\\plain'
}

function runs (list) {
  return list.map(run => {
    if (run.isBreak) return '\\line '
    let controls = ''
    if (run.isBold) controls += '\\b'
    if (run.isItalic) controls += '\\i'
    if (run.isStrike) controls += '\\strike'
    if (run.isCode) controls += '\\cs10\\f1'
    const text = escapeRtf(run.text)
    const group = controls ? `{${controls} ${text}}` : text
    if (!run.link) return group
    return `{\\field{\\*\\fldinst{HYPERLINK "${escapeRtf(run.link.replace(/"/g, '%22'))}"}}{\\fldrslt{\\cs11\\ul\\cf2 ${group}}}}`
  }).join('')
}

export function escapeRtf (text) {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0)
    if (char == '\\' || char == '{' || char == '}') out += '\\' + char
    else if (char == '\t') out += '\\tab '
    else if (code < 0x20) continue
    else if (code < 0x80) out += char
    else if (code < 0x10000) out += `\\u${code > 0x7fff ? code - 0x10000 : code}?`
    else {
      // a surrogate pair, each half its own \u
      const high = 0xd800 + ((code - 0x10000) >> 10)
      const low = 0xdc00 + ((code - 0x10000) & 0x3ff)
      out += `\\u${high - 0x10000}?\\u${low - 0x10000}?`
    }
  }
  return out
}
