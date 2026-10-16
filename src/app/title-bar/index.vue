<!--
The window's title bar where the app draws it (macOS: the native one is laid over the page,
tauri.macos.conf.json): a row as high as a plain title bar (28 px), above the toolbar. The
window's buttons and its title (the file name, and "— Edited") are macOS's own, at the left; the
button that hides and shows the toolbar is at the right, a grey circle a little larger than the
window's buttons, on their middle line. Its empty parts move the window, and a double click
zooms it (data-tauri-drag-region). Not drawn in fullscreen, where macOS shows its buttons and
title in its own bar (App).
-->
<template>

  <div
    class='title-bar'
    data-tauri-drag-region
  >
    <Toggle
      class='toggle'
      :isShown='isToolbarShown'
      isCircle
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
      isToolbarShown: Boolean
    },
    emits: ['toggleToolbar']
  }

</script><style scoped lang='less'>

  // macOS's own title bar, on whose middle line its buttons are (App's titleBarHeight)
  @height: 28px;

  .title-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    // above the toolbar, which slides up under it when hidden
    z-index: 3;
    height: @height;
    background: var(--color--background);
    user-select: none;
    -webkit-user-select: none;
  }

  // the window's buttons' mirror image: on their middle line (a little below the row's), its
  // edge about as far from the window's right edge as theirs from the left
  .toggle {
    position: absolute;
    top: calc(50% + 2px);
    right: 4px;
    transform: translateY(-50%);
    appearance: none;
    display: flex;
    margin: 0;
    padding: 4px;
    border: 0;
    background: none;
    // the circle's: the toolbar icons' colour, fainter (mixed into the page's, not see-through,
    // so its edge and its filling are the same colour); the same under the mouse
    color: color-mix(in srgb, var(--color--text--secondary) 40%, var(--color--background));
    cursor: pointer;
  }

</style>
