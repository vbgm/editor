<!--
The button that hides the toolbar (Cmd+Alt+T) and shows it again. In the toolbar, an arrow:
pointing down while the toolbar is hidden, morphing to point up as it shows (and back as it
hides), as the toolbar slides. In the title bar where the app draws its own (macOS),
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
    >
      <Icon
        name='angle'
        :value='angle'
      />
    </span>
  </button>

</template><script>

  // components
  import Icon from '/foundation/icon/index.vue'
  // local functions
  import { slideTiming } from '../../functions/slides.js'

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
    emits: ['toggle'],
    data () {
      return {
        // the arrow: 0 down, 1 up (morph)
        angle: this.isShown ? 1 : 0
      }
    },
    watch: {
      'isShown' (isShown) {
        this.morph(isShown ? 1 : 0)
      }
    },
    beforeUnmount () {
      cancelAnimationFrame(this.frame)
    },
    methods: {
      // The arrow morphs up while the toolbar shows, down while it hides, as the toolbar slides.
      // Safari cannot animate a path's shape in CSS: the path is drawn anew each frame, its
      // progress eased by a target-less animation.
      morph (to) {
        cancelAnimationFrame(this.frame)
        const from = this.angle
        const timing = new Animation(new KeyframeEffect(null, null, slideTiming))
        timing.play()
        const step = () => {
          const { progress } = timing.effect.getComputedTiming()
          // done: no progress any more
          this.angle = progress == null ? to : from + (to - from) * progress
          if (progress != null) this.frame = requestAnimationFrame(step)
        }
        step()
      }
    }
  }

</script><style scoped lang='less'>

  // as the toolbar's icons
  .glyph {
    display: block;
    width: 1.3rem;
    height: 1.3rem;
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
