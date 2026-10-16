// npm packages
import { Annotation, StateEffect, RangeSetBuilder } from '@codemirror/state'
import { EditorView, ViewPlugin, Decoration } from '@codemirror/view'

// Alt+↑/↓ moves slide: every move swaps two neighbouring stretches of lines, and both slide from
// where they were on screen to their new place. The document changes at once, as before; only the drawing is animated, with CSS
// transforms on line decorations, so keys are never held up. A move during a slide starts from
// where the lines are drawn at that moment.
//
// The move commands say which lines they swapped (movedLines). dispatchMove reads where those
// lines are drawn just before the move and right after it (before the browser paints), and the
// plugin draws them back at the old place, then lets them slide. Only drawn lines are measured
// (CodeMirror's own heights can lag behind the page); a stretch out of view does not slide.

// { above: { from, to, newFrom }, below: { from, to, newFrom } }:
// line numbers before the move, and where each stretch starts after it
export const movedLines = Annotation.define()

// { lines: [{ from, to, offset, opacity }] }: new line numbers, how far above (< 0) or below
// their new place they were drawn, and the opacity they start from (none: fully drawn)
const slide = StateEffect.define()
const settle = StateEffect.define()
const clear = StateEffect.define()

// also the CSS transitions of moves and drags (--move-duration on the editor)
const duration = 150

// Dispatches a move transaction and slides it, when the view is drawn (tests pass a bare
// { state, dispatch } to the commands).
export function dispatchMove (view, transaction) {
  const swapped = transaction.annotation(movedLines)
  if (!swapped || !view.contentDOM?.isConnected) return view.dispatch(transaction)
  const old = { above: drawnTop(view, swapped.above.from), below: drawnTop(view, swapped.below.from) }
  view.dispatch(transaction)
  const lines = []
  for (const key of ['above', 'below']) {
    const span = swapped[key]
    const now = drawnTop(view, span.newFrom)
    if (old[key] == null || now == null) continue
    lines.push({ from: span.newFrom, to: span.newFrom + span.to - span.from, offset: old[key] - now })
  }
  if (lines.length) view.dispatch({ effects: slide.of({ lines }) })
}

// Slides lines from where they were drawn to their place: lines as in the slide effect (a drop
// after dragging, from where its faded copy was, dnd/index.js); a drop eases out, settling
export function slideLines (view, lines) {
  view.dispatch({ effects: slide.of({ lines, isDrop: true }) })
}

// where line number is drawn on screen (with any slide still going on), or null when it is not
function drawnTop (view, number) {
  const pos = view.state.doc.line(number).from
  if (pos < view.viewport.from || pos > view.viewport.to) return null
  const node = view.domAtPos(pos).node
  const line = (node.nodeType == 1 ? node : node.parentElement)?.closest('.cm-line')
  return line ? line.getBoundingClientRect().top : null
}

class SlidePlugin {
  constructor (view) {
    this.view = view
    this.decorations = Decoration.none
    this.id = 0
  }

  update (update) {
    // a change of the text (the move itself too) ends any slide at once
    if (update.docChanged) {
      this.id++
      this.decorations = Decoration.none
    }
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(slide)) this.start(effect.value)
        if (effect.is(settle) && effect.value == this.id) this.decorations = this.draw(this.lines, false, this.isDrop)
        if (effect.is(clear) && effect.value == this.id) this.decorations = Decoration.none
      }
    }
  }

  start ({ lines, isDrop = false }) {
    const id = ++this.id
    this.lines = lines
    this.isDrop = isDrop
    this.decorations = this.draw(lines, true)
    // drawn at the old place first, then let go in the next frame, so the transition runs
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (id != this.id) return
      this.view.dispatch({ effects: settle.of(id) })
      setTimeout(() => {
        if (id == this.id) this.view.dispatch({ effects: clear.of(id) })
      }, duration + 50)
    }))
  }

  draw (lines, isAtStart, isDrop) {
    const { view } = this
    const { doc } = view.state
    const builder = new RangeSetBuilder()
    for (const { from, to, offset, opacity } of lines.slice().sort((a, b) => a.from - b.from)) {
      const style = `transform: translateY(${offset}px)${opacity != null ? `; opacity: ${opacity}` : ''}`
      const decoration = isAtStart
        ? Decoration.line({ class: 'cm-slide-from', attributes: { style } })
        : Decoration.line({ class: isDrop ? 'cm-slide-to cm-slide-drop' : 'cm-slide-to' })
      for (let number = from; number <= Math.min(to, doc.lines); number++) {
        const pos = doc.line(number).from
        // a hidden blank line is drawn as part of the line above
        if (view.lineBlockAt(pos).from != pos) continue
        builder.add(pos, pos, decoration)
      }
    }
    return builder.finish()
  }
}

