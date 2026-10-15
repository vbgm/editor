<!--
Browser-native editing with the same text, as speed baselines to compare the editor with:
- 'textarea': a native textarea
- 'contenteditable': a plain editable element without CodeMirror (the kind of element
  CodeMirror edits in), to see what the browser alone costs
Uncontrolled: Vue sets the text once and never re-renders while typing; read it with getText().
-->
<template>

  <div class='native'>
    <textarea
      v-if='kind == `textarea`'
      ref='input'
      class='input'
      :value='text'
      spellcheck='false'
    />
    <div
      v-else
      ref='input'
      class='input editable'
      contenteditable='plaintext-only'
      spellcheck='false'
    />
  </div>

</template><script>

  export default {
    name: 'NativeEditor',
    props: {
      // 'textarea' or 'contenteditable'
      kind: String,
      text: String
    },
    mounted () {
      // set once, outside Vue's rendering
      if (this.kind == 'contenteditable') this.$refs.input.textContent = this.text
      this.$refs.input.focus()
    },
    methods: {
      getText () {
        // textContent: plaintext-only editing keeps line breaks as text; innerText adds extra ones
        return this.kind == 'textarea' ? this.$refs.input.value : this.$refs.input.textContent
      }
    }
  }

</script><style scoped lang='less'>

  .native {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    overflow-y: auto;

    > .input {
      flex: 1 1 auto;
      box-sizing: border-box;
      width: 100%;
      max-width: 46rem;
      margin: 0 auto;
      padding: 2rem 2rem 50vh;
      font: inherit;
      line-height: 1.6;
      color: var(--color--text--primary);
      background: transparent;
      border: none;
      outline: none;
      resize: none;
    }

    > .editable {
      align-self: flex-start;
      min-height: 100%;
      white-space: pre-wrap;
      overflow-wrap: break-word;
    }
  }

</style>
