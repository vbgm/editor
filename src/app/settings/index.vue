<!--
The settings sidebar (right): for now the development controls that were in the toolbar: pick a
sample document, open a file, switch between Document and Markdown mode, turn literal typing on
or off, how the sidebars move the text, show the stats, run the benchmark.
Controls do not take the keyboard focus (mousedown.prevent): the editor keeps the cursor, so
shortcuts work right after clicking one. Its top is under the toolbar (--top-inset).
-->
<template>

  <div class='settings'>
    <section class='section'>
      <h2 class='title'>
        Document
      </h2>

      <!-- the open document, or a sample to open -->
      <select
        class='select'
        :value='documentName'
        @change='openSample'
      >
        <option
          v-if='!sampleNames.includes(documentName)'
          :value='documentName'
          disabled
        >
          {{ documentName }}
        </option>
        <option
          v-for='name in sampleNames'
          :key='name'
          :value='name'
        >
          {{ name }}
        </option>
      </select>

      <button
        class='button'
        title='Open a file (Cmd+O)'
        @mousedown.prevent=''
        @click='$emit(`openFile`)'
      >
        Open file…
      </button>
    </section>

    <section class='section'>
      <h2 class='title'>
        Editing
      </h2>

      <label
        v-for='option in options'
        :key='option.event'
        class='option'
        :title='option.title'
        @mousedown.prevent=''
      >
        <input
          type='checkbox'
          :checked='option.isChecked'
          @change='$emit(option.event)'
        >
        {{ option.label }}
      </label>
    </section>

    <section class='section'>
      <h2 class='title'>
        Benchmark
      </h2>

      <button
        class='button'
        :disabled='!!progress'
        @mousedown.prevent=''
        @click='$emit(`benchmark`)'
      >
        Run benchmark
      </button>
      <span
        v-if='progress'
        class='progress'
      >
        {{ progress }}
      </span>
    </section>
  </div>

</template><script>

  export default {
    name: 'Settings',
    props: {
      sampleNames: Array,
      documentName: String,
      isMarkdownShown: Boolean,
      isLiteral: Boolean,
      isStatsShown: Boolean,
      isTextSliding: Boolean,
      progress: String
    },
    emits: ['openSample', 'openFile', 'toggleMarkdown', 'toggleLiteral', 'toggleTextSliding', 'toggleStats', 'benchmark'],
    computed: {
      options () {
        return [
          {
            event: 'toggleMarkdown',
            label: 'Markdown mode',
            title: 'Markdown mode: the file as it is (Cmd+Shift+M)',
            isChecked: this.isMarkdownShown
          },
          {
            event: 'toggleLiteral',
            label: 'Literal typing',
            title: 'Literal: typed text stays as typed in Document mode; Markdown typed in is escaped, not formatted',
            isChecked: this.isLiteral
          },
          {
            event: 'toggleTextSliding',
            label: 'Slide text with sidebars',
            title: 'Opening or closing a sidebar moves the text aside; otherwise the sidebar is drawn over the margin and the text moves only where there is too little room',
            isChecked: this.isTextSliding
          },
          {
            event: 'toggleStats',
            label: 'Show stats',
            title: 'Typing latency and benchmark results',
            isChecked: this.isStatsShown
          }
        ]
      }
    },
    methods: {
      // the list shows the open document until it is replaced: opening may be cancelled (unsaved
      // edits), and then nothing else changes it back
      openSample (event) {
        this.$emit('openSample', event.target.value)
        event.target.value = this.documentName
      }
    }
  }

</script><style scoped lang='less'>

  .settings {
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: calc(0.5rem + var(--top-inset, 0px)) 0 0.5rem;
    font-size: 0.85rem;
    user-select: none;
    -webkit-user-select: none;
  }

  .section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem 0.75rem;

    & + .section {
      border-top: 1px solid var(--color--border--solid);
    }
  }

  .title {
    margin: 0 0 0.1rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color--text--secondary);
  }

  .select,
  .button {
    font: inherit;
    color: var(--color--text--primary);
    background: var(--color--background);
    border: 1px solid var(--color--border--solid);
    border-radius: var(--radius--control);
    padding: 0.2rem 0.55rem;
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }

  .select {
    max-width: 100%;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: default;

    > input {
      margin: 0;
    }
  }

  .progress {
    color: var(--color--text--secondary);
    font-variant-numeric: tabular-nums;
  }

</style>
