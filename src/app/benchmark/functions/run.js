// npm packages
import { EditorSelection } from '@codemirror/state'
// app functions
import { createState } from '/src/app/editor/functions/create-state.js'
import { getBlocks, granularities } from '/src/app/editor/functions/blocks/index.js'
import { moveBlockDown } from '/src/app/editor/functions/move/index.js'

// Runs the same scripted session for every granularity on the given text:
// load, full parse into blocks, typing in the middle of the document, block moves.
// Typing is dispatched directly (no real key events), so it measures the editor's own
// update and paint cost, not the browser's input handling.
// Two numbers per action: 'update' is the synchronous work (state update + DOM update),
// 'frame' runs until the next paint, so it can never be below one display frame (~16.7 ms at 60 Hz).

const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))

function summary (samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = share => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]
  return { median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] }
}

export default async function runBenchmark (view, text, { typing = 150, moves = 30, onProgress } = {}) {
  const results = []

  // 'no cards' is plain CodeMirror with the same document, as a baseline
  const runs = [
    { name: 'no cards', granularity: 'element', cards: false },
    ...granularities.map(granularity => ({ name: granularity, granularity }))
  ]

  for (const { name, granularity, cards } of runs) {
    onProgress?.(`${name}: loading`)
    let startedAt = performance.now()
    view.setState(createState(text, { granularity, cards }))
    await nextPaint()
    const load = performance.now() - startedAt

    startedAt = performance.now()
    const blockCount = getBlocks(view.state, { complete: true }).length
    const blocks = performance.now() - startedAt

    // type in the middle of the document, inside a paragraph
    const middle = view.state.doc.line(Math.floor(view.state.doc.lines / 2)).to
    view.dispatch({ selection: EditorSelection.cursor(middle), scrollIntoView: true })
    await nextPaint()

    onProgress?.(`${name}: typing`)
    const typingUpdates = []
    const typingFrames = []
    for (let index = 0; index < typing; index++) {
      startedAt = performance.now()
      const head = view.state.selection.main.head
      view.dispatch({
        changes: { from: head, insert: index % 6 == 5 ? ' ' : 'a' },
        selection: EditorSelection.cursor(head + 1),
        userEvent: 'input.type'
      })
      typingUpdates.push(performance.now() - startedAt)
      await nextPaint()
      typingFrames.push(performance.now() - startedAt)
    }

    onProgress?.(`${name}: moving`)
    const moveUpdates = []
    const moveFrames = []
    for (let index = 0; index < moves; index++) {
      startedAt = performance.now()
      moveBlockDown(view)
      moveUpdates.push(performance.now() - startedAt)
      await nextPaint()
      moveFrames.push(performance.now() - startedAt)
    }

    results.push({
      name,
      lines: view.state.doc.lines,
      blockCount,
      load,
      blocks,
      typing: { update: summary(typingUpdates), frame: summary(typingFrames) },
      move: { update: summary(moveUpdates), frame: summary(moveFrames) }
    })
  }

  onProgress?.(null)
  return results
}
