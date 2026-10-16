# Decisions

Decisions made after the [handover](handover.md). Where they differ, this file wins.

## Stack and code style

- **JavaScript, not TypeScript.** Vue 3 Options API + LESS, following Ordner's style:
  - Options API (`name, components, mixins, props, emits, data, computed, watch, methods`).
  - Blank lines inside `<template>`; `</template><script>` and `</script><style scoped lang='less'>` joined; script and style indented 2 spaces.
  - Single quotes in attributes, backticks inside template expressions, `v-bind='{ ... }'` for passing many props.
  - One folder per component with `index.vue`, plus `components/`, `mixins/` and `functions/` subfolders.
  - Imports grouped under comments (`// npm packages`, `// components`, `// local components`, `// mixins`), absolute paths from the project root (`/src/...`, `/foundation/...`).
  - Ordner's own drag-n-drop and tree code is a heavily modified MIT fork and is **not** a style reference; it gets rewritten.
- **Editor engine: CodeMirror 6.** Speed and file fidelity first. No Tiptap prototype.
- **No branch for the spike.** Work happens on `main`; the editor prototype is the start of the real app.

## Shared components (`/foundation`)

- `/foundation` is a local stand-in for the shared `foundation` repo. Code there must not import from `/src`.
- Later it moves to `submodules/foundation` and is shared with Ordner; the move is a Vite alias change, not an import rewrite.

## Drag and drop: one engine, two modes

One pointer-events engine (no HTML5 drag, because of Tauri's file-drop handling on Windows) handles pointer tracking, the dragged-item preview, auto-scroll and hit-testing. It never moves DOM it does not own; it emits a `move` and the owner applies it.

- **Displace mode** (editor blocks, flat lists): items under the pointer move aside to open a gap, like Ordner's list reordering. Built (`foundation/dnd/`): the engine (`index.js`) follows the pointer, moves the preview, auto-scrolls near the scroller's top and bottom edge, and cancels on Escape; the mode (`displace.js`) passes a stretch once the dragged item's top (going up) or bottom (going down) crosses its middle. The mode is a parameter of the engine, so target mode is another mode object.
- **Target mode** (TOC sidebar, trees): items stay put; the drop position is decided by the **vertical** position over a target node only, never by moving horizontally:
  - near the node's top or bottom edge (roughly 10–20% of its row each): drop **before** or **after** it, at its level; shown as a thin line on that edge
  - over the rest of the node: drop **onto** it, nesting the dragged node inside (as its first child); shown as a highlight of the target row
  - a node cannot be dropped onto itself or into its own subtree
  - reference: Ordner's sidebar (`ordner/imports/submodules/foundation/client/vue/components/tree/methods/dnd/utils.js`, `getDropPosition`), which works well; it splits the row (the node's own line, not its children) into thirds, top / middle / bottom, so its edge zones are wider than the 10–20% wanted here. Its code is not a style reference (see above), its behaviour is.

## Block model

- Blocks are derived from the Markdown structure; no directives, no metadata in the file.
- Headings are optional. A heading owns everything below it until the next heading of the same or higher level.
- Levels are relative: moving a heading in the TOC moves its subtree and shifts all heading levels inside it by the same amount (`#` ↔ `##`, …). Max depth is Markdown's 6 for now.
- **Blocks are item-sized** (Notion-like: every paragraph and every list item is a block; a heading moves together with what it owns). Bigger blocks (a whole list, a whole section) were built, measured and tried, and dropped as not useful.

### Measurements (2026-10-15)

Generated document of 10k lines, Vite dev build (not minified), Chromium in the Claude desktop browser pane on this Mac. Milliseconds, median / p95. "Update" is the synchronous state and DOM update; "frame" runs to the next paint and cannot be below one 60 Hz frame (~16.7 ms).

