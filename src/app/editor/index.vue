<!--
CodeMirror owns everything inside the root element; Vue never touches it.
The document is not mirrored into Vue on every keystroke: read it with getText(); `change` only
says that it changed.
The outline (headings, for the TOC sidebar) is sent when the browser is idle after an edit, and
only when it changed; so is the heading of the section with the cursor, and the formats of the
text with the cursor (for the toolbar's buttons).
The top of the editor is under the toolbar (topInset): the text starts below it, and the cursor
is scrolled into view below it. `underToolbar` says whether the text is scrolled on under it.
-->
<template>

  <div
    ref='root'
    class='editor'
    :class='{switching: isSwitching}'
  />

</template><script>

  // npm packages
  import { markRaw } from 'vue'
  import { Transaction } from '@codemirror/state'
  import { undo, redo } from '@codemirror/commands'
  import { EditorView } from '@codemirror/view'
  import { syntaxTree } from '@codemirror/language'
  // local functions
  import { createState, getText, switchMode, switchLiteral } from './functions/create-state.js'
  import { markdownTopShift } from './functions/markdown-top.js'
  import { redrawCaret } from './functions/redraw-caret.js'
  import { idleScheduler } from './functions/blocks/decorations.js'
  import { getOutline, activeIndex, dropLevel, outlineMove, headingTextStart, renameSpec } from './functions/outline/index.js'
  import { dispatchMove } from './functions/move/animate.js'
  import { activeFormats } from './functions/format/active.js'
  import { setHeading, toggleList, toggleTaskList } from './functions/format/lines.js'
  import { toggleInline, insertLink } from './functions/format/inline.js'

  // the toolbar's formats (format())
  const formatCommands = {
    heading: setHeading,
    bold: () => toggleInline('**'),
    italic: () => toggleInline('*'),
    strikethrough: () => toggleInline('~~'),
    code: () => toggleInline('`'),
    link: () => insertLink,
    bullet: () => toggleList('bullet'),
    ordered: () => toggleList('ordered'),
    task: () => toggleTaskList
  }

  export default {
    name: 'Editor',
    props: {
      // the document when the editor starts; load() replaces it (opening a file)
      text: String,
      // Markdown mode: symbols and blank lines visible; otherwise Document mode
      isMarkdownShown: Boolean,
      // typed text stays as typed in Document mode; otherwise typing Markdown formats
      isLiteral: Boolean,
      // px at the top covered by the toolbar
      topInset: {
        type: Number,
        default: 0
      }
    },
    // outline: [{ id, title, level }]; activeSection: index in it of the section with the cursor
    // formats: of the text with the cursor (format/active.js)
    // change: the document's text changed
    // underToolbar: whether the text has been scrolled up under the toolbar
    emits: ['toggleMarkdown', 'outline', 'activeSection', 'formats', 'change', 'underToolbar'],
    data () {
      return {
        view: null,
        // the caret is hidden while the lines are redrawn for the other mode
        isSwitching: false
      }
    },
    watch: {
      'isLiteral' (value) {
        switchLiteral(this.view, value)
      },
      'topInset' () {
        this.$nextTick(() => this.checkUnderToolbar())
      },
      'isMarkdownShown' (value) {
        // Safari keeps drawing its caret where it was in the old layout (redraw-caret.js): hide
        // the caret while switching, then have it drawn anew
        this.isSwitching = true
        if (value) this.alignMarkdownTop()
        switchMode(this.view, value)
        redrawCaret(this.view, () => { this.isSwitching = false })
      }
    },
    mounted () {
      // markRaw: the view must not become a reactive proxy
      this.view = markRaw(new EditorView({
        state: this.createState(),
        parent: this.$refs.root
      }))
      if (this.isMarkdownShown) this.alignMarkdownTop()
      this.view.focus()
      this.scheduleOutline()
      this.view.scrollDOM.addEventListener('scroll', this.checkUnderToolbar, { passive: true })
      this.checkUnderToolbar()
    },
    created () {
      // not reactive: only what is sent out is
      this.outline = []
      this.outlineKey = null
      this.activeSection = null
      this.formatsKey = null
      this.isUnderToolbar = false
      this.scheduleOutline = idleScheduler(() => this.sendOutline())
    },
    beforeUnmount () {
      this.view.scrollDOM.removeEventListener('scroll', this.checkUnderToolbar)
      this.view.destroy()
    },
    methods: {
      // a new document: new undo history, the cursor at the start
      load (text) {
        this.view.setState(this.createState(text))
        if (this.isMarkdownShown) this.alignMarkdownTop()
        this.scheduleOutline()
      },
      createState (text = this.text) {
        return createState(text, {
          isMarkdownShown: this.isMarkdownShown,
          isLiteral: this.isLiteral,
          onToggleMarkdown: () => this.$emit('toggleMarkdown'),
          extensions: [
            EditorView.updateListener.of(update => {
              // the tree also changes while the parser goes on in the background
              const isChanged = update.docChanged || syntaxTree(update.state) != syntaxTree(update.startState)
              if (isChanged || update.selectionSet) this.scheduleOutline()
              if (update.docChanged) this.$emit('change')
              if (update.geometryChanged) this.checkUnderToolbar()
            }),
            // the cursor is scrolled into view below the toolbar
            EditorView.scrollMargins.of(() => ({ top: this.topInset }))
          ]
        })
      },
      // whether the first line's top (the content's, below its padding) is above the toolbar's
      // bottom, sent when it changed; read from the page, as CodeMirror may not have measured yet
      checkUnderToolbar () {
        if (!this.view) return
        const { contentDOM, scrollDOM } = this.view
        const textTop = contentDOM.getBoundingClientRect().top + parseFloat(getComputedStyle(contentDOM).paddingTop)
        const isUnder = textTop < scrollDOM.getBoundingClientRect().top + this.topInset - 0.5
        if (isUnder != this.isUnderToolbar) {
          this.isUnderToolbar = isUnder
          this.$emit('underToolbar', isUnder)
        }
      },
      // the outline as far as the parser has got, sent when it changed
      sendOutline () {
        if (!this.view) return
        const { state } = this.view
        this.outline = getOutline(state)
        const key = this.outline.map(entry => `${entry.level} ${entry.id}`).join('\n')
        if (key != this.outlineKey) {
          this.outlineKey = key
          this.$emit('outline', this.outline.map(({ id, title, level }) => ({ id, title, level })))
        }
        const active = activeIndex(this.outline, state.selection.main.head)
        if (active != this.activeSection) {
          this.activeSection = active
          this.$emit('activeSection', active)
        }
        const formats = activeFormats(state)
        const formatsKey = JSON.stringify(formats)
        if (formatsKey != this.formatsKey) {
          this.formatsKey = formatsKey
          this.$emit('formats', formats)
        }
      },
      // a format from the toolbar for the selection: name in formatCommands, heading with its
      // level (0: text)
      format (name, level) {
        formatCommands[name]?.(level)(this.view)
        this.view.focus()
      },
      // the cursor to the start of a heading's text, the heading near the top of the editor
      selectSection (index) {
        const entry = getOutline(this.view.state)[index]
        if (!entry) return
        const pos = headingTextStart(this.view.state, entry)
        this.view.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 32 })
        })
        this.view.focus()
      },
      // whether the heading at outline index from can be dropped at slot (outline/index.js)
      canDropSection (from, slot) {
        return dropLevel(this.outline, from, slot) != null
      },
      // Renaming a heading from the outline shows each keystroke in the text at once
      // (previewRename), outside the undo history; when it ends (finishRename), the original
      // is put back unseen and the final title applied, so a rename is one undo step. The editor
      // keeps its scroll position and its cursor.
      startRename (index) {
        const entry = getOutline(this.view.state, { complete: true })[index]
        this.rename = entry ? { from: entry.from, doc: this.view.state.doc, changes: null } : null
      },
      previewRename (text) {
        const { rename } = this
        const { state } = this.view
        // an empty title would make the heading a bare '#', a paragraph: the last one stays
        const entry = rename && text.trim() && getOutline(state, { complete: true }).find(other => other.from == rename.from)
        const spec = entry && renameSpec(state, entry, text)
        if (!spec) return
        const transaction = state.update({ ...spec, annotations: Transaction.addToHistory.of(false) })
        rename.changes = rename.changes ? rename.changes.compose(transaction.changes) : transaction.changes
        this.view.dispatch(transaction)
      },
      // text: the title to keep, null to put the original back
      finishRename (text) {
        const { rename } = this
        this.rename = null
        if (!rename) return
        if (rename.changes) {
          this.view.dispatch({ changes: rename.changes.invert(rename.doc), annotations: Transaction.addToHistory.of(false) })
        }
        if (text) {
          const { state } = this.view
          const entry = getOutline(state, { complete: true }).find(other => other.from == rename.from)
          const spec = entry && renameSpec(state, entry, text)
          if (spec) this.view.dispatch(spec)
        }
        // the outline at once: editing another heading right after starts from the titles as
        // they are now
        this.sendOutline()
      },
      // drops the heading at outline index from at slot { index, position }: one undo step, the
      // moved lines slide where they are drawn; the editor keeps its scroll position
      moveSection (from, slot) {
        const { state } = this.view
        const outline = getOutline(state, { complete: true })
        // the sidebar's outline may be from before the last key press
        if (outline.length != this.outline.length) return
        const transaction = outlineMove(state, outline, from, slot)
        if (transaction) dispatchMove(this.view, transaction)
      },
      // the first line's text starts at the same height as in Document mode (markdown-top.js)
      alignMarkdownTop () {
        const shift = markdownTopShift(this.$refs.root, this.view.state)
        this.$refs.root.style.setProperty('--markdown-top', `${shift}px`)
        // CodeMirror measures the content's padding: let it see the new one
        this.view.requestMeasure()
      },
      getText () {
        return getText(this.view.state)
      },
      // from the menu (CodeMirror's own Cmd+Z goes first while the editor has the focus)
      undo () {
        undo(this.view)
      },
      redo () {
        redo(this.view)
      },
      focus () {
        this.view.focus()
      }
    }
  }

