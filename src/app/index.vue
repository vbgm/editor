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
        progress
      }'
      @open='open'
      @openFile='openFile'
      @granularity='granularity = $event'
      @appearance='setAppearance'
      @benchmark='benchmark'
    />

    <PlainTextarea
      v-if='appearance == `textarea`'
      ref='textarea'
      :text='text'
    />
    <Editor
      v-else
      ref='editor'
      v-bind='{
        text,
        granularity,
        appearance
      }'
    />

    <Metrics
      v-bind='{
        results
      }'
    />
  </div>

</template><script>

  // components
  import Toolbar from './toolbar/index.vue'
  import Editor from './editor/index.vue'
  import PlainTextarea from './textarea/index.vue'
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
      PlainTextarea,
      Metrics
    },
    data () {
      return {
        documentNames: Object.keys(documents),
        documentName: 'basic.md',
        text: documents['basic.md'],
        granularities,
        granularity: 'item',
        // 'plain' and 'textarea' are baselines for comparing how typing feels
        appearances: ['cards', 'plain', 'textarea'],
        appearance: 'cards',
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
        // keep the edits made in the editor or textarea that is being replaced
        if (value == 'textarea' || this.appearance == 'textarea') {
          this.text = this.appearance == 'textarea' ? this.$refs.textarea.getText() : this.$refs.editor.getText()
        }
        this.appearance = value
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
