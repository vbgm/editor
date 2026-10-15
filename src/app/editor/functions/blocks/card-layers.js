// npm packages
import { layer } from '@codemirror/view'
// local functions
import { cards, active } from './decorations.js'
import markdownShown from '../markdown-shown.js'

// Cards are drawn only while Markdown is shown; otherwise the page looks like plain text.
// Cards are boxes in layers behind the text: one box per visible block, plus one box for the
// block with the cursor. Moving the cursor to another block only moves that one box, and typing
// only repositions boxes when the layout changes; the text lines are never repainted for it.
//
// The boxes follow the line marks of the cards plugin (they are mapped cheaply while typing),
// and their positions come from CodeMirror's height map, so nothing here parses Markdown.

// blocks drawn as structure, not as cards
const withoutCard = ['heading', 'frontmatter', 'rule']

class CardMarker {
  constructor (className, left, top, width, height) {
    this.className = className
    this.left = left
    this.top = top
    this.width = width
    this.height = height
  }

  eq (other) {
    return this.className == other.className && this.left == other.left && this.top == other.top &&
      this.width == other.width && this.height == other.height
  }

  draw () {
    const dom = document.createElement('div')
    this.apply(dom)
    return dom
  }

  update (dom, old) {
    if (!this.eq(old)) this.apply(dom)
    return true
  }

  apply (dom) {
    dom.className = this.className
    dom.style.left = `${this.left}px`
    dom.style.top = `${this.top}px`
    dom.style.width = `${this.width}px`
    dom.style.height = `${this.height}px`
  }
}

// position of the text lines inside the layer (which scrolls with the content), and the space
// between cards: the transparent border on a block's first line (index.vue), so the styling
// stays in LESS
function measureBase (view) {
  const line = view.contentDOM.querySelector('.cm-line')
  if (!line) return null
  const lineRect = line.getBoundingClientRect()
  const scrollRect = view.scrollDOM.getBoundingClientRect()
  const firstLine = view.contentDOM.querySelector('.cm-block-first:not(.cm-block--heading)')
  return {
    left: lineRect.left - scrollRect.left + view.scrollDOM.scrollLeft,
    width: lineRect.width,
    top: view.documentTop - scrollRect.top + view.scrollDOM.scrollTop,
    gap: firstLine ? parseFloat(getComputedStyle(firstLine).borderTopWidth) || 0 : 0
  }
}

function cardMarker (view, base, className, from, to) {
  const top = view.lineBlockAt(from).top + base.gap
  const bottom = view.lineBlockAt(to).bottom - base.gap
  return new CardMarker(className, base.left, base.top + top, base.width, Math.max(bottom - top, 0))
}

// visible blocks, read from the line marks: [{ from, to, type }] with from/to at line starts
function markedBlocks (view) {
  const decorations = view.plugin(cards)?.decorations
  const blocks = []
  let current = null
  decorations?.between(view.viewport.from, view.viewport.to, (from, _, decoration) => {
    const className = decoration.spec.class
    // a block cut off at the top of the viewport has no first line here
    if (!current || className.includes('cm-block-first')) {
      current = { from, to: from, type: /cm-block--(\w+)/.exec(className)[1] }
      blocks.push(current)
    }
    current.to = from
    if (className.includes('cm-block-last')) current = null
  })
  return blocks
}

const lastSeen = new WeakMap()

// true once per view when value differs from the one seen last time under key
function changed (view, key, value) {
  const seen = lastSeen.get(view) || {}
  lastSeen.set(view, seen)
  if (seen[key] === value) return false
  seen[key] = value
  return true
}

const isShownChanged = update => update.state.facet(markdownShown) != update.startState.facet(markdownShown)

const cardsLayer = layer({
  above: false,
  class: 'cm-cards',
  update: update => update.docChanged || update.viewportChanged || isShownChanged(update) ||
    changed(update.view, 'cards', update.view.plugin(cards)?.decorations),
  markers (view) {
    if (!view.state.facet(markdownShown)) return []
    const base = measureBase(view)
    if (!base) return []
    return markedBlocks(view)
      .filter(block => !withoutCard.includes(block.type))
      .map(block => cardMarker(view, base, 'cm-card', block.from, block.to))
  }
})

const activeLayer = layer({
  above: false,
  class: 'cm-cards-active',
  update: update => update.docChanged || update.viewportChanged || isShownChanged(update) ||
    changed(update.view, 'active', update.view.plugin(active)?.block),
  markers (view) {
    if (!view.state.facet(markdownShown)) return []
    const block = view.plugin(active)?.block
    if (!block || withoutCard.includes(block.type)) return []
    // only when it overlaps the rendered part of the document
    if (block.to < view.viewport.from || block.from > view.viewport.to) return []
    const base = measureBase(view)
    if (!base) return []
    const to = view.state.doc.lineAt(block.to).from
    return [cardMarker(view, base, 'cm-card cm-card--active', block.from, to)]
  }
})

// layers listed earlier are drawn on top: the active box above the cards, both below the text
export default [cards, active, activeLayer, cardsLayer]
