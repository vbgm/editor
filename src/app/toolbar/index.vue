<!--
Temporary development toolbar: pick a test document, open a local file, show the outline, set options, switch between Document
and Markdown mode, turn literal typing on or off, show the stats, run the benchmark.
Buttons do not take the keyboard focus (mousedown.prevent): the editor keeps the cursor, so
shortcuts work right after clicking one. Replaced by the native menu and title-bar buttons later.
-->
<template>

  <div class='toolbar'>
    <select
      :value='documentName'
      @change='$emit(`open`, $event.target.value)'
    >
      <option
        v-for='name in documentNames'
        :key='name'
        :value='name'
      >
        {{ name }}
      </option>
    </select>

    <label class='button'>
      Open file…
      <input
        type='file'
        accept='.md,.markdown,.txt,text/markdown,text/plain'
        @change='openFile'
      >
    </label>

    <button
      class='button'
      :class='{selected: isSidebarShown}'
      title='Outline: the headings in a sidebar (Ctrl+Cmd+S)'
      @mousedown.prevent=''
      @click='$emit(`toggleSidebar`)'
    >
      Outline
    </button>
    <!-- a menu of checkboxes; fixed, so the toolbar's own scrolling does not clip it -->
    <details
      ref='options'
      class='menu'
      @toggle='toggleOptions'
    >
      <summary
        ref='optionsButton'
        class='button'
        @mousedown.prevent=''
      >
        Options
      </summary>
      <div
        class='items'
        :style='optionsPlace'
      >
        <label
          class='item'
          title='Opening or closing the outline moves the text aside; otherwise the outline is drawn over the margin and the text moves only where there is too little room'
          @mousedown.prevent=''
        >
          <input
            type='checkbox'
            :checked='isTextSliding'
            @change='$emit(`toggleTextSliding`)'
          >
          Slide text with sidebar
        </label>
      </div>
    </details>
    <button
      class='button'
      :class='{selected: isMarkdownShown}'
      title='Markdown mode: the file as it is (Cmd+Shift+M)'
      @mousedown.prevent=''
      @click='$emit(`toggleMarkdown`)'
    >
      Markdown
    </button>
    <button
      class='button'
      :class='{selected: isLiteral}'
      title='Literal: typed text stays as typed in Document mode; Markdown typed in is escaped, not formatted'
      @mousedown.prevent=''
      @click='$emit(`toggleLiteral`)'
    >
      Literal
    </button>

    <div class='spacer' />

    <span
      v-if='progress'
      class='label'
    >
      {{ progress }}
    </span>
    <button
      class='button'
      :class='{selected: isStatsShown}'
      title='Typing latency and benchmark results'
      @mousedown.prevent=''
      @click='$emit(`toggleStats`)'
    >
      Stats
    </button>
    <button
      class='button'
      :disabled='!!progress'
      @mousedown.prevent=''
      @click='$emit(`benchmark`)'
    >
      Run benchmark
    </button>
  </div>

</template><script>

  export default {
    name: 'Toolbar',
    props: {
      documentNames: Array,
      documentName: String,
      isMarkdownShown: Boolean,
      isLiteral: Boolean,
      isStatsShown: Boolean,
      isSidebarShown: Boolean,
      isTextSliding: Boolean,
      progress: String
    },
    emits: ['toggleSidebar', 'toggleTextSliding', 'open', 'openFile', 'toggleMarkdown', 'toggleLiteral', 'toggleStats', 'benchmark'],
    data () {
      return {
        optionsPlace: null
      }
    },
    beforeUnmount () {
      document.removeEventListener('pointerdown', this.closeOptions, true)
    },
    methods: {
      // open: placed under its button, closed by a press anywhere outside
      toggleOptions () {
        if (this.$refs.options.open) {
          const rect = this.$refs.optionsButton.getBoundingClientRect()
          this.optionsPlace = { top: `${rect.bottom + 4}px`, left: `${rect.left}px` }
          document.addEventListener('pointerdown', this.closeOptions, true)
        } else {
          document.removeEventListener('pointerdown', this.closeOptions, true)
        }
      },
      closeOptions (event) {
        if (!this.$refs.options.contains(event.target)) this.$refs.options.open = false
      },
      async openFile (event) {
        const file = event.target.files[0]
        if (!file) return
        // ignoreBOM keeps a byte order mark in the text, so saving writes it back
        const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await file.arrayBuffer())
        this.$emit('openFile', { name: file.name, text })
        event.target.value = ''
      }
    }
  }

</script><style scoped lang='less'>

  .toolbar {
    flex: 0 0 auto;
    // scrolls on its own in a narrow window
    overflow-x: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    background: var(--color--background--secondary);
    border-bottom: 1px solid var(--color--border--solid);

    > .group {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-left: 0.5rem;
    }

    > .spacer {
      flex: 1 1 auto;
    }

    .label {
      color: var(--color--text--secondary);
      margin-right: 0.25rem;
    }

    select,
    .button {
      font: inherit;
      color: var(--color--text--primary);
      background: var(--color--background);
      border: 1px solid var(--color--border--solid);
      border-radius: 0.35rem;
      padding: 0.2rem 0.55rem;
      cursor: pointer;
    }

    .menu {
      > summary {
        list-style: none;
        user-select: none;
        -webkit-user-select: none;

        &::-webkit-details-marker {
          display: none;
        }
      }

      &[open] > summary {
        border-color: var(--color--selected--border);
        background: var(--color--selection);
      }

      > .items {
        position: fixed;
        z-index: 20;
        display: flex;
        flex-direction: column;
        padding: 0.3rem 0;
        background: var(--color--background);
        border: 1px solid var(--color--border--solid);
        border-radius: 0.4rem;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      }

      .item {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0.75rem 0.25rem 0.5rem;
        white-space: nowrap;
        cursor: default;

        > input {
          margin: 0;
        }
      }
    }

    .button {
      &.selected {
        border-color: var(--color--selected--border);
        background: var(--color--selection);
      }

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }

      > input {
        display: none;
      }
    }
  }

</style>
