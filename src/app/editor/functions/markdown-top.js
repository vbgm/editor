// local functions
import { getBlocksInRange } from './blocks/index.js'

// Switching modes must not move the top of the text: the first line's capital letters start at
// the same height in Markdown mode as in Document mode. The two modes use different fonts, sizes
// and line heights, and in Document mode a first heading is bigger, so the space Markdown mode
// needs above its first line is measured instead of guessed: a hidden copy of the first line in
// each mode, built with the editor's own classes so it gets exactly the same styles.
// Returns how much lower (px) Markdown mode's first line must start; index.vue adds it to the
// top padding. Measured when switching to Markdown mode or opening a file in it, not while
// typing, so the text never jumps under the cursor.

export function markdownTopShift (root, state) {
  const level = firstHeadingLevel(state)
  const documentProbe = probe('cm-document', level)
  const markdownProbe = probe('cm-markdown', 0)
  root.append(documentProbe, markdownProbe)
  const shift = capTop(documentProbe) - capTop(markdownProbe)
  documentProbe.remove()
  markdownProbe.remove()
  return shift
}

// heading level of the block on the first line, 0 for anything else
function firstHeadingLevel (state) {
  const block = getBlocksInRange(state, 0, 0)[0]
  return block && block.from == 0 && block.type == 'heading' ? block.level : 0
}

// one line of text in the editor's structure; in Document mode a heading's text is a
// .cm-heading span (syntax/index.js)
function probe (modeClass, level) {
  const element = document.createElement('div')
  element.className = `cm-editor ${modeClass}`
  element.setAttribute('aria-hidden', 'true')
  element.style.cssText = 'position: absolute; visibility: hidden; pointer-events: none; inset: 0 auto auto 0; width: 100%'
  const text = level ? `<span class='cm-heading cm-heading--${level}'>H<span class='cap'></span></span>` : `H<span class='cap'></span>`
  element.innerHTML = `<div class='cm-scroller'><div class='cm-content'><div class='cm-line'>${text}</div></div></div>`
  // sits on the baseline and is one cap height tall: its top is where the capital letters start
  element.querySelector('.cap').style.cssText = 'display: inline-block; width: 0; height: 1cap'
  return element
}

// distance from the top of the line to the top of its capital letters
function capTop (element) {
  const line = element.querySelector('.cm-line')
  const marker = line.querySelector('.cap')
  return marker.getBoundingClientRect().top - line.getBoundingClientRect().top
}
