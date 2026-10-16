<!--
The window's title bar where the app draws it (macOS: the native one is laid over the page,
tauri.macos.conf.json): a row as high as a plain title bar (28 px), above the toolbar. The
window's buttons are macOS's own, at the left; the button that hides and shows the toolbar is at
the right, a grey circle a little larger than the window's buttons, on their middle line. The
title (the file name, and "— Edited") is the app's, centred in the window (macOS would put its
own right after the buttons; it is hidden, src-tauri/src/title.rs). The row and the title move
the window, and a double click zooms it (data-tauri-drag-region). Not drawn in fullscreen, where
macOS shows its buttons and its own title in its own bar (App).
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
      title: String,
      isToolbarShown: Boolean
    },
    emits: ['toggleToolbar']
  }

</script><style scoped lang='less'>

  // macOS's own title bar, on whose middle line its buttons are (App's titleBarHeight)
  @height: 28px;
  // kept clear on both sides of the title, so it is centred in the window and never under the
  // window's buttons (as wide as they are, from the window's left edge)
  @title-margin: 76px;

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

  // as macOS draws a window's title, on the circle's line (as macOS's own on its buttons'); centred
  // in the window; cut short with "…" when it does not fit
  .title {
    position: absolute;
    top: calc(50% + 2px);
    left: @title-margin;
    right: @title-margin;
    transform: translateY(-50%);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--color--text--secondary);
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
