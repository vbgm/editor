<template>

  <div
    class='app'
    :style='{"--top-inset": `${topInset}px`}'
  >
    <div class='main'>
      <Toolbar
        v-bind='{
          isShown: isToolbarShown,
          isSidebarShown: isLeftShown,
          isSettingsShown: isRightShown,
          formats
        }'
        @toggle='toggleToolbar'
        @toggleSidebar='toggleSidebar'
        @toggleSettings='toggleSettings'
        @format='(name, level) => $refs.editor.format(name, level)'
      />

      <Sidebar
        ref='body'
        v-bind='{
          isLeftShown,
          leftWidth: sidebarWidth,
          isRightShown,
          rightWidth: settingsWidth,
          isTextSliding,
          anchor: `.cm-content`
        }'
        @resize='resizeSidebar'
      >
        <template #left>
          <Outline
            v-bind='{
              sections,
              activeIndex: activeSection,
              canDrop: (from, slot) => $refs.editor.canDropSection(from, slot)
            }'
            @select='$refs.editor.selectSection($event)'
            @move='$refs.editor.moveSection($event.from, $event.slot)'
            @renameStart='$refs.editor.startRename($event)'
            @renameInput='$refs.editor.previewRename($event.text)'
            @rename='$refs.editor.finishRename($event.text)'
          />
        </template>

        <template #right>
          <Settings
            v-bind='{
              sampleNames,
              documentName,
              isMarkdownShown,
              isLiteral,
              isStatsShown,
              isTextSliding,
              progress
            }'
            @openSample='openSample'
            @openFile='openFile'
            @toggleMarkdown='toggleMarkdown'
            @toggleLiteral='isLiteral = !isLiteral'
            @toggleTextSliding='toggleTextSliding'
            @toggleStats='isStatsShown = !isStatsShown'
            @benchmark='benchmark'
          />
        </template>

        <template #center>
          <Editor
            ref='editor'
            v-bind='{
              text,
              isMarkdownShown,
              isLiteral,
              topInset
            }'
            @toggleMarkdown='toggleMarkdown'
            @change='saving.edited()'
            @outline='sections = $event'
            @activeSection='activeSection = $event'
            @formats='formats = $event'
          />
        </template>
      </Sidebar>
    </div>

    <!-- v-show: keeps counting key presses while hidden -->
    <Metrics
      v-show='isStatsShown'
      v-bind='{
        look: isMarkdownShown ? `markdown` : `document`,
        results
      }'
    />
  </div>

