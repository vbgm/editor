<!--
CodeMirror owns everything inside the root element; Vue never touches it.
The document is not mirrored into Vue on every keystroke: read it with getText().
The outline (headings, for the TOC sidebar) is sent when the browser is idle after an edit, and
only when it changed; so is the heading of the section with the cursor.
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
  import { EditorView } from '@codemirror/view'
  import { syntaxTree } from '@codemirror/language'
  // local functions
  import { createState, getText, switchMode, switchLiteral } from './functions/create-state.js'
  import { markdownTopShift } from './functions/markdown-top.js'
  import { redrawCaret } from './functions/redraw-caret.js'
  import { idleScheduler } from './functions/blocks/decorations.js'
  import { getOutline, activeIndex, dropLevel, outlineMove, headingTextStart } from './functions/outline/index.js'
  import { dispatchMove } from './functions/move/animate.js'

  export default {
    name: 'Editor',
    props: {
      // replaces the whole document (opening a file)
      text: String,
      // Markdown mode: symbols and blank lines visible; otherwise Document mode
      isMarkdownShown: Boolean,
      // typed text stays as typed in Document mode; otherwise typing Markdown formats
      isLiteral: Boolean
    },
    // outline: [{ id, title, level }]; activeSection: index in it of the section with the cursor
    emits: ['toggleMarkdown', 'outline', 'activeSection'],
    data () {
      return {
        view: null,
        // the caret is hidden while the lines are redrawn for the other mode
        isSwitching: false
      }
    },
    watch: {
      'text' () {
        this.view.setState(this.createState())
        if (this.isMarkdownShown) this.alignMarkdownTop()
        this.scheduleOutline()
      },
      'isLiteral' (value) {
        switchLiteral(this.view, value)
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
    },
    created () {
      // not reactive: only what is sent out is
      this.outline = []
      this.outlineKey = null
      this.activeSection = null
      this.scheduleOutline = idleScheduler(() => this.sendOutline())
    },
    beforeUnmount () {
      this.view.destroy()
    },
    methods: {
      createState () {
        return createState(this.text, {
          isMarkdownShown: this.isMarkdownShown,
          isLiteral: this.isLiteral,
          onToggleMarkdown: () => this.$emit('toggleMarkdown'),
          extensions: EditorView.updateListener.of(update => {
            // the tree also changes while the parser goes on in the background
            const isChanged = update.docChanged || syntaxTree(update.state) != syntaxTree(update.startState)
            if (isChanged || update.selectionSet) this.scheduleOutline()
          })
        })
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
      focus () {
        this.view.focus()
      }
    }
  }

</script><style scoped lang='less'>

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
      line-height: 1.6;
    }

    :deep(.cm-content) {
      max-width: 46rem;
      margin: 0 auto;
      padding: 2rem 1rem 50vh;
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
      padding: 0 1rem;
    }

    // Markdown mode (.cm-markdown): the file as it is, in one monospace font, like a plain
    // text field
    :deep(.cm-markdown .cm-scroller) {
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 0.9rem;
      // a little tighter than Document mode (1.6), so the page keeps about the same height
      // and switching jumps less
      line-height: 1.55;
    }

    // the first line's capital letters start at the same height as in Document mode, whatever
    // the fonts and the first block (--markdown-top, measured in markdown-top.js)
    :deep(.cm-markdown .cm-content) {
      padding-top: calc(2rem + var(--markdown-top, 0px));
    }

    // Document mode (.cm-document) reads as plain text. Space between blocks: transparent borders
    // on a block's first and last line (never margins, which CodeMirror cannot measure); the blank
    // lines between blocks are hidden (gaps/index.js). List items sit close together, headings
    // get more room above. In Markdown mode the blank lines themselves are the space.
    :deep(.cm-document) {
      .cm-block-first {
        border-top: 0.4rem solid transparent;
      }

      .cm-block-last {
        border-bottom: 0.4rem solid transparent;
      }

      // nested items and an item's further lines sit inside the item's block, so they get the
      // same space between them as items
      .cm-nested-item,
      .cm-item-line,
      .cm-item-paragraph {
        border-top: 0.2rem solid transparent;
      }

      // list items sit close together; a list as a whole is spaced like a paragraph
      .cm-block--listItem {
        &.cm-after--listItem {
          border-top-width: 0.1rem;
        }

        &.cm-before--listItem {
          border-bottom-width: 0.1rem;
        }
      }

      .cm-block--heading.cm-block-first {
        border-top-width: 1.1rem;
      }

      // nothing above the first block: no space, so the first line stays put when switching modes
      .cm-content > .cm-line:first-child {
        border-top-width: 0;
      }

      // the empty line after Enter, and an empty paragraph (gaps/index.js), are spaced like a
      // paragraph
      .cm-new-block,
      .cm-empty-paragraph {
        border-top: 0.4rem solid transparent;
        border-bottom: 0.4rem solid transparent;
      }

      // the empty line after Shift+Enter is a further line of the block above: no space between
      .cm-block-last:has(+ .cm-new-line) {
        border-bottom-width: 0;
      }

      .cm-new-line {
        border-bottom: 0.4rem solid transparent;
      }

      .cm-block--listItem.cm-before--listItem + .cm-new-line {
        border-bottom-width: 0.1rem;
      }
    }

    // a selected empty paragraph, in both modes (gaps/index.js): a selection-coloured block where
    // its text would start
    :deep(.cm-selected-empty) {
      background: linear-gradient(var(--color--text-selection), var(--color--text-selection)) no-repeat 1rem center / 0.5em 1.2em;
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
      width: 0.9em;
      color: var(--color--text--secondary);
    }

    // a list line hangs: wrapped lines start where its text starts (--hang, syntax/index.js)
    :deep(.cm-hanging) {
      padding-left: calc(1rem + var(--hang));
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

    // a list number starts where a bullet does and is at least as wide (0.9em): numbers line up
    // with each other and with bullets, and single-digit items start their text where bullet
    // items do, at every level
    :deep(.cm-number) {
      display: inline-block;
      min-width: 0.9em;
    }

    // a task's checkbox stands in the bullet's place: round, a little larger than the text, and
    // taking the bullet's width (0.9em, with its margins), so the task's text starts where other
    // items' text does
    :deep(.cm-task-checkbox) {
      appearance: none;
      box-sizing: border-box;
      // form controls have a smaller font of their own; em must be the text's
      font-size: inherit;
      width: 1.1em;
      height: 1.1em;
      // set a little into the margin, for some room before the text; still 0.9em in all
      margin: 0 0.05em 0 -0.25em;
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
      padding-left: calc(1rem + var(--quote-level, 1) * var(--quote-step));
      background: repeating-linear-gradient(to right, var(--color--border--solid) 0 3px, transparent 3px var(--quote-step)) no-repeat 1rem 0 / calc((var(--quote-level, 1) - 1) * var(--quote-step) + 3px) 100%;
      background-clip: padding-box;
      color: var(--color--text--secondary);
    }

    // the rule spans the text column (inside the line's padding), as wide as a line of text
    :deep(.cm-rule-line) {
      background: linear-gradient(var(--color--border--solid), var(--color--border--solid)) no-repeat center / 100% 1px;
      background-origin: content-box;
      background-clip: content-box;
    }

    // dragging blocks (dnd/index.js): a handle of nine dots (3 × 3) fades in left of the block under the
    // mouse; while dragging, the block's lines are an empty gap, the lines it passes slide aside,
    // and a faded copy follows the pointer
    :deep(.cm-dnd-handle) {
      position: absolute;
      top: 0;
      left: 0;
      width: 18px;
      height: 18px;
      background: radial-gradient(circle, var(--color--text--secondary) 0 1.3px, transparent 1.7px) 0 0 / 6px 6px;
      border-radius: 3px;
      opacity: 0;
      pointer-events: none;
      cursor: grab;
      transition: opacity 0.15s;
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
      transition: transform 0.15s ease, opacity 0.15s ease;
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
      transition: transform 0.15s ease;
    }

    :deep(.cm-dnd-gap) {
      opacity: 0;
    }

    :deep(.cm-dnd-preview) {
      position: fixed;
      top: 0;
      left: 0;
      height: auto;
      opacity: 0.6;
      // fading from the block it copies when the drag starts (as long as a drop takes), gently
      // at first
      transition: opacity 0.15s ease-in;
      pointer-events: none;
      z-index: 10;

      .cm-scroller {
        height: auto;
        overflow: visible;
      }

      .cm-content {
        max-width: none;
        margin: 0;
        padding-top: 0;
        padding-bottom: 0;
      }
    }

    // a tighter line than text (1.6): the bigger font would otherwise add empty space under the
    // heading's text, so it would sit further from its paragraph than paragraphs from each other
    :deep(.cm-heading) {
      font-weight: 650;
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
      font-weight: 650;
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
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
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
