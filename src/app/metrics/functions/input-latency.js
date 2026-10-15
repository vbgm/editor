// Measures what typing feels like, separately for each look (cards, plain, textarea),
// so the editor can be compared with a native textarea on the same machine.
// Collected outside Vue, so measuring does not cause re-renders.
//
// Two measurements per key press, both starting at the key event's timestamp (set by the
// browser when the OS delivers the key, before any page code runs):
// - own: until the frame after the key has been painted (requestAnimationFrame, then a task
//   that runs after that frame). Works in every browser, including Safari.
// - Event Timing API (Chrome only): the browser's own key press → paint duration. It only
//   reports keys of 16 ms or more and rounds to 8 ms, so keys are counted separately and
//   only the slow ones are recorded.
//
// A key shown in the next frame takes up to one frame (16.7 ms at 60 Hz) plus the input delay;
// 32 ms or more means it reached the screen at least one frame late.

const maxSamples = 2000

export default function createInputLatency () {
  const stats = {
    isEventTimingSupported: !!PerformanceObserver.supportedEntryTypes?.includes('event'),
    look: null,
    byLook: {}
  }

  const bucket = look => stats.byLook[look] || (stats.byLook[look] = { keys: 0, own: [], slow: [] })

  // key presses waiting for their Event Timing entry, to know which look they belong to
  const pending = []

  document.addEventListener('keydown', event => {
    const look = stats.look
    const samples = bucket(look)
    samples.keys++
    pending.push({ startTime: event.timeStamp, look })
    if (pending.length > maxSamples) pending.shift()

    const startedAt = event.timeStamp
    requestAnimationFrame(() => setTimeout(() => {
      samples.own.push(performance.now() - startedAt)
      if (samples.own.length > maxSamples) samples.own.shift()
    }, 0))
  }, true)

  if (stats.isEventTimingSupported) {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name != 'keydown' || !entry.interactionId) continue
        const index = pending.findIndex(press => Math.abs(press.startTime - entry.startTime) < 1)
        const look = index >= 0 ? pending[index].look : stats.look
        bucket(look).slow.push(entry.duration)
      }
    }).observe({ type: 'event', durationThreshold: 16 })
  }

  stats.reset = () => {
    stats.byLook = {}
    pending.length = 0
  }

  return stats
}
