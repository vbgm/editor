// npm packages
import { Facet } from '@codemirror/state'

// Whether Markdown is shown as it is in the file (create-state.js). Card layers only draw
// cards then; otherwise the page looks like plain text.
export default Facet.define({
  combine: values => values.some(Boolean)
})
