// One pointer-events drag engine for lists and trees (no HTML5 drag: Tauri's file drop gets in
// its way on Windows). It follows the pointer, moves the preview, scrolls the scroller when the
// pointer is near its top or bottom edge, and asks the mode which slot the dragged item is over.
// It never touches DOM it does not own: the owner shows the slot (moving items aside, a line, a
// highlight) and applies the drop.
//
// Positions are in the scroller's content coordinates (0 = top of the scrolled content), so they
// stay valid while it scrolls.
//
// Modes:
// - displace (displace.js): items move aside to open a gap where the item would go
// - target (target.js, for trees): items stay put; before / after / onto a node, by the vertical
//   position of the pointer over it

const edge = 48
const maxSpeed = 18

// options:
// - event: the pointerdown that starts the drag
// - scroller: the scrolling element
// - item: { top, bottom } of the dragged item, content coordinates
// - preview: an element (position: fixed) moved with the pointer; the owner adds and removes it
// - mode: { slotAt (top, bottom, pointer) }, the slot for the dragged item at top..bottom with the
//   pointer at pointer; optionally initial (the slot before the pointer moves, 0 by default) and
//   isSame (a, b), for slots that are objects
// - onSlot (slot), onDrop (slot), onCancel ()
// Returns { cancel }.
export function startDrag ({ event, scroller, item, preview, mode, onSlot, onDrop, onCancel }) {
  const height = item.bottom - item.top
  const startContentY = contentY(scroller, event.clientY)
  let clientY = event.clientY
  const isSame = mode.isSame || ((a, b) => a == b)
  let slot = mode.initial ?? 0
  let frame = null

  const root = document.documentElement
  root.classList.add('is-dragging')

  function update () {
    const pointer = contentY(scroller, clientY)
    const top = item.top + pointer - startContentY
    const rect = scroller.getBoundingClientRect()
    preview.style.transform = `translateY(${top - scroller.scrollTop + rect.top}px)`
    const next = mode.slotAt(top, top + height, pointer)
    if (!isSame(next, slot)) {
      slot = next
      onSlot(slot)
    }
  }

  // scrolls while the pointer is near the top or bottom edge, faster nearer to it
  function scroll () {
    frame = null
    const rect = scroller.getBoundingClientRect()
    const speed = clientY < rect.top + edge
      ? -Math.min(maxSpeed, (rect.top + edge - clientY) / edge * maxSpeed)
      : clientY > rect.bottom - edge
        ? Math.min(maxSpeed, (clientY - rect.bottom + edge) / edge * maxSpeed)
        : 0
    if (!speed) return
    const before = scroller.scrollTop
    scroller.scrollTop += speed
    if (scroller.scrollTop != before) update()
    frame = requestAnimationFrame(scroll)
  }

  function move (moveEvent) {
    clientY = moveEvent.clientY
    update()
    if (!frame) frame = requestAnimationFrame(scroll)
  }

  function end () {
    root.classList.remove('is-dragging')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key, true)
    if (frame) cancelAnimationFrame(frame)
  }

  function up () {
    end()
    onDrop(slot)
  }

  function cancel () {
    end()
    onCancel()
  }

  function key (keyEvent) {
    keyEvent.preventDefault()
    keyEvent.stopPropagation()
    if (keyEvent.key == 'Escape') cancel()
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  // keys go nowhere while dragging; Escape cancels
  window.addEventListener('keydown', key, true)
  update()

  return { cancel }
}

function contentY (scroller, clientY) {
  return clientY - scroller.getBoundingClientRect().top + scroller.scrollTop
}
