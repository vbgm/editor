<!--
A native textarea with the same text, as the speed baseline to compare the editor with.
Uncontrolled: Vue sets the text once and never re-renders while typing; read it with getText().
-->
<template>

  <div class='textarea'>
    <textarea
      ref='textarea'
      :value='text'
      spellcheck='false'
    />
  </div>

</template><script>

  export default {
    name: 'PlainTextarea',
    props: {
      text: String
    },
    mounted () {
      this.$refs.textarea.focus()
    },
    methods: {
      getText () {
        return this.$refs.textarea.value
      }
    }
  }

</script><style scoped lang='less'>

  .textarea {
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
      font: inherit;
      line-height: 1.6;
      color: var(--color--text--primary);
      background: transparent;
      border: none;
      outline: none;
      resize: none;
    }
  }

</style>