| Blocks | Count | Load | Full parse + blocks | Typing update | Typing frame | Move update | Move frame |
|---|---|---|---|---|---|---|---|
| no cards (plain CodeMirror) | – | 21 | 119 | 2.9 / 3.9 | 17 / 18 | 4.9 / 5.6 | 17 / 25 |
| item | 6234 | 26 | 108 | 2.9 / 3.6 | 17 / 18 | 7.0 / 7.9 | 17 / 19 |
| element | 2917 | 24 | 96 | 3.3 / 3.6 | 17 / 18 | 5.4 / 6.3 | 17 / 21 |
| section | 642 | 28 | 96 | 3.1 / 3.6 | 17 / 18 | 9.4 / 11 | 18 / 23 |

- Cards cost nothing measurable while typing: they are computed only for the visible lines. Granularity does not change typing speed.
- Typing work (~3 ms) fits easily in a frame; moves take 5–10 ms of work and usually paint in the next frame (p95 up to ~25 ms).
- The first move after opening a large file parses the whole file once (~100 ms for 10k lines). Parsing in idle time after opening would remove that.
- Selection across blocks is native (one CodeMirror document), so it works the same for every granularity.
- **Result: use `item` (Notion-like: every paragraph and list item is a block) as the default.** Still to measure: Safari/WKWebView (macOS), WebView2 (Windows), WebKitGTK (Linux), and a production build.

### Typing latency (2026-10-15)

Measured key press → paint per look (cards, styled, plain CodeMirror, raw contenteditable, native textarea) in the dev panel.

- **Safari / WebKit is the reference**: the macOS app runs in WKWebView. There, plain and styled CodeMirror are as fast as a native textarea. The remaining cost was the cards (arrow keys between blocks, Enter), so cards are drawn as boxes in layers behind the text and lines carry no paint.
- **Chrome on macOS** is late by a frame for most keys even in a native textarea, so it is not optimized for. Windows (WebView2, Chromium) and Linux (WebKitGTK) still need their own measurement.
- Typing never rebuilds the cards: line marks are mapped through edits and the blocks are re-checked when idle.

## Editing

