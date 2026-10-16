<!--
The arrow that hides the toolbar (Cmd+Alt+T) and shows it again: down while the toolbar shows,
up while it is hidden, morphing from one to the other as the toolbar slides. In the toolbar,
or in the title bar where the app draws its own (macOS); the parent styles the button as its
other buttons. It does not take the keyboard focus (mousedown.prevent).
-->
<template>

  <button
    :title='isShown ? `Hide the toolbar (Cmd+Alt+T)` : `Show the toolbar (Cmd+Alt+T)`'
    @mousedown.prevent=''
    @click='$emit(`toggle`)'
  >
    <span class='glyph'>
      <Icon
        name='angle'
        :value='angle'
      />
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
      isShown: Boolean
    },
    emits: ['toggle'],
    data () {
      return {
        // 0 down, 1 up (morph)
        angle: this.isShown ? 0 : 1
      }
    },
    watch: {
      'isShown' (isShown) {
        this.morph(isShown ? 0 : 1)
      }
    },
    beforeUnmount () {
      cancelAnimationFrame(this.frame)
    },
    methods: {
      // The arrow morphs down while the toolbar shows, up while it hides, as long as
      // the toolbar slides and with the same easing. Safari cannot animate a path's shape in
      // CSS: the path is drawn anew each frame, its progress eased by a target-less animation.
      morph (to) {
        cancelAnimationFrame(this.frame)
        const from = this.angle
        const timing = new Animation(new KeyframeEffect(null, null, { duration: 300, easing: 'ease' }))
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

</style>
