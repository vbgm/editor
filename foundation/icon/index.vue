<!--
An icon from shapes.js, drawn in the text colour (currentColor), so CSS colours it and fades
the colour. As large as its element: the parent sets the size. An icon that morphs is drawn for
its value (0–1): animating the value morphs it.
-->
<template>

  <svg
    class='icon'
    viewBox='0 0 128 128'
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

  export default {
    name: 'Icon',
    props: {
      name: String,
      // in the 128 × 128 grid: Ordner's buttons use 11, 12 when active
      strokeWidth: {
        type: Number,
        default: 11
      },
      // for an icon that morphs
      value: {
        type: Number,
        default: 0
      }
    },
    computed: {
      // { scale, paths: [{ d, cap, weight }] }
      shape () {
        const entry = shapes[this.name] ?? []
        const { scale = 1, paths } = Array.isArray(entry) || typeof entry == 'function' ? { paths: entry } : entry
        const list = typeof paths == 'function' ? paths(this.value) : paths
        return {
          scale,
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
  }

</style>
