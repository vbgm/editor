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
  import { createState, getText, granularityCompartment, appearanceCompartment, appearanceExtensions } from './functions/create-state.js'
  import { granularity as granularityFacet } from './functions/blocks/index.js'

  export default {
    name: 'Editor',
    props: {
      // replaces the whole document (opening a file)
      text: String,
      granularity: String,
      // 'cards' or 'plain'
      appearance: String
    },
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
          appearance: this.appearance
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
      background: var(--color--selection);
    }

    :deep(.cm-line) {
      padding: 0 1rem;
    }

    // space between cards: borders and padding on a block's first and last line (never margins,
    // which CodeMirror cannot measure); the 3px border is the gap between cards (cardGap in
    // card-layers.js). Lines carry no paint, so changing a card never repaints text.
    :deep(.cm-block-first) {
      border-top: 3px solid transparent;
      padding-top: 0.45rem;
    }

    :deep(.cm-block-last) {
      border-bottom: 3px solid transparent;
      padding-bottom: 0.45rem;
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