- **Two modes of one editor**, switched with the **Markdown** button (Cmd+Shift+M, later a View menu item), instantly and keeping undo history: **Document** (the default) shows Markdown as plain text, with no symbols and no blank lines between blocks, and Enter/Backspace/Delete work on blocks; **Markdown** shows the file as it is, in one monospace font with no styling (like a plain text field), with Enter/Backspace/Delete as in a text editor. Moving and selecting blocks and the formatting shortcuts work in both. The file is never changed by switching. (A plain textarea view was tried and dropped.)
- **Blank lines between blocks** stay in the file but are hidden on screen while Markdown is hidden: blocks sit right below each other and the cursor skips the gap. The blank line with the cursor (a new block after Enter) stays visible. Enter in a paragraph or heading starts a new block, Backspace at the start of a paragraph joins it to the block above, Delete at the end of a block joins the paragraph below. Taking a list item's mark off (Backspace where its text starts, or Cmd+7 / Cmd+8 turning the item off) makes it a further line of the text right above it: lined up under that text and spaced like list items, so the text does not move; a whole list turned off becomes lines right below each other. In the file the line keeps its item's own indentation (shallower than a Shift+Enter line, which is indented to the item's text; both are drawn the same). Cmd+7 / Cmd+8 on a further line make a Shift+Enter line a sub-item of its item, and put a line whose mark was taken off back at its old level, with the next number. Backspace or Enter in an empty item (after Enter) ends the list instead: the line becomes a paragraph of its own, split off from the list by blank lines; Enter in an empty sub-item outdents as in Markdown. Blank lines inside a list item are hidden too, the paragraph after them spaced like the item's lines. Turning paragraphs into a list makes one tight list; a quoted line made a list item, task or heading loses its quote. The hiding is a state field updated only for the edited lines (about 1 ms per key on 10k lines; recomputing the whole document was 7–10 ms).
- Several blank lines in a row mean the same as one in Markdown (outside code), so collapsing them never changes the document's meaning; the editor still keeps them as they are in the file. **Empty paragraphs**: one or two blank lines between blocks are the normal gap; every two more show as an empty paragraph (an Enter left empty stays as one, also at the end of the file, where the line after the last line break counts as one of the blank lines). It can be selected (Shift+↑/↓ step onto it, it shows selected, in Markdown mode on one blank line per empty paragraph), Backspace or Delete next to it removes it. Other Markdown viewers show a normal gap there. The hidden blank lines at the end of the file are not a place for the cursor (it goes to the last empty paragraph, or the end of the text).
- **Marks stay as typed until the space**: `#`, `##`, `-`, `1.` at the start of a line show as they are (plain text, a paragraph), and become a heading or list as soon as a space follows (`# `, `- `, `1. `).
- **Literal** (toolbar button, off by default): normally typing Markdown in Document mode formats (`# ` makes a heading, `*word*` italic). With Literal on, typed text stays exactly as typed: a typed character that would become Markdown syntax is saved with a backslash (`\#`, `\- `, `*word\*`), which Document mode hides. Only characters that would become syntax are escaped; pasted text and Markdown mode are never escaped. Deleting an escaped character in Document mode deletes its hidden backslash too.
- **Minimal look**: the page looks like plain text: no card boxes, no highlight of the block with the cursor, only spacing between blocks.
- **Spacing**: one gap between blocks (paragraphs, a heading and its text, a list and the paragraph after it), equal as seen from text to text (about 25 px baseline to capitals; headings have a tighter line height, 1.3, so their bigger font adds no extra space); headings get more room above. List items sit close together, nested ones as much as first-level ones; a number starts where a bullet does and is drawn at least as wide, so numbers line up with each other and with bullets, and single-digit numbered items start their text where bullet items do, at every level; a list as a whole is spaced like a paragraph, also from a list of another kind right next to it (numbered after bullets). A quote's first bar starts where the text of other lines starts, its text after the bars. A task item shows a round checkbox (a little larger than the text) in the bullet's place, without a bullet; its text starts where other items' text does. (Cards were tried and dropped: they were only useful for measuring.)
- **Dragging blocks** (both modes): a handle of nine dots (3 × 3), 14 px left of the text (no further out than the editor's edge in a narrow window), in one column for all blocks (sub-items' handles too; which block goes by the line), fades in only while the mouse is around it: from a little left of it up to the text, never over the text and not further out in the margin. While it shows, the mouse is the hand and pressing anywhere there starts the drag. A drag goes exactly where Alt+↑/↓ would take the block, and the drop gives the same file as pressing the keys as often (tested from every line of the sample), as one undo step: paragraphs and top-level items block by block, headings with what they own among sibling headings, sub-items among siblings and into the items around their parent. What is dragged is what Alt+↑/↓ would move from that block, or the selection when the block is part of a selection over several blocks. While dragging, a faded copy follows the pointer, the block's own place is an empty gap that slides to where it would land, and the lines it passes slide aside (CSS transforms on line decorations; the document and layout change only on drop). The cursor stays on the text it was on. The drop replays the key presses on a copy of just the region they change, about 0.5 ms per step on 10k lines.
- **List kinds after a move**: a bullet item and a numbered item that end up next to each other get a blank line between them (Alt+↑/↓ and dragging). Right under a bullet item, a numbered item other than `1.` would become a line of its text.
- **Tab / Shift+Tab** (Document mode) indent by block: a list item (with its sub-items, or all selected items) nests under the item above, indented as wide as that item's mark, and moves back out with Shift+Tab; the first item of a list nests under the last item of a list of another kind right above it (bullet points under a numbered step), and Cmd+7 / Cmd+8 on a sub-item switch it between numbers and bullets in place (an item's further lines and sub-items shift with its mark, so they stay in it; further lines get no mark of their own); a paragraph becomes a quote, one level more with each Tab (`> > `), one less with Shift+Tab or with Backspace where the quote's text starts (on a further line of the quote, Backspace joins it to the line above). Enter in a quote starts a new, unquoted paragraph after it (Shift+Enter adds a line to the quote). Nested items are drawn under their parent's text, each quote level with its own bar. Numbered lists are counted again (a sub-list from 1). In code Tab inserts indentation, headings stay. In Markdown mode Tab / Shift+Tab indent the selected lines by 2 spaces. Tab never leaves the editor.
- **The cursor stays at the text** of headings, quotes and list items, also numbered ones whose number is visible: clicking the mark or pressing Home puts it where the text starts, and ← (or word ←) from there goes to the end of the line above.
- **Shift+Enter** starts a new line within the block: a plain (soft) line break in the file, no space between the lines. In a list item the line is indented under the item's text (drawn as wide as the bullet or number) so it stays in the item; in a quote it gets `> `; in a heading it acts as Enter (a heading is one line). Backspace at the start of such a line joins it back in one press.
- **Moving sub-items** (Alt+↑/↓ with the cursor in a nested list item): a sub-item swaps with its siblings, keeping its depth, and at the edge of its sub-list goes into the neighbouring parent item (the last sub-item of A moving down becomes the first sub-item of B); at the edge of the whole list it stays. Top-level items, paragraphs and headings keep moving past whole units.
- **Moves slide** (Alt+↑/↓, both modes): every move swaps two neighbouring stretches of lines, and both slide from where they were drawn to their new place in 0.15 s (a fade of the moved block was tried and dropped). The document changes at once; only the drawing is animated (CSS transforms on line decorations), so keys are never held up, and a move during a slide starts from where the lines are drawn at that moment. Positions are read from the drawn lines right before and right after the move, before the browser paints (CodeMirror's own heights can lag behind the page). A stretch out of view does not slide; a drop after dragging does not slide (its gap already showed the place).
- **A block that cannot move bumps** (Alt+↑/↓ at the top or bottom, a heading with no sibling that way, a sub-item at the edge of its list): it nudges 4 px in the pressed direction and springs back (0.26 s), so the key visibly did something; the text is left as it is. Each press restarts it.
- **Numbered lists after a move** count up in order again, in the same undo step: a list keeps its lowest number as its start and each item its `.` or `)`; a list whose items all have the same number (`1.` `1.` `1.`) is left as it is, an item moved into it getting that number too. Whether a list is written that way is decided without the moved item (its other items, at least two, or one when the moved item came from such a list), so `1. x` joined by `1. a` from a counted list counts up. Sub-lists count from 1; a numbered sub-item that ends up first in its sub-list gets `1.` in the move itself, since right under text Markdown reads `2. b` as more of that text, not as an item.
- **Shortcuts**: Cmd+1…6 heading level, Cmd+0 paragraph, Cmd+7 numbered list, Cmd+8 bullet list, Cmd+B bold, Cmd+I italic, Cmd+E inline code, Cmd+K link, Cmd+Shift+X strikethrough (Cmd+X is cut), Cmd+Enter ticks or unticks a task, or makes a list item or paragraph an open task (as in Notion and Obsidian; not Alt+Space, which types a non-breaking space on macOS and is often taken by launchers), Cmd+Shift+M show Markdown (Cmd+M minimizes).
  - The line formats also work with **Cmd+Alt+number**: browsers reserve Cmd+number for switching tabs (Chrome never lets a page have it), so this second set works everywhere. In the app, Cmd+number are native menu items.
  - Not Cmd+Shift+number (macOS takes Cmd+Shift+3/4/5 for screenshots), not Alt+number alone (types characters such as `[ ] | { }` on many keyboard layouts).
## Files

- Single-file windows first.
- Images later: the `.md` turns into a folder holding the Markdown and its images. [TextBundle](http://textbundle.org) (`Name.textbundle/` with `text.md`, `assets/`, `info.json`) is the candidate format: Bear, Ulysses and iA Writer support it, and macOS shows it as one file.
- Markdown for now; extending it later is allowed if needed.
