// npm packages
import { Facet } from '@codemirror/state'

// Whether the editor is in Markdown mode (create-state.js): the file as it is, symbols and blank
// lines visible. Otherwise it is in Document mode, where they are hidden.
export default Facet.define({
  combine: values => values.some(Boolean)
})
