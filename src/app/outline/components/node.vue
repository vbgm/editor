<!--
One heading of the outline with the headings under it, as in Ordner's tree: its height is set from
the rows that show, so opening or closing a heading slides the rows below it. The children are a
drawer: they come out from behind the heading's row and move exactly with the rows below, by
layout (the same height transition: @fold-duration, @fold-easing), so nothing moves against
anything. (A shorter slide on the same curve moved slower than the rows below and always looked
off.)
On top, they fade with a timing of their own (@fade-in-*, @fade-out-*).
The children are animated from Vue's enter / leave hooks (Web Animations), not by its CSS
transition classes: those start two frames after the children are inserted, while the height
starts changing at once, so the children came in late. The hooks start them in the same frame,
with the height transition's own duration and easing.
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
        :class='{active: node.index == activeIndex, untitled: !node.section.title && !isEditing}'
      >
        <!-- renaming: the title as a text field that looks like the title itself, as wide as its
        text (a hidden copy of the text in the same place sets the width) -->
        <span
          v-if='isEditing'
          class='rename-box'
          :data-value='editingValue'
        >
          <input
            ref='input'
            class='rename'
            size='1'
            :value='editingValue'
            spellcheck='false'
            @input='input($event.target.value)'
            @keydown.enter.prevent.stop='finish(true, true)'
            @keydown.esc.prevent.stop='finish(false, true)'
            @blur='finish(true, false)'
          >
        </span>
        <!-- the text alone: hovering it shows the text cursor, a click on it edits there -->
        <span
          v-else
          class='title'
        >{{ node.section.title || `Untitled` }}</span>
      </div>
    </div>

    <transition
      :css='false'
      @enter='enter'
      @leave='leave'
    >
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
            dropSlot,
            editingId,
            editingCaret
          }'
          @toggle='$emit(`toggle`, $event)'
          @renameInput='$emit(`renameInput`, $event)'
          @rename='$emit(`rename`, $event)'
        />
      </ul>
    </transition>
  </li>

</template><script>

  // a time from CSS ('0.2s', '20ms') in milliseconds
  const milliseconds = value => parseFloat(value) * (/ms\s*$/.test(value) ? 1 : 1000)

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
      // id of the heading being renamed, and where its cursor starts (offset in the title)
      editingId: String,
      editingCaret: Number,
      isTop: Boolean
    },
    // renameInput: { index, text } on every change; rename: { index, text, byKey } at the end,
    // text null when cancelled, byKey for Enter / Escape
    emits: ['toggle', 'renameInput', 'rename'],
    watch: {
      // the field takes the focus, its cursor where the title was clicked
      'isEditing' (isEditing) {
        if (isEditing) this.editingValue = this.node.section.title
        if (isEditing) this.$nextTick(() => {
          const { input } = this.$refs
          const caret = Math.min(this.editingCaret ?? input.value.length, input.value.length)
          input.focus()
          input.setSelectionRange(caret, caret)
        })
      }
    },
    data () {
      return {
        // the text in the rename field
        editingValue: ''
      }
    },
    computed: {
      isEditing () {
        return this.editingId != null && this.editingId == this.node.section.id
      },
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
    },
    methods: {
      input (text) {
        this.editingValue = text
        this.$emit('renameInput', { index: this.node.index, text })
      },
      // Enter or leaving the field saves, Escape cancels; only once (saving moves the focus,
      // which blurs the field)
      finish (isSaved, byKey) {
        if (!this.isEditing || this.isFinished) return
        this.isFinished = true
        this.$emit('rename', { index: this.node.index, text: isSaved ? this.$refs.input.value : null, byKey })
        this.$nextTick(() => { this.isFinished = false })
      },
      enter (element, done) {
        this.fold(element, true, done)
      },
      leave (element, done) {
        this.fold(element, false, done)
      },
      // The list of children (element) is a drawer by layout: while folding, its box is the
      // space open so far (it follows the node's height) and its rows sit at its bottom, so they
      // move with the rows below in the same layout, frame by frame. (A transform animation of
      // the rows ran on the compositor apart from the height's transition, and drifted in
      // Safari.) Only the fade is animated, with its own timing.
      fold (element, isOpening, done) {
        const rows = [...element.children]
        const settings = getComputedStyle(this.$el)
        const setting = name => settings.getPropertyValue(`--${name}`).trim()
        // a click during a fold turns the fade around from where it is
        const opacity = rows[0] ? getComputedStyle(rows[0]).opacity : '1'
        const isFading = rows.some(row => row.getAnimations().some(animation => animation.playState == 'running'))
        rows.forEach(row => row.getAnimations().forEach(animation => animation.cancel()))
        const from = isFading ? opacity : isOpening ? 0 : 1

        // faded in, hidden until it starts (fill); faded out, transparent as their own style
        // until the fold ends and the rows are removed: holding the end of the animation instead
        // (fill: forwards) flashed the rows for a frame in Safari when the fade ended
        const way = isOpening ? 'in' : 'out'
        const fade = {
          duration: milliseconds(setting(`fade-${way}-duration`)),
          delay: milliseconds(setting(`fade-${way}-delay`)),
          easing: setting(`fade-${way}-easing`),
          fill: isOpening ? 'backwards' : 'none'
        }
        if (!isOpening) rows.forEach(row => { row.style.opacity = '0' })
        element.classList.add('folding')
        const fades = rows.map(row => row.animate([{ opacity: from }, { opacity: isOpening ? 1 : 0 }], fade).finished)
        // the drawer ends with the node's height transition
        const folded = new Promise(resolve => setTimeout(resolve, milliseconds(settings.transitionDuration)))
        Promise.all([...fades, folded]).then(() => {
          element.classList.remove('folding')
          done()
        }, () => {})
      }
    }
  }

