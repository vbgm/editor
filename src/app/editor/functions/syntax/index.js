// npm packages
import { RangeSetBuilder, EditorState, EditorSelection } from '@codemirror/state'
import { ViewPlugin, Decoration, WidgetType, EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// Hides the Markdown syntax while Markdown is not shown: the file stays exactly as it is, only
// the symbols are not drawn.
// - hidden: heading marks ('## ', closing '#'), emphasis, strikethrough and inline code marks,
//   link brackets and addresses (only the link text stays), autolink '<' '>', quote '> ',
//   escaping backslashes
// - whole lines collapsed: setext underlines ('===', '---') and code fences ('```js')
// - drawn instead: '•' for bullets, a checkbox for '[ ]' / '[x]', a line for '***' rules;
//   numbers of numbered lists stay as they are
// The cursor skips the hidden symbols, and a cursor at the start of a line goes after its
// heading, quote or bullet mark, so typing there types into the text, and Backspace at the start
// of a heading, quote or list item removes its mark in one press.
// Only the visible lines are looked at.

class BulletWidget extends WidgetType {
  eq () { return true }

  toDOM () {
    const dom = document.createElement('span')
    dom.className = 'cm-bullet'
    dom.textContent = '•'
    return dom
  }
}

class CheckboxWidget extends WidgetType {
  constructor (isChecked) {
    super()
    this.isChecked = isChecked
  }

  eq (other) { return other.isChecked == this.isChecked }

  toDOM (view) {
    const dom = document.createElement('input')
    dom.type = 'checkbox'
    dom.className = 'cm-task-checkbox'
    dom.checked = this.isChecked
    dom.addEventListener('mousedown', event => {
      event.preventDefault()
      // the marker is '[ ]' or '[x]'; toggle the character between the brackets
      const pos = view.posAtDOM(dom)
      const marker = view.state.sliceDoc(pos, pos + 3)
      if (!/^\[[ xX]\]$/.test(marker)) return
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: this.isChecked ? ' ' : 'x' }, userEvent: 'input.toggle' })
    })
    return dom
  }

  ignoreEvent () { return false }
}

const hide = Decoration.replace({})
const bullet = Decoration.replace({ widget: new BulletWidget() })
const checked = Decoration.replace({ widget: new CheckboxWidget(true) })
const unchecked = Decoration.replace({ widget: new CheckboxWidget(false) })
const collapsedLine = Decoration.line({ class: 'cm-collapsed-line' })
const quoteLine = Decoration.line({ class: 'cm-quote-line' })
const ruleLine = Decoration.line({ class: 'cm-rule-line' })

// spaces and tabs after pos, up to the end of the line
function spacesAfter (doc, pos) {
  const line = doc.lineAt(pos)
  return /^[ \t]*/.exec(line.text.slice(pos - line.from))[0].length
}

