<!--
The toolbar, over the top of the window, the sidebars and the text: they run on under it, seen
through its translucent, blurred background (as Ordner's folder header); a line below it only
while a sidebar is shown or the text is scrolled up under it.
- left: hide or show the toolbar (Cmd+Alt+T; in the title bar instead where the app draws it,
  macOS), the outline sidebar (Ctrl+Cmd+S)
- center: formatting for the text with the cursor, lit where the cursor's text has it (formats,
  from the editor), in two groups: what a line is (headings H1–H6, a menu where the toolbar is
  too narrow for all six; numbered list, bulleted list, task), then the inline formats
- right: the settings sidebar
Hiding and showing, it slides out at the top and back in, fading, as the sidebars do (functions/slides.js);
the app moves the text with it (App's toggleToolbar). Hidden, only the arrow to show it again
stays, in its place, and is drawn only under the mouse.
Buttons look like Ordner's (ActionIconStyled): icons only, no background; the icon's colour
changes when hovered, pressed or on. All icons have the same stroke, on or not. They do not take
the keyboard focus (mousedown.prevent): the editor keeps the cursor and its selection.
-->
<template>

  <div
    class='toolbar'
    :class='{hidden: !isShown, lined: isSidebarShown || isSettingsShown || isTextUnder}'
  >
    <div class='start'>
      <Toggle
        v-if='!hasTitleBar'
        class='button angle'
        :isShown='isShown'
        @toggle='$emit(`toggle`)'
      />

      <button
        class='button sidebar'
        :class='{active: isSidebarShown}'
        title='Outline: the headings in a sidebar (Ctrl+Cmd+S)'
        @mousedown.prevent=''
        @click='$emit(`toggleSidebar`)'
      >
        <span class='glyph'>
          <Icon
            name='sidebar'
          />
        </span>
      </button>
    </div>

    <div class='center'>
      <!-- what a line is -->
      <div class='group'>
        <!-- all six levels where there is room; otherwise a menu -->
        <div class='group headings'>
          <button
            v-for='level in 6'
            :key='level'
            class='button'
            :class='{active: formats.heading == level}'
            :title='`Heading ${level} (Cmd+${level})`'
            @mousedown.prevent=''
            @click='setHeading(level)'
          >
            <span class='glyph'>
              <Icon
                :name='`heading-${level}`'
                isFitted
              />
            </span>
          </button>
        </div>

        <div
          ref='headingMenu'
          class='group heading-menu'
        >
          <button
            class='button'
            :class='{active: formats.heading > 0, open: isHeadingMenuOpen}'
            title='Heading'
            @mousedown.prevent=''
            @click='isHeadingMenuOpen = !isHeadingMenuOpen'
          >
            <span class='glyph'>
              <Icon
                name='heading'
                isFitted
              />
            </span>
            <span class='chevron'>
              <Icon
                name='angle-down'
                :strokeWidth='15'
                isFitted
              />
            </span>
          </button>

          <div
            v-if='isHeadingMenuOpen'
            class='menu'
          >
            <button
              v-for='level in 7'
              :key='level'
              class='item'
              @mousedown.prevent=''
              @click='chooseHeading(level - 1)'
            >
              <span class='check'>
                <Icon
                  v-if='formats.heading == level - 1'
                  name='check'
                  :strokeWidth='14'
                />
              </span>
              <span class='label'>
                {{ level == 1 ? `Paragraph` : `Heading ${level - 1}` }}
              </span>
              <span class='shortcut'>
                Cmd+{{ level - 1 }}
              </span>
            </button>
          </div>
        </div>

        <button
          v-for='button in lineButtons'
          :key='button.name'
          class='button'
          :class='{active: formats[button.name]}'
          :title='button.title'
          @mousedown.prevent=''
          @click='$emit(`format`, button.name)'
        >
          <span class='glyph'>
            <Icon
              :name='button.icon'
              isFitted
              :marginLeft='button.marginLeft'
              :marginRight='button.marginRight'
            />
          </span>
        </button>
      </div>

      <!-- inline formats -->
      <div class='group'>
        <button
          v-for='button in inlineButtons'
          :key='button.name'
          class='button'
          :class='{active: formats[button.name]}'
          :title='button.title'
          @mousedown.prevent=''
          @click='$emit(`format`, button.name)'
        >
          <span class='glyph'>
            <Icon
              :name='button.icon'
              isFitted
              :marginLeft='button.marginLeft'
              :marginRight='button.marginRight'
            />
          </span>
        </button>
      </div>
    </div>

    <div class='end'>
      <button
        class='button settings'
        :class='{active: isSettingsShown}'
        title='Settings'
        @mousedown.prevent=''
        @click='$emit(`toggleSettings`)'
      >
        <span class='glyph'>
          <Icon
            name='sliders'
          />
        </span>
      </button>
    </div>
  </div>

</template><script>

  // components
  import Icon from '/foundation/icon/index.vue'
  import Toggle from './components/toggle.vue'

  // what a line is, after the headings. Each button may have marginLeft and marginRight, px
  // added at its icon's sides (negative: closer), to move it by hand
  const lineButtons = [
    { name: 'ordered', icon: 'list-ordered', title: 'Numbered list (Cmd+7)', marginLeft: -1 },
    { name: 'bullet', icon: 'list-bullet', title: 'Bulleted list (Cmd+8)' },
    { name: 'task', icon: 'task', title: 'Task: a checkbox, or back to a paragraph' }
  ]

  // the inline formats, a group of their own (marginLeft, marginRight as for lineButtons)
  const inlineButtons = [
    { name: 'bold', icon: 'bold', title: 'Bold (Cmd+B)' },
    { name: 'italic', icon: 'italic', title: 'Italic (Cmd+I)' },
    { name: 'strikethrough', icon: 'strikethrough', title: 'Strikethrough (Cmd+Shift+X)' },
    { name: 'code', icon: 'code', title: 'Code (Cmd+E)' },
    { name: 'link', icon: 'link', title: 'Link (Cmd+K)' }
  ]

  export default {
    name: 'Toolbar',
    components: {
      Icon,
      Toggle
    },
    props: {
      isShown: Boolean,
      isSidebarShown: Boolean,
      isSettingsShown: Boolean,
      // the app draws the window's title bar (macOS), which has the arrow
      hasTitleBar: Boolean,
      // the text scrolled up under the toolbar
      isTextUnder: Boolean,
      // what the text with the cursor has (editor/functions/format/active.js): heading 0–6,
      // and true for each of the groups' names it has
      formats: Object
    },
    // format: a group's button name, or `heading` and its level (0: text)
    emits: ['toggle', 'toggleSidebar', 'toggleSettings', 'format'],
    data () {
      return {
        lineButtons,
        inlineButtons,
        isHeadingMenuOpen: false
      }
    },
    watch: {
      // closed by a press anywhere outside it, or Escape
      'isHeadingMenuOpen' (isOpen) {
        if (isOpen) {
          document.addEventListener('pointerdown', this.closeHeadingMenu, true)
          document.addEventListener('keydown', this.closeHeadingMenu, true)
        } else {
          this.removeListeners()
        }
      }
    },
    beforeUnmount () {
      this.removeListeners()
    },
    methods: {
      // the level of the line with the cursor again: back to text
      setHeading (level) {
        this.$emit('format', 'heading', this.formats.heading == level ? 0 : level)
      },
      chooseHeading (level) {
        this.isHeadingMenuOpen = false
        this.$emit('format', 'heading', level)
      },
      closeHeadingMenu (event) {
        if (event.type == 'keydown' ? event.key == 'Escape' : !this.$refs.headingMenu.contains(event.target)) {
          this.isHeadingMenuOpen = false
        }
      },
      removeListeners () {
        document.removeEventListener('pointerdown', this.closeHeadingMenu, true)
        document.removeEventListener('keydown', this.closeHeadingMenu, true)
      }
    }
  }

</script><style scoped lang='less'>

  // as Ordner's header and its buttons (ActionIconStyled): a 3rem bar, 1.3rem icons with 0.5rem
  // around them, the colour fading in 0.3 s
  @height: 3rem;
  @icon: 1.3rem;
  @icon-margin: 0.5rem;
  // in the center's groups: between one icon and the next, as drawn
  @spacing: 1rem;
  @fade: 0.3s ease;
  // sliding in and out: as the text moves with it (functions/slides.js, via App)
  @slide: var(--toolbar-slide-duration, 0.3s) var(--toolbar-slide-easing, ease);
  @slide-duration: var(--toolbar-slide-duration, 0.3s);
  // all six heading buttons fit, with the center still in the middle; narrower: the menu
  @compact-width: 37.5rem;

  // below the title bar where the app draws it (macOS: --title-bar-height)
  .toolbar {
    position: absolute;
    top: var(--title-bar-height, 0px);
    left: 0;
    right: 0;
    // above the sidebars
    z-index: 2;
    height: @height;
    box-sizing: border-box;
    padding: 0 0.4rem;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    container-type: inline-size;
    user-select: none;
    -webkit-user-select: none;

    > .start {
      justify-self: start;
      display: flex;
    }

    > .center {
      display: flex;
      align-items: center;
      // between the line formats and the inline ones
      gap: 1.5rem;
    }

    > .end {
      justify-self: end;
      display: flex;
    }

    // the background, translucent and blurred, as Ordner's folder header, over the whole width:
    // the text, the sidebars' backgrounds and their edges are seen blurred through it. Opaque at
    // the top of the window, 75 % from halfway down; more opaque at the right edge, where the
    // scrollbar is (97 % together with the 75 % under it)
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      --translucent: color-mix(in srgb, var(--color--background) 75%, transparent);
      background:
        linear-gradient(
          to right,
          transparent calc(100% - 2rem),
          color-mix(in srgb, var(--color--background) 88%, transparent) 100%
        ),
        linear-gradient(
          to bottom,
          var(--color--background),
          var(--translucent) 50%
        );
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      // the line below, fading in and out with the sidebars
      box-shadow: inset 0 -1px 0 transparent;
    }

    // a sidebar shown, or the text scrolled under it: a 1 px line at the bottom, as the sidebars'
    // edges
    &.lined::before {
      box-shadow: inset 0 -1px 0 var(--color--border--panel);
    }

    // everything but the arrow slides and fades, each on a layer of its own: WebKit moves it as
    // drawn, smoothly, instead of drawing the thin strokes anew on whole pixels every frame,
    // which made the icons jitter
    &::before,
    > .center,
    > .end,
    .sidebar {
      transition: transform @slide, opacity @slide;
      will-change: transform, opacity;
    }

    &::before {
      transition: transform @slide, opacity @slide, box-shadow @fade;
    }

    // hidden: the bar is slid up out of sight; the arrow stays, drawn only under the mouse
    &.hidden {
      pointer-events: none;

      &::before,
      > .center,
      > .end,
      .sidebar {
        transform: translateY(-@height);
        opacity: 0;
      }

      > .center,
      > .end,
      .sidebar {
        visibility: hidden;
        transition: transform @slide, opacity @slide, visibility 0s @slide-duration;
      }

      .angle {
        pointer-events: auto;
        opacity: 0;
        transition: opacity @fade;

        &:hover {
          opacity: 1;
        }
      }
    }
  }

  .group {
    display: flex;
    align-items: center;
  }

  .heading-menu {
    display: none;
    position: relative;
  }

  @container (width < @compact-width) {
    .headings {
      display: none;
    }

    .heading-menu {
      display: flex;
    }
  }

  .button {
    appearance: none;
    display: flex;
    align-items: center;
    margin: 0;
    padding: @icon-margin;
    border: 0;
    background: none;
    font: inherit;
    color: var(--color--text--secondary);
    cursor: pointer;
    transition: color @fade;

    &:hover,
    &.open {
      color: var(--color--text--secondary--hover);
    }

    &.active,
    &:active {
      color: var(--color--text--secondary--active);
    }

    &:active {
      transition: none;
    }

    > .glyph {
      width: @icon;
      height: @icon;
    }

    // smaller, its stroke as thick as the icons' (15 × 0.8 / 1.3: about 9)
    // as wide as drawn (fitted), a little apart from the H
    > .chevron {
      height: 0.8rem;
      margin-left: 0.2rem;
    }
  }

  // In the center's groups, every icon is as far from the next as drawn (@spacing): the icons
  // are as wide as their drawings (Icon's isFitted).
  .center .button {
    padding-left: (@spacing / 2);
    padding-right: (@spacing / 2);

    > .glyph {
      width: auto;
    }
  }

  // below the toolbar (the button is shorter than it), its edge under the H
  .menu {
    position: absolute;
    top: calc(100% + (@height - @icon - 2 * @icon-margin) / 2 + 0.25rem);
    left: (@spacing / 2);
    z-index: 1;
    display: flex;
    flex-direction: column;
    padding: 0.3rem 0;
    font-size: 0.85rem;
    background: var(--color--background);
    border: 1px solid var(--color--border--solid);
    border-radius: 0.4rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);

    > .item {
      appearance: none;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin: 0;
      padding: 0.25rem 0.75rem 0.25rem 0.5rem;
      border: 0;
      background: none;
      font: inherit;
      color: var(--color--text--primary);
      text-align: left;
      white-space: nowrap;
      cursor: pointer;

      &:hover {
        background: var(--color--outline--active);
      }

      > .check {
        width: 0.9rem;
        height: 0.9rem;
      }

      > .label {
        flex: 1 1 auto;
      }

      > .shortcut {
        margin-left: 1.5rem;
        color: var(--color--text--secondary);
      }
    }
  }

</style>
