// npm packages
import { StateEffect, RangeSetBuilder } from '@codemirror/state'
import { ViewPlugin, Decoration } from '@codemirror/view'
// foundation
import { startDrag } from '/foundation/dnd/index.js'
import { displace } from '/foundation/dnd/displace.js'
// local functions
import { dragSource, dropSlots, dropSpec } from './slots.js'

// Dragging blocks with the mouse, in both modes. A handle fades in while the mouse is near it, in
// the narrow strip left of the text (never over the text, never further out in the margin). All
// handles stand in one column, sub-items' too: which block one is for goes by the line it is
// beside. Dragging it moves the block exactly where Alt+↑/↓ would (slots.js), and the drop is one
// undo step.
// While dragging, a faded copy of the block follows the pointer, the block's own lines stay as an
// empty gap, and the lines it passes move aside (displace mode of the foundation's drag engine),
// so the gap follows the pointer. The lines are moved with CSS transforms on line decorations:
// nothing changes in the document or the layout until the drop.

// asks the plugin to draw the drag again (a new slot, the start or end of a drag)
const redraw = StateEffect.define()

const handleWidth = 18
// room between the handle and the text (or a sub-item's bullet)
const handleGap = 14
// how far left of the handle the mouse may be for it to show
const handleReach = 36

class DragPlugin {
  constructor (view) {
    this.view = view
    this.drag = null
    this.source = null
    this.decorations = Decoration.none

    this.handle = document.createElement('div')
    this.handle.className = 'cm-dnd-handle'
    this.handle.setAttribute('aria-hidden', 'true')
    view.scrollDOM.appendChild(this.handle)

    this.onMouseMove = event => this.hover(event)
    this.onMouseLeave = () => this.hideHandle()
    this.onPointerDown = event => this.start(event)
    view.scrollDOM.addEventListener('mousemove', this.onMouseMove)
    view.scrollDOM.addEventListener('mouseleave', this.onMouseLeave)
    // anywhere the handle shows for, not only on the handle; before CodeMirror's own mouse
    // handling, which would place the cursor
    view.scrollDOM.addEventListener('pointerdown', this.onPointerDown, true)
  }

  update (update) {
    if (update.docChanged && !this.drag) this.hideHandle()
    const isRedrawn = update.transactions.some(transaction => transaction.effects.some(effect => effect.is(redraw)))
    if (isRedrawn || (this.drag && update.viewportChanged)) this.decorations = this.draw()
  }

  destroy () {
    this.drag?.engine?.cancel()
    this.handle.remove()
    this.view.scrollDOM.removeEventListener('mousemove', this.onMouseMove)
    this.view.scrollDOM.removeEventListener('mouseleave', this.onMouseLeave)
    this.view.scrollDOM.removeEventListener('pointerdown', this.onPointerDown, true)
  }

  // the handle shows for the block next to the mouse while the mouse is around the handle: from a
  // little left of it up to where the text starts; not while selecting with the mouse
  hover (event) {
    if (this.drag || event.target == this.handle) return
    if (event.buttons) return this.hideHandle()
    const { view } = this
    const { state } = view
    const height = event.clientY - view.documentTop
    if (height < 0 || height > view.contentHeight) return this.hideHandle()
    const line = state.doc.lineAt(view.lineBlockAtHeight(height).from)
    if (!line.text.trim()) return this.hideHandle()

    const source = dragSource(state, line.from)
    if (!source) return this.hideHandle()
    const first = state.doc.line(source.from)
    const textStart = first.from + /^[ \t]*/.exec(first.text)[0].length
    const coords = view.coordsAtPos(textStart, 1)
    if (!coords) return this.hideHandle()
    // sub-items too: every handle stands in one column, left of the top-level text
    const right = this.textColumn()
    const scroller = view.scrollDOM.getBoundingClientRect()
    // in a narrow window, no further out than the editor's edge
    const left = Math.max(right - handleGap - handleWidth, scroller.left + 2)
    if (event.clientX >= right || event.clientX < left - handleReach) return this.hideHandle()

    this.source = source
    const top = (coords.top + coords.bottom) / 2 - this.handle.offsetHeight / 2
    this.handle.style.top = `${top - scroller.top + view.scrollDOM.scrollTop}px`
    this.handle.style.left = `${left - scroller.left + view.scrollDOM.scrollLeft}px`
    this.handle.classList.add('is-visible')
    // the grabbing hand wherever the handle shows for
    view.scrollDOM.classList.add('cm-dnd-hover')
  }

  hideHandle () {
    if (this.drag) return
    this.source = null
    this.handle.classList.remove('is-visible')
    this.view.scrollDOM.classList.remove('cm-dnd-hover')
  }

  // where the text of a top-level line starts (the content's padding plus the line's); the
  // handles' column ends there
  textColumn () {
    const content = this.view.contentDOM
    const rect = content.getBoundingClientRect()
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
    return rect.left + parseFloat(getComputedStyle(content).paddingLeft) + rem
  }