function build (view) {
  const { state } = view
  const { doc } = state
  // replaced ranges and line classes, collected first: the tree is not in document order for them
  const marks = []
  const lines = []
  // ranges the cursor skips: hidden symbols, and collapsed lines with their line break
  const atomic = []

  const hideRange = (from, to, decoration = hide) => {
    if (to > from) {
      marks.push([from, to, decoration])
      atomic.push([from, to])
    }
  }
  const collapseLine = pos => {
    const line = doc.lineAt(pos)
    lines.push([line.from, collapsedLine])
    hideRange(line.from, line.to)
    // skip from the end of the line above to the start of the line below
    const start = line.number > 1 ? doc.line(line.number - 1).to : line.from
    const end = line.number < doc.lines ? doc.line(line.number + 1).from : line.to
    atomic.push([start, end])
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: node => {
        switch (node.name) {
          case 'HeaderMark': {
            const parent = node.node.parent
            if (/^SetextHeading/.test(parent?.name)) collapseLine(node.from)
            // an opening mark takes the spaces after it, a closing mark the spaces before it
            else if (node.from == parent?.from) hideRange(node.from, node.to + spacesAfter(doc, node.to))
            else hideRange(node.from - /[ \t]*$/.exec(doc.sliceString(parent.from, node.from))[0].length, node.to)
            break
          }
          case 'EmphasisMark':
          case 'StrikethroughMark':
            hideRange(node.from, node.to)
            break
          case 'CodeMark':
            // inline code; fences are handled with their code block below
            hideRange(node.from, node.to)
            break
          case 'Escape':
            hideRange(node.from, node.from + 1)
            break
          case 'QuoteMark':
            lines.push([doc.lineAt(node.from).from, quoteLine])
            hideRange(node.from, node.to + Math.min(spacesAfter(doc, node.to), 1))
            break
          case 'ListMark':
            if (node.node.parent?.parent?.name == 'BulletList') {
              marks.push([node.from, node.to, bullet])
              atomic.push([node.from, node.to + Math.min(spacesAfter(doc, node.to), 1)])
            }
            break
          case 'TaskMarker': {
            const isChecked = /x/i.test(doc.sliceString(node.from, node.to))
            marks.push([node.from, node.to, isChecked ? checked : unchecked])
            atomic.push([node.from, node.to])
            break
          }
          case 'HorizontalRule':
            lines.push([doc.lineAt(node.from).from, ruleLine])
            hideRange(node.from, node.to)
            break
          case 'Link':
          case 'Image': {
            if (node.name == 'Image') return false
            // keep the text between the first '[' and its ']', hide the rest
            const children = []
            for (let child = node.node.firstChild; child; child = child.nextSibling) children.push(child)
            const linkMarks = children.filter(child => child.name == 'LinkMark')
            if (linkMarks.length < 2) return false
            hideRange(linkMarks[0].from, linkMarks[0].to)
            hideRange(linkMarks[1].from, node.to)
            return false
          }
          case 'Autolink':
            for (let child = node.node.firstChild; child; child = child.nextSibling) {
              if (child.name == 'LinkMark') hideRange(child.from, child.to)
            }
            return false
          case 'FencedCode':
          case 'CodeBlock':
          case 'HTMLBlock':
          case 'Frontmatter':
          case 'CommentBlock':
            // content stays as it is, only fences are collapsed
            if (node.name == 'FencedCode') {
              for (let child = node.node.firstChild; child; child = child.nextSibling) {
                if (child.name == 'CodeMark') collapseLine(child.from)
              }
            }
            return false
        }
      }
    })
  }

  marks.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  lines.sort((a, b) => a[0] - b[0])
  atomic.sort((a, b) => a[0] - b[0] || a[1] - b[1])

  const builder = new RangeSetBuilder()
  // line classes and replaced ranges in one set: line decorations come first at the same position
  let lineIndex = 0
  let lastLine = -1
  for (const [from, to, decoration] of marks) {
    while (lineIndex < lines.length && lines[lineIndex][0] <= from) {
      if (lines[lineIndex][0] != lastLine) builder.add(lines[lineIndex][0], lines[lineIndex][0], lines[lineIndex][1])
      lastLine = lines[lineIndex][0]
      lineIndex++
    }
    builder.add(from, to, decoration)
  }
  for (; lineIndex < lines.length; lineIndex++) {
    if (lines[lineIndex][0] != lastLine) builder.add(lines[lineIndex][0], lines[lineIndex][0], lines[lineIndex][1])
    lastLine = lines[lineIndex][0]
  }

  const skip = new RangeSetBuilder()
  for (const [from, to] of atomic) skip.add(from, to, hide)

  return { decorations: builder.finish(), atomicRanges: skip.finish() }
}

export const hiddenSyntax = ViewPlugin.fromClass(class {
  constructor (view) {
    Object.assign(this, build(view))
  }

  update (update) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.state) != syntaxTree(update.startState)) {
      Object.assign(this, build(update.view))
    }
  }
}, {
  decorations: plugin => plugin.decorations
})

// marks at the start of a line that the cursor goes behind: heading, quote, bullet (with a task box)
const lineStartMark = /^(?:[ \t]{0,3}#{1,6}[ \t]+|(?:[ \t]*>[ \t]?)+|[ \t]*[-*+][ \t](?:\[[ xX]\][ \t]?)?)/

// where the text of the line at lineFrom starts, behind its hidden heading, quote or bullet mark
export function textStart (state, lineFrom) {
  const line = state.doc.lineAt(lineFrom)
  const mark = lineStartMark.exec(line.text)
  return mark && !isInCode(state, line.from) ? line.from + mark[0].length : line.from
}

function isInCode (state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (['FencedCode', 'CodeBlock', 'HTMLBlock', 'Frontmatter'].includes(node.name)) return true
  }
  return false
}

// A cursor placed at the start of a line with such a mark goes behind it (clicks, Home, ↑ ↓).
// Moving left from just behind the mark goes on to the end of the block above instead.
const cursorAfterLineMarks = EditorState.transactionFilter.of(transaction => {
  if (!transaction.selection || transaction.selection.ranges.some(range => !range.empty)) return transaction
  const { state, startState } = transaction
  let isMoved = false
  const ranges = transaction.selection.ranges.map((range, index) => {
    const line = state.doc.lineAt(range.head)
    if (range.head != line.from) return range
    const mark = lineStartMark.exec(line.text)
    if (!mark || isInCode(state, line.from)) return range
    isMoved = true
    const contentStart = line.from + mark[0].length
    const oldHead = !transaction.docChanged && startState.selection.ranges[index]?.head
    if (oldHead == contentStart && line.number > 1) {
      // the end of the block above, past the (hidden) blank lines between them
      let number = line.number - 1
      while (number > 1 && /^[ \t]*$/.test(state.doc.line(number).text)) number--
      return EditorSelection.cursor(state.doc.line(number).to)
    }
    return EditorSelection.cursor(contentStart)
  })
  if (!isMoved) return transaction
  return [transaction, { selection: EditorSelection.create(ranges, transaction.selection.mainIndex), sequential: true }]
})

export default [
  hiddenSyntax,
  EditorView.atomicRanges.of(view => view.plugin(hiddenSyntax)?.atomicRanges ?? Decoration.none),
  cursorAfterLineMarks
]