</script><style scoped lang='less'>

  @indent: 20px;
  @arrow: 23px;
  @drop: var(--color--text-selection);
  // Opening and closing a heading: the rows below and the children (a drawer) share these
  // exactly, so they move together
  @fold-duration: 0.2s;
  @fold-easing: cubic-bezier(0.2, 0, 0, 1);
  // the children's fade: in as long as the fold but starting a little after it (they come in
  // after the space opens), out a little quicker (gone before it closes)
  @fade-in-duration: @fold-duration;
  @fade-in-delay: @fold-duration * 0.4;
  @fade-in-easing: @fold-easing;
  @fade-out-duration: @fold-duration * 0.15;
  @fade-out-delay: 0s;
  @fade-out-easing: cubic-bezier(0.4, 0, 1, 1);
  // the arrow turning
  @arrow-turn: 0.2s;
  // how far past a title's text a click still edits it (the cursor at the end)
  @title-reach: 0.5rem;
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
    // for the children's fade (fold in the script)
    --fade-in-duration: @fade-in-duration;
    --fade-in-delay: @fade-in-delay;
    --fade-in-easing: @fade-in-easing;
    --fade-out-duration: @fade-out-duration;
    --fade-out-delay: @fade-out-delay;
    --fade-out-easing: @fade-out-easing;
    // no jitter in Safari: 3d accelerated transforms
    transform: translateZ(0);

    &.top {
      padding-left: @arrow;
    }

    > .children {
      flex: 1;
      // shrinks with the node's height while folding (a flex item would not go below its
      // content), so its clip is the space open so far
      min-height: 0;
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
    }
  }

  // while folding, the list is a drawer: its rows sit at the bottom of its box (the space open so
  // far), overflowing upwards behind the heading's row, where they are cut off. By overflow, not
  // clip-path: Safari did not always clip the rows' own layers (translateZ) with a clip-path, and
  // faded rows showed at the end of closing. The arrows reach out to the left of the list: room
  // for them that moves nothing (a margin taken back by padding).
  .children.folding {
    justify-content: flex-end;
    overflow: hidden;
    margin-left: -@arrow;
    padding-left: @arrow;
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

    // the title's text, and a little past its end: a text field to the mouse (the rest of the
    // row selects)
    > .title {
      cursor: text;
      padding-right: @title-reach;
    }

    // no look of its own: the title, editable
    // the field and a hidden copy of its text share one grid cell: the field is as wide as the
    // text (and a space more, for the cursor at its end), so a click beside the text is outside
    // it and ends editing
    > .rename-box {
      display: inline-grid;
      max-width: 100%;
      vertical-align: top;

      // the field reaches as far past its text as the title does, so a click there puts the
      // cursor at the end
      &::after {
        content: attr(data-value) ' ';
        grid-area: 1 / 1;
        visibility: hidden;
        white-space: pre;
        overflow: hidden;
        padding-right: @title-reach;
      }
    }

    // (size 1: a text field is about 20 characters wide by itself, which would set the cell's
    // width)
    .rename {
      grid-area: 1 / 1;
      min-width: 1px;
      width: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 0 @title-reach 0 0;
      border: 0;
      outline: none;
      background: transparent;
      font: inherit;
      color: inherit;
      line-height: inherit;
      user-select: text;
      -webkit-user-select: text;
    }
  }

</style>
