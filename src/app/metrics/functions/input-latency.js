// Measures what typing feels like, separately for each look (cards, plain, textarea),
// so the editor can be compared with a native textarea on the same machine.
// Collected outside Vue, so measuring does not cause re-renders.
//
// Two measurements per key press, both starting at the key event's timestamp (set by the
// browser when the OS delivers the key, before any page code runs):
// - own: until the frame after the key has been painted (requestAnimationFrame, then a task
//   that runs after that frame). Works in every browser, including Safari.
// - Event Timing API (Chrome, recent Safari): the browser's own key press → paint duration.
//   It only reports keys of 16 ms or more and rounds to 8 ms, so keys are counted separately
//   and only the slow ones are recorded.
//
// A key shown in the next frame takes up to one frame (16.7 ms at 60 Hz) plus the input delay;
// 32 ms or more means it reached the screen at least one frame late.

const maxSamples = 2000

// key kinds, measured separately; modifier keys on their own are not counted
export const kinds = ['letters', 'edit', 'arrows']
const modifiers = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']
const editKeys = ['Enter', 'Backspace', 'Delete', 'Tab']
const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']

function kindOf (event) {
  if (event.key.length == 1 && !event.metaKey && !event.ctrlKey) return 'letters'
  if (editKeys.includes(event.key)) return 'edit'
  if (arrowKeys.includes(event.key)) return 'arrows'
  return 'other'
}

const createSamples = () => ({ keys: 0, own: [], slow: [] })

export default function createInputLatency () {
  const stats = {
    isEventTimingSupported: !!PerformanceObserver.supportedEntryTypes?.includes('event'),
    look: null,
    byLook: {}
  }

  // samples for a look: 'all' keys, and per kind
  const buckets = (look, kind) => {
    const byKind = stats.byLook[look] || (stats.byLook[look] = { all: createSamples() })
    return [byKind.all, byKind[kind] || (byKind[kind] = createSamples())]
  }
  const push = (list, value) => {
    list.push(value)
    if (list.length > maxSamples) list.shift()
  }

  // key presses waiting for their Event Timing entry, to know their look and kind
  const pending = []

  document.addEventListener('keydown', event => {
    if (modifiers.includes(event.key)) return
    const look = stats.look
    const kind = kindOf(event)
    const samples = buckets(look, kind)
    for (const sample of samples) sample.keys++
    push(pending, { startTime: event.timeStamp, look, kind })

    const startedAt = event.timeStamp
    requestAnimationFrame(() => setTimeout(() => {
      const duration = performance.now() - startedAt
      for (const sample of samples) push(sample.own, duration)
    }, 0))
  }, true)

  if (stats.isEventTimingSupported) {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name != 'keydown' || !entry.interactionId) continue
        const press = pending.find(press => Math.abs(press.startTime - entry.startTime) < 1)
        // a key not found (modifier, or too old) is not counted
        if (!press) continue
        for (const sample of buckets(press.look, press.kind)) push(sample.slow, entry.duration)
      }
    }).observe({ type: 'event', durationThreshold: 16 })
  }

  stats.reset = () => {
    stats.byLook = {}
    pending.length = 0
  }

  return stats
}
