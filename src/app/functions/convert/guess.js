// Structure in documents written without styles (TextEdit's RTF, Word and OpenDocument files):
// headings told by their size, list items by the marker typed at their start.

// The heading level of each paragraph, or null. paragraphs: [{ text, size (the same for all its
// text, or null), isAllBold, isCandidate (not in a list or a table, one line, no code or links) }].
// A short paragraph in larger type is a heading, the largest size level 1; one all in bold at the
// body's size is the level after the sizes; a sentence (ending in . , : ; ! ?) is not.
export function guessHeadings (paragraphs, bodySize) {
  const looksLike = p => {
    if (!p.isCandidate || p.size == null || !p.text.trim()) return false
    const text = p.text.trim()
    if (p.size >= bodySize * 1.15) return text.length <= 150
    return p.size == bodySize && p.isAllBold && text.length <= 80 && !/[.,:;!?]$/.test(text)
  }
  const sizes = [...new Set(paragraphs.filter(looksLike).map(p => p.size))].filter(size => size > bodySize).sort((a, b) => b - a)
  return paragraphs.map(p => {
    if (!looksLike(p)) return null
    const index = sizes.indexOf(p.size)
    return Math.min(6, index >= 0 ? index + 1 : sizes.length + 1)
  })
}

// the value with the most weight (characters of text), e.g. the body text's size
export function mostCommon (items, key, weight) {
  const totals = new Map()
  for (const item of items) totals.set(key(item), (totals.get(key(item)) ?? 0) + weight(item))
  let best = null
  let bestTotal = -1
  for (const [value, total] of totals) {
    if (total > bestTotal) {
      best = value
      bestTotal = total
    }
  }
  return best
}

// a font's family without its face: 'Times-Italic', 'Helvetica Neue Bold' → 'times', 'helvetica
// neue' (TextEdit names each face a font of its own)
export function fontFamily (name) {
  return name
    .replace(/(?:[-\s,]+(?:roman|regular|book|plain|normal|bold|italic|oblique|light|medium|semibold|demibold|heavy|black|thin|condensed|narrow|mt|ps|psmt|boldmt|italicmt|bolditalic|bolditalicmt|boldoblique))+$/i, '')
    .trim()
    .toLowerCase()
}

// A list marker typed at the start of a paragraph, with the tab or spaces after it: '•⇥',
// '3.⇥', '3⇥'. { isOrdered, number, length } or null. Without a tab, only '•' and the like count,
// and numbers with a dot or parenthesis.
export function typedMarker (text) {
  const bullet = /^[\t ]*([•◦▪▫■□●○‣⁃–\-*])(\t+| +)/.exec(text)
  if (bullet && (bullet[2].includes('\t') || '•◦▪▫■□●○‣⁃'.includes(bullet[1]))) return { isOrdered: false, number: 1, length: bullet[0].length }
  const number = /^[\t ]*\(?(\d{1,4})([.)]?)(\t+| +)/.exec(text)
  if (number && (number[3].includes('\t') || number[2])) return { isOrdered: true, number: Number(number[1]), length: number[0].length }
  return null
}
