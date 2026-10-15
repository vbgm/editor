<!--
The raw Markdown of the file, in a plain textarea (the "Markdown" button, Cmd+Shift+M).
Uncontrolled: Vue sets the text once and never re-renders while typing; read it with getText().
Line breaks are '\n' here; the editor puts the file's own line breaks back.
-->
<template>

  <div class='markdown'>
    <textarea
      ref='textarea'
      :value='text'
      spellcheck='false'
      @keydown.meta.shift.m.prevent='$emit(`toggleMarkdown`)'
      @keydown.ctrl.shift.m.prevent='$emit(`toggleMarkdown`)'
    />
  </div>

</template><script>

  export default {
    name: 'MarkdownSource',
    props: {
      text: String
    },
    emits: ['toggleMarkdown'],
    mounted () {
      this.$refs.textarea.focus()
      this.$refs.textarea.setSelectionRange(0, 0)
    },
    methods: {
      getText () {
        return this.$refs.textarea.value
      }
    }
  }

</script><style scoped lang='less'>

  .markdown {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;

    > textarea {
      flex: 1 1 auto;
      box-sizing: border-box;
      width: 100%;
      max-width: 46rem;
      margin: 0 auto;
      padding: 2rem 2rem 50vh;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 0.9rem;
      line-height: 1.6;
      color: var(--color--text--primary);
      background: transparent;
      border: none;
      outline: none;
      resize: none;

      &::selection {
        background: var(--color--text-selection);
        color: var(--color--text-selection--text);
      }
    }
  }

</style>
