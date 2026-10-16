<!--
An icon from shapes.js, drawn in the text colour (currentColor), so CSS colours it and fades
the colour. As large as its element: the parent sets the size. An icon that morphs is drawn for
its value (0–1): animating the value morphs it.
isFitted: as wide as the drawing with its stroke, the parent setting only the height, so icons
side by side are as far apart as their padding (the toolbar's).
marginLeft, marginRight: px added at its sides (negative: closer), to move one icon by hand.
-->
<template>

  <svg
    class='icon'
    :class='{fitted: isFitted}'
    :viewBox='viewBox'
    :style='{
      aspectRatio: isFitted && bounds ? `${bounds.right - bounds.left} / 128` : null,
      marginLeft: marginLeft ? `${marginLeft}px` : null,
      marginRight: marginRight ? `${marginRight}px` : null
    }'
    preserveAspectRatio='xMidYMid meet'
    aria-hidden='true'
  >
    <g
      ref='drawing'
      :transform='shape.scale != 1 ? `translate(64 64) scale(${shape.scale}) translate(-64 -64)` : null'>
      <path
        v-for='(path, index) in shape.paths'
        ref='paths'
        :key='index'
        :d='path.d'
        fill='none'
        stroke='currentColor'
        :stroke-linecap='path.cap'
        stroke-linejoin='round'
        :stroke-width='strokeWidth * path.weight / shape.scale'
      />
    </g>
  </svg>

</template><script>

  // local functions
  import shapes from './shapes.js'

  export default {
    name: 'Icon',
    props: {
      name: String,
      // in the 128 × 128 grid: the toolbar's icons all use 9
      strokeWidth: {
        type: Number,
        default: 9
      },
      // for an icon that morphs
      value: {
        type: Number,
        default: 0
      },
      isFitted: Boolean,
      // px
      marginLeft: {
        type: Number,
        default: 0
      },
      marginRight: {
        type: Number,
        default: 0
      }
    },
    data () {
      return {
        // fitted: the drawing's left and right edges with its stroke, in the grid
        bounds: null
      }
    },
    computed: {
      viewBox () {
        return this.isFitted && this.bounds ? `${this.bounds.left} 0 ${this.bounds.right - this.bounds.left} 128` : '0 0 128 128'
      },
      // { scale, optical, paths: [{ d, cap, weight }] }
      shape () {
        const entry = shapes[this.name] ?? []
        const { scale = 1, optical = [0, 0], paths } = Array.isArray(entry) || typeof entry == 'function' ? { paths: entry } : entry
        const list = typeof paths == 'function' ? paths(this.value) : paths
        return {
          scale,
          optical,
          paths: list.map(path => {
            const { d, cap = 'butt', weight = 1 } = typeof path == 'string' ? { d: path } : path
            return { d, cap, weight }
          })
        }
      }
    },
    watch: {
      'shape' () {
        if (this.isFitted) this.$nextTick(() => this.fit())
      }
    },
    mounted () {
      if (this.isFitted) this.fit()
    },
    methods: {
      // The paths' extent, scaled as drawn, and half the stroke on each side, except at the
      // butt ends of a horizontal line, which end where the line does; then the optical
      // correction (shapes.js).
      fit () {
        const { scale } = this.shape
        const toGrid = x => 64 + (x - 64) * scale
        let left = Infinity
        let right = -Infinity
        for (const [index, element] of (this.$refs.paths ?? []).entries()) {
          const path = this.shape.paths[index]
          const box = element.getBBox()
          const isHorizontal = path.cap == 'butt' && /^M[-\d.]+,[-\d.]+l[-\d.]+,-?0$/.test(path.d)
          const half = isHorizontal ? 0 : this.strokeWidth * path.weight / 2
          left = Math.min(left, toGrid(box.x) - half)
          right = Math.max(right, toGrid(box.x + box.width) + half)
        }
        const [opticalLeft, opticalRight] = this.shape.optical
        if (left < right) this.bounds = { left: left - opticalLeft, right: right + opticalRight }
      }
    }
  }

</script><style scoped lang='less'>

  .icon {
    display: block;
    width: 100%;
    height: 100%;
    // a stroke on the grid's edge is not cut off
    overflow: visible;
    pointer-events: none;

    // as high as the parent, as wide as the drawing (aspect-ratio)
    &.fitted {
      width: auto;
    }
  }

</style>
