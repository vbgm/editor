# Session handover

State of the project at the end of the fourth working session (2026-10-16), for whoever continues.
Read in this order:

1. this file: where things stand and how to work here
2. [decisions.md](decisions.md): everything decided so far; it overrides the original handover
3. [handover.md](handover.md): the original product handover (vision, milestones, Tauri plans)

## How to work here

- **Workflow** (from the user's instructions): investigate → propose a plan and wait → the user confirms → implement → ask before committing → the user pushes. **Never push**, never touch the `stage` / `prod` branches, and **no attribution** (no "Co-Authored-By", no "Generated with …") in commits or anywhere else.
- Small tweaks of something already built (a distance, a size, a timing, "a bit more", "revert") are done right away: change it, measure the result in the pane, say the new value, ask to commit. New behaviour gets a plan first.
- "Commit" means: commit everything listed in the last summary on `main`. Write the message as helps later: a summary line, and a body explaining what changed and why when that is useful.
- After committing, name only the commits that are **not pushed yet** (`git log --oneline @{u}..HEAD`); the user pushes often.
- The user tests in **Safari** (the engine the macOS app will run on) all the time; don't add "not checked in Safari" caveats. Say what you verified in the browser pane (Chromium) and how.
- A hidden browser pane (or a Claude window out of view) renders no frames: transitions and `requestAnimationFrame` stand still and timers slow down. Show the pane before measuring anything animated; forcing frames with a `setTimeout` stand-in checks the sequence, not the motion.
- In the browser pane, use the `dev` server (`localhost:1420`, hot reload). If you use the production preview (`localhost:1421`), rebuild it after every change, or stale code gets tested.
- Keep it **minimal**: the page must look like plain text; no visual chrome unless asked. Debugging tools go behind a toggle.
- Before claiming a fix, **verify it in the browser pane**. Measure with JS where a screenshot cannot show it: text positions (x and y), gaps between lines, the caret, the file text after real key presses. Reproduce the user's exact steps (for example Tab at the very start of a paragraph, not just the cursor placed at the text start): fixes that only pass a simplified test get noticed quickly.
- Explain in plain words; when a request is unclear, ask, and say how you read it. Several times a misreading cost a full round, for example "a new line" meaning a further line right under the text, not a paragraph.
- The user tunes values in the files themselves while you work (durations, easings, paddings): re-read a file before editing it and keep their values; point them to where a value lives (file and line, a LESS variable) when they want to play with it.
- For motion, compare what the eye compares: when two things "don't match", check distance and speed as well as duration and easing, and measure positions at several times (`getAnimations()`, `currentTime`), not only the timing settings.
- `tests/fixtures/basic.md` is the user's own sample of what the editor does; they edit it. The blocks tests check its block types and heading levels, so update them when it changes; never revert the user's edits.

## Code style

- **Vue 3 Options API, plain JavaScript, LESS.** No TypeScript. Follow Ordner's style (details in decisions.md): blank lines inside `<template>`, `</template><script>` and `</script><style scoped lang='less'>` joined, single quotes in attributes, backticks in template expressions, `v-bind='{ … }'` for many props, events last on elements, one folder per component with `index.vue` and `functions/`, imports grouped under comments, absolute paths from the project root (`/src/...`).
- Comments explain **why**, at the top of each module; keep them true when behaviour changes.
- `/foundation` is a local stand-in for the shared `foundation` repo; it holds the drag engine (`foundation/dnd/`) and must not import from `/src`.

## Running it

```bash
npm run dev          # localhost:1420, hot reload
npm run production   # build + preview on localhost:1421
npm test             # vitest, 228 tests (node + jsdom)
npm run tauri:dev    # the desktop app, with its own Vite server on 1420 (stop the pane's first)
npm run tauri:build  # .app and .dmg in src-tauri/target/release/bundle (unsigned)
cd src-tauri && cargo test   # the Rust side: reading and saving files
```

`.claude/launch.json` has both servers (`dev`, `production`) for the browser pane. The dev toolbar picks a sample document (the test fixtures, plus a generated 10k-line file), opens local files, shows the **Outline**, has an **Options** menu (for now one checkbox, *Slide text with sidebar*), switches **Markdown** mode, turns **Literal** typing on or off, shows **Stats** (typing latency per mode, benchmark results) and runs the benchmark.

Rust is installed with rustup (`~/.cargo/bin`; a shell started before that needs `source ~/.cargo/env`). This Mac is Intel (x86_64): a universal build needs `rustup target add aarch64-apple-darwin` and `tauri build --target universal-apple-darwin`. The desktop app's window cannot be seen from a Claude session (no screen recording, and the user will not grant it): the user checks it; test the Rust side with `cargo test` and the saving logic with vitest.

## This session

The outline sidebar (Milestone 5), and the look of dragging:

- **Sidebar** on the left, hidden at first (Outline button, Ctrl+Cmd+S), as Ordner's: a 1 px right edge with a 7 px resize handle (160–400 px), width and shown kept in `localStorage`. It opens and closes by transforms only, the column taking its width at once, so Safari does not lay out the editor on every frame. *Slide text with sidebar* (Options, off by default): off, the sidebar is drawn over the editor's margin and the text stays, moving only as far as needed in a narrow window; on, the text slides aside with the sidebar's edge, as one.
- **Outline**: the headings as a tree, nested by relative level, with Ordner's rows (31 px, 20 px indent, chevron in the indent), hover background (0.2 s ease-out) and pointer cursor; the section with the cursor is highlighted.
  - **Folding** by the chevron, or by clicking the selected heading's row: a drawer. While folding, the children's list is the space open so far with its rows at its bottom (`justify-content: flex-end`, `overflow: hidden`), so they move with the rows below by layout; on top they fade (in 0.2 s, 40% later; out almost at once, strong ease-in). All in `@fold-*`, `@fade-in-*`, `@fade-out-*` in `outline/components/node.vue`.
  - **Clicking** a row goes to the heading; clicking the **title's text** (and 0.5rem past it) edits it in place, a field that looks like the title, as wide as its text. Each keystroke shows in the editor at once, outside the undo history; saving (Enter, a click elsewhere) is one undo step, Escape puts the original back. A click on another title's text switches editing to it.
  - **Dragging** a heading (target mode, `foundation/dnd/target.js`): before / after / onto by the pointer's height over a row; the section moves with its levels shifted, refused into its own section or deeper than `######`. The title follows the hand as a small label; the drop line starts with a ring at the level the heading lands at.
- **Dragging blocks** in the editor: the handle is 2 × 3 dots again, 16 px from the text; the copy that follows the pointer is opaque, on its own slightly brighter background with a shadow and even room above and below its text, fading in at the start and out (behind the landing text) on the drop.

The values to tune: constants at the top of `dnd/index.js` (`handleWidth`, `handleHeight`, `handleGap`, `handleReach`, `previewOpacity`), `move/animate.js` (`duration`, `bumpDistance`, `bumpDuration`), `foundation/dnd/index.js` (`edge`, `maxSpeed`), `outline/index.vue` (`rowHeight`, `dragDistance`, `labelOffset`), `sidebar/index.vue` (`duration`, `easing`, `minWidth`, `maxWidth`); the motion values the CSS shares with them reach it as CSS variables set from those constants (`--move-duration`, `--dnd-handle-width`, `--dnd-handle-height`, `--dnd-preview-opacity`), so each lives in one place. Style values are LESS variables at the top of each component's `<style>` (the editor's spacing, text inset, mark widths and `@drop-fade-share`; the outline's `@fold-*`, `@fade-*`, `@title-reach`, `@drop-ring`, `@drop-line`; the sidebar's handle), and shared ones are CSS variables in `src/styles/index.less` (colors incl. `--color--outline--*` and `--color--drag-preview`, `--shadow--drag-preview`, `--font--monospace`, `--radius--control`).

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
  - **Dragging** (both modes): a handle of 2 × 3 dots fades in when the mouse is near it, left of a block; an opaque copy follows the pointer, the lines it passes slide aside, and the block goes where Alt+↑/↓ would take it and slides into place (decisions.md, "Dragging blocks").
  - **Literal** (toolbar): typed Markdown is escaped and stays as typed.
