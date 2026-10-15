// npm packages
import { EditorState, Prec, Text } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
// local functions
import markdown from './markdown/index.js'
import { blockLines } from './blocks/decorations.js'
import { moveBlockUp, moveBlockDown } from './move/index.js'
import { selectBlockUp, selectBlockDown } from './blocks/select.js'
import formatKeymap from './format/keymap.js'
import hiddenSyntax from './syntax/index.js'
import gaps from './gaps/index.js'
import { insertNewBlock, joinBackward, joinForward } from './gaps/commands.js'

// Classes instead of inline styles, so the look lives in LESS
const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, class: 'cm-heading cm-heading--1' },
  { tag: tags.heading2, class: 'cm-heading cm-heading--2' },
  { tag: tags.heading3, class: 'cm-heading cm-heading--3' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], class: 'cm-heading cm-heading--4' },
  { tag: tags.strong, class: 'cm-strong' },
  { tag: tags.emphasis, class: 'cm-emphasis' },
  { tag: tags.strikethrough, class: 'cm-strikethrough' },
  { tag: tags.link, class: 'cm-link' },
  { tag: tags.url, class: 'cm-url' },
  { tag: tags.monospace, class: 'cm-monospace' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], class: 'cm-mark' },
  { tag: tags.quote, class: 'cm-quote' }
])

// The editor shows Markdown as plain text: no syntax (syntax/index.js), no blank lines between
// blocks (gaps/index.js), spacing between blocks (blocks/decorations.js), and Enter, Backspace,
// Delete and Alt+↑/↓ working on blocks. The raw file is shown in a textarea instead (app).
// bare: plain CodeMirror with the same document, as a speed baseline for the benchmark
function documentExtensions (bare) {
  if (bare) return []
  return [
    syntaxHighlighting(highlightStyle),
    blockLines,
    hiddenSyntax,
    gaps,
    Prec.high(keymap.of([
      // moving lines past hidden blank lines would look like nothing happens: move blocks
      { key: 'Alt-ArrowUp', run: moveBlockUp },
      { key: 'Alt-ArrowDown', run: moveBlockDown },
      { key: 'Enter', run: insertNewBlock },
      { key: 'Backspace', run: joinBackward },
      { key: 'Delete', run: joinForward }
    ]))
  ]
}

// Files keep their own line breaks: CRLF files are saved as CRLF.
// Files with mixed line breaks are normalized to LF (lineBreakOf returns null for them).
export function lineBreakOf (text) {
  const crlf = (text.match(/\r\n/g) || []).length
  if (!crlf) return null
  const all = (text.match(/\r\n|\r|\n/g) || []).length
  return crlf == all ? '\r\n' : null
}

export function createState (text, options = {}) {
  const lineBreak = lineBreakOf(text)
  return EditorState.create({
    doc: text,
    extensions: [
      lineBreak ? EditorState.lineSeparator.of(lineBreak) : [],
      markdown(),
      history(),
      // no drawSelection(): the browser's own caret and selection move in the same frame as the
      // text; CodeMirror's drawn cursor is positioned one frame later and feels slower
      EditorView.lineWrapping,
      documentExtensions(options.bare),
      Prec.high(keymap.of([
        { key: 'Alt-Shift-ArrowUp', run: moveBlockUp },
        { key: 'Alt-Shift-ArrowDown', run: moveBlockDown },
        { key: 'Shift-ArrowUp', run: selectBlockUp },
        { key: 'Shift-ArrowDown', run: selectBlockDown },
        // the app switches to the raw Markdown; the editor only reports the shortcut
        { key: 'Mod-Shift-m', run: () => { options.onToggleMarkdown?.(); return true } }
      ])),
      // before the default keymap, which uses Mod-i for selecting the parent syntax node
      Prec.high(formatKeymap),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      options.extensions || []
    ]
  })
}

// The file content, with the file's own line breaks
export function getText (state) {
  return state.sliceDoc()
}

// Replaces the document with text (line breaks as '\n', as a textarea gives them) as one change
// covering only the part that differs, so undo history and the file's own line breaks stay.
export function replaceText (state, text) {
  const current = state.doc.toString()
  if (current == text) return null
  let start = 0
  while (start < current.length && start < text.length && current[start] == text[start]) start++
  let end = 0
  while (end < current.length - start && end < text.length - start &&
    current[current.length - 1 - end] == text[text.length - 1 - end]) end++
  const insert = text.slice(start, text.length - end)
  return {
    // in document positions every line break is one character; Text splits the insert into lines
    changes: { from: start, to: current.length - end, insert: Text.of(insert.split('\n')) },
    userEvent: 'input.replace'
  }
}
