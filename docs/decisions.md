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

- **Displace mode** (editor blocks, flat lists): items under the pointer move aside to open a gap, like Ordner's list reordering.
- **Target mode** (TOC sidebar, trees): items stay put; a target line shows the drop position and depth (between items, or inside an item), like Ordner's sidebar. The horizontal position decides the level.

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

- **One editor, one look**: the editor always shows Markdown as plain text (no syntax, no blank lines between blocks). The **Markdown** button (Cmd+Shift+M, later a View menu item) shows the raw file in a plain textarea instead; switching back applies its edits to the editor as one undo step, keeping the file's own line breaks. The file is never changed by hiding.
- **Blank lines between blocks** stay in the file but are hidden on screen while Markdown is hidden: blocks sit right below each other and the cursor skips the gap. The blank line with the cursor (a new block after Enter) stays visible. Enter in a paragraph or heading starts a new block, Backspace at the start of a paragraph joins it to the block above, Delete at the end of a block joins the paragraph below. The hiding is a state field updated only for the edited lines (about 1 ms per key on 10k lines; recomputing the whole document was 7–10 ms).
- Several blank lines in a row mean the same as one in Markdown (outside code), so collapsing them never changes the document's meaning; the editor still keeps them as they are in the file.
- **Minimal look**: the page looks like plain text: no card boxes, no highlight of the block with the cursor, only spacing between blocks. (Cards were tried and dropped: they were only useful for measuring, and the raw Markdown is clearer in a textarea.)
- **Drag handle** (to come with drag-and-drop): appears only while the mouse is in the left margin next to a block, never when hovering over the text.
- **Shortcuts**: Cmd+1…6 heading level, Cmd+0 paragraph, Cmd+7 numbered list, Cmd+8 bullet list, Cmd+B bold, Cmd+I italic, Cmd+E inline code, Cmd+K link, Cmd+Shift+X strikethrough (Cmd+X is cut), Cmd+Shift+M show Markdown (Cmd+M minimizes).
  - The line formats also work with **Cmd+Alt+number**: browsers reserve Cmd+number for switching tabs (Chrome never lets a page have it), so this second set works everywhere. In the app, Cmd+number are native menu items.
  - Not Cmd+Shift+number (macOS takes Cmd+Shift+3/4/5 for screenshots), not Alt+number alone (types characters such as `[ ] | { }` on many keyboard layouts).
## Files

- Single-file windows first.
- Images later: the `.md` turns into a folder holding the Markdown and its images. [TextBundle](http://textbundle.org) (`Name.textbundle/` with `text.md`, `assets/`, `info.json`) is the candidate format: Bear, Ulysses and iA Writer support it, and macOS shows it as one file.
- Markdown for now; extending it later is allowed if needed.
