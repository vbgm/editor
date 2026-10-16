// npm packages
import { ViewPlugin } from '@codemirror/view'

// Safari keeps drawing its caret where it was in the old layout when the text around it moves
// but the browser's selection stays at the same place in the DOM (switching modes; Tab, where
// the added indentation is drawn as a widget in front of the same text). Moving the cursor one
// step away and back once the new lines are painted makes the editor write the browser's
// selection again, and Safari draws the caret anew.

export function redrawCaret (view, onDone) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const selection = view.state.selection
    const head = selection.main.head
    // within the same line: a neighbouring line could be a hidden blank one
    const line = view.state.doc.lineAt(head)
    const away = head < line.to ? head + 1 : head > line.from ? head - 1 : null
    view.focus()
    // filter: false, so the cursor rules (syntax/index.js) do not move it back on the spot
    if (away != null) view.dispatch({ selection: { anchor: away }, filter: false })
    view.dispatch({ selection, filter: false })
    onDone?.()
  }))
}

// after Tab and Shift+Tab (indent/index.js)
export const caretRedrawAfterIndent = ViewPlugin.fromClass(class {
  update (update) {
    if (update.transactions.some(transaction => transaction.isUserEvent('input.indent'))) redrawCaret(update.view)
  }
})
