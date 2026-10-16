<!--
An icon from shapes.js, drawn in the text colour (currentColor), so CSS colours it and fades
the colour. As large as its element: the parent sets the size.
-->
<template>

  <svg
    class='icon'
    viewBox='0 0 128 128'
    preserveAspectRatio='xMidYMid meet'
    aria-hidden='true'
  >
    <path
      v-for='(path, index) in paths'
      :key='index'
      :d='path.d'
      fill='none'
      stroke='currentColor'
      :stroke-linecap='path.cap'
      stroke-linejoin='round'
      :stroke-width='strokeWidth * path.weight'
    />
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
      }
    },
    computed: {
      paths () {
        return (shapes[this.name] ?? []).map(path => {
          const { d, cap = 'butt', weight = 1 } = typeof path == 'string' ? { d: path } : path
          return { d, cap, weight }
        })
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
