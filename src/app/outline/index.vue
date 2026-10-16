<!--
The outline (TOC): the document's headings as a tree, nested by level. A pure component: the
headings come in as props, clicks and drops go out as events; it knows nothing of the editor.

- An arrow left of a heading with subheadings opens or closes it, as in Ordner's tree (clicking
  the title only selects). Everything starts open; closed headings are remembered by id.
- Dragging a heading (once the pointer has moved 4 px) uses the target mode of the drag engine:
  rows stay put, and the pointer's height over a row decides before / onto / after it
  (foundation/dnd/target.js). canDrop says which drops are allowed; a drop onto a closed heading
  opens it, so the dropped heading shows.
-->
<template>

  <div
    ref='scroller'
    class='outline'
    :style='{"--row-height": `${rowHeight}px`}'
    @pointerdown='pointerDown'
  >
    <ul
      v-if='tree.length'
      class='root'
    >
      <Node
        v-for='node in tree'
        :key='node.section.id'
        v-bind='{
          node,
          collapsed,
          rowHeight,
          activeIndex,
          draggedIndex,
          dropSlot,
          isTop: true
        }'
        @toggle='toggle'
      />
    </ul>

    <div
      v-else
      class='empty'
    >
      No headings
    </div>
  </div>

</template><script>

  // foundation
  import { startDrag } from '/foundation/dnd/index.js'
  import { target } from '/foundation/dnd/target.js'
  // local components
  import Node from './components/node.vue'

  // as in Ordner's sidebar
  const rowHeight = 31
  // how far the pointer moves before a press becomes a drag (less is a click)
  const dragDistance = 4

  export default {
    name: 'Outline',
    components: {
      Node
    },
    props: {
      // [{ id, title, level }], in document order
      sections: Array,
      // index in sections of the section with the cursor, -1 for none
      activeIndex: Number,
      // (from, { index, position }): whether sections[from] can be dropped there
      canDrop: {
        type: Function,
        default: () => true
      }
    },
    // select: index; move: { from, slot: { index, position } }
    emits: ['select', 'move'],
    data () {
      return {
        rowHeight,
        // id: true for closed headings
        collapsed: {},
        draggedIndex: -1,
        dropSlot: null
      }
    },
    computed: {
      // [{ section, index, children }]: a heading's children are the deeper headings after it, up
      // to the next one of its level or higher
      tree () {
        const roots = []
        const stack = []
        this.sections.forEach((section, index) => {
          const node = { section, index, children: [] }
          while (stack.length && stack[stack.length - 1].section.level >= section.level) stack.pop()
          if (stack.length) stack[stack.length - 1].children.push(node)
          else roots.push(node)
          stack.push(node)
        })
        return roots
      }
    },
    methods: {
      toggle (id) {
        if (this.collapsed[id]) delete this.collapsed[id]
        else this.collapsed[id] = true
      },
      // a press on a row: a click selects the heading, a move starts a drag; the editor keeps
      // the focus either way
      pointerDown (event) {
        const item = event.button == 0 && event.target.closest('.item')
        if (!item) return
        event.preventDefault()
        const index = Number(item.dataset.index)
        const move = moveEvent => {
          if (Math.hypot(moveEvent.clientX - event.clientX, moveEvent.clientY - event.clientY) < dragDistance) return
          stop()
          this.drag(event, item, index)
        }
        const up = () => {
          stop()
          this.$emit('select', index)
        }
        const stop = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      },
      drag (event, item, index) {
        const scroller = this.$refs.scroller
        const box = scroller.getBoundingClientRect()
        // rows in the scroller's content coordinates
        const place = element => {
          const rect = element.getBoundingClientRect()
          return { top: rect.top - box.top + scroller.scrollTop, bottom: rect.bottom - box.top + scroller.scrollTop }
        }
        const items = [...scroller.querySelectorAll('.item')]
        const indices = items.map(element => Number(element.dataset.index))

        // a faded copy of the row follows the pointer (the engine moves it up and down)
        const rect = item.getBoundingClientRect()
        const preview = item.cloneNode(true)
        Object.assign(preview.style, {
          position: 'fixed',
          top: '0',
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          opacity: '0.6',
          pointerEvents: 'none',
          zIndex: '10'
        })
        this.$el.appendChild(preview)
        this.draggedIndex = index

        const finish = () => {
          preview.remove()
          this.draggedIndex = -1
          this.dropSlot = null
        }
        startDrag({
          event,
          scroller,
          item: place(item),
          preview,
          mode: target({
            rows: items.map(place),
            isAllowed: (row, position) => this.canDrop(index, { index: indices[row], position })
          }),
          onSlot: slot => {
            this.dropSlot = slot && { index: indices[slot.index], position: slot.position }
          },
          onDrop: () => {
            const slot = this.dropSlot
            finish()
            if (!slot) return
            if (slot.position == 'onto') delete this.collapsed[this.sections[slot.index].id]
            this.$emit('move', { from: index, slot })
          },
          onCancel: finish
        })
      }
    }
  }

</script><style scoped lang='less'>

  .outline {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    box-sizing: border-box;
    padding: 0.5rem 0;
    font-size: 0.95rem;
    user-select: none;
    -webkit-user-select: none;
  }

  .root {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .empty {
    padding: 0.4rem 1.5rem;
    color: var(--color--text--secondary);
  }

</style>
