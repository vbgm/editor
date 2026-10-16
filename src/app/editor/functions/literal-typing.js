// npm packages
import { EditorState, EditorSelection, ChangeSet } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
// local functions
import markdownShown from './markdown-shown.js'

// Literal (toolbar button, off by default): in Document mode, what is typed is what shows. A typed
// character that would turn into Markdown syntax (a lone '#' or '- ' at the start of a line, the
// closing '*' of '*word*', the ']' that would make a link, …) is saved with a backslash in front,
// which Markdown shows as the character itself and Document mode hides (syntax/index.js).
// Only typed characters that become syntax are escaped, so ordinary text such as 'snake_case'
// or 'a * b' stays as it is in the file. Pasted text is left alone: it is often Markdown on
// purpose. Markdown mode never escapes: there the file is edited as it is.
// With Literal off, typing Markdown formats, as in any Markdown editor.

// syntax that Document mode hides or draws as something else
const marks = new Set([
  'HeaderMark', 'EmphasisMark', 'StrikethroughMark', 'CodeMark', 'Escape', 'QuoteMark',
  'ListMark', 'TaskMarker', 'HorizontalRule', 'LinkMark'
])

// backslash escapes do not work inside these: the opening mark is escaped instead
const rawInside = new Set(['InlineCode', 'Autolink'])

// typing inside code is literal already, and a backslash there would show
const code = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'HTMLBlock', 'Frontmatter', 'CommentBlock'])

// characters a backslash can escape in Markdown
const escapable = /[!-/:-@[-`{-~]/

function isInCode (state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (code.has(node.name) && node.from < pos && node.to > pos) return true
  }
  return false
}

// positions (in state) where a backslash goes, for the typed text at from..to
function escapesIn (state, from, to) {
  const escapes = new Set()
  syntaxTree(state).iterate({
    from,
    to,
    enter: node => {
      if (!marks.has(node.name)) return
      const parent = node.node.parent
      if (parent && rawInside.has(parent.name)) {
        escapes.add(parent.from)
        return
      }
      for (let pos = Math.max(from, node.from); pos < Math.min(to, node.to); pos++) {
        if (escapable.test(state.sliceDoc(pos, pos + 1))) escapes.add(pos)
      }
    }
  })
  return [...escapes].sort((a, b) => a - b)
}

const backslashes = (positions, length) => ChangeSet.of(positions.map(pos => ({ from: pos, insert: '\\' })), length)

// Several characters typed in one go (fast input, text replacement) are escaped as if typed one
// by one: '*b*' arriving at once escapes only its closing '*', as typing it would.
function typeOneByOne (startState, from, to, text) {
  let state = startState
  let changes = ChangeSet.empty(startState.doc.length)
  let pos = from
  for (const character of text) {
    const isCode = isInCode(state, pos)
    const step = state.update({ changes: { from: pos, to, insert: character }, filter: false })
    changes = changes.compose(step.changes)
    state = step.state
    let end = pos + character.length
    const escapes = isCode ? [] : escapesIn(state, pos, end)
    if (escapes.length) {
      const escaping = backslashes(escapes, state.doc.length)
      changes = changes.compose(escaping)
      state = state.update({ changes: escaping, filter: false }).state
      end = escaping.mapPos(end)
    }
    pos = to = end
  }
  return { changes, selection: EditorSelection.cursor(pos) }
}

export default EditorState.transactionFilter.of(transaction => {
  if (!transaction.docChanged || !transaction.isUserEvent('input.type')) return transaction
  const { state, startState } = transaction
  if (state.facet(markdownShown)) return transaction

  const inserted = []
  transaction.changes.iterChanges((fromA, toA, fromB, toB, text) => {
    if (toB > fromB) inserted.push({ fromA, toA, fromB, toB, text: text.toString() })
  })
  if (!inserted.length) return transaction

  const [only] = inserted
  if (inserted.length == 1 && startState.selection.ranges.length == 1 && only.text.length > 1 && only.text.length <= 100 && !only.text.includes('\n')) {
    return { ...typeOneByOne(startState, only.fromA, only.toA, only.text), userEvent: 'input.type', scrollIntoView: true }
  }

  const escapes = inserted
    .filter(({ fromA }) => !isInCode(startState, fromA))
    .flatMap(({ fromB, toB }) => escapesIn(state, fromB, toB))
  if (!escapes.length) return transaction
  return [transaction, { changes: backslashes([...new Set(escapes)].sort((a, b) => a - b), state.doc.length), sequential: true }]
})
