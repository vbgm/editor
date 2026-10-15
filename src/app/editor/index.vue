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
  import { createState, getText, granularityCompartment } from './functions/create-state.js'
  import { granularity as granularityFacet } from './functions/blocks/index.js'
  import keystrokeLatency from './functions/keystroke-latency.js'

  export default {
    name: 'Editor',
    props: {
      // replaces the whole document (opening a file)
      text: String,
      granularity: String
    },
    emits: ['keystroke'],
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
          extensions: keystrokeLatency(ms => this.$emit('keystroke', ms))
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

    :deep(.cm-cursor) {
      border-left-color: var(--color--text--primary);
    }

    :deep(.cm-selectionBackground) {
      background: var(--color--selection) !important;
    }

    :deep(.cm-line) {
      padding: 0 1rem;
    }

    // cards: drawn with line decorations; borders and padding (never margins,
    // which CodeMirror cannot measure) make the edges and the space between cards
    :deep(.cm-block) {
      background: var(--color--card);
      background-clip: padding-box;
      box-shadow: inset 1px 0 0 var(--color--card--border), inset -1px 0 0 var(--color--card--border);
      transition: box-shadow 0.15s ease;

      &.cm-block-first {
        border-top: 3px solid transparent;
        padding-top: 0.45rem;
        border-top-left-radius: 0.6rem;
        border-top-right-radius: 0.6rem;
        box-shadow: inset 1px 0 0 var(--color--card--border), inset -1px 0 0 var(--color--card--border), inset 0 1px 0 var(--color--card--border);
      }

      &.cm-block-last {
        border-bottom: 3px solid transparent;
        padding-bottom: 0.45rem;
        border-bottom-left-radius: 0.6rem;
        border-bottom-right-radius: 0.6rem;
        box-shadow: inset 1px 0 0 var(--color--card--border), inset -1px 0 0 var(--color--card--border), inset 0 -1px 0 var(--color--card--border);
      }

      &.cm-block-first.cm-block-last {
        box-shadow: inset 0 0 0 1px var(--color--card--border);
      }

      &.cm-block--active {
        --color--card--border: var(--color--card--border-active);
      }

      // headings and rules read as structure, not as content cards
      &.cm-block--heading,
      &.cm-block--frontmatter,
      &.cm-block--rule {
        --color--card--border: transparent;
        background: transparent;
      }
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