</script><style scoped lang='less'>

  // the page
  @line-height: 1.6;
  // a little tighter than Document mode, so the page keeps about the same height and switching
  // jumps less
  @markdown-line-height: 1.55;
  @font-size--markdown: 0.9rem;
  @content-width: 46rem;
  // above the first line, in both modes
  @content-top: 1.5rem;
  // inside a line, before its text: the text column starts here (also for hanging lists, quote
  // bars, a selected empty paragraph; dnd/index.js counts on it being 1rem)
  @text-inset: 1rem;

  // space between blocks (Document mode), as transparent borders
  @block-space: 0.4rem;
  @heading-space: 1.1rem;
  // between list items, and between nested items or an item's further lines
  @item-space: 0.1rem;
  @nested-space: 0.2rem;

  // a bullet's width; numbers are at least as wide and a task's checkbox takes as much room, so
  // all their texts start at the same place
  @mark-width: 0.9em;
  @checkbox-size: 1.1em;

  @bold: 650;

  // moves and drags: --move-duration, --dnd-preview-opacity and the handle's size come from
  // move/animate.js and dnd/index.js, which time, fade and place the same things
  @move-duration: var(--move-duration, 0.15s);
  @handle-fade: 0.15s;
  // how long a dropped block's copy takes to lose its background and shadow, against the slide
  @drop-fade-share: 1;

  .editor {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;

    :deep(.cm-editor) {
      flex: 1 1 auto;
      min-width: 0;
      outline: none;
    }

    :deep(.cm-scroller) {
      font-family: inherit;
      line-height: @line-height;
    }

    :deep(.cm-content) {
      max-width: @content-width;
      margin: 0 auto;
      padding: calc(@content-top + var(--top-inset, 0px)) 1rem 50vh;
      caret-color: var(--color--text--primary);
    }

    &.switching :deep(.cm-content) {
      caret-color: transparent;
    }

    :deep(.cm-content ::selection) {
      background: var(--color--text-selection);
      color: var(--color--text-selection--text);
    }

    :deep(.cm-line) {
      padding: 0 @text-inset;
    }

    // Markdown mode (.cm-markdown): the file as it is, in one monospace font, like a plain
    // text field
    :deep(.cm-markdown .cm-scroller) {
      font-family: var(--font--monospace);
      font-size: @font-size--markdown;
      line-height: @markdown-line-height;
    }

    // the first line's capital letters start at the same height as in Document mode, whatever
    // the fonts and the first block (--markdown-top, measured in markdown-top.js)
    :deep(.cm-markdown .cm-content) {
      padding-top: calc(@content-top + var(--top-inset, 0px) + var(--markdown-top, 0px));
    }

    // Document mode (.cm-document) reads as plain text. Space between blocks: transparent borders
    // on a block's first and last line (never margins, which CodeMirror cannot measure); the blank
    // lines between blocks are hidden (gaps/index.js). List items sit close together, headings
    // get more room above. In Markdown mode the blank lines themselves are the space.
    :deep(.cm-document) {
      .cm-block-first {
        border-top: @block-space solid transparent;
      }

      .cm-block-last {
        border-bottom: @block-space solid transparent;
      }

      // nested items and an item's further lines sit inside the item's block, so they get the
      // same space between them as items
      .cm-nested-item,
      .cm-item-line,
      .cm-item-paragraph {
        border-top: @nested-space solid transparent;
      }

      // list items sit close together; a list as a whole is spaced like a paragraph
      .cm-block--listItem {
        &.cm-after--listItem {
          border-top-width: @item-space;
        }

        &.cm-before--listItem {
          border-bottom-width: @item-space;
        }
      }

      .cm-block--heading.cm-block-first {
        border-top-width: @heading-space;
      }

      // nothing above the first block: no space, so the first line stays put when switching modes
      .cm-content > .cm-line:first-child {
        border-top-width: 0;
      }

      // the empty line after Enter, and an empty paragraph (gaps/index.js), are spaced like a
      // paragraph
      .cm-new-block,
      .cm-empty-paragraph {
        border-top: @block-space solid transparent;
        border-bottom: @block-space solid transparent;
      }

      // the empty line after Shift+Enter is a further line of the block above: no space between
      .cm-block-last:has(+ .cm-new-line) {
        border-bottom-width: 0;
      }

      .cm-new-line {
        border-bottom: @block-space solid transparent;
      }

      .cm-block--listItem.cm-before--listItem + .cm-new-line {
        border-bottom-width: @item-space;
      }
    }

    // a selected empty paragraph, in both modes (gaps/index.js): a selection-coloured block where
    // its text would start
    :deep(.cm-selected-empty) {
      background: linear-gradient(var(--color--text-selection), var(--color--text-selection)) no-repeat @text-inset center / 0.5em 1.2em;
      background-clip: padding-box;
      background-origin: padding-box;
    }

    // and no sliver of the browser's own selection on selected blank lines: only the block above
    :deep(.cm-selected-empty),
    :deep(.cm-selected-blank) {
      &::selection,
      ::selection {
        background: transparent;
      }
    }

    // hidden syntax (syntax/index.js): lines that only hold syntax take no space,
    // and some symbols are drawn instead of shown
    :deep(.cm-collapsed-line) {
      height: 0;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      border-width: 0 !important;
      overflow: hidden;
    }

    :deep(.cm-bullet) {
      display: inline-block;
      width: @mark-width;
      color: var(--color--text--secondary);
    }

    // a list line hangs: wrapped lines start where its text starts (--hang, syntax/index.js)
    :deep(.cm-hanging) {
      padding-left: calc(@text-inset + var(--hang));
      text-indent: calc(-1 * var(--hang));

      // text-indent is inherited: the drawn bullet (an inline-block) would shift its dot as well
      * {
        text-indent: 0;
      }
    }

    // a list item's further line: indented as wide as the item's bullet or number (syntax/index.js)
    :deep(.cm-list-indent) {
      visibility: hidden;
    }

    // a list number starts where a bullet does and is at least as wide: numbers line up
    // with each other and with bullets, and single-digit items start their text where bullet
    // items do, at every level
    :deep(.cm-number) {
      display: inline-block;
      min-width: @mark-width;
    }

    // a task's checkbox stands in the bullet's place: round, a little larger than the text, and
    // taking the bullet's width (with its margins), so the task's text starts where other
    // items' text does
    :deep(.cm-task-checkbox) {
      appearance: none;
      box-sizing: border-box;
      // form controls have a smaller font of their own; em must be the text's
      font-size: inherit;
      width: @checkbox-size;
      height: @checkbox-size;
      // set a little into the margin, for some room before the text; as wide as a bullet in all
      margin: 0 0.05em 0 (@mark-width - @checkbox-size - 0.05em);
      vertical-align: -0.2em;
      border: 1.5px solid var(--color--text--secondary);
      border-radius: 50%;
      background: transparent no-repeat center / 70%;
      cursor: pointer;

      &:checked {
        border-color: var(--color--link);
        background-color: var(--color--link);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      }
    }

    // each quote level ('> > ', syntax/index.js) is indented a step further, with a bar of its own
    // The first bar starts where the text of other lines starts, the quote's text after the bars.
    :deep(.cm-quote-line) {
      --quote-step: 0.75rem;
      padding-left: calc(@text-inset + var(--quote-level, 1) * var(--quote-step));
      background: repeating-linear-gradient(to right, var(--color--border--solid) 0 3px, transparent 3px var(--quote-step)) no-repeat @text-inset 0 / calc((var(--quote-level, 1) - 1) * var(--quote-step) + 3px) 100%;
      background-clip: padding-box;
      color: var(--color--text--secondary);
    }

    // the rule spans the text column (inside the line's padding), as wide as a line of text
    :deep(.cm-rule-line) {
      background: linear-gradient(var(--color--border--solid), var(--color--border--solid)) no-repeat center / 100% 1px;
      background-origin: content-box;
      background-clip: content-box;
    }

    // dragging blocks (dnd/index.js): a handle of six dots (2 × 3) fades in left of the block under the
    // mouse; while dragging, the block's lines are an empty gap, the lines it passes slide aside,
    // and a copy of the block, opaque on a background of its own, follows the pointer
    :deep(.cm-dnd-handle) {
      position: absolute;
      top: 0;
      left: 0;
      width: var(--dnd-handle-width);
      height: var(--dnd-handle-height);
      background: radial-gradient(circle, var(--color--text--secondary) 0 1.3px, transparent 1.7px) 0 0 / 6px 6px;
      border-radius: 3px;
      opacity: 0;
      pointer-events: none;
      cursor: grab;
      transition: opacity @handle-fade;
      z-index: 2;

      &.is-visible {
        opacity: 1;
        pointer-events: auto;
      }
    }

    // wherever the handle shows for, the mouse is the hand, also off the handle itself
    :deep(.cm-dnd-hover),
    :deep(.cm-dnd-hover *) {
      cursor: grab;
    }

    // Alt+↑/↓ (move/animate.js): the swapped lines are drawn where they were, then slide into
    // place
    :deep(.cm-slide-to) {
      transition: transform @move-duration ease, opacity @move-duration ease;
    }

    // a dropped block settles into place
    :deep(.cm-slide-drop) {
      transition-timing-function: ease-out;
    }

    // Alt+↑/↓ where the block cannot move (move/animate.js): a short nudge in the pressed direction
    // and back, as far as --bump and as long as --bump-duration (by kind of block); two copies of
    // each, so every press restarts it
    :deep(.cm-bump--up-a) {
      animation: bump-up-a var(--bump-duration, 0.26s) ease-out;
    }

    :deep(.cm-bump--up-b) {
      animation: bump-up-b var(--bump-duration, 0.26s) ease-out;
    }

    :deep(.cm-bump--down-a) {
      animation: bump-down-a var(--bump-duration, 0.26s) ease-out;
    }

    :deep(.cm-bump--down-b) {
      animation: bump-down-b var(--bump-duration, 0.26s) ease-out;
    }

    @keyframes bump-up-a { 0%, 100% { transform: none } 30% { transform: translateY(calc(-1 * var(--bump, 4px))) } 65% { transform: translateY(calc(0.375 * var(--bump, 4px))) } }
    @keyframes bump-up-b { 0%, 100% { transform: none } 30% { transform: translateY(calc(-1 * var(--bump, 4px))) } 65% { transform: translateY(calc(0.375 * var(--bump, 4px))) } }
    @keyframes bump-down-a { 0%, 100% { transform: none } 30% { transform: translateY(calc(1 * var(--bump, 4px))) } 65% { transform: translateY(calc(-0.375 * var(--bump, 4px))) } }
    @keyframes bump-down-b { 0%, 100% { transform: none } 30% { transform: translateY(calc(1 * var(--bump, 4px))) } 65% { transform: translateY(calc(-0.375 * var(--bump, 4px))) } }

    :deep(.cm-dnd-line) {
      transition: transform @move-duration ease;
    }

    :deep(.cm-dnd-gap) {
      opacity: 0;
    }

    :deep(.cm-dnd-preview) {
      position: fixed;
      top: 0;
      left: 0;
      height: auto;
      opacity: var(--dnd-preview-opacity);
      // fading from the block it copies when the drag starts (as long as a drop takes), gently
      // at first (with an opaque copy, its opacity does not change; its background does)
      transition: opacity @move-duration ease-in;
      pointer-events: none;
      z-index: 10;

      .cm-scroller {
        height: auto;
        overflow: visible;
      }

      // An opaque copy with a background of its own (a little brighter than the page) and a
      // shadow, as much room above the text as below: the space between blocks. It is on the
      // content, which is moved to put the text where the original's is (dnd/index.js), so the
      // space above a block on the page (larger above a heading) does not change it.
      .cm-content {
        max-width: none;
        margin: 0;
        padding-top: @block-space;
        padding-bottom: @block-space;
        background: var(--color--drag-preview);
        border-radius: var(--radius--control);
        box-shadow: var(--shadow--drag-preview);
        transition:
          background-color @move-duration ease-in,
          box-shadow @move-duration ease-in;
      }

      .cm-content > .cm-line:first-child {
        border-top-width: 0;
      }

      .cm-content > .cm-line:last-child {
        border-bottom-width: 0;
      }

      // after the drop: only its background and shadow, sliding with the block's own lines
      // (as they do: ease-out) while they fade out, faster than they faded in (gone while the
      // block still settles)
      &.is-settling {
        transition: transform @move-duration ease-out;
        // behind the text: the block's own lines land right on it (above it, its opaque
        // background hid them, and the text blinked)
        z-index: -1;

        .cm-content {
          transition-duration: calc(@move-duration * @drop-fade-share);
        }

        .cm-line {
          visibility: hidden;
        }
      }
    }

    // a tighter line than text (1.6): the bigger font would otherwise add empty space under the
    // heading's text, so it would sit further from its paragraph than paragraphs from each other
    :deep(.cm-heading) {
      font-weight: @bold;
      text-decoration: none;
      line-height: 1.3;
    }

    :deep(.cm-heading--1) {
      font-size: 1.6em;
    }

    :deep(.cm-heading--2) {
      font-size: 1.3em;
    }

    :deep(.cm-heading--3) {
      font-size: 1.1em;
    }

    :deep(.cm-strong) {
      font-weight: @bold;
    }

    :deep(.cm-emphasis) {
      font-style: italic;
    }

    :deep(.cm-strikethrough) {
      text-decoration: line-through;
    }

    :deep(.cm-link),
    :deep(.cm-url) {
      color: var(--color--link);
    }

    :deep(.cm-monospace) {
      font-family: var(--font--monospace);
      font-size: 0.9em;
    }

    :deep(.cm-mark),
    :deep(.cm-quote) {
      color: var(--color--text--secondary);
    }

    // a heading or list mark with nothing after it yet looks like the text it is (raw-markup.js)
    :deep(.cm-raw-line) {
      .cm-heading {
        font-size: inherit;
        font-weight: inherit;
      }

      .cm-mark {
        color: inherit;
      }
    }
  }

</style>
