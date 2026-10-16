<!--
A layout with a sidebar on either side (left and right slots) and the main part between them
(center slot), as Ordner's (layouts/asides.vue):
- showing and hiding: the center slides from where its text was to where it lands, and the
  sidebar slides in as far as the text moves, fading in, so its edge and the text move as one
  (and back out when hiding), in 0.3 s
- isTextSliding off (the default): the sidebars are drawn over the center's margins and the
  text stays where it is; where the margins are too narrow, the text is moved aside only as far
  as needed for no sidebar to cover the anchor (insets). On: the sidebars take their own columns
  and the center moves aside for them
- a sidebar's inner edge is a 1 px line; a 7 px wide handle over it changes the width by
  dragging, live, between minWidth and maxWidth
- the sidebars run up to the top of the window, under the toolbar (App's): their colour and
  edge go on behind its buttons. Only over the center is the toolbar's background drawn
  (isBarShown): translucent and blurred, the text scrolling on under it; at the center's top, it
  slides with the center (sideways with the sidebars, up and down with the toolbar, App's
  toggleToolbar) and the sidebars are drawn over it. A sidebar's own content scrolls on under a
  band of its colour

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
      v-for='sidebar in sidebars'
      :key='sidebar.side'
      class='sidebar'
      :class='[sidebar.side, {overlay: !isTextSliding}]'
      :style='{width: `${sidebar.isShown ? sidebar.width : 0}px`}'
    >
      <div
        :ref='element => setContent(sidebar.side, element)'
        class='content'
        :class='{hidden: !sidebar.isShown}'
        :style='{width: `${sidebar.width}px`}'
      >
        <slot :name='sidebar.side' />
      </div>

      <div
        v-if='sidebar.isShown'
        class='handle'
        @pointerdown='resizeStart(sidebar.side, $event)'
      />
    </div>

    <div
      ref='center'
      class='center'
      :class='{bar: isBarShown}'
      :style='{
        paddingLeft: insets.left ? `${insets.left}px` : null,
        paddingRight: insets.right ? `${insets.right}px` : null
      }'
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
      isLeftShown: Boolean,
      leftWidth: Number,
      isRightShown: Boolean,
      rightWidth: Number,
      // the center moves aside for the sidebars; otherwise they are drawn over it
      isTextSliding: Boolean,
      // a selector inside the center whose movement the center follows, and which the sidebars
      // must not cover; none: the center itself
      anchor: String,
      // the toolbar's background over the center's top, --top-bar-height high
      isBarShown: Boolean
    },
    // resize: { side, width }, while dragging a handle
    emits: ['resize'],
    data () {
      return {
        // how far the center's text is moved in from each side, for sidebars drawn over it
        insets: { left: 0, right: 0 }
      }
    },
    computed: {
      sidebars () {
        return [
          { side: 'left', isShown: this.isLeftShown, width: this.leftWidth },
          { side: 'right', isShown: this.isRightShown, width: this.rightWidth }
        ]
      }
    },
    watch: {
      // before the new layout is rendered: where the center's text is now
      'isLeftShown': {
        flush: 'pre',
        handler (isShown) {
          this.toggle('left', isShown)
        }
      },
      'isRightShown': {
        flush: 'pre',
        handler (isShown) {
          this.toggle('right', isShown)
        }
      },
      // switching it with a sidebar shown moves the text: it slides there
      'isTextSliding': {
        flush: 'pre',
        handler () {
          const from = this.anchorLeft()
          this.updateInsets()
          this.$nextTick(() => {
            const center = this.$refs.center
            const shift = from - this.anchorLeft()
            if (shift) center.animate([{ transform: `translateX(${shift}px)` }, { transform: 'translateX(0)' }], { duration, easing })
          })
        }
      },
      'leftWidth' () {
        this.updateInsets()
      },
      'rightWidth' () {
        this.updateInsets()
      }
    },
    created () {
      // not reactive: each side's content element, and its running slide
      this.contents = {}
      this.animations = {}
    },
    mounted () {
      this.updateInsets()
      // a narrower window leaves less margin
      this.resizeObserver = new ResizeObserver(() => this.updateInsets())
      this.resizeObserver.observe(this.$el)
    },
    beforeUnmount () {
      this.resizeObserver.disconnect()
    },
    methods: {
      setContent (side, element) {
        this.contents[side] = element
      },
      toggle (side, isShown) {
        const from = this.anchorLeft()
        this.updateInsets()
        // a toggle during a toggle starts from where things are drawn now
        const content = this.contents[side]
        const style = getComputedStyle(content)
        const isMoving = this.animations[side]?.playState == 'running'
        const contentFrom = isMoving ? { transform: style.transform == 'none' ? 'translateX(0)' : style.transform, opacity: style.opacity } : null
        this.animations[side]?.cancel()
        // from already holds where the center is drawn now, also by the other side's slide
        this.animations.center?.cancel()
        this.$nextTick(() => this.slide(side, isShown, from, contentFrom))
      },
      // With sidebars drawn over the center, the anchor (centered, up to its max-width) must be
      // between them: it stays centered where it fits, moves aside as far as needed where it
      // does not (padding on the center moves it half as far as the padding), and fills the
      // room between the sidebars where that is narrower than the anchor.
      updateInsets () {
        const left = this.isLeftShown && !this.isTextSliding ? this.leftWidth : 0
        const right = this.isRightShown && !this.isTextSliding ? this.rightWidth : 0
        if (!left && !right) {
          this.insets = { left: 0, right: 0 }
          return
        }
        const space = this.$el.getBoundingClientRect().width
        const element = this.anchor && this.$refs.center.querySelector(this.anchor)
        const maxWidth = element ? parseFloat(getComputedStyle(element).maxWidth) || space : space
        const width = Math.min(maxWidth, space)
        if (space - left - right < width) {
          this.insets = { left, right }
          return
        }
        const middle = Math.min(Math.max(space / 2, left + width / 2), space - right - width / 2)
        const shift = middle - space / 2
        this.insets = { left: Math.round(Math.max(0, 2 * shift)), right: Math.round(Math.max(0, -2 * shift)) }
      },
      anchorLeft () {
        const center = this.$refs.center
        const element = (this.anchor && center.querySelector(this.anchor)) || center
        return element.getBoundingClientRect().left
      },
      slide (side, isShown, from, contentFrom) {
        const center = this.$refs.center
        // both sides toggled at once (with the toolbar): the second slide replaces the first's,
        // from the same from, covering both
        this.animations.center?.cancel()
        // the center is laid out for the new width; draw it where it was and let it slide
        const shift = from - this.anchorLeft() + this.currentShift(center)
        // the sidebar slides as far as the text does, fading, so its edge and the text move as
        // one, at the same speed; where the text stays, a third of its width (as in Ordner)
        const width = side == 'left' ? this.leftWidth : this.rightWidth
        const distance = Math.abs(shift) > 0.5 ? Math.abs(shift) : width / 3
        const hidden = { transform: `translateX(${side == 'left' ? -distance : distance}px)`, opacity: 0 }
        const shown = { transform: 'translateX(0)', opacity: 1 }
        const options = { duration, easing }
        this.animations.center = center.animate([{ transform: `translateX(${shift}px)` }, { transform: 'translateX(0)' }], options)
        this.animations[side] = this.contents[side].animate([contentFrom || (isShown ? hidden : shown), isShown ? shown : hidden], options)
      },
      // a slide still going on (cancelled above, so normally 0)
      currentShift (element) {
        const transform = getComputedStyle(element).transform
        return transform == 'none' ? 0 : new DOMMatrix(transform).m41
      },
      resizeStart (side, event) {
        if (event.button != 0) return
        event.preventDefault()
        const handle = event.target
        handle.setPointerCapture(event.pointerId)
        const root = document.documentElement
        root.classList.add('is-resizing')
        const { left, right } = this.$el.getBoundingClientRect()
        const move = moveEvent => {
          const width = Math.round(side == 'left' ? moveEvent.clientX - left + 2 : right - moveEvent.clientX + 1)
          this.$emit('resize', { side, width: Math.min(Math.max(width, minWidth), maxWidth) })
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
    // the hidden sidebars and the sliding center stay out of sight
    overflow: hidden;
  }

  .sidebar {
    flex: 0 0 auto;
    position: relative;

    // drawn over the center's margin
    &.overlay {
      position: absolute;
      top: 0;
      bottom: 0;
    }

    // above the center, which slides under it; the handle reaches over the center's edge
    z-index: 1;

    .content {
      position: absolute;
      top: 0;
      bottom: 0;
      box-sizing: border-box;
      background: var(--color--background--secondary);

      // the band under the toolbar (--top-inset high), the content scrolling on under it; the
      // 1 px edge stays uncovered
      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: var(--top-inset, 0px);
        z-index: 1;
        background: color-mix(in srgb, var(--color--background--secondary) 75%, transparent);
        -webkit-backdrop-filter: blur(4px);
        backdrop-filter: blur(4px);
        pointer-events: none;
      }
    }

    > .handle {
      position: absolute;
      top: 0;
      width: @handle-reach * 2 + 1px;
      height: 100%;
      cursor: ew-resize;
      z-index: 100;
    }

    &.left {
      order: 0;

      &.overlay {
        left: 0;
      }

      .content {
        left: 0;
        // the 1 px edge
        box-shadow: inset -1px 0 0 var(--color--border--solid);

        &::before {
          right: 1px;
        }

        &.hidden {
          // off screen; no visibility: hidden, which would end the slide out at once
          transform: translateX(-100%);
        }
      }

      > .handle {
        right: -@handle-reach;
      }
    }

    &.right {
      order: 2;

      &.overlay {
        right: 0;
      }

      .content {
        right: 0;
        box-shadow: inset 1px 0 0 var(--color--border--solid);

        &::before {
          left: 1px;
        }

        &.hidden {
          transform: translateX(100%);
        }
      }

      > .handle {
        left: -@handle-reach;
      }
    }

    .content.hidden {
      opacity: 0;
      pointer-events: none;
    }
  }

  .center {
    order: 1;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    position: relative;
    // the bar over the text, under the sidebars
    isolation: isolate;

    // the toolbar's background, as Ordner's folder header: translucent and blurred, more opaque
    // at the right edge, where the scrollbar is. Hiding, it fades as it slides up with the center
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: var(--top-bar-height, 0px);
      z-index: 1;
      --translucent: color-mix(in srgb, var(--color--background) 75%, transparent);
      background: linear-gradient(
        to right,
        var(--translucent),
        var(--translucent) calc(100% - 2rem),
        color-mix(in srgb, var(--color--background) 97%, transparent) 100%
      );
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }

    &.bar::before {
      opacity: 1;
    }
  }

</style>
