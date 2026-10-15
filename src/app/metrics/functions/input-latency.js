// Measures what typing feels like, with the browser's Event Timing API: from the key press
// (hardware timestamp) until the next frame is painted, so the editor's work, layout and paint
// are all included. Collected outside Vue, so measuring does not cause re-renders.
//
// The browser only reports interactions of 16 ms or more (its minimum threshold) and rounds
// durations to 8 ms, so: every key press is counted, and only the slow ones are recorded.
// Not supported in Safari / WebKit.

export default function createInputLatency () {
  const stats = {
    isSupported: !!PerformanceObserver.supportedEntryTypes?.includes('event'),
    keys: 0,
    slow: []
  }

  document.addEventListener('keydown', () => { stats.keys++ }, true)

  if (stats.isSupported) {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name == 'keydown' && entry.interactionId) stats.slow.push(entry.duration)
      }
    }).observe({ type: 'event', durationThreshold: 16 })
  }

  stats.reset = () => {
    stats.keys = 0
    stats.slow = []
  }

  return stats
}
