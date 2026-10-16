# Session handover

State of the project at the end of the first working session (2026-10-16), for whoever continues.
Read in this order:

1. this file: where things stand and how to work here
2. [decisions.md](decisions.md): everything decided so far; it overrides the original handover
3. [handover.md](handover.md): the original product handover (vision, milestones, Tauri plans)

## How to work here

- **Workflow** (from the user's instructions): investigate → propose a plan and wait → the user confirms → implement → ask before committing → the user pushes. **Never push**, never touch the `stage` / `prod` branches, and **no attribution** (no "Co-Authored-By", no "Generated with …") in commits or anywhere else.
- "Commit" means: commit everything listed in the last summary on `main`. Write the message as helps later: a summary line, and a body explaining what changed and why when that is useful.
- Testing happens in **Safari** (the engine the macOS app will run on) and Chrome, usually on the production build at `localhost:1421`. **After every change, rebuild that preview** (stop and start the `production` launch config), or stale code gets tested.
- Keep it **minimal**: the page must look like plain text; no visual chrome unless asked. Debugging tools go behind a toggle.
- Before claiming a fix, **verify it in the browser pane** (measure positions with JS where screenshots cannot show it, such as the caret) and say what could not be checked. Fixes that do not work get noticed quickly.
- Explain in plain words; when a request is unclear, ask instead of guessing. Several times a misreading cost a full round (see "Tried and dropped").

## Code style

- **Vue 3 Options API, plain JavaScript, LESS.** No TypeScript. Follow Ordner's style (details in decisions.md): blank lines inside `<template>`, `</template><script>` and `</script><style scoped lang='less'>` joined, single quotes in attributes, backticks in template expressions, `v-bind='{ … }'` for many props, events last on elements, one folder per component with `index.vue` and `functions/`, imports grouped under comments, absolute paths from the project root (`/src/...`).
- Comments explain **why**, at the top of each module; keep them true when behaviour changes.
- `/foundation` is a local stand-in for the shared `foundation` repo (only a README so far).

## Running it

```bash
npm run dev          # localhost:1420, hot reload
npm run production   # build + preview on localhost:1421 (what gets tested)
npm test             # vitest, 163 tests (node + jsdom)
```

`.claude/launch.json` has both servers (`dev`, `production`) for the browser pane. The dev toolbar picks a sample document (the test fixtures, plus a generated 10k-line file), opens local files, switches **Markdown** mode, turns **Literal** typing on or off, shows **Stats** (typing latency per mode, benchmark results) and runs the benchmark.

Rust is **not installed** on this Mac, so there is no Tauri shell yet; everything runs in the browser.

## What exists

One CodeMirror 6 editor (in `src/app/editor/`) with two modes, switched by the Markdown button or Cmd+Shift+M:

- **Document** (default): Markdown as plain text. Syntax hidden (`#`, `**`, link addresses, `> `, fences, setext underlines), bullets drawn as `•`, task boxes as checkboxes, blank lines between blocks hidden with spacing instead. Enter starts a new block, Backspace/Delete join paragraphs, Backspace at the start of a heading/quote/list item removes its mark.
- **Markdown**: the file as it is, monospace (line height 1.55, aligned so the first line does not move), Enter/Backspace as in a text editor.
- **Both modes**: Alt+↑/↓ (and Alt+Shift+↑/↓) move blocks, one undo step each; Shift+↑/↓ select within the block first, then whole blocks; formatting shortcuts Cmd+1…6 / Cmd+0 / Cmd+7 / Cmd+8 (also with Alt, for browsers that keep Cmd+number), Cmd+B/I/E/K, Cmd+Shift+X, Cmd+Enter (tick a task / make a task).
- Files round-trip byte for byte (BOM, CRLF, no final newline, front matter); a mixed-line-break file is normalized to LF.

## Map of the code

| Path | What it does |
|---|---|
| `src/app/index.vue` | app: toolbar, editor, stats footer; sample documents; benchmark |
| `src/app/toolbar/` | dev toolbar (buttons use `mousedown.prevent` so the editor keeps focus) |
| `src/app/metrics/` | stats footer: Event Timing + own key-press→paint timing, per mode and key kind |
| `src/app/benchmark/` | scripted load/typing/move benchmark, editor vs bare CodeMirror |
| `src/app/editor/index.vue` | Vue wrapper around the `EditorView`; mode switch incl. Safari caret redraw |
| `editor/functions/create-state.js` | all extensions, keymaps, Document/Markdown mode (`modeCompartment`, `switchMode`), `getText` |
| `editor/functions/markdown/` | lezer Markdown (GFM) + front matter parser extension |
| `editor/functions/blocks/index.js` | blocks from the syntax tree: every top-level element, every top-level list item |
| `editor/functions/blocks/decorations.js` | line classes for spacing (`cm-block-first/last`, type); mapped while typing, re-checked when idle |
| `editor/functions/blocks/select.js` | block-aware Shift+↑/↓ |
| `editor/functions/move/` | block moves as swaps of adjacent spans, heading level shift (for the outline later), moving sub-items (`nested.js`), renumbering numbered lists after a move |
| `editor/functions/gaps/` | hiding blank lines between blocks (state field, updated only around edits), Enter/Backspace/Delete on blocks, click/cursor fixes |
| `editor/functions/syntax/` | hiding Markdown syntax, widgets, cursor placement behind hidden line marks, `textStart` |
| `editor/functions/redraw-caret.js` | makes Safari draw the caret anew after a mode switch or Tab |
| `editor/functions/indent/` | Tab / Shift+Tab: nest list items, quote levels for paragraphs |
| `editor/functions/format/` | formatting commands and their keymap |
| `editor/functions/markdown-shown.js` | facet: is Markdown mode on |
| `editor/functions/markdown-top.js` | Markdown mode's top padding, so the first line's text starts where it does in Document mode |
| `editor/functions/raw-markup.js` | heading and list marks with no space after them yet: shown as typed, treated as paragraphs |
| `editor/functions/literal-typing.js` | Literal: typed characters that would become syntax are escaped |
| `tests/` | fixtures (round-trip), blocks, moves, gaps (incl. 300 random edits vs full recompute), syntax, formats |

## Things learned the hard way

- **Speed**: in Safari, CodeMirror itself is as fast as a native textarea. Anything per keystroke must stay off the typing path: shift existing decorations through the edit and re-check when idle (`idleScheduler`); rebuild at once only for edits across lines (or the spacing jumps). Chrome on macOS is a frame late even for a textarea; not optimized for.
- **Decorations that hide line breaks must come from a state field**, not a view plugin (CodeMirror throws). The first whole-document version cost 7–10 ms per key on 10k lines; `gaps/index.js` now recomputes only the edited region plus blocks the parser changed (`changedBlocks`). A randomized test compares it with a full recompute; keep it.
- **Atomic ranges** make the cursor skip hidden text; clicks need their own handling (`clicksBesideLines`), and a cursor placed at a line start goes behind a hidden mark via a transaction filter (`cursorAfterLineMarks`).
- **Safari keeps drawing the caret at its old place** after a re-layout when the browser's selection stays at the same place in the DOM (mode switch; Tab, where the new indentation is a widget in front of the same text); `redraw-caret.js` moves the cursor one character away and back within its line once the new lines are painted (`index.vue` also hides the caret during a mode switch).
- **Anything wider than the window** makes CodeMirror's scroll-into-view scroll the whole app sideways; the app's children have `min-width: 0` and the toolbar/stats scroll on their own.
- **jsdom tests** need `Range.getClientRects` stubs and cannot test layout (clicks, vertical moves, caret, layers); verify those in the pane.
- CodeMirror's `drawSelection` is off: the browser's own caret feels faster than a drawn one.

## Tried and dropped

Card boxes around blocks (as line styling, then as a layer); a Look switch with styled/plain/contenteditable/textarea baselines; a plain-textarea Markdown view; bigger block sizes (whole lists, whole sections) with a live switch and an active-block background; blank lines as skipped spacing lines, and as part of the card above. Details and reasons are in decisions.md.

## Next steps (not started)

- **Tauri shell** (Milestone 2 in handover.md): install Rust, Tauri 2, platform adapter, no-flash window, native menu with the shortcuts and Document/Markdown in the View menu; measure in WKWebView, WebView2, WebKitGTK.
- **Files** (Milestone 4): open/save, autosave, atomic writes, external-change reload (keep undo: apply as a minimal diff), recent files, session.
- **Outline and drag-and-drop** (Milestone 5): one pointer-events drag engine in `/foundation` with two modes (displace for blocks, target lines for the outline tree, as decided); the drag handle appears only in the left margin next to a block, never over the text; outline moves use `moveSpec` with `levelDelta`.
- Smaller open items: Cmd-click to open links; tables, HTML and front matter are still shown raw in Document mode; a fence or setext heading loses a little spacing where its line collapses; images via TextBundle later; check Cmd+1…6 in Safari.
