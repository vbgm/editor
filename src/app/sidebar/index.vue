<!--
A layout with a sidebar on the left (default slot) and the main part beside it (center slot), as
Ordner's (layouts/asides.vue):
- showing and hiding: the center slides from where its text was to where it lands, and the
  sidebar slides in as far as the text moves, fading in, so its edge and the text move as one
  (and back out when hiding), in 0.3 s
- isTextSliding off (the default): the sidebar is drawn over the center's left margin and the
  text stays where it is; where the margin is too narrow, the center is moved right only as far
  as needed for the sidebar not to cover the anchor (inset). On: the sidebar takes its own
  column and the center moves aside for it
- the sidebar's right edge is a 1 px line; a 7 px wide handle over it changes the width by
  dragging, live, between minWidth and maxWidth

Only transforms and opacity are animated (Web Animations, run by the compositor): the column
takes its new width at once, the center is laid out once for it, and both are drawn moving from
where they were. Animating the width instead lays out the editor on every frame, which stutters
in Safari.
The center moves by how far its anchor moves (the editor's text, which is centered: half the
sidebar's width in a wide window), not by the sidebar's width.
-->
<template>

  <div class='sidebar-layout'>
    <div
      class='sidebar'
      :class='{overlay: !isTextSliding}'
      :style='{width: `${isShown ? width : 0}px`}'
    >
      <div
        ref='content'
        class='content'
        :class='{hidden: !isShown}'
        :style='{width: `${width}px`}'
      >
        <slot />
      </div>

      <div
        v-if='isShown'
        class='handle'
        @pointerdown='resizeStart'
      />
    </div>

    <div
      ref='center'
      class='center'
      :style='{paddingLeft: inset ? `${inset}px` : null}'
    >
      <slot name='center' />
    </div>
  </div>

</template><script>

  const duration = 300
  const easing = 'ease'
  const minWidth = 160
  const maxWidth = 400

  export default {
    name: 'Sidebar',
    props: {
      isShown: Boolean,
      width: Number,
      // the center moves aside for the sidebar; otherwise the sidebar is drawn over it
      isTextSliding: Boolean,
      // a selector inside the center whose movement the center follows, and which the sidebar
      // must not cover; none: the center itself
      anchor: String
    },
    // resize: the new width, while dragging the handle
    emits: ['resize'],
    data () {
      return {
        // how far the center is moved right for the sidebar drawn over it
        inset: 0
      }
    },
    watch: {
      // before the new layout is rendered: where the center's text is now
      'isShown': {
        flush: 'pre',
        handler (isShown) {
          const from = this.anchorLeft()
          this.updateInset()
          // a toggle during a toggle starts from where things are drawn now
          const content = this.$refs.content
          const style = getComputedStyle(content)
          const isMoving = this.animations?.some(animation => animation.playState == 'running')
          const contentFrom = isMoving ? { transform: style.transform == 'none' ? 'translateX(0)' : style.transform, opacity: style.opacity } : null
          this.animations?.forEach(animation => animation.cancel())
          this.$nextTick(() => this.slide(isShown, from, contentFrom))
        }
      },
      // switching it with the sidebar shown moves the text: it slides there
      'isTextSliding': {
        flush: 'pre',
        handler () {
          const from = this.anchorLeft()
          this.updateInset()
          this.$nextTick(() => {
            const center = this.$refs.center
            const shift = from - this.anchorLeft()
            if (shift) center.animate([{ transform: `translateX(${shift}px)` }, { transform: 'translateX(0)' }], { duration, easing })
          })
        }
      },
      'width' () {
        this.updateInset()
      }
    },
    mounted () {
      this.updateInset()
      // a narrower window leaves less margin
      this.resizeObserver = new ResizeObserver(() => this.updateInset())
      this.resizeObserver.observe(this.$el)
    },
    beforeUnmount () {
      this.resizeObserver.disconnect()
    },
    methods: {
      // With the sidebar drawn over the center, the anchor (centered, up to its max-width) must
      // start right of the sidebar: padding on the center moves it right, half as far as the
      // padding while it is still centered, all of it once it fills the center.
      updateInset () {
        if (!this.isShown || this.isTextSliding) {
          this.inset = 0
          return
        }
        const space = this.$el.getBoundingClientRect().width
        const element = this.anchor && this.$refs.center.querySelector(this.anchor)
        const maxWidth = element ? parseFloat(getComputedStyle(element).maxWidth) || space : space
        const margin = (space - Math.min(maxWidth, space)) / 2
        const width = this.width
        this.inset = Math.round(margin >= width ? 0 : margin >= width / 2 ? 2 * (width - margin) : width)
      },
      anchorLeft () {
        const center = this.$refs.center
        const element = (this.anchor && center.querySelector(this.anchor)) || center
        return element.getBoundingClientRect().left
      },
      slide (isShown, from, contentFrom) {
        const center = this.$refs.center
        // the center is laid out for the new width; draw it where it was and let it slide
        const shift = from - this.anchorLeft() + this.currentShift(center)
        // the sidebar slides as far as the text does, fading, so its edge and the text move as
        // one, at the same speed; where the text stays, a third of its width (as in Ordner)
        const distance = Math.abs(shift) > 0.5 ? Math.abs(shift) : this.width / 3
        const hidden = { transform: `translateX(${-distance}px)`, opacity: 0 }
        const shown = { transform: 'translateX(0)', opacity: 1 }
        const options = { duration, easing }
        this.animations = [
          center.animate([{ transform: `translateX(${shift}px)` }, { transform: 'translateX(0)' }], options),
          this.$refs.content.animate([contentFrom || (isShown ? hidden : shown), isShown ? shown : hidden], options)
        ]
      },
      // a slide still going on (cancelled above, so normally 0)
      currentShift (element) {
        const transform = getComputedStyle(element).transform
        return transform == 'none' ? 0 : new DOMMatrix(transform).m41
      },
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

  // how far the resize handle reaches out on each side of the 1 px edge
  @handle-reach: 3px;

  .sidebar-layout {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    position: relative;
    // the hidden sidebar and the sliding center stay out of sight
    overflow: hidden;
  }

  .sidebar {
    flex: 0 0 auto;
    position: relative;

    // drawn over the center's left margin
    &.overlay {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
    }

    // above the center, which slides under it; the handle reaches over the center's edge
    z-index: 1;

    .content {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      box-sizing: border-box;
      background: var(--color--background--secondary);
      // the 1 px right edge
      box-shadow: inset -1px 0 0 var(--color--border--solid);

      &.hidden {
        // off screen; no visibility: hidden, which would end the slide out at once
        transform: translateX(-100%);
        opacity: 0;
        pointer-events: none;
      }
    }

    > .handle {
      position: absolute;
      top: 0;
      right: -@handle-reach;
      width: @handle-reach * 2 + 1px;
      height: 100%;
      cursor: ew-resize;
      z-index: 100;
    }
  }

  .center {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
  }

</style>
