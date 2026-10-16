// npm packages
import { RangeSetBuilder, EditorState, EditorSelection, Prec } from '@codemirror/state'
import { ViewPlugin, Decoration, WidgetType, EditorView, keymap } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
// local functions
import { isBareHeading, isBareListItem, isRawLine } from '../raw-markup.js'

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
// A heading or list mark with no space after it yet stays as typed (raw-markup.js).
// Indentation in lists is drawn as wide as the marks it stands for: a nested item lines up under
// its parent's text, and a further line of an item (Shift+Enter, or written so in the file) under
// the item's text. It is an invisible copy of the bullets and numbers above, and the cursor goes
// behind it. Each quote level ('> > ') is indented with a bar of its own.
// Only the visible lines are looked at.

class BulletWidget extends WidgetType {
  eq () { return true }

  toDOM () {
    const dom = document.createElement('span')
    dom.className = 'cm-bullet'
    dom.textContent = '•'
    return dom
  }

  // CodeMirror handles clicks on the bullet like clicks on text: otherwise the browser puts its
  // own caret between the bullet and the text, and the editor's cursor stays where it was
  ignoreEvent () { return false }
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

// indentation in a list: as wide as the bullets or numbers (and the space after each) of the
// items it lines up under, outermost first
class ListIndentWidget extends WidgetType {
  constructor (marks) {
    super()
    // each item's number ('1.'), or null for a bullet
    this.marks = marks
    this.key = marks.map(mark => mark ?? '•').join(' ')
  }

  eq (other) { return other.key == this.key }

