// npm packages
import { EditorState, EditorSelection, Prec, Compartment, Facet } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { history, defaultKeymap, historyKeymap, deleteCharBackward, indentMore, indentLess } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
// local functions
import markdown from './markdown/index.js'
import { blockLines } from './blocks/decorations.js'
import { moveBlockUp, moveBlockDown } from './move/index.js'
import { slideMoves } from './move/animate.js'
import { selectBlockUp, selectBlockDown } from './blocks/select.js'
import formatKeymap from './format/keymap.js'
import hiddenSyntax from './syntax/index.js'
import gaps, { cursorForDocument, selectedEmptyParagraphs } from './gaps/index.js'
import markdownShown from './markdown-shown.js'
import { insertNewBlock, newParagraphAfterQuote, insertLineBreak, joinItemLine, joinBackward, joinForward, listItemToParagraph, emptyListItemToParagraph } from './gaps/commands.js'
import literalTyping from './literal-typing.js'
import { indentBlock, outdentBlock, quoteBackspace } from './indent/index.js'
import { caretRedrawAfterIndent } from './redraw-caret.js'
import dragBlocks from './dnd/index.js'

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
      EditorView.editorAttributes.of({ class: 'cm-markdown' }),
      // a plain Backspace, before the Markdown keymap's, which would turn a list mark it stands
      // behind ('1. ') into spaces
      Prec.highest(keymap.of([
        { key: 'Backspace', run: deleteCharBackward },
        // the selected lines, as in a code editor; Tab never leaves the editor
        { key: 'Tab', run: view => indentMore(view) || true },
        { key: 'Shift-Tab', run: view => indentLess(view) || true }
      ]))
    ]
  }
  return [
    EditorView.editorAttributes.of({ class: 'cm-document' }),
    syntaxHighlighting(highlightStyle),
    hiddenSyntax,
    gaps,
    // before the Markdown keymap (lang-markdown, also high), whose Backspace would turn a list
    // item's mark into indentation; these commands do nothing where they do not apply
    Prec.highest(keymap.of([
      { key: 'Enter', run: emptyListItemToParagraph },
      { key: 'Enter', run: newParagraphAfterQuote },
      { key: 'Enter', run: insertNewBlock },
      { key: 'Shift-Enter', run: insertLineBreak },
      { key: 'Backspace', run: listItemToParagraph },
      { key: 'Backspace', run: joinItemLine },
      { key: 'Backspace', run: quoteBackspace },
      { key: 'Backspace', run: joinBackward },
      { key: 'Delete', run: joinForward },
      { key: 'Tab', run: indentBlock },
      { key: 'Shift-Tab', run: outdentBlock }
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

// Literal (off by default): typed text stays as typed in Document mode (literal-typing.js).
// Otherwise typing Markdown formats ('# ' makes a heading).
export const literalCompartment = new Compartment()

export function switchLiteral (view, isLiteral) {
  view.dispatch({ effects: literalCompartment.reconfigure(isLiteral ? literalTyping : []) })
}

// bare: plain CodeMirror with the same document, as a speed baseline for the benchmark
function documentExtensions (bare, isMarkdownShown, isLiteral) {
  if (bare) return []
  return [
    blockLines,
    caretRedrawAfterIndent,
    selectedEmptyParagraphs,
    // dragging blocks by a handle left of them, in both modes (dnd/index.js)
    dragBlocks,
    // Alt+↑/↓ moves slide into place (move/animate.js)
    slideMoves,
    modeCompartment.of(modeExtensions(isMarkdownShown)),
    literalCompartment.of(isLiteral ? literalTyping : []),
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

// A byte order mark is not text: kept in the document, it hides a heading or front matter on
// the first line from the parser, and the cursor would step over an invisible character.
// It stays outside the document and getText puts it back, so the file is saved as it was.
const BOM = '\uFEFF'
const hasBom = Facet.define({ combine: values => values.some(Boolean) })

export function createState (text, options = {}) {
  const lineBreak = lineBreakOf(text)
  const isBom = text.startsWith(BOM)
  return EditorState.create({
    doc: isBom ? text.slice(1) : text,
    extensions: [
      isBom ? hasBom.of(true) : [],
      lineBreak ? EditorState.lineSeparator.of(lineBreak) : [],
      markdown(),
      history(),
      // no drawSelection(): the browser's own caret and selection move in the same frame as the
      // text; CodeMirror's drawn cursor is positioned one frame later and feels slower
      EditorView.lineWrapping,
      documentExtensions(options.bare, options.isMarkdownShown, options.isLiteral),
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

// The file content, with the file's own line breaks and byte order mark
export function getText (state) {
  return (state.facet(hasBom) ? BOM : '') + state.sliceDoc()
}
