<!--
The left sidebar, as Ordner's (layouts/asides.vue):
- showing and hiding: its column opens or closes in 0.3 s, while its content slides in from a
  third of its width to the left and fades in (and back out when hiding)
- its right edge is a 1 px line; a 7 px wide handle over it changes the width by dragging, live,
  between minWidth and maxWidth (the column's width only animates while showing or hiding)
-->
<template>

  <div
    class='sidebar'
    :class='{toggling: isToggling, shown: isShown}'
    :style='{width: `${isShown ? width : 0}px`}'
  >
    <div class='clip'>
      <div
        class='content'
        :style='{width: `${width}px`, transform: isShown ? null : `translateX(${-width / 3}px)`}'
      >
        <slot />
      </div>
    </div>

    <div
      v-if='isShown'
      class='handle'
      @pointerdown='resizeStart'
    />
  </div>

</template><script>

  const duration = 300
  const minWidth = 160
  const maxWidth = 400

  export default {
    name: 'Sidebar',
    props: {
      isShown: Boolean,
      width: Number
    },
    // resize: the new width, while dragging the handle
    emits: ['resize'],
    data () {
      return {
        isToggling: false
      }
    },
    watch: {
      'isShown' () {
        this.isToggling = true
        clearTimeout(this.toggleTimer)
        this.toggleTimer = setTimeout(() => { this.isToggling = false }, duration)
      }
    },
    beforeUnmount () {
      clearTimeout(this.toggleTimer)
    },
    methods: {
      resizeStart (event) {
        if (event.button != 0) return
        event.preventDefault()
        const handle = event.target
        handle.setPointerCapture(event.pointerId)
        const root = document.documentElement
        root.classList.add('is-resizing')
        const left = this.$el.getBoundingClientRect().left
        const move = moveEvent => {
          const width = Math.round(moveEvent.clientX - left + 2)
          this.$emit('resize', Math.min(Math.max(width, minWidth), maxWidth))
        }
        const end = () => {
          root.classList.remove('is-resizing')
          handle.removeEventListener('pointermove', move)
          handle.removeEventListener('pointerup', end)
          handle.removeEventListener('pointercancel', end)
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', end)
        handle.addEventListener('pointercancel', end)
      }
    }
  }

</script><style scoped lang='less'>

  .sidebar {
    flex: 0 0 auto;
    position: relative;
    // the handle reaches over the editor's edge
    z-index: 1;

    &.toggling {
      transition: width 0.3s ease;
    }

    > .clip {
      position: absolute;
      inset: 0;
      overflow: hidden;
    }

    .content {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      box-sizing: border-box;
      background: var(--color--background--secondary);
      // the 1 px right edge
      box-shadow: inset -1px 0 0 var(--color--border--solid);
      opacity: 0;
      transition: transform 0.3s ease, opacity 0.3s ease;
    }

    &.shown .content {
      opacity: 1;
    }

    > .handle {
      position: absolute;
      top: 0;
      right: -3px;
      width: 7px;
      height: 100%;
      cursor: ew-resize;
      z-index: 100;
    }
  }

</style>
