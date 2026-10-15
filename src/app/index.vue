<template>

  <div class='app'>
    <div class='placeholder'>
      Editor
    </div>
  </div>

</template><script>

  export default {
    name: 'App'
  }

</script><style scoped lang='less'>

  .app {
    height: 100%;
    display: flex;

    > .placeholder {
      margin: auto;
      color: var(--color--text--secondary);
    }
  }

</style>
