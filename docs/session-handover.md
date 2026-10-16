# Session handover

State of the project at the end of the second working session (2026-10-16), for whoever continues.
Read in this order:

1. this file: where things stand and how to work here
2. [decisions.md](decisions.md): everything decided so far; it overrides the original handover
3. [handover.md](handover.md): the original product handover (vision, milestones, Tauri plans)

## How to work here

- **Workflow** (from the user's instructions): investigate → propose a plan and wait → the user confirms → implement → ask before committing → the user pushes. **Never push**, never touch the `stage` / `prod` branches, and **no attribution** (no "Co-Authored-By", no "Generated with …") in commits or anywhere else.
- "Commit" means: commit everything listed in the last summary on `main`. Write the message as helps later: a summary line, and a body explaining what changed and why when that is useful.
- After committing, name only the commits that are **not pushed yet** (`git log --oneline @{u}..HEAD`); the user pushes often.
- The user tests in **Safari** (the engine the macOS app will run on) all the time; don't add "not checked in Safari" caveats. Say what you verified in the browser pane (Chromium) and how.
- A hidden browser pane (or a Claude window out of view) renders no frames: transitions and `requestAnimationFrame` stand still and timers slow down. Show the pane before measuring anything animated; forcing frames with a `setTimeout` stand-in checks the sequence, not the motion.
- In the browser pane, use the `dev` server (`localhost:1420`, hot reload). If you use the production preview (`localhost:1421`), rebuild it after every change, or stale code gets tested.
- Keep it **minimal**: the page must look like plain text; no visual chrome unless asked. Debugging tools go behind a toggle.
- Before claiming a fix, **verify it in the browser pane**. Measure with JS where a screenshot cannot show it: text positions (x and y), gaps between lines, the caret, the file text after real key presses. Reproduce the user's exact steps (for example Tab at the very start of a paragraph, not just the cursor placed at the text start): fixes that only pass a simplified test get noticed quickly.
- Explain in plain words; when a request is unclear, ask, and say how you read it. Several times a misreading cost a full round, for example "a new line" meaning a further line right under the text, not a paragraph.
- `tests/fixtures/basic.md` is the user's own sample of what the editor does; they edit it. The blocks tests check its block types and heading levels, so update them when it changes; never revert the user's edits.

## Code style

- **Vue 3 Options API, plain JavaScript, LESS.** No TypeScript. Follow Ordner's style (details in decisions.md): blank lines inside `<template>`, `</template><script>` and `</script><style scoped lang='less'>` joined, single quotes in attributes, backticks in template expressions, `v-bind='{ … }'` for many props, events last on elements, one folder per component with `index.vue` and `functions/`, imports grouped under comments, absolute paths from the project root (`/src/...`).
- Comments explain **why**, at the top of each module; keep them true when behaviour changes.
- `/foundation` is a local stand-in for the shared `foundation` repo (only a README so far).

## Running it

```bash
npm run dev          # localhost:1420, hot reload
npm run production   # build + preview on localhost:1421
npm test             # vitest, 184 tests (node + jsdom)
```

`.claude/launch.json` has both servers (`dev`, `production`) for the browser pane. The dev toolbar picks a sample document (the test fixtures, plus a generated 10k-line file), opens local files, switches **Markdown** mode, turns **Literal** typing on or off, shows **Stats** (typing latency per mode, benchmark results) and runs the benchmark.

Rust is **not installed** on this Mac, so there is no Tauri shell yet; everything runs in the browser.

## What exists

One CodeMirror 6 editor (in `src/app/editor/`) with two modes, switched by the Markdown button or Cmd+Shift+M. Markdown mode's first line starts at the same height as Document mode's, for any first block. The full list of rules is in decisions.md ("Editing"); the main points:

- **Document** (default): Markdown as plain text.
  - Syntax is hidden: `#`, `**`, link addresses, `> `, fences, setext underlines.
  - Bullets are drawn as `•`. Numbers line up with bullets (at least 0.9em wide). Tasks show a round checkbox instead of a bullet.
  - Wrapped and further lines of list items hang under the item's text, at every level.
  - Blank lines between blocks are hidden, with spacing instead: about 25 px from text to text between paragraphs, lists, quotes and below headings, 3 px between list items, more above headings.
  - Every two blank lines beyond the normal gap show as an **empty paragraph**. It can be selected and removed.
  - Marks being typed (`#`, `-`, `1.`) stay as typed until the space after them.
- **Markdown**: the file as it is, monospace, Enter/Backspace as in a text editor (Enter still continues lists).
- **Keys** (Document mode unless noted):
  - **Enter**: starts a new block; in an empty list item, ends the list; in a quote, starts an unquoted paragraph.
  - **Shift+Enter**: a new line within the block.
  - **Backspace** at a list item's text start: takes the mark off, so the line becomes a further line of the text above and the text doesn't move. In an empty item it ends the list instead.
  - **Tab / Shift+Tab**: nest or un-nest list items (also bullets under a numbered step); quote levels for paragraphs. In Markdown mode they indent the selected lines.
  - **Cmd+7 / Cmd+8**: numbers / bullets, kept nested. Turning an item off and on gives back the same file. A quoted line loses its quote.
  - **Cmd+Enter**: ticks a task, or makes the line a task.
  - **Alt+↑/↓** (both modes): moves blocks, or a sub-item among its siblings and into the neighbouring items; the swapped lines slide into place; a block that cannot move bumps in the pressed direction. Numbered lists are renumbered after a move. Shift+↑/↓ select within a block, then block by block.
  - **Dragging** (both modes): a handle fades in when the mouse is near it, left of a block; the block goes where Alt+↑/↓ would take it (decisions.md, "Dragging blocks").
  - **Literal** (toolbar): typed Markdown is escaped and stays as typed.
- Files round-trip byte for byte (BOM kept outside the editor text, CRLF, no final newline, front matter); a mixed-line-break file is normalized to LF.

## Map of the code

| Path | What it does |
|---|---|
| `src/app/index.vue` | app: toolbar, editor, stats footer; sample documents; benchmark |
| `src/app/toolbar/` | dev toolbar (buttons use `mousedown.prevent` so the editor keeps focus) |
| `src/app/metrics/` | stats footer: Event Timing + own key-press→paint timing, per mode and key kind |
| `src/app/benchmark/` | scripted load/typing/move benchmark, editor vs bare CodeMirror |
| `src/app/editor/index.vue` | Vue wrapper around the `EditorView`; mode switch; all editor CSS (spacing rules, hanging lists, checkbox, quote bars) |
| `editor/functions/create-state.js` | all extensions, keymaps (Document mode's block keys are `Prec.highest`, ahead of lang-markdown's), Document/Markdown and Literal compartments, BOM handling, `getText` |
| `editor/functions/markdown/` | lezer Markdown (GFM) + front matter parser extension |
| `editor/functions/blocks/index.js` | blocks from the syntax tree: every top-level element, every top-level list item (with the list it belongs to) |
| `editor/functions/blocks/decorations.js` | line classes for spacing (`cm-block-first/last`, type, `cm-after--`/`cm-before--` neighbour types); mapped while typing, re-checked when idle |
| `editor/functions/blocks/select.js` | block-aware Shift+↑/↓ (empty paragraphs are steps) |
| `editor/functions/dnd/` | dragging blocks: handle, gap, lines sliding aside, preview (`index.js`); where a drag can go and the drop, replaying Alt+↑/↓ on the region it changes (`slots.js`) |
| `foundation/dnd/` | drag engine: pointer, preview, auto-scroll, Escape (`index.js`); displace mode (`displace.js`) |
| `editor/functions/move/` | block moves (`index.js`), sub-item moves (`nested.js`), the slide of a move and the bump when a block cannot move (`animate.js`), renumbering numbered lists (`renumber.js`), heading level shift for the outline later |
| `editor/functions/gaps/index.js` | hiding blank lines (state field, updated only around edits), empty paragraphs, selected empty paragraphs, cursor rules around gaps and the end of the file |
| `editor/functions/gaps/commands.js` | Enter / Shift+Enter / Backspace / Delete on blocks, list items and quotes |
| `editor/functions/syntax/index.js` | hiding Markdown syntax, widgets (bullet, checkbox, list indentation), hanging indents, quote levels, cursor placement behind marks, ← at a text start |
| `editor/functions/indent/` | Tab / Shift+Tab, Backspace at a quote's text start |
| `editor/functions/format/` | formatting commands and their keymap; `lines.js` has list switching, taking marks off and on, tasks |
| `editor/functions/raw-markup.js` | heading and list marks with no space after them yet: shown as typed, treated as paragraphs |
| `editor/functions/literal-typing.js` | Literal: typed characters that would become syntax are escaped |
| `editor/functions/redraw-caret.js` | makes Safari draw the caret anew after a mode switch or Tab |
| `editor/functions/markdown-top.js` | Markdown mode's top padding, measured so the first line's text starts where it does in Document mode |
| `editor/functions/markdown-shown.js` | facet: is Markdown mode on |
| `tests/` | fixtures (round-trip), blocks, block lines, moves, dragging (drop = key presses), gaps (incl. 300 random edits vs full recompute), syntax, formats, indent, literal typing |

## Things learned the hard way

- **Speed**: in Safari, CodeMirror itself is as fast as a native textarea. Anything per keystroke must stay off the typing path: shift existing decorations through the edit and re-check when idle (`idleScheduler`); rebuild at once only for edits across lines (or the spacing jumps). Chrome on macOS is a frame late even for a textarea; not optimized for.
- **Decorations that hide line breaks must come from a state field**, not a view plugin (CodeMirror throws). `gaps/index.js` recomputes only the edited region plus blocks the parser changed (`changedBlocks`). A randomized test compares it with a full recompute; keep it.
- **lang-markdown's keymap** (Enter, Backspace) is `Prec.high` and comes first; our block keys must be `Prec.highest`. Its Backspace turns a list mark into indentation and its Enter continues quotes and lists; most list and quote behaviour here replaces them, each command doing nothing where it does not apply.
- **Cursor rules must check edits, not only cursor moves**: an edit that inserts a mark at the cursor (Tab on a paragraph's start) left the cursor in front of the hidden `> `, and Backspace then joined the paragraph to the heading above. `cursorAfterLineMarks` now checks both, and commands map the selection with `assoc 1`.
- **"← at the text start goes to the line above" is a key command** (`cursorLeftOverLineMark`), not part of the cursor filter: Home lands at the line start too and must stay on the line.
- **Atomic ranges** make the cursor skip hidden text, but only for key moves; clicks need their own handling (a widget with `ignoreEvent () { return false }`, `clicksBesideLines`).
- **Safari keeps drawing the caret at its old place** when the browser's selection stays at the same DOM place while the layout moves (mode switch; Tab, where the new indentation is a widget in front of the same text); `redraw-caret.js` moves the cursor one character away and back once the new lines are painted.
- **CSS**: `text-indent` is inherited into inline-blocks (the bullet's dot moved with the hanging indent; reset inside). Form controls have their own smaller font, so `em` sizes need `font-size: inherit`. A heading's tall line box adds empty space under its text: compare spacing from text to text (baseline to capitals, measured with a `1cap` inline-block), not between line boxes.
- **Widths are measured, not guessed**: hanging indents use a canvas with the editor's font; Markdown mode's top padding uses a hidden copy of the first line.
- **Markdown structure decides what the user sees**: a line right under an item is a lazy continuation of the item above, not a new paragraph, unless a blank line separates them; a sub-level needs a parent item (an indented first item is a top-level item, or code at 4+ spaces). Check with the parser before assuming.
- **Anything wider than the window** makes CodeMirror's scroll-into-view scroll the whole app sideways; the app's children have `min-width: 0` and the toolbar/stats scroll on their own.
- **jsdom tests** need `Range.getClientRects` stubs, have no canvas, and cannot test layout (clicks, vertical moves, caret, widths); verify those in the pane. In the pane, Vite sometimes reloads the page: get the view again (`document.querySelector('.editor').__vueParentComponent.proxy.view`) or keys go to a stale one.
- CodeMirror's `drawSelection` is off: the browser's own caret feels faster than a drawn one.

## Tried and dropped

Card boxes around blocks (as line styling, then as a layer); a Look switch with styled/plain/contenteditable/textarea baselines; a plain-textarea Markdown view; bigger block sizes (whole lists, whole sections) with a live switch and an active-block background; blank lines as skipped spacing lines, and as part of the card above. This session: taking a list mark off as a paragraph of its own (the user wants a further line right under the text, so the text doesn't move); a list right under text sitting 3 px close to it (12 px like paragraphs instead). Details on the earlier ones are in decisions.md.

## Next steps (not started)

- **Tauri shell** (Milestone 2 in handover.md): install Rust, Tauri 2, platform adapter, no-flash window, native menu with the shortcuts and Document/Markdown in the View menu; measure in WKWebView, WebView2, WebKitGTK.
- **Files** (Milestone 4): open/save, autosave, atomic writes, external-change reload (keep undo: apply as a minimal diff), recent files, session.
- **Outline** (Milestone 5): dragging blocks is done (displace mode); still to do:
  - Target mode of the drag engine (`foundation/dnd/`) for the outline tree, deciding before / after / onto (nest) by the vertical position only, as in Ordner's sidebar (decisions.md).
  - Outline moves use `moveSpec` with `levelDelta`.
- Smaller open items:
  - Cmd-click to open links.
  - Tables, HTML and front matter are still shown raw in Document mode.
  - A fence or setext heading loses a little spacing where its line collapses.
  - Images via TextBundle later.
  - Enter in an empty sub-item still uses Markdown's outdent.
  - Moving a numbered item out of the top of its list leaves the rest starting at 2 (top-level lists keep their lowest number, so numbering continued after a paragraph is kept).
