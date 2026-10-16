<template>

  <div class='app'>
    <Toolbar
      v-bind='{
        documentNames,
        documentName,
        isMarkdownShown,
        isLiteral,
        isStatsShown,
        progress
      }'
      @open='open'
      @openFile='openFile'
      @toggleMarkdown='toggleMarkdown'
      @toggleLiteral='isLiteral = !isLiteral'
      @toggleStats='isStatsShown = !isStatsShown'
      @benchmark='benchmark'
    />

    <Editor
      ref='editor'
      v-bind='{
        text,
        isMarkdownShown,
        isLiteral
      }'
      @toggleMarkdown='toggleMarkdown'
    />

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
  import Metrics from './metrics/index.vue'
  // functions
  import generateDocument from './functions/generate-document.js'
  import runBenchmark from './benchmark/functions/run.js'

  // the test fixtures double as sample documents
  const fixtures = import.meta.glob('/tests/fixtures/*.md', { query: '?raw', import: 'default', eager: true })
  const generatedName = 'generated (10k lines)'
  const documents = {
    ...Object.fromEntries(Object.entries(fixtures).map(([path, text]) => [path.split('/').pop(), text])),
    [generatedName]: null
  }

  export default {
    name: 'App',
    components: {
      Toolbar,
      Editor,
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
        results: [],
        progress: null
      }
    },
    methods: {
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
