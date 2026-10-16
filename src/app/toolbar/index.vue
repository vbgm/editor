<!--
The toolbar, over the top of the window: the text scrolls on under it, seen through its
translucent, blurred background (as Ordner's folder header).
- left: hide or show the toolbar (Cmd+Alt+T), the outline sidebar (Ctrl+Cmd+S)
- center: formatting for the text with the cursor, lit where the cursor's text has it (formats,
  from the editor): headings H1–H6 (a menu where the toolbar is too narrow for all six), inline
  formats, lists
- right: the settings sidebar
Hiding and showing, it slides out at the top and back in, fading, in 0.3 s, as the sidebars do;
the app moves the text with it (App's toggleToolbar). Hidden, only the arrow to show it again
stays, in its place, and is drawn only under the mouse.
Buttons look like Ordner's (ActionIconStyled): icons only, no background; the icon's colour
changes when hovered, pressed or on. They do not take the keyboard focus (mousedown.prevent):
the editor keeps the cursor and its selection.
-->
<template>

  <div
    class='toolbar'
    :class='{hidden: !isShown}'
  >
    <div class='start'>
      <button
        class='button angle'
        :title='isShown ? `Hide the toolbar (Cmd+Alt+T)` : `Show the toolbar (Cmd+Alt+T)`'
        @mousedown.prevent=''
        @click='$emit(`toggle`)'
      >
        <span class='glyph'>
          <Icon
            name='angle'
            :value='angle'
          />
        </span>
      </button>

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
            :strokeWidth='strokeOf(isSidebarShown)'
          />
        </span>
      </button>
    </div>

    <div class='center'>
      <!-- all six levels where there is room; otherwise a menu -->
      <div class='group headings'>
        <button
          v-for='level in 6'
          :key='level'
          class='button text'
          :class='{active: formats.heading == level}'
          :title='`Heading ${level} (Cmd+${level})`'
          @mousedown.prevent=''
          @click='setHeading(level)'
        >
          H{{ level }}
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
              :strokeWidth='strokeOf(formats.heading > 0)'
            />
          </span>
          <span class='chevron'>
            <Icon
              name='angle-down'
              :strokeWidth='16'
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
              {{ level == 1 ? `Text` : `Heading ${level - 1}` }}
            </span>
            <span class='shortcut'>
              Cmd+{{ level - 1 }}
            </span>
          </button>
        </div>
      </div>

      <div
        v-for='(group, index) in groups'
        :key='index'
        class='group'
      >
        <button
          v-for='button in group'
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
              :strokeWidth='strokeOf(formats[button.name])'
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
            :strokeWidth='strokeOf(isSettingsShown)'
          />
        </span>
      </button>
    </div>
  </div>

</template><script>

  // components
  import Icon from '/foundation/icon/index.vue'

  // the formatting buttons after the headings, in groups
  const groups = [
    [
      { name: 'bold', icon: 'bold', title: 'Bold (Cmd+B)' },
      { name: 'italic', icon: 'italic', title: 'Italic (Cmd+I)' },
      { name: 'strikethrough', icon: 'strikethrough', title: 'Strikethrough (Cmd+Shift+X)' },
      { name: 'code', icon: 'code', title: 'Code (Cmd+E)' },
      { name: 'link', icon: 'link', title: 'Link (Cmd+K)' }
    ],
    [
      { name: 'bullet', icon: 'list-bullet', title: 'Bulleted list (Cmd+8)' },
      { name: 'ordered', icon: 'list-ordered', title: 'Numbered list (Cmd+7)' },
      { name: 'task', icon: 'task', title: 'Task (Cmd+Enter)' }
    ]
  ]

  export default {
    name: 'Toolbar',
    components: {
      Icon
    },
    props: {
      isShown: Boolean,
      isSidebarShown: Boolean,
      isSettingsShown: Boolean,
      // what the text with the cursor has (editor/functions/format/active.js): heading 0–6,
      // and true for each of the groups' names it has
      formats: Object
    },
    // format: a group's button name, or `heading` and its level (0: text)
    emits: ['toggle', 'toggleSidebar', 'toggleSettings', 'format'],
    data () {
      return {
        groups,
        isHeadingMenuOpen: false,
        // the arrow: 0 down, 1 up (morphAngle)
        angle: this.isShown ? 1 : 0
      }
    },
    watch: {
      'isShown' (isShown) {
        this.morphAngle(isShown ? 1 : 0)
      },
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
      cancelAnimationFrame(this.frame)
    },
    methods: {
      // The arrow morphs up while the toolbar shows (it hides it), down while hidden, as long as
      // the toolbar slides and with the same easing. Safari cannot animate a path's shape in
      // CSS: the path is drawn anew each frame, its progress eased by a target-less animation.
      morphAngle (to) {
        cancelAnimationFrame(this.frame)
        const from = this.angle
        const timing = new Animation(new KeyframeEffect(null, null, { duration: 300, easing: 'ease' }))
        timing.play()
        const step = () => {
          const { progress } = timing.effect.getComputedTiming()
          // done: no progress any more
          this.angle = progress == null ? to : from + (to - from) * progress
          if (progress != null) this.frame = requestAnimationFrame(step)
        }
        step()
      },
      // as Ordner's buttons: a little thicker when on
      strokeOf (isActive) {
        return isActive ? 12 : 11
      },
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
  @fade: 0.3s ease;
  // all six heading buttons fit, with the center still in the middle; narrower: the menu
  @compact-width: 41rem;

  .toolbar {
    position: absolute;
    top: 0;
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

    // the background, translucent and blurred, as Ordner's folder header: more opaque at the
    // right edge, where the scrollbar is; a 1 px line at the bottom
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      --translucent: color-mix(in srgb, var(--color--background) 75%, transparent);
      background: linear-gradient(
        to right,
        var(--translucent),
        var(--translucent) calc(100% - 2rem),
        color-mix(in srgb, var(--color--background) 97%, transparent) 100%
      );
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      box-shadow: inset 0 -1px 0 var(--color--border--solid);
    }

    > .start {
      justify-self: start;
      display: flex;
    }

    > .center {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    > .end {
      justify-self: end;
      display: flex;
    }

    // everything but the arrow slides and fades
    &::before,
    > .center,
    > .end,
    .sidebar {
      transition: transform @fade, opacity @fade;
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
        transition: transform @fade, opacity @fade, visibility 0s 0.3s;
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
    cursor: default;
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

    // the headings: close together, as one control
    &.text {
      height: @icon + 2 * @icon-margin;
      padding: 0 0.3rem;
      font-size: 0.8rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    > .chevron {
      width: 0.8rem;
      height: 0.8rem;
      margin-left: -0.1rem;
    }
  }

  .menu {
    position: absolute;
    top: 100%;
    left: 0;
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
      cursor: default;

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
