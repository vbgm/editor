<!--
CodeMirror owns everything inside the root element; Vue never touches it.
The document is not mirrored into Vue on every keystroke: read it with getText().
-->
<template>

  <div
    ref='root'
    class='editor'
  />

</template><script>

  // npm packages
  import { markRaw } from 'vue'
  import { EditorView } from '@codemirror/view'
  // local functions
  import { createState, getText, granularityCompartment, appearanceCompartment, appearanceExtensions, markdownCompartment, markdownVisibilityExtensions } from './functions/create-state.js'
  import { granularity as granularityFacet } from './functions/blocks/index.js'

  export default {
    name: 'Editor',
    props: {
      // replaces the whole document (opening a file)
      text: String,
      granularity: String,
      // 'cards', 'styled' or 'plain'
      appearance: String,
      // Markdown syntax shown as it is in the file
      isMarkdownShown: Boolean
    },
    emits: ['toggleMarkdown'],
    data () {
      return {
        view: null
      }
    },
    watch: {
      'text' () {
        this.view.setState(this.createState())
      },
      'granularity' (value) {
        this.view.dispatch({
          effects: granularityCompartment.reconfigure(granularityFacet.of(value))
        })
      },
      'appearance' (value) {
        this.view.dispatch({
          effects: appearanceCompartment.reconfigure(appearanceExtensions(value))
        })
      },
      'isMarkdownShown' (value) {
        this.view.dispatch({
          effects: markdownCompartment.reconfigure(markdownVisibilityExtensions(value))
        })
      }
    },
    mounted () {
      // markRaw: the view must not become a reactive proxy
      this.view = markRaw(new EditorView({
        state: this.createState(),
        parent: this.$refs.root
      }))
      this.view.focus()
    },
    beforeUnmount () {
      this.view.destroy()
    },
    methods: {
      createState () {
        return createState(this.text, {
          granularity: this.granularity,
          appearance: this.appearance,
          isMarkdownShown: this.isMarkdownShown,
          onToggleMarkdown: () => this.$emit('toggleMarkdown')
        })
      },
      getText () {
        return getText(this.view.state)
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

    :deep(.cm-content ::selection) {
      background: var(--color--text-selection);
      color: var(--color--text-selection--text);
    }

    :deep(.cm-line) {
      padding: 0 1rem;
    }

    // space between cards: borders and padding on a block's first and last line (never margins,
    // which CodeMirror cannot measure). With Markdown hidden there are no blank lines between
    // blocks, so the transparent borders are the whole gap between cards (card-layers.js reads
    // their width). Lines carry no paint, so changing a card never repaints text.
    :deep(.cm-block-first) {
      border-top: 0.3rem solid transparent;
      padding-top: 0.45rem;
    }

    :deep(.cm-block-last) {
      border-bottom: 0.3rem solid transparent;
      padding-bottom: 0.45rem;
    }

    // Markdown hidden: no cards, the page reads as plain text. Blocks are apart by the space
    // between paragraphs, list items sit close together, headings get more room above.
    :deep(.cm-markdown-hidden) {
      .cm-block-first {
        border-top-width: 0.4rem;
        padding-top: 0;
      }

      .cm-block-last {
        border-bottom-width: 0.4rem;
        padding-bottom: 0;
      }

      .cm-block--listItem {
        &.cm-block-first {
          border-top-width: 0.1rem;
        }

        &.cm-block-last {
          border-bottom-width: 0.1rem;
        }
      }

      .cm-block--heading.cm-block-first {
        border-top-width: 1.1rem;
      }
    }

    // the cards themselves: boxes in layers behind the text (card-layers.js)
    :deep(.cm-cards > .cm-card) {
      box-sizing: border-box;
      background: var(--color--card);
      border: 1px solid var(--color--card--border);
      border-radius: 0.6rem;
    }

    :deep(.cm-cards-active > .cm-card--active) {
      box-sizing: border-box;
      border: 1px solid var(--color--card--border-active);
      border-radius: 0.6rem;
    }

    // Markdown hidden (syntax/index.js): lines that only hold syntax take no space,
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
  }

</style>
