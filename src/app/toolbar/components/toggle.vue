<!--
The button that hides the toolbar (Cmd+Alt+T) and shows it again. In the toolbar, an arrow:
pointing down while the toolbar shows, left while it is hidden, turning a quarter from one to the
other as the toolbar slides. In the title bar where the app draws its own (macOS),
isCircle: a circle a little larger than the window's buttons, in the icons' colour: only its
outline while the toolbar shows, filled while it is hidden. The parent styles the button
as its other buttons. It does not take the keyboard focus (mousedown.prevent).
-->
<template>

  <button
    :title='isShown ? `Hide the toolbar (Cmd+Alt+T)` : `Show the toolbar (Cmd+Alt+T)`'
    @mousedown.prevent=''
    @click='$emit(`toggle`)'
  >
    <span
      v-if='isCircle'
      class='circle'
      :class='{closed: !isShown}'
    />

    <span
      v-else
      class='glyph'
      :class='{closed: !isShown}'
    >
      <Icon name='angle' />
    </span>
  </button>

</template><script>

  // components
  import Icon from '/foundation/icon/index.vue'

  export default {
    name: 'Toggle',
    components: {
      Icon
    },
    props: {
      // the toolbar
      isShown: Boolean,
      // a circle instead of the arrow (macOS's title bar)
      isCircle: Boolean
    },
    emits: ['toggle']
  }

</script><style scoped lang='less'>

  // as the toolbar's icons; the arrow (angle) points down, turned to the left when closed
  .glyph {
    display: block;
    width: 1.3rem;
    height: 1.3rem;
    // as the toolbar slides (App's toolbarSlide)
    transition: transform var(--toolbar-slide-duration, 0.3s) var(--toolbar-slide-easing, ease);

    &.closed {
      transform: rotate(90deg);
    }
  }

  // 16 px (the window's buttons are 12), in the icons' colour (the parent's, currentColor): its
  // outline only while the toolbar shows, as thick as the icons' strokes (9 of 128 at 1.3rem);
  // filled while it is hidden
  .circle {
    display: block;
    box-sizing: border-box;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: transparent;
    box-shadow: inset 0 0 0 calc(1.3rem * 9 / 128) currentColor;
    transition: background-color var(--toolbar-slide-duration, 0.3s) var(--toolbar-slide-easing, ease);

    &.closed {
      background-color: currentColor;
    }
  }

</style>
