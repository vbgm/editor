<!--
The window's title bar where the app draws it (macOS: the native one is laid over the page, its
own title hidden, tauri.macos.conf.json): a row as high as a plain title bar (28 px), above
the toolbar. The window's buttons are at its left, where macOS puts them; the title (the file
name, and "— Edited") in the middle of the window, not after the buttons as macOS would have it;
the arrow that hides and shows the toolbar at the right, on the buttons' middle line. Its empty
parts move the window, and a double click zooms it (data-tauri-drag-region).
-->
<template>

  <div
    class='title-bar'
    data-tauri-drag-region
  >
    <span
      class='title'
      data-tauri-drag-region
    >
      {{ title }}
    </span>

    <Toggle
      class='toggle'
      :isShown='isToolbarShown'
      @toggle='$emit(`toggleToolbar`)'
    />
  </div>

</template><script>

  // components
  import Toggle from '../toolbar/components/toggle.vue'

  export default {
    name: 'TitleBar',
    components: {
      Toggle
    },
    props: {
      title: String,
      isToolbarShown: Boolean
    },
    emits: ['toggleToolbar']
  }

</script><style scoped lang='less'>

  // macOS's own title bar, on whose middle line its buttons are (App's titleBarHeight)
  @height: 28px;
  // the window's buttons at the left, and as much room at the right: the title stays centred
  @buttons-width: 5rem;
  @fade: 0.3s ease;

  .title-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    // above the toolbar, which slides up under it when hidden
    z-index: 3;
    height: @height;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 @buttons-width;
    background: var(--color--background);
    user-select: none;
    -webkit-user-select: none;
  }

  // as macOS draws a window's title
  .title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 600;
    color: var(--color--text--secondary);
  }

  // as the toolbar's buttons, on the window buttons' middle line (a little below the row's)
  .toggle {
    position: absolute;
    top: calc(50% + 2px);
    right: 0.25rem;
    transform: translateY(-50%);
    appearance: none;
    display: flex;
    margin: 0;
    padding: 0.2rem 0.5rem;
    border: 0;
    background: none;
    color: var(--color--text--secondary);
    cursor: pointer;
    transition: color @fade;

    &:hover {
      color: var(--color--text--secondary--hover);
    }

    &:active {
      color: var(--color--text--secondary--active);
      transition: none;
    }
  }

</style>
