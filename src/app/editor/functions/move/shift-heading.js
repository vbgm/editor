// Changes the level of the heading at the start of text by delta (clamped to 1–6).
// Setext headings ('Title' + '===' / '---') only have levels 1 and 2, so they become ATX ('#').
export default function shiftHeading (text, level, delta, lineBreak) {
  if (!delta) return text
  const newLevel = Math.min(Math.max(level + delta, 1), 6)
  const lines = text.split(lineBreak)

  const atx = /^( {0,3})(#{1,6})(?=[ \t]|$)/.exec(lines[0])
  if (atx) {
    lines[0] = atx[1] + '#'.repeat(newLevel) + lines[0].slice(atx[0].length)
    return lines.join(lineBreak)
  }

  const underline = lines.findIndex((line, index) => index > 0 && /^ {0,3}(=+|-+)[ \t]*$/.test(line))
  if (underline > 0) {
    const title = lines.slice(0, underline).map(line => line.trim()).join(' ')
    return ['#'.repeat(newLevel) + ' ' + title, ...lines.slice(underline + 1)].join(lineBreak)
  }

  return text
}
