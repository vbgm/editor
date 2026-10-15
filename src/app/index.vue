<template>

  <div class='app'>
    <Toolbar
      v-bind='{
        documentNames,
        documentName,
        isMarkdownShown,
        progress
      }'
      @open='open'
      @openFile='openFile'
      @toggleMarkdown='toggleMarkdown'
      @benchmark='benchmark'
    />

    <!-- kept mounted while the raw Markdown is shown, so its undo history stays -->
    <Editor
      v-show='!isMarkdownShown'
      ref='editor'
      :text='text'
      @toggleMarkdown='toggleMarkdown'
    />
    <MarkdownSource
      v-if='isMarkdownShown'
      ref='markdown'
      :text='markdownText'
      @toggleMarkdown='toggleMarkdown'
    />

    <Metrics
      v-bind='{
        look: isMarkdownShown ? `markdown` : `editor`,
        results
      }'
    />
  </div>

</template><script>

  // components
  import Toolbar from './toolbar/index.vue'
  import Editor from './editor/index.vue'
  import MarkdownSource from './markdown/index.vue'
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
      MarkdownSource,
      Metrics
    },
    data () {
      return {
        documentNames: Object.keys(documents),
        documentName: 'basic.md',
        text: documents['basic.md'],
        // the raw Markdown in a textarea instead of the editor (button or Cmd+Shift+M)
        isMarkdownShown: false,
        // the textarea's text when it was opened
        markdownText: '',
        results: [],
        progress: null
      }
    },
    methods: {
      open (name) {
        this.isMarkdownShown = false
        this.documentName = name
        this.text = documents[name] ?? (documents[name] = generateDocument())
      },
      openFile ({ name, text }) {
        this.isMarkdownShown = false
        if (!this.documentNames.includes(name)) this.documentNames.push(name)
        documents[name] = text
        this.documentName = name
        this.text = text
      },
      toggleMarkdown () {
        if (this.isMarkdownShown) {
          // the edits made in the textarea go back into the editor as one undo step
          this.$refs.editor.applyLines(this.$refs.markdown.getText())
          this.isMarkdownShown = false
          this.$nextTick(() => this.$refs.editor.focus())
        } else {
          this.markdownText = this.$refs.editor.getLines()
          this.isMarkdownShown = true
        }
      },
      async benchmark () {
        if (this.isMarkdownShown) this.toggleMarkdown()
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
