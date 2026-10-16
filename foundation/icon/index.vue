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
    <g :transform='shape.scale != 1 ? `translate(64 64) scale(${shape.scale}) translate(-64 -64)` : null'>
      <path
        v-for='(path, index) in shape.paths'
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

  // A path's box, measured in an SVG of its own out of sight, so an icon is fitted however it
  // is shown (not at all, display: none, when the toolbar shows the heading menu instead of the
  // buttons, or the other way round); the same paths are measured once.
  const boxes = new Map()
  let measuring = null

  function boxOf (d) {
    if (!boxes.has(d)) {
      if (!measuring) {
        measuring = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        measuring.setAttribute('aria-hidden', 'true')
        measuring.style.cssText = 'position: absolute; width: 0; height: 0; overflow: hidden; visibility: hidden; pointer-events: none'
        document.body.appendChild(measuring)
      }
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', d)
      measuring.appendChild(path)
      const { x, width } = path.getBBox()
      path.remove()
      boxes.set(d, { x, width })
    }
    return boxes.get(d)
  }

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
    computed: {
      viewBox () {
        return this.isFitted && this.bounds ? `${this.bounds.left} 0 ${this.bounds.right - this.bounds.left} 128` : '0 0 128 128'
      },
      // Fitted: the drawing's left and right edges in the grid: the paths' extent, scaled as
      // drawn, and half the stroke on each side, except at the butt ends of a horizontal line,
      // which end where the line does; then the optical correction (shapes.js).
      bounds () {
        if (!this.isFitted) return null
        const { scale, optical, paths } = this.shape
        const toGrid = x => 64 + (x - 64) * scale
        let left = Infinity
        let right = -Infinity
        for (const path of paths) {
          const box = boxOf(path.d)
          const isHorizontal = path.cap == 'butt' && /^M[-\d.]+,[-\d.]+l[-\d.]+,-?0$/.test(path.d)
          const half = isHorizontal ? 0 : this.strokeWidth * path.weight / 2
          left = Math.min(left, toGrid(box.x) - half)
          right = Math.max(right, toGrid(box.x + box.width) + half)
        }
        return left < right ? { left: left - optical[0], right: right + optical[1] } : null
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
