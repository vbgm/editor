<template>

  <div class='app'>
    <Toolbar
      v-bind='{
        documentNames,
        documentName,
        isMarkdownShown,
        isLiteral,
        isStatsShown,
        isSidebarShown,
        progress
      }'
      @toggleSidebar='toggleSidebar'
      @open='open'
      @openFile='openFile'
      @toggleMarkdown='toggleMarkdown'
      @toggleLiteral='isLiteral = !isLiteral'
      @toggleStats='isStatsShown = !isStatsShown'
      @benchmark='benchmark'
    />

    <Sidebar
      v-bind='{
        isShown: isSidebarShown,
        width: sidebarWidth,
        anchor: `.cm-content`
      }'
      @resize='resizeSidebar'
    >
      <Outline
        v-bind='{
          sections,
          activeIndex: activeSection,
          canDrop: (from, slot) => $refs.editor.canDropSection(from, slot)
        }'
        @select='$refs.editor.selectSection($event)'
        @move='$refs.editor.moveSection($event.from, $event.slot)'
      />

      <template #center>
        <Editor
          ref='editor'
          v-bind='{
            text,
            isMarkdownShown,
            isLiteral
          }'
          @toggleMarkdown='toggleMarkdown'
          @outline='sections = $event'
          @activeSection='activeSection = $event'
        />
      </template>
    </Sidebar>

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

  // components
  import Toolbar from './toolbar/index.vue'
  import Editor from './editor/index.vue'
  import Sidebar from './sidebar/index.vue'
  import Outline from './outline/index.vue'
  import Metrics from './metrics/index.vue'
  // functions
  import generateDocument from './functions/generate-document.js'
  import runBenchmark from './benchmark/functions/run.js'

  // the test fixtures double as sample documents
  const fixtures = import.meta.glob('/tests/fixtures/*.md', { query: '?raw', import: 'default', eager: true })
  const generatedName = 'generated (10k lines)'

  // the sidebar's width and whether it shows, kept in the browser until the app has its own
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
  const documents = {
    ...Object.fromEntries(Object.entries(fixtures).map(([path, text]) => [path.split('/').pop(), text])),
    [generatedName]: null
  }

  export default {
    name: 'App',
    components: {
      Toolbar,
      Editor,
      Sidebar,
      Outline,
      Metrics
    },
    data () {
      return {
        documentNames: Object.keys(documents),
        documentName: 'basic.md',
        text: documents['basic.md'],
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
        // the document's headings, and the index of the one with the cursor
        sections: [],
        activeSection: -1,
        results: [],
        progress: null
      }
    },
    mounted () {
      this.onKeyDown = event => {
        if (event.metaKey && event.ctrlKey && !event.altKey && !event.shiftKey && event.code == 'KeyS') {
          event.preventDefault()
          this.toggleSidebar()
        }
      }
      window.addEventListener('keydown', this.onKeyDown)
    },
    beforeUnmount () {
      window.removeEventListener('keydown', this.onKeyDown)
    },
    methods: {
      toggleSidebar () {
        this.isSidebarShown = !this.isSidebarShown
        store('sidebar.isShown', this.isSidebarShown)
      },
      resizeSidebar (width) {
        this.sidebarWidth = width
        store('sidebar.width', width)
      },
      open (name) {
        this.documentName = name
        this.text = documents[name] ?? (documents[name] = generateDocument())
      },
      openFile ({ name, text }) {
        if (!this.documentNames.includes(name)) this.documentNames.push(name)
        documents[name] = text
        this.documentName = name
        this.text = text
      },
      toggleMarkdown () {
        this.isMarkdownShown = !this.isMarkdownShown
      },
      async benchmark () {
        // the results show in the stats
        this.isStatsShown = true
        const text = documents[generatedName] ?? (documents[generatedName] = generateDocument())
        const view = this.$refs.editor.view
        this.results = await runBenchmark(view, text, {
          onProgress: progress => { this.progress = progress }
        })
        // back to the document that was open
        this.$refs.editor.view.setState(this.$refs.editor.createState())
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
  }

</style>