  // a press where the handle shows: a canceled pointerdown also keeps the browser from sending
  // mousedown, so CodeMirror does not move the cursor
  start (event) {
    if (event.button != 0 || !this.source || !this.handle.classList.contains('is-visible')) return
    event.preventDefault()
    event.stopPropagation()
    const { view } = this
    const { state } = view
    const dragged = this.source
    const { up, down } = dropSlots(state, dragged)

    // line edges in the scroller's content coordinates
    const offset = view.documentTop - view.scrollDOM.getBoundingClientRect().top + view.scrollDOM.scrollTop
    const top = number => view.lineBlockAt(state.doc.line(number).from).top + offset
    const bottom = number => view.lineBlockAt(state.doc.line(number).from).bottom + offset
    const item = { top: top(dragged.from), bottom: bottom(dragged.to) }
    // what the block passes on its way to each slot, from the slot before it (or the block itself)
    const edgeOf = slot => slot.cut.edge == 'top' ? top(slot.cut.line) : bottom(slot.cut.line)
    const stretches = (slots, start) => slots.map((slot, index) => {
      const edge = edgeOf(slot)
      const previous = index ? edgeOf(slots[index - 1]) : start
      return { top: Math.min(edge, previous), bottom: Math.max(edge, previous) }
    })

    const preview = this.createPreview(dragged)
    this.drag = { dragged, up, down, height: item.bottom - item.top, slot: 0 }
    this.handle.classList.remove('is-visible')
    view.scrollDOM.classList.remove('cm-dnd-hover')
    view.dispatch({ effects: redraw.of(null) })

    const finish = spec => {
      preview.remove()
      this.drag = null
      view.dispatch({ ...spec, effects: redraw.of(null) })
      view.focus()
    }
    this.drag.engine = startDrag({
      event,
      scroller: view.scrollDOM,
      item,
      preview,
      mode: displace({ up: stretches(up, item.top), down: stretches(down, item.bottom) }),
      onSlot: slot => {
        this.drag.slot = slot
        view.dispatch({ effects: redraw.of(null) })
      },
      onDrop: slot => finish(slot ? dropSpec(view.state, dragged, slot) || {} : {}),
      onCancel: () => finish({})
    })
  }

  // a faded copy of the dragged lines that are drawn, in the editor's own classes so it looks the
  // same; the engine moves it with the pointer
  createPreview (dragged) {
    const { view } = this
    const { doc } = view.state
    const lines = []
    for (let number = dragged.from; number <= dragged.to; number++) {
      const pos = doc.line(number).from
      if (pos < view.viewport.from || pos > view.viewport.to) continue
      const element = view.domAtPos(pos).node
      const line = (element.nodeType == 1 ? element : element.parentElement).closest('.cm-line')
      if (line && !lines.includes(line)) lines.push(line)
    }

    // the editor's classes on a copy of its elements; the outer element is the one placed (the
    // editor's own class is always position: relative)
    const preview = document.createElement('div')
    preview.className = 'cm-dnd-preview'
    const editor = document.createElement('div')
    editor.className = view.dom.className
    const scroller = document.createElement('div')
    scroller.className = view.scrollDOM.className
    const content = document.createElement('div')
    content.className = view.contentDOM.className
    for (const line of lines) content.appendChild(line.cloneNode(true))
    scroller.appendChild(content)
    editor.appendChild(scroller)
    preview.appendChild(editor)

    const rect = view.contentDOM.getBoundingClientRect()
    preview.style.left = `${rect.left}px`
    preview.style.width = `${rect.width}px`
    view.dom.parentElement.appendChild(preview)

    // the copy's first line is the first line of its content, which has no space above it: put
    // its text where the original's is
    if (lines.length) {
      preview.style.transform = `translateY(${lines[0].getBoundingClientRect().top}px)`
      const shift = lines[0].getBoundingClientRect().top - content.firstChild.getBoundingClientRect().top
      if (shift > 0) content.style.paddingTop = `${shift}px`
    }
    return preview
  }

  // the dragged lines as a gap, and the lines between it and the slot moved aside
  draw () {
    if (!this.drag) return Decoration.none
    const { view } = this
    const { doc } = view.state
    const { dragged, up, down, height, slot } = this.drag
    const first = up.length ? up[up.length - 1].cut.line : dragged.from
    const last = down.length ? down[down.length - 1].cut.line : dragged.to
    const shift = slot < 0 ? up[-slot - 1].shift : slot > 0 ? down[slot - 1].shift : null
    const moved = Decoration.line({ class: 'cm-dnd-line', attributes: { style: `transform: translateY(${slot < 0 ? height : -height}px)` } })

    const builder = new RangeSetBuilder()
    for (const { from, to } of view.visibleRanges) {
      for (let number = doc.lineAt(from).number; number <= doc.lineAt(to).number; number++) {
        if (number < first || number > last) continue
        const pos = doc.line(number).from
        // a hidden blank line is drawn as part of the line above
        if (view.lineBlockAt(pos).from != pos) continue
        if (number >= dragged.from && number <= dragged.to) builder.add(pos, pos, gap)
        else if (shift && number >= shift.from && number <= shift.to) builder.add(pos, pos, moved)
        else builder.add(pos, pos, still)
      }
    }
    return builder.finish()
  }
}

const gap = Decoration.line({ class: 'cm-dnd-gap' })
// lines that can move aside: they slide back and forth
const still = Decoration.line({ class: 'cm-dnd-line' })

export default ViewPlugin.fromClass(DragPlugin, {
  decorations: plugin => plugin.decorations
})
