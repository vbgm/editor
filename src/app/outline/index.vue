<!--
The outline (TOC): the document's headings as a tree, nested by level. A pure component: the
headings come in as props, clicks and drops go out as events; it knows nothing of the editor.

- An arrow left of a heading with subheadings opens or closes it, as in Ordner's tree; so does
  a click on the row of the heading already selected (the section with the cursor), while a
  click on another row selects it. Everything starts open; closed headings are remembered by
  id.
- The title's text works as a text field: hovering it shows the text cursor, and a click on it
  edits the title in place, the cursor where it was clicked (the title becomes a text field that
  looks like it, as wide as its text). Enter or a click outside the text saves (emits rename);
  a click on another heading's text then edits that one, a click anywhere else does nothing
  more. Escape cancels, empty is cancelled. After Enter or Escape the focus stays in the outline (for keyboard navigation);
  after a click elsewhere it goes where that click puts it.
- Dragging a heading (once the pointer has moved 4 px) uses the target mode of the drag engine:
  rows stay put, and the pointer's height over a row decides before / onto / after it
  (foundation/dnd/target.js). canDrop says which drops are allowed; a drop onto a closed heading
  opens it, so the dropped heading shows.
-->
<template>

  <div
    ref='scroller'
    class='outline'
    tabindex='0'
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
          editingId,
          editingCaret,
          isTop: true
        }'
        @toggle='toggle'
        @renameInput='$emit(`renameInput`, $event)'
        @rename='finishRename'
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

  // where in its text node a click at x, y is (Safari has caretRangeFromPoint); null when the
  // browser cannot tell
  function caretAt (x, y) {
    if (document.caretPositionFromPoint) return document.caretPositionFromPoint(x, y)?.offset ?? null
    return document.caretRangeFromPoint?.(x, y)?.startOffset ?? null
  }

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
    // select: index; move: { from, slot: { index, position } }; renaming: renameStart: index,
    // renameInput: { index, text } on every change, rename: { index, text } at the end, text
    // null when cancelled or unchanged
    emits: ['select', 'move', 'renameStart', 'renameInput', 'rename'],
    data () {
      return {
        rowHeight,
        // id: true for closed headings
        collapsed: {},
        draggedIndex: -1,
        dropSlot: null,
        // id of the heading being renamed, and where its cursor starts
        editingId: null,
        editingCaret: null,
        // while renaming, the headings as they were when it started: the title changing in the
        // editor would change the row's id and rebuild it, field and all
        frozen: null
      }
    },
    computed: {
      // the headings shown
      items () {
        return this.frozen || this.sections
      },
      // [{ section, index, children }]: a heading's children are the deeper headings after it, up
      // to the next one of its level or higher
      tree () {
        const roots = []
        const stack = []
        this.items.forEach((section, index) => {
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
      // a press on a row: a click on the title's text edits it, elsewhere selects the heading
      // (or opens or closes the selected one); a move starts a drag. The editor keeps the
      // focus unless editing starts.
      pointerDown (event) {
        // the rename field works as a text field
        if (event.target.closest('.rename')) return
        const item = event.button == 0 && event.target.closest('.item')
        if (!item) return
        event.preventDefault()
        const index = Number(item.dataset.index)
        // While a title is being edited, a press saves it and ends editing (the press does not
        // move the focus, so the field is left by hand); on another heading's text it edits that
        // one at once, anywhere else it does nothing more.
        const onText = event.target.closest('.title')
        const field = document.activeElement?.classList.contains('rename') && document.activeElement
        if (field) {
          field.blur()
          if (!onText) return
        }
        // on the title's text: where its cursor goes when editing (the end, when unknown)
        const caret = onText ? caretAt(event.clientX, event.clientY) ?? Infinity : null
        const move = moveEvent => {
          if (Math.hypot(moveEvent.clientX - event.clientX, moveEvent.clientY - event.clientY) < dragDistance) return
          stop()
          this.drag(event, item, index)
        }
        const up = () => {
          stop()
          if (caret != null) this.startRename(index, caret)
          else this.click(index)
        }
        const stop = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      },
      // a click on the heading already selected (the section with the cursor) opens or closes
      // it, on another heading selects it
      click (index) {
        const section = this.items[index]
        const hasChildren = this.items[index + 1]?.level > section.level
        if (index == this.activeIndex && hasChildren) this.toggle(section.id)
        else this.$emit('select', index)
      },
      startRename (index, caret) {
        this.frozen = this.items
        this.editingCaret = caret
        this.editingId = this.items[index].id
        this.$emit('renameStart', index)
      },
      // text: the new title, null when cancelled; after Enter or Escape the focus stays in the
      // outline (for the keyboard), after a click elsewhere it is where that click put it. A
      // closed heading stays closed under its new title.
      finishRename ({ index, text, byKey }) {
        const section = this.items[index]
        this.editingId = null
        this.frozen = null
        if (byKey) this.$refs.scroller.focus({ preventScroll: true })
        const title = text?.trim()
        if (!title || title == section.title) return this.$emit('rename', { index, text: null })
        if (this.collapsed[section.id]) {
          delete this.collapsed[section.id]
          this.collapsed[this.idFor(index, title)] = true
        }
        this.$emit('rename', { index, text: title })
      },
      // the id the heading at index gets with title (as the editor gives ids: the title, and
      // which heading of that title it is)
      idFor (index, title) {
        const count = this.items.filter((section, other) => other < index && section.title == title).length + 1
        return count > 1 ? `${title} ${count}` : title
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
            if (slot.position == 'onto') delete this.collapsed[this.items[slot.index].id]
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
    outline: none;
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
