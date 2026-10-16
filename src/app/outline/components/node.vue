<!--
One heading of the outline with the headings under it, as in Ordner's tree: its height is set from
the rows that show, so opening or closing a heading slides the rows below it, and the
children fade in sliding down from above, or fade out sliding up, cut off from below by the
shrinking height, all with the same timing (@fold-duration, @fold-easing).
-->
<template>

  <li
    class='node'
    :class='{top: isTop}'
    :style='{height: `${height * rowHeight}px`}'
  >
    <div
      class='item'
      :class='[dropClass, {dragged: node.index == draggedIndex}]'
      :data-index='node.index'
      :style='{height: `${rowHeight}px`}'
    >
      <div
        v-if='node.children.length'
        class='arrow'
        @pointerdown.stop.prevent=''
        @click='$emit(`toggle`, node.section.id)'
      >
        <svg
          :class='{expanded: isExpanded}'
          viewBox='0 0 128 128'
        >
          <path
            d='M60.035,82l18,-18l-18,-18'
            fill='none'
            stroke='currentColor'
            stroke-linecap='round'
            stroke-linejoin='round'
            stroke-width='8'
          />
        </svg>
      </div>

      <div
        class='anchor'
        :class='{active: node.index == activeIndex, untitled: !node.section.title}'
      >
        {{ node.section.title || `Untitled` }}
      </div>
    </div>

    <transition name='t-fade'>
      <ul
        v-if='node.children.length && isExpanded'
        class='children'
      >
        <Node
          v-for='child in node.children'
          :key='child.section.id'
          v-bind='{
            node: child,
            collapsed,
            rowHeight,
            activeIndex,
            draggedIndex,
            dropSlot
          }'
          @toggle='$emit(`toggle`, $event)'
        />
      </ul>
    </transition>
  </li>

</template><script>

  export default {
    name: 'Node',
    props: {
      // { section, index, children }
      node: Object,
      // ids of closed headings
      collapsed: Object,
      rowHeight: Number,
      activeIndex: Number,
      draggedIndex: Number,
      // where a drag would drop: { index, position }
      dropSlot: Object,
      isTop: Boolean
    },
    emits: ['toggle'],
    computed: {
      isExpanded () {
        return !this.collapsed[this.node.section.id]
      },
      // rows that show: this one, and its children's while it is open
      height () {
        const count = node => 1 + (this.collapsed[node.section.id] ? 0 : node.children.reduce((sum, child) => sum + count(child), 0))
        return count(this.node)
      },
      dropClass () {
        return this.dropSlot && this.dropSlot.index == this.node.index ? `drop-${this.dropSlot.position}` : null
      }
    }
  }

</script><style scoped lang='less'>

  @indent: 20px;
  @arrow: 23px;
  @drop: var(--color--text-selection);
  // opening and closing a heading: the rows below sliding and the children fading share them, so
  // they move together
  @fold-duration: 0.2s;
  @fold-easing: cubic-bezier(0.2, 0, 0, 1);
  // the arrow turning
  @arrow-turn: 0.2s;
  // a row's height (rowHeight in index.vue, which also sets the nodes' heights)
  @row-height: var(--row-height);

  .node {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    position: relative;
    box-sizing: border-box;
    white-space: nowrap;
    padding-left: @indent;
    transition: height @fold-duration @fold-easing;
    // no jitter in Safari: 3d accelerated transforms
    transform: translateZ(0);

    &.top {
      padding-left: @arrow;
    }

    > .children {
      flex: 1;
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
    }
  }

  .t-fade-enter-active {
    transition: opacity @fold-duration @fold-easing, transform @fold-duration @fold-easing;
  }

  // closing mirrors opening, over the same time as the rows below slide up (Ordner's 0.1 s fade
  // out was abrupt)
  .t-fade-leave-active {
    transition: opacity @fold-duration @fold-easing, transform @fold-duration @fold-easing;
  }

  // while the children fade out, the heading's shrinking height cuts them off from below, so the
  // rows sliding up never pass over them (only up and down: the arrows reach out to the left)
  .node:has(> .children.t-fade-leave-active) {
    clip-path: inset(0 -100vw 0 -100vw);
  }

  .t-fade-enter-active,
  .t-fade-leave-active {
    transform: translateY(0) translateZ(0);
  }

  .t-fade-enter-from,
  .t-fade-leave-to {
    opacity: 0;
    transform: translateY(-1rem) translateZ(0);
  }

  .item {
    flex: 0 0 auto;
    display: flex;
    align-items: stretch;
    position: relative;
    z-index: 1;
    box-sizing: border-box;

    &.dragged {
      opacity: 0.4;
    }

    // drop markers (as in Ordner): a line on the edge for before / after, a frame for onto
    &.drop-before::before,
    &.drop-after::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0.5rem;
      height: 6px;
      z-index: 2;
      box-sizing: border-box;
      background-color: @drop;
      border: 2px solid @drop;
      border-top-color: transparent;
      border-bottom-color: transparent;
      background-clip: padding-box;
      pointer-events: none;
    }

    &.drop-before::before {
      top: 0;
      transform: translateY(-50%);
    }

    &.drop-after::after {
      bottom: 0;
      transform: translateY(50%);
    }

    &.drop-onto > .anchor {
      box-shadow: inset 0 0 0 2px @drop;
    }
  }

  // in the indentation, left of the title
  .arrow {
    position: absolute;
    z-index: 2;
    top: 0;
    bottom: 0;
    left: -@arrow;
    width: @arrow;
    display: flex;
    align-items: center;
    padding-left: 2px;
    box-sizing: border-box;
    cursor: pointer;
    color: var(--color--text--primary);

    // whole pixels, so it turns around a pixel-exact center; on a layer of its own in both states
    // (Safari otherwise makes one for the hover's fade only, and the arrow jumps by a fraction of
    // a pixel)
    > svg {
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      opacity: 0.5;
      transition: transform @arrow-turn, opacity @arrow-turn;
      transform: translateZ(0);
      will-change: transform, opacity;

      &.expanded {
        transform: rotate(90deg) translateZ(0);
      }
    }

    &:hover > svg {
      opacity: 0.8;
    }
  }

  .anchor {
    flex: 1 1 auto;
    min-width: 0;
    margin-right: 0.5rem;
    padding: 0 0.4rem;
    border-radius: var(--radius--control);
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: @row-height;
    cursor: default;

    &.active {
      background: var(--color--outline--active);
    }

    &.untitled {
      color: var(--color--text--secondary);
    }
  }

</style>
