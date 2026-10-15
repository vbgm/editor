<template>

  <div class='app'>
    <Toolbar
      v-bind='{
        documentNames,
        documentName,
        granularities,
        granularity,
        appearances,
        appearance,
        isMarkdownShown,
        progress
      }'
      @open='open'
      @openFile='openFile'
      @granularity='granularity = $event'
      @appearance='setAppearance'
      @toggleMarkdown='isMarkdownShown = !isMarkdownShown'
      @benchmark='benchmark'
    />

    <NativeEditor
      v-if='isNative(appearance)'
      :key='appearance'
      ref='native'
      v-bind='{
        kind: appearance,
        text
      }'
    />
    <Editor
      v-else
      ref='editor'
      v-bind='{
        text,
        granularity,
        appearance,
        isMarkdownShown
      }'
      @toggleMarkdown='isMarkdownShown = !isMarkdownShown'
    />

    <Metrics
      v-bind='{
        look: appearance,
        results
      }'
    />
  </div>

</template><script>

  // components
  import Toolbar from './toolbar/index.vue'
  import Editor from './editor/index.vue'
  import NativeEditor from './native/index.vue'
  import Metrics from './metrics/index.vue'
  // functions
  import { granularities } from './editor/functions/blocks/index.js'
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
      NativeEditor,
      Metrics
    },
    data () {
      return {
        documentNames: Object.keys(documents),
        documentName: 'basic.md',
        text: documents['basic.md'],
        granularities,
        granularity: 'item',
        // from full to bare, for comparing how typing feels:
        // cards; styled Markdown without cards; bare CodeMirror; browser-native editing
        appearances: ['cards', 'styled', 'plain', 'contenteditable', 'textarea'],
        appearance: 'cards',
        // Markdown syntax is hidden by default (Cmd+Shift+M or the toolbar button shows it)
        isMarkdownShown: false,
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
      setAppearance (value) {
        // keep the edits made in the editor that is being replaced
        // (CodeMirror looks switch in place and keep their state)
        if (this.isNative(value) || this.isNative(this.appearance)) {
          this.text = (this.isNative(this.appearance) ? this.$refs.native : this.$refs.editor).getText()
        }
        this.appearance = value
      },
      isNative (appearance) {
        return appearance == 'textarea' || appearance == 'contenteditable'
      },
      async benchmark () {
        const text = documents[generatedName] ?? (documents[generatedName] = generateDocument())
        const view = this.$refs.editor.view
        this.results = await runBenchmark(view, text, {
          onProgress: progress => { this.progress = progress }
        })
        // back to the document that was open, in the selected granularity
        this.$refs.editor.view.setState(this.$refs.editor.createState())
      }
    }
  }

</script><style scoped lang='less'>

  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

</style>
