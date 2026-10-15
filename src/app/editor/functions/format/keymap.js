// npm packages
import { keymap } from '@codemirror/view'
// local functions
import { setHeading, toggleList } from './lines.js'
import { toggleInline, insertLink } from './inline.js'

// Formatting shortcuts (see docs/decisions.md). Line formats have two sets:
// - Cmd+1…6 / Cmd+0 / Cmd+7 / Cmd+8: the main shortcuts (native menu items in the app). Browsers
//   reserve Cmd+number for switching tabs; where a browser lets the page handle the key first,
//   it is handled here and the browser's action is prevented.
// - Cmd+Alt+number: the same, for browsers that keep Cmd+number to themselves.
// (Alt+number alone types characters on many keyboard layouts, such as [ ] | { } on German ones.)

const lineFormats = [
  ['1', setHeading(1)],
  ['2', setHeading(2)],
  ['3', setHeading(3)],
  ['4', setHeading(4)],
  ['5', setHeading(5)],
  ['6', setHeading(6)],
  ['0', setHeading(0)],
  ['7', toggleList('ordered')],
  ['8', toggleList('bullet')]
]

export default keymap.of([
  ...lineFormats.flatMap(([key, run]) => [
    { key: `Mod-${key}`, run, preventDefault: true },
    { key: `Mod-Alt-${key}`, run, preventDefault: true }
  ]),
  { key: 'Mod-b', run: toggleInline('**'), preventDefault: true },
  { key: 'Mod-i', run: toggleInline('*'), preventDefault: true },
  { key: 'Mod-e', run: toggleInline('`'), preventDefault: true },
  { key: 'Mod-Shift-x', run: toggleInline('~~'), preventDefault: true },
  { key: 'Mod-k', run: insertLink, preventDefault: true }
])