export const slideMoves = [
  ViewPlugin.fromClass(SlidePlugin, {
    decorations: plugin => plugin.decorations
  }),
  EditorView.editorAttributes.of({ style: `--move-duration: ${duration}ms` })
]

// When Alt+↑/↓ cannot move the block (at the top or bottom, or a heading with no sibling that
// way), the block bumps: a short nudge in the pressed direction and back, so the key visibly did
// something. Each press restarts it (two alternating animations, since re-adding the same one
// would not restart it). How far it goes depends on the block: a list item least, anything else
// (paragraphs, quotes, code) a pixel more, headings more again, the bigger the further. A further
// bump takes longer, as a spring does (by the square root of the distance; '###' takes 0.26 s).
const bumped = StateEffect.define()
const bumpEnd = StateEffect.define()
// pixels: list items 2, anything else 3, headings by level ('####' and deeper 4 … '#' 7)
function bumpDistance (kind, level) {
  if (kind == 'heading') return Math.max(4, 8 - level)
  return kind == 'listItem' ? 2 : 3
}

// milliseconds: 260 for a '###' heading (5 px)
const bumpDuration = distance => Math.round(260 * Math.sqrt(distance / 5))

// lines: { from, to, kind, level } with line numbers, the kind of block ('heading', 'listItem',
// or anything else) and a heading's level; direction: 'up' or 'down'
export function bump (view, lines, direction) {
  if (!lines || !view.contentDOM?.isConnected) return
  view.dispatch({ effects: bumped.of({ ...lines, direction }) })
}

class BumpPlugin {
  constructor (view) {
    this.view = view
    this.decorations = Decoration.none
    this.count = 0
  }

  update (update) {
    if (update.docChanged) this.decorations = Decoration.none
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(bumped)) this.start(effect.value)
        if (effect.is(bumpEnd) && effect.value == this.count) this.decorations = Decoration.none
      }
    }
  }

  start ({ from, to, kind, level, direction }) {
    const count = ++this.count
    const { view } = this
    const { doc } = view.state
    const distance = bumpDistance(kind, level)
    const duration = bumpDuration(distance)
    const decoration = Decoration.line({
      class: `cm-bump cm-bump--${direction}-${count % 2 ? 'a' : 'b'}`,
      attributes: { style: `--bump: ${distance}px; --bump-duration: ${duration}ms` }
    })
    const builder = new RangeSetBuilder()
    for (let number = from; number <= Math.min(to, doc.lines); number++) {
      const pos = doc.line(number).from
      // a hidden blank line is drawn as part of the line above
      if (view.lineBlockAt(pos).from != pos) continue
      builder.add(pos, pos, decoration)
    }
    this.decorations = builder.finish()
    setTimeout(() => {
      if (count == this.count) view.dispatch({ effects: bumpEnd.of(count) })
    }, duration + 50)
  }
}

export const bumpBlocked = ViewPlugin.fromClass(BumpPlugin, {
  decorations: plugin => plugin.decorations
})
