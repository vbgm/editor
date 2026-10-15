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
- **Block granularity is open, decided by measurement:** Notion-like small blocks (each paragraph, each list item) if speed and native text selection hold up; otherwise larger blocks (a whole list, groups of paragraphs). Build it as a parameter and measure both.

## Files

- Single-file windows first.
- Images later: the `.md` turns into a folder holding the Markdown and its images. [TextBundle](http://textbundle.org) (`Name.textbundle/` with `text.md`, `assets/`, `info.json`) is the candidate format: Bear, Ulysses and iA Writer support it, and macOS shows it as one file.
- Markdown for now; extending it later is allowed if needed.