  toDOM () {
    const dom = document.createElement('span')
    dom.className = 'cm-list-indent'
    for (const mark of this.marks) {
      if (mark) {
        dom.append(`${mark} `)
      } else {
        const bullet = dom.appendChild(document.createElement('span'))
        bullet.className = 'cm-bullet'
        bullet.textContent = '•'
        dom.append(' ')
      }
    }
    return dom
  }
}

const listIndentCache = new Map()

function listIndent (marks) {
  const widget = new ListIndentWidget(marks)
  if (!listIndentCache.has(widget.key)) listIndentCache.set(widget.key, widget)
  return listIndentCache.get(widget.key)
}

const quoteLineCache = new Map()

function quoteLine (level) {
  if (!quoteLineCache.has(level)) quoteLineCache.set(level, Decoration.line({ class: 'cm-quote-line', attributes: { style: `--quote-level: ${level}` } }))
  return quoteLineCache.get(level)
}

const hide = Decoration.replace({})
const bullet = Decoration.replace({ widget: new BulletWidget() })
const checked = Decoration.replace({ widget: new CheckboxWidget(true) })
const unchecked = Decoration.replace({ widget: new CheckboxWidget(false) })
const collapsedLine = Decoration.line({ class: 'cm-collapsed-line' })
const ruleLine = Decoration.line({ class: 'cm-rule-line' })
const rawLine = Decoration.line({ class: 'cm-raw-line' })
// a nested list item's first line: spaced from the line above like items of the first level
const nestedItemLine = Decoration.line({ class: 'cm-nested-item' })

const isBlankText = text => /^[ \t]*$/.test(text)

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
  // the lines of a top-level list from..to (visible), and an indented line right after it (being
  // typed after Shift+Enter): their indentation drawn as wide as the marks of the items they
  // line up under
  const tree = syntaxTree(state)
  const alignListLines = (list, from, to) => {
    let last = doc.lineAt(list.to)
    if (last.from == list.to && list.to > list.from) last = doc.lineAt(list.to - 1)
    const lastNumber = last.number < doc.lines && /^[ \t]+$/.test(doc.line(last.number + 1).text) ? last.number + 1 : last.number
    const firstNumber = Math.max(doc.lineAt(list.from).number + 1, doc.lineAt(from).number)
    for (let number = firstNumber; number <= Math.min(lastNumber, doc.lineAt(to).number); number++) {
      const line = doc.line(number)
      const isAfter = number > last.number
      if (!isAfter && isBlankText(line.text)) continue
      const indent = /^[ \t]*/.exec(line.text)[0].length
      // the items this line lines up under: those it is in, without the one it starts
      const chain = []
      let startsItem = false
      const inside = isAfter ? doc.line(number - 1).to : line.from + indent
      for (let node = tree.resolveInner(inside, isAfter ? -1 : 1); node && node.from >= list.from; node = node.parent) {
        if (node.name != 'ListItem') continue
        if (node.from >= line.from) startsItem = true
        else chain.unshift(itemMark(node))
      }
      if (!chain.length) continue
      if (startsItem) lines.push([line.from, nestedItemLine])
      const widget = listIndent(chain)
      if (indent) {
        marks.push([line.from, line.from + indent, Decoration.replace({ widget })])
        // a further line: from the end of the line above, so Backspace joins the lines in one press
        atomic.push([startsItem ? line.from : doc.line(number - 1).to, line.from + indent])
      } else if (!startsItem) {
        marks.push([line.from, line.from, Decoration.widget({ widget, side: -1 })])
      }
    }
  }
  // an item's number ('1.'), or null for a bullet
  const itemMark = item => {
    const mark = /^(?:[-*+]|(\d{1,9}[.)]))/.exec(doc.sliceString(item.from, doc.lineAt(item.from).to))
    return mark?.[1] ?? null
  }
  const quoteLevels = new Map()
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
            if (/^ATXHeading/.test(parent?.name) && isBareHeading(doc, parent)) lines.push([doc.lineAt(node.from).from, rawLine])
            else if (/^SetextHeading/.test(parent?.name)) collapseLine(node.from)
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
          case 'QuoteMark': {
            const lineFrom = doc.lineAt(node.from).from
            quoteLevels.set(lineFrom, (quoteLevels.get(lineFrom) ?? 0) + 1)
            hideRange(node.from, node.to + Math.min(spacesAfter(doc, node.to), 1))
            break
          }
          case 'BulletList':
          case 'OrderedList':
            if (node.node.parent?.name == 'Document') alignListLines(node.node, from, to)
            break
          case 'ListMark':
            if (isBareListItem(doc, node.node.parent)) lines.push([doc.lineAt(node.from).from, rawLine])
            else if (node.node.parent?.parent?.name == 'BulletList') {
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

  for (const [lineFrom, level] of quoteLevels) lines.push([lineFrom, quoteLine(level)])
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

// marks at the start of a line that the cursor goes behind: heading, quote, bullet or number
// (with a task box). A number stays visible, but the cursor never goes in front of it either.
const lineStartMark = /^(?:[ \t]{0,3}#{1,6}[ \t]+|(?:[ \t]*>[ \t]?)+|[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t](?:\[[ xX]\][ \t]?)?)/

// the indentation of a further line of a list item (drawn as wide as the marks above it), 0 for
// any other line
export function itemLineIndent (state, line) {
  const indent = /^[ \t]*/.exec(line.text)[0].length
  if (!indent || line.number == 1) return 0
  if (/^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/.test(line.text)) return 0
  // the item: the one this line is in, or (a line being typed after Shift+Enter) the one above
  const inside = /^[ \t]+$/.test(line.text) ? state.doc.line(line.number - 1).to : line.from + indent
  for (let node = syntaxTree(state).resolveInner(inside, -1); node; node = node.parent) {
    if (node.name == 'ListItem') return node.from < line.from ? indent : 0
  }
  return 0
}

// where the text of the line at lineFrom starts, behind its heading, quote, bullet or number
export function textStart (state, lineFrom) {
  const line = state.doc.lineAt(lineFrom)
  const mark = lineStartMark.exec(line.text)
  return mark && !isInCode(state, line.from) && !isRawLine(state, line.from) ? line.from + mark[0].length : line.from
}

function isInCode (state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (['FencedCode', 'CodeBlock', 'HTMLBlock', 'Frontmatter'].includes(node.name)) return true
  }
  return false
}

// A cursor placed at the start of a line with such a mark, or inside the mark, goes behind it
// (clicks, also on a bullet or number, Home, ↑ ↓): the caret is never drawn in front of the text.
// Moving left from there goes to the end of the block above instead (cursorLeftOverLineMark).
// Edits are checked too: an edit inserting a mark where the cursor is must not leave the cursor
// in front of it.
const cursorAfterLineMarks = EditorState.transactionFilter.of(transaction => {
  const selection = transaction.selection ?? (transaction.docChanged ? transaction.newSelection : null)
  if (!selection || selection.ranges.some(range => !range.empty)) return transaction
  const { state } = transaction
  let isMoved = false
  const ranges = selection.ranges.map(range => {
    const line = state.doc.lineAt(range.head)
    const mark = lineStartMark.exec(line.text)
    const markLength = mark ? mark[0].length : itemLineIndent(state, line)
    if (!markLength) return range
    const contentStart = line.from + markLength
    if (range.head >= contentStart || isInCode(state, line.from) || (mark && isRawLine(state, line.from))) return range
    isMoved = true
    return EditorSelection.cursor(contentStart)
  })
  if (!isMoved) return transaction
  return [transaction, { selection: EditorSelection.create(ranges, selection.mainIndex), sequential: true }]
})

// ← (and word ←) where the text starts, behind a heading, quote, bullet or number: to the end of
// the block above, past the hidden blank lines between them. A key of its own, since Home lands
// at the line start too and must stay on the line.
export function cursorLeftOverLineMark ({ state, dispatch }) {
  const { main } = state.selection
  if (state.selection.ranges.length > 1 || !main.empty) return false
  const line = state.doc.lineAt(main.head)
  if (line.number == 1 || main.head == line.from || main.head != textStart(state, line.from)) return false
  let number = line.number - 1
  while (number > 1 && /^[ \t]*$/.test(state.doc.line(number).text)) number--
  dispatch(state.update({ selection: EditorSelection.cursor(state.doc.line(number).to), scrollIntoView: true, userEvent: 'select' }))
  return true
}

// Deleting an escaped character ('#' of '\#', typed in Literal mode or from the file) deletes its
// hidden backslash too: left alone it would no longer escape anything and would show up.
const deleteEscapeWithCharacter = EditorState.transactionFilter.of(transaction => {
  if (!transaction.docChanged || !transaction.isUserEvent('delete')) return transaction
  const { startState, changes } = transaction
  const tree = syntaxTree(startState)
  const backslashes = []
  changes.iterChanges((fromA, toA) => {
    if (toA == fromA) return
    tree.iterate({
      from: Math.max(fromA - 1, 0),
      to: toA,
      enter: node => {
        // the backslash stays, the character after it goes
        if (node.name == 'Escape' && node.from < fromA && node.from + 1 >= fromA && node.from + 1 < toA) {
          backslashes.push(changes.mapPos(node.from))
        }
      }
    })
  })
  if (!backslashes.length) return transaction
  return [transaction, { changes: backslashes.map(pos => ({ from: pos, to: pos + 1 })), sequential: true }]
})

export default [
  Prec.high(keymap.of([
    { key: 'ArrowLeft', run: cursorLeftOverLineMark },
    { mac: 'Alt-ArrowLeft', win: 'Ctrl-ArrowLeft', linux: 'Ctrl-ArrowLeft', run: cursorLeftOverLineMark }
  ])),
  hiddenSyntax,
  deleteEscapeWithCharacter,
  EditorView.atomicRanges.of(view => view.plugin(hiddenSyntax)?.atomicRanges ?? Decoration.none),
  cursorAfterLineMarks
]
