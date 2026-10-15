// npm packages
import { EditorState, Compartment, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
// local functions
import markdown from './markdown/index.js'
import { granularity } from './blocks/index.js'
import cardLayers from './blocks/card-layers.js'
import { moveBlockUp, moveBlockDown } from './move/index.js'
import formatKeymap from './format/keymap.js'
import hiddenSyntax from './syntax/index.js'

// Granularity, appearance and Markdown visibility can be switched without recreating the editor
export const granularityCompartment = new Compartment()
export const appearanceCompartment = new Compartment()
export const markdownCompartment = new Compartment()

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

// 'cards': blocks as cards and styled Markdown
// 'styled': styled Markdown (heading sizes, emphasis, …) without cards
// 'plain': bare CodeMirror, as a baseline for speed
export function appearanceExtensions (appearance) {
  if (appearance == 'plain') return []
  if (appearance == 'styled') return [syntaxHighlighting(highlightStyle)]
  return [syntaxHighlighting(highlightStyle), cardLayers]
}

// Markdown hidden (the default) or shown as it is in the file (syntax/index.js)
export function markdownVisibilityExtensions (isMarkdownShown) {
  if (isMarkdownShown) return []
  return [
    EditorView.editorAttributes.of({ class: 'cm-markdown-hidden' }),
    hiddenSyntax
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
      granularityCompartment.of(granularity.of(options.granularity || 'item')),
      history(),
      // no drawSelection(): the browser's own caret and selection move in the same frame as the
      // text; CodeMirror's drawn cursor is positioned one frame later and feels slower
      EditorView.lineWrapping,
      appearanceCompartment.of(appearanceExtensions(options.appearance)),
      markdownCompartment.of(markdownVisibilityExtensions(options.isMarkdownShown)),
      Prec.high(keymap.of([
        { key: 'Alt-Shift-ArrowUp', run: moveBlockUp },
        { key: 'Alt-Shift-ArrowDown', run: moveBlockDown },
        // the app owns the setting; the editor only reports the shortcut
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
