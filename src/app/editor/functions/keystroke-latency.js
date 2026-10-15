// npm packages
import { ViewPlugin } from '@codemirror/view'

// Measures real typing: from keydown (or beforeinput) until the frame after the document changed has been painted.
// onSample gets milliseconds.
export default function keystrokeLatency (onSample) {
  return ViewPlugin.fromClass(class {
    constructor () {
      this.startedAt = null
    }

    update (update) {
      if (this.startedAt == null || !update.docChanged) return
      const startedAt = this.startedAt
      this.startedAt = null
      requestAnimationFrame(() => setTimeout(() => onSample(performance.now() - startedAt), 0))
    }
  }, {
    eventHandlers: {
      keydown () {
        this.startedAt = performance.now()
      },
      // input without a key press (IME, dictation, pasted text) starts here
      beforeinput () {
        if (this.startedAt == null) this.startedAt = performance.now()
      }
    }
  })
}
