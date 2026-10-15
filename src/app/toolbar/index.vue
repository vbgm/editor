<!--
Temporary development toolbar: pick a test document, open a local file, show the raw Markdown,
run the benchmark.
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
      :class='{selected: isMarkdownShown}'
      title='Show the raw Markdown (Cmd+Shift+M)'
      @mousedown.prevent=''
      @click='$emit(`toggleMarkdown`)'
    >
      Markdown
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
      progress: String
    },
    emits: ['open', 'openFile', 'toggleMarkdown', 'benchmark'],
    methods: {
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