</template><script>

  // platform
  import platform from '/src/platform/index.js'
  // components
  import Toolbar from './toolbar/index.vue'
  import Editor from './editor/index.vue'
  import Sidebar from './sidebar/index.vue'
  import Outline from './outline/index.vue'
  import Settings from './settings/index.vue'
  import Metrics from './metrics/index.vue'
  // functions
  import generateDocument from './functions/generate-document.js'
  import runBenchmark from './benchmark/functions/run.js'
  import Saving, { untitledName } from './functions/saving.js'

  // the test fixtures double as sample documents: opened without a path, so saving asks where
  const fixtures = import.meta.glob('/tests/fixtures/*.md', { query: '?raw', import: 'default', eager: true })
  const generatedName = 'generated (10k lines)'
  // the toolbar's height (3rem): while it shows, the editor and the sidebars start below it, and
  // scroll on under it
  const toolbarHeight = 48

  // the sidebars' widths and whether they and the toolbar show, kept in the browser until the app has its own
  // settings store; storage may be unavailable (private windows)
  function stored (key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key))
      return value ?? fallback
    } catch {
      return fallback
    }
  }

  function store (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  }
  const samples = {
    ...Object.fromEntries(Object.entries(fixtures).map(([path, text]) => [path.split('/').pop(), text])),
    [generatedName]: null
  }
  // the app starts with a new document, the browser (development) with the user's sample
  const first = platform.isApp ? { name: untitledName, text: '' } : { name: 'basic.md', text: samples['basic.md'] }

  // the menu's undo and redo for a text field outside the editor (renaming in the outline)
  function isInField () {
    const element = document.activeElement
    return element?.matches('input, textarea') && !element.closest('.cm-editor')
  }

  export default {
    name: 'App',
    components: {
      Toolbar,
      Editor,
      Sidebar,
      Outline,
      Settings,
      Metrics
    },
    data () {
      return {
        sampleNames: Object.keys(samples),
        documentName: first.name,
        // the document the editor starts with; others are loaded into it (show)
        text: first.text,
        // Markdown mode (button or Cmd+Shift+M): the file as it is, symbols and blank lines
        // visible; otherwise Document mode
        isMarkdownShown: false,
        // Literal: typed text stays as typed in Document mode (escaped in the file); otherwise
        // typing Markdown formats ('# ' makes a heading)
        isLiteral: false,
        // the stats footer (typing latency, benchmark results)
        isStatsShown: false,
        // the outline sidebar (Ctrl+Cmd+S, as "Show Sidebar" in macOS apps)
        isSidebarShown: stored('sidebar.isShown', false),
        sidebarWidth: stored('sidebar.width', 240),
        // the text moves aside when the sidebar opens; otherwise the sidebar is drawn over the
        // margin and the text stays (moving only as far as needed in a narrow window)
        isTextSliding: stored('sidebar.isTextSliding', false),
        // the toolbar (Cmd+Alt+T, as "Show Toolbar" in macOS apps)
        isToolbarShown: stored('toolbar.isShown', true),
        // the settings sidebar, on the right
        isSettingsShown: stored('settings.isShown', false),
        settingsWidth: stored('settings.width', 240),
        // of the text with the cursor, for the toolbar (editor/functions/format/active.js)
        formats: {},
        // the document's headings, and the index of the one with the cursor
        sections: [],
        activeSection: -1,
        results: [],
        progress: null
      }
    },
    computed: {
      // px at the top covered by the toolbar
      topInset () {
        return this.isToolbarShown ? toolbarHeight : 0
      },
      // the sidebars hide with the toolbar, and come back with it as they were
      isLeftShown () {
        return this.isToolbarShown && this.isSidebarShown
      },
      isRightShown () {
        return this.isToolbarShown && this.isSettingsShown
      }
    },
    created () {
      // not reactive; the window's title says whether there are unsaved edits
      this.saving = new Saving({
        platform,
        getText: () => this.$refs.editor.getText(),
        onChange: ({ name, isEdited }) => {
          this.documentName = name
          platform.setTitle(isEdited ? `${name} — Edited` : name)
        }
      })
      this.saving.load({ path: null, ...first })
    },
    mounted () {
      platform.setTitle(first.name)
      platform.onMenu(command => this.runMenu(command))
      platform.onFileDrop(paths => this.openPath(paths[0]))
      platform.onCloseRequested(() => this.saving.release())
      // the document is in the page: the window can show without flashing
      platform.ready()
      // the menu's shortcuts, for the browser (in the app the menu takes them first)
      this.onKeyDown = event => {
        if (event.metaKey && event.ctrlKey && !event.altKey && !event.shiftKey && event.code == 'KeyS') {
          event.preventDefault()
          this.toggleSidebar()
        }
        if (event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey && event.code == 'KeyT') {
          event.preventDefault()
          this.toggleToolbar()
        }
      }
      window.addEventListener('keydown', this.onKeyDown)
    },
    beforeUnmount () {
      window.removeEventListener('keydown', this.onKeyDown)
    },
    methods: {
      toggleSidebar () {
        this.showSidebar('isSidebarShown', 'sidebar.isShown')
      },
      toggleSettings () {
        this.showSidebar('isSettingsShown', 'settings.isShown')
      },
      // with the toolbar hidden, a sidebar opens with it (no sidebar without the toolbar)
      showSidebar (key, storeKey) {
        this[key] = this.isToolbarShown ? !this[key] : true
        store(storeKey, this[key])
        if (!this.isToolbarShown) this.toggleToolbar()
      },
      // The toolbar slides in from the top as the sidebars do from the side (toolbar/index.vue),
      // and the text moves down with it: the body takes its new top inset at once and is drawn
      // moving from where it was (a transform: the editor is laid out once, as for the sidebars).
      // The editor keeps its scroll position, so its text moves exactly as far as the inset.
      toggleToolbar () {
        const body = this.$refs.body.$el
        // a toggle during a slide starts from where the body is drawn now
        const transform = getComputedStyle(body).transform
        const drawn = transform == 'none' ? 0 : new DOMMatrix(transform).m42
        this.bodySlide?.cancel()
        this.isToolbarShown = !this.isToolbarShown
        store('toolbar.isShown', this.isToolbarShown)
        const from = drawn + (this.isToolbarShown ? -toolbarHeight : toolbarHeight)
        this.$nextTick(() => {
          this.bodySlide = body.animate([{ transform: `translateY(${from}px)` }, { transform: 'translateY(0)' }], { duration: 300, easing: 'ease' })
        })
      },
      toggleTextSliding () {
        this.isTextSliding = !this.isTextSliding
        store('sidebar.isTextSliding', this.isTextSliding)
      },
      resizeSidebar ({ side, width }) {
        if (side == 'left') {
          this.sidebarWidth = width
          store('sidebar.width', width)
        } else {
          this.settingsWidth = width
          store('settings.width', width)
        }
      },
      // native menu commands (src-tauri/src/menu.rs)
      runMenu (command) {
        const commands = {
          new: () => this.newDocument(),
          open: () => this.openFile(),
          save: () => this.saving.save({ isAsked: true }),
          saveAs: () => this.saving.saveAs(),
          // the window asks to close (onCloseRequested); the app quits with its only window
          close: () => platform.close(),
          quit: () => platform.close(),
          undo: () => isInField() ? document.execCommand('undo') : this.$refs.editor.undo(),
          redo: () => isInField() ? document.execCommand('redo') : this.$refs.editor.redo(),
          markdown: () => this.toggleMarkdown(),
          sidebar: () => this.toggleSidebar(),
          toolbar: () => this.toggleToolbar()
        }
        commands[command]?.()
      },
      // a document into the editor: { path (null: none yet), name, text, modified }
      show (document) {
        this.saving.load(document)
        this.documentName = document.name
        platform.setTitle(document.name)
        this.$refs.editor.load(document.text)
        this.$refs.editor.focus()
      },
      // each of these first saves the open document, or asks (and may be cancelled)
      async newDocument () {
        if (await this.saving.release()) this.show({ path: null, name: untitledName, text: '' })
      },
      async openSample (name) {
        if (!await this.saving.release()) return
        this.show({ path: null, name, text: samples[name] ?? (samples[name] = generateDocument()) })
      },
      async openFile () {
        const file = await this.readFile(() => platform.pickFile())
        if (file && await this.saving.release()) this.show(file)
      },
      async openPath (path) {
        const file = await this.readFile(() => platform.readFile(path))
        if (file && await this.saving.release()) this.show(file)
      },
      async readFile (read) {
        try {
          return await read()
        } catch (error) {
          await platform.tell('The file could not be opened.', error.kind == 'notText' ? 'It is not a text file (UTF-8).' : error.message)
          return null
        }
      },
      toggleMarkdown () {
        this.isMarkdownShown = !this.isMarkdownShown
      },
      async benchmark () {
        // the results show in the stats
        this.isStatsShown = true
        // the benchmark's typing never reaches the file
        await this.saving.save()
        const documentText = this.$refs.editor.getText()
        this.saving.isPaused = true
        const text = samples[generatedName] ?? (samples[generatedName] = generateDocument())
        const view = this.$refs.editor.view
        this.results = await runBenchmark(view, text, {
          onProgress: progress => { this.progress = progress }
        })
        // back to the document that was open, as it was
        this.$refs.editor.view.setState(this.$refs.editor.createState(documentText))
        this.saving.isPaused = false
      }
    }
  }

</script><style scoped lang='less'>

  .app {
    height: 100%;
    display: flex;
    flex-direction: column;

    // nothing may be wider than the window: the editor scrolling the cursor into view would
    // otherwise scroll the whole app sideways
    > * {
      min-width: 0;
    }

    // the toolbar over the sidebars and the editor
    > .main {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      position: relative;
      // the body sliding with the toolbar stays above the stats
      overflow: hidden;
    }
  }

</style>