- **Outline** (toolbar button, Ctrl+Cmd+S; hidden at first): the headings as a tree in a resizable left sidebar; clicking one goes to it, clicking its title's text renames it, the chevron (or a click on the selected heading) folds it, and dragging one moves its section before, after or onto (into) another heading, levels shifted (decisions.md, "Outline sidebar").
- Files round-trip byte for byte (BOM kept outside the editor text, CRLF, no final newline, front matter); a mixed-line-break file is normalized to LF.

## Map of the code

| Path | What it does |
|---|---|
| `src/app/index.vue` | app: toolbar, sidebar layout with the outline and the editor, stats footer; sample documents; benchmark; the sidebar's settings in `localStorage` |
| `src/app/sidebar/` | a layout: the sidebar (default slot) beside the center (the editor): shown / hidden by transforms (the center follows its text, `anchor`), drawn over the margin unless *Slide text with sidebar*, resized by its 1 px right edge |
| `src/app/outline/` | the outline (TOC) tree, a pure component: headings in, `select` / `move` / `renameStart` / `renameInput` / `rename` out; clicks, renaming, dragging in target mode with a label (`index.vue`); a row, folding as a drawer, the rename field, drop markers (`components/node.vue`) |
| `editor/functions/outline/` | headings as the outline (titles without Markdown, ids by title), which drops are allowed, a drop as a move with the levels shifted, renaming a heading's text (`renameSpec`) |
| `src-tauri/` | the desktop app: window, menu (`src/menu.rs`), reading and atomic saving (`src/files.rs`, with tests), quitting (`src/lib.rs`); `tauri.conf.json`, permissions in `capabilities/` |
| `src/platform/` | the only door to Tauri: `tauri.js` in the app, `browser.js` in a browser; the functions are listed in `index.js` |
| `src/app/functions/saving.js` | the open document's file: path, unsaved edits, autosave, Save, Save As, release before closing or replacing |
| `src/app/toolbar/` | dev toolbar (buttons use `mousedown.prevent` so the editor keeps focus); the Options menu |
| `src/app/metrics/` | stats footer: Event Timing + own key-press→paint timing, per mode and key kind |
| `src/app/benchmark/` | scripted load/typing/move benchmark, editor vs bare CodeMirror |
| `src/app/editor/index.vue` | Vue wrapper around the `EditorView`; mode switch; all editor CSS (spacing rules, hanging lists, checkbox, quote bars) |
| `editor/functions/create-state.js` | all extensions, keymaps (Document mode's block keys are `Prec.highest`, ahead of lang-markdown's), Document/Markdown and Literal compartments, BOM handling, `getText` |
| `editor/functions/markdown/` | lezer Markdown (GFM) + front matter parser extension |
| `editor/functions/blocks/index.js` | blocks from the syntax tree: every top-level element, every top-level list item (with the list it belongs to) |
| `editor/functions/blocks/decorations.js` | line classes for spacing (`cm-block-first/last`, type, `cm-after--`/`cm-before--` neighbour types); mapped while typing, re-checked when idle |
| `editor/functions/blocks/select.js` | block-aware Shift+↑/↓ (empty paragraphs are steps) |
| `editor/functions/dnd/` | dragging blocks: handle, gap, lines sliding aside, preview (`index.js`); where a drag can go and the drop, replaying Alt+↑/↓ on the region it changes (`slots.js`) |
| `foundation/dnd/` | drag engine: pointer, preview (moved with the item, or placed by its owner: `place`), auto-scroll, Escape (`index.js`); displace mode (`displace.js`); target mode (`target.js`) |
| `editor/functions/move/` | block moves (`index.js`), sub-item moves (`nested.js`), the slide of a move and the bump when a block cannot move (`animate.js`), renumbering numbered lists (`renumber.js`), heading level shift for outline moves |
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
| `tests/` | fixtures (round-trip), blocks, block lines, moves, dragging (drop = key presses), outline (titles, drops, levels, renaming, target mode), gaps (incl. 300 random edits vs full recompute), syntax, formats, indent, literal typing |

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
- **Animating CodeMirror lines**: move them with CSS transforms on line decorations, never by touching its DOM. Changing a line decoration's attributes keeps the same element, so a CSS transition runs; `style` attributes from several decorations are merged (`--hang` survives). To restart a CSS animation on each key press, alternate two identical keyframes (`-a` / `-b`).
- **Measure the drawn lines, not CodeMirror's height map**, around a change: right after typing the map can be 30–160 px off the page. `dispatchMove` reads line rects just before the move and right after the dispatch (CodeMirror updates the DOM synchronously; the browser has not painted yet), then draws the lines back by the difference.
- **CodeMirror's editor class is `position: relative !important`**: a copy of the editor's elements (the drag preview) needs a plain wrapper to be placed. The copy's first line is the first line of its content, which drops its top border: align copies by where the text area starts (below border and padding), not by line boxes.
- **A direct move is not the same as several presses**: renumbering after each press differs from renumbering once. The drop replays the presses on a copy of just the region they change (blocks between the place and the slot, one more on each side, whole lists at the edges, in a state with only the parser): about 0.5 ms per step on 10k lines, where replaying on the whole document took 8 ms.
- **Markdown: a numbered line right under text is only an item if it is `1.`** (CommonMark); `2. b` under a bullet item's text is more of that text. lezer accepts it under a numbered item, so it is easy to miss.
- **A hidden browser pane** (see above) also keeps CSS transitions "running" at time 0, so computed values look stuck; check the sequence of classes and starting positions there, and leave the motion to the user's Safari. Web Animations' `finished` promises and `transitionend` do not come either (they need rendering steps); `getAnimations()` with `pause()` and `currentTime` steps through any animation, CSS transitions included, to measure positions at given times.
- **Animating a column's width lays out what is beside it on every frame**: smooth in Chrome, stuttering in Safari with CodeMirror beside it. Give it its width at once, lay out once, and animate transforms from where things were drawn (FLIP), with Web Animations.
- **Two motions on the same curve but over different distances look like different easings** (children sliding 1rem while the space opens by their height). Only the same distance matches; here the children are placed by layout at the opening edge, so they cannot drift.
- **In Safari, a compositor animation (transform, opacity) and a main-thread one (a height transition) start and step apart**: anything that must stay together with a height change is done by layout, not by a second animation.
- **Vue's CSS transition classes start two frames after the element is inserted**; whatever must start with a change made in the same render (a height transition) goes through `@enter` / `@leave` hooks with Web Animations instead.
- **Safari**: `clip-path` did not always clip descendants on their own layers (`translateZ(0)` rows), `overflow: hidden` did; holding the end of an animation (`fill: forwards`) flashed for a frame when it ended (set the end state as the element's own style instead); an element that turns into a layer only on hover (an opacity transition) jumps by a fraction of a pixel (keep it a layer always, at whole-pixel sizes).
- **An opaque overlay above lines that land under it hides them**: the dragged copy goes behind the text (`z-index: -1`) while it fades out on the drop, or the text blinks.
- **A text field has a width of its own** (about 20 characters); to size it to its text with a hidden copy in the same grid cell, give it `size='1'`.
- **Live edits from outside the editor** (renaming in the outline) go in with `Transaction.addToHistory.of(false)`, the changes composed as they come; at the end they are inverted against the starting document and the final change applied normally: one undo step. The outline's rows are keyed by title, so it keeps its list as it was while a title changes, or the row (and its field) is rebuilt.
- **Single and double clicks cannot both act at once**: a double-click starts with a click. Waiting to tell them apart felt slow and taking the first click back showed it; renaming by a click on the title's text avoids the choice.
- In the pane, importing a CodeMirror module again (`import('/node_modules/.vite/deps/…')`) gives a second copy whose `undo` does nothing on the app's state; press the real keys (Cmd+Z) instead.

## Tried and dropped

Card boxes around blocks (as line styling, then as a layer); a Look switch with styled/plain/contenteditable/textarea baselines; a plain-textarea Markdown view; bigger block sizes (whole lists, whole sections) with a live switch and an active-block background; blank lines as skipped spacing lines, and as part of the card above. Second session: taking a list mark off as a paragraph of its own (the user wants a further line right under the text, so the text doesn't move); a list right under text sitting 3 px close to it (12 px like paragraphs instead). Third session: a cross-fade for Alt+↑/↓ (a slide reads better), a fade of the moved block while it slides, all drag handles in one column (each is next to its own bullet again). This session: the sidebar animating its width (Ordner's way; stuttered in Safari) and its content sliding only a third of its width (ran ahead of its edge); folding children that slide 1rem, slide their full height by a transform, or tie their fade to the opening's progress (none matched the rows below; the drawer by layout does), a soft mask at the drawer's top; double-click to rename, with a wait before toggling, or throttled, or with the toggle taken back; a tick and Ordner's triangle at the drop line's ends, and the line trimmed at the rows' corners; the dragged block faded to 0.6; a copy of the row as the outline's drag preview; the 3 × 3 handle. Details on the earlier ones are in decisions.md.

## Next steps (not started)

- **Keyboard in the outline** (the user's next step): the outline is focusable and keeps the focus after renaming with Enter or Escape; still to do: ↑/↓ between headings, ←/→ to close / open (as in Ordner), Enter to rename, a way back to the editor.
- **Files** (rest of Milestone 4): watching the file and taking in outside changes (keep undo: apply as a minimal diff; this also ends the "changed by another app" stop), recent files, reopening the last session (with the outline's closed headings and the sidebar's settings, now in `localStorage`), opening `.md` files from Finder (file associations, "Open With"), single instance, a settings store.
- **Windows build** (decisions.md, Desktop app): GitHub Actions with `tauri-action`, then check typing latency, fonts and shortcuts there; signing later.
- **Desktop polish**: the overlay title bar with title-bar buttons replacing the dev toolbar, Cmd+1…6 as menu items, an app icon (the Tauri default for now), signing and notarization (Milestone 7).
- Smaller open items:
  - Renaming a heading that has Markdown inside (bold, links) replaces it with plain text (the user's choice); undoing a rename opens a heading that was closed (its closed state moved to the new title).
  - In light mode the dragged block's background can barely be brighter than the white page (`#fafafb`); its shadow carries it.
  - The drop line's ring and the dragged copy were only measured in the pane (too small to see there); the user checks them in Safari.
  - Cmd-click to open links.
  - Tables, HTML and front matter are still shown raw in Document mode.
  - A fence or setext heading loses a little spacing where its line collapses.
  - Images via TextBundle later.
  - Enter in an empty sub-item still uses Markdown's outdent.
  - Moving a numbered item out of the top of its list leaves the rest starting at 2 (top-level lists keep their lowest number, so numbering continued after a paragraph is kept).
