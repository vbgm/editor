// npm packages
import { EditorState, EditorSelection, Prec, Compartment } from '@codemirror/state'
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
import gaps, { cursorForDocument } from './gaps/index.js'
import markdownShown from './markdown-shown.js'
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

// Document or Markdown mode can be switched without recreating the editor
export const modeCompartment = new Compartment()

// Document mode (the default): Markdown shown as plain text, with no syntax (syntax/index.js),
// no blank lines between blocks (gaps/index.js) and spacing between blocks instead; Enter,
// Backspace and Delete work on blocks.
// Markdown mode: the file as it is, in one monospace font with no styling (like a plain text
// field); Enter, Backspace and Delete work as in a text editor. Moving and selecting blocks work in both modes.
export function modeExtensions (isMarkdownShown) {
  if (isMarkdownShown) {
    return [
      markdownShown.of(true),
      EditorView.editorAttributes.of({ class: 'cm-markdown' })
    ]
  }
  return [
    EditorView.editorAttributes.of({ class: 'cm-document' }),
    syntaxHighlighting(highlightStyle),
    hiddenSyntax,
    gaps,
    Prec.high(keymap.of([
      { key: 'Enter', run: insertNewBlock },
      { key: 'Backspace', run: joinBackward },
      { key: 'Delete', run: joinForward }
    ]))
  ]
}

// Switches the view between Document and Markdown mode, keeping text, undo history and cursor.
// In Document mode the cursor must not stay where text is hidden: it goes off a hidden blank
// line, and behind a hidden heading, quote or bullet mark (setting the selection again lets the
// hidden syntax place it, syntax/index.js).
export function switchMode (view, isMarkdownShown) {
  view.dispatch({
    effects: modeCompartment.reconfigure(modeExtensions(isMarkdownShown)),
    scrollIntoView: true
  })
  if (!isMarkdownShown && view.state.selection.main.empty) {
    view.dispatch({
      selection: EditorSelection.cursor(cursorForDocument(view.state)),
      scrollIntoView: true
    })
  }
}

// bare: plain CodeMirror with the same document, as a speed baseline for the benchmark
function documentExtensions (bare, isMarkdownShown) {
  if (bare) return []
  return [
    blockLines,
    modeCompartment.of(modeExtensions(isMarkdownShown)),
    Prec.high(keymap.of([
      // Alt+↑/↓ move blocks, not lines (CodeMirror's default would move lines past hidden
      // blank lines in Document mode, which looks like nothing happens)
      { key: 'Alt-ArrowUp', run: moveBlockUp },
      { key: 'Alt-ArrowDown', run: moveBlockDown }
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
      documentExtensions(options.bare, options.isMarkdownShown),
      Prec.high(keymap.of([
        { key: 'Alt-Shift-ArrowUp', run: moveBlockUp },
        { key: 'Alt-Shift-ArrowDown', run: moveBlockDown },
        { key: 'Shift-ArrowUp', run: selectBlockUp },
        { key: 'Shift-ArrowDown', run: selectBlockDown },
        // the app owns the mode; the editor only reports the shortcut
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
