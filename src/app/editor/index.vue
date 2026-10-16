<!--
CodeMirror owns everything inside the root element; Vue never touches it.
The document is not mirrored into Vue on every keystroke: read it with getText().
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
  // local functions
  import { createState, getText, switchMode, switchLiteral } from './functions/create-state.js'
  import { markdownTopShift } from './functions/markdown-top.js'

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
    emits: ['toggleMarkdown'],
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
      },
      'isLiteral' (value) {
        switchLiteral(this.view, value)
      },
      'isMarkdownShown' (value) {
        // Safari keeps drawing its caret where it was in the old layout, even though the cursor
        // is at the same place in the text (so the editor does not touch the browser's selection):
        // hide the caret, switch, and once the new lines are painted move the cursor away and
        // back, so the browser's selection is written and the caret drawn anew
        this.isSwitching = true
        if (value) this.alignMarkdownTop()
        switchMode(this.view, value)
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const { view } = this
          const selection = view.state.selection
          const head = selection.main.head
          // within the same line: a neighbouring line could be a hidden blank one
          const line = view.state.doc.lineAt(head)
          const away = head > line.from ? head - 1 : head < line.to ? head + 1 : null
          view.focus()
          if (away != null) view.dispatch({ selection: { anchor: away } })
          view.dispatch({ selection })
          this.isSwitching = false
        }))
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
    },
    beforeUnmount () {
      this.view.destroy()
    },
    methods: {
      createState () {
        return createState(this.text, {
          isMarkdownShown: this.isMarkdownShown,
          isLiteral: this.isLiteral,
          onToggleMarkdown: () => this.$emit('toggleMarkdown')
        })
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

      // the empty line after Enter (gaps/index.js) is spaced like a paragraph
      .cm-new-block {
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

    // a list item's further line: indented as wide as the item's bullet or number (syntax/index.js)
    :deep(.cm-list-indent) {
      visibility: hidden;
    }

    :deep(.cm-task-checkbox) {
      margin: 0 0.35em 0 0;
      vertical-align: -0.1em;
      cursor: pointer;
    }

    :deep(.cm-quote-line) {
      box-shadow: inset 3px 0 0 var(--color--border--solid);
      color: var(--color--text--secondary);
    }

    :deep(.cm-rule-line) {
      background: linear-gradient(var(--color--border--solid), var(--color--border--solid)) no-repeat center / 100% 1px;
    }

    :deep(.cm-heading) {
      font-weight: 650;
      text-decoration: none;
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
