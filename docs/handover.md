# Block Markdown Notepad — Handover

Original handover, kept as written. Decisions made since then are in [decisions.md](decisions.md) and take precedence.

Name: Textflow (earlier working name: Editor; "TextBlocks" is taken by another app in the App Store).

## Product in one paragraph

A fast desktop notepad that edits plain Markdown files on disk. No database, no accounts, no server: download, open a `.md` file, write. The distinctive idea is blocks larger than Notion's: each block is a title + body (paragraphs, bullet lists, numbered lists). Text can be selected across blocks, blocks can be moved up/down and dragged to reorder, and everything is saved as Markdown. Speed is the top priority: instant startup, keyboard-first, autosave, no friction.

## Decided

- Shell: Tauri 2, desktop only for now — macOS, Windows, Linux. No mobile/Capacitor in the first version.
- Frontend: Vue 3 + Vite + TypeScript. No Meteor, no backend.
- Storage: plain `.md` files on the user's disk are the only storage.
- Block = title + body (paragraphs, bullets, numbered lists).
- Must have: selection across blocks, move block up/down, drag-and-drop reorder, save to Markdown.
- Outline panel: reuse the outline component from Ordner and improve it; the improvements should flow back to Ordner.
- Native UI: native menu bar plus a few basic top-level native-looking buttons. Priority is speed over full native chrome.
- Distribution: official stores are acceptable (Mac App Store, Microsoft Store). Linux has no paid store, so Linux sells directly. Website price may be lower than store price.

## Proposed, not yet decided

- Editor engine (decide first, via a spike — see Milestone 1):
  - CodeMirror 6 with live preview (Obsidian-style): text is the document, so file fidelity is perfect; fastest typing; cross-block selection and line moves come free. Blocks are drawn as cards with decorations. Drag-and-drop is custom work (about a day).
  - Tiptap 3 + `@tiptap/markdown` (ProseMirror): real block UI (custom `section` node), official drag handle (`@tiptap/extension-drag-handle-vue-3`, free). Saving re-serializes the file, so formatting gets normalized.
- Markdown block convention:
  1. A heading (e.g. `##`) starts a block; the block runs until the next heading of the same level. Cleanest, most portable Markdown. Headings inside a body would need to be disallowed or demoted.
  2. Container directive (`:::block{id=…}` … `:::`) if blocks need metadata (ID, collapsed state). Unambiguous, but other tools show the fences as text.
- Pricing: paid license with a free trial (one-time, roughly in the $15–30 range for this category), license keys verified offline (Ed25519 signature), sold through a merchant of record (Paddle, Lemon Squeezy or Polar) on the website. No character or usage limits.

## Architecture

```
┌─────────────────────────────────────────────┐
│ Vue app                                      │
│  ├─ Title bar strip (HTML buttons, drag region)
│  ├─ Outline panel (from Ordner, pure component)
│  ├─ Editor (CodeMirror 6 or Tiptap)          │
│  ├─ Command palette, quick open              │
│  └─ platform/ adapter  ◄── only place that talks to Tauri
└──────────────┬──────────────────────────────┘
               │ invoke / events
┌──────────────▼──────────────────────────────┐
│ Tauri 2 (Rust, small: ~200–400 lines)        │
│  file read/save (atomic), file watch,        │
│  menus, session, open-file events, license   │
└─────────────────────────────────────────────┘
```

## Rules

- Platform adapter: the UI calls only a small interface, e.g. `openFile`, `saveFile`, `watchFile`, `onMenuCommand`, `getSession`, `setSession`, `verifyLicense`. Nothing else imports `@tauri-apps/*`. This keeps a later Capacitor (mobile) or Swift shell cheap to add.
- Editor owns its DOM. No drag library may move editor DOM nodes. Drag UIs compute a target and call one editor command: `moveSection(fromId, toIndex)`. Same command for drag handle, outline drag, and keyboard moves.
- One move = one transaction = one undo step.
- Outline component is pure: props in (`sections: { id, title, level }[]`), events out (`move`, `select`, `rename`). No data-layer imports. Consider a shared workspace package used by both this app and Ordner.

## Block model

- A section is identified by its title line and spans to the next section boundary.
- Commands: `moveSectionUp`, `moveSectionDown`, `moveSection(from, to)`, `foldSection`, `newSectionAfter`, `getOutline`.
- Keyboard: Alt+Shift+↑/↓ move section (final keys TBD).

## Native layer (Tauri) scope

- Window: `titleBarStyle: Overlay` + hidden title on macOS (traffic lights over content); create the window hidden and `show()` after the first Vue render (no white flash). Optional vibrancy for the sidebar.
- Menus: full native menu bar (File, Edit, View, Block, Window, Help) with shortcuts; menu items emit events to the frontend. Native context menus.
- Files: read, atomic save (write `*.tmp` then rename), watch for external changes and reload, native open/save dialogs.
- Plugins likely needed: dialog, fs, window-state, single-instance, file associations / open-with for `.md`, updater (for direct builds), store (settings/session).
- Later, optional: real `NSToolbar` via `objc2-app-kit` for a few macOS buttons.
- Gotcha: Tauri's file-drop handling can interfere with HTML5 drag-and-drop on Windows. Use pointer events for all in-app dragging.

## Speed checklist

- Open the last session's files immediately at startup.
- Autosave with debounce (~300–500 ms); never show a save dialog for an existing file.
- File I/O in Rust, never blocking the UI.
- Lazy-load settings, export, extra code-highlighting languages.
- Quick open (Cmd/Ctrl+P) with fuzzy search over a folder (e.g. `uFuzzy`); command palette for everything.
- Test with large files (10k+ lines). With Tiptap, avoid heavy Vue node views per block.
- Test the editor in all three web views: WebKit (macOS), WebView2 (Windows), WebKitGTK (Linux, weakest).

## Milestones

1. Spike (1–2 days): two throwaway prototypes of the core loop — CodeMirror 6 vs Tiptap — each with: open/save a `.md` file, sections as title+body cards, select across sections, Alt+Shift+↑/↓ move. Pick the editor and the Markdown convention from this.
2. Scaffold: Tauri 2 + Vue 3 + Vite + TS; platform adapter; window/no-flash startup; native menu skeleton.
3. Core editor: chosen engine, block model and commands, Markdown round-trip tests (load → save → byte-compare on a fixture set).
4. Files and session: open/save/autosave, atomic writes, external change reload, recent files, reopen last session, open-with `.md`.
5. Outline and drag: port Ordner outline as a pure component; outline drag → `moveSection`; in-editor drag handle.
6. Speed and polish: command palette, quick open, title-bar buttons, themes (light/dark), large-file performance.
7. Distribution: code signing + notarization (macOS), Windows signing, Linux packages (`.deb`, `.rpm`, AppImage, Flatpak later); Mac App Store and Microsoft Store builds; license check for direct builds; trial.

## Later

- Mobile (iOS/Android) via Tauri mobile or Capacitor, sharing the editor bundle. Main hurdle is opening files in place (iOS security-scoped bookmarks, Android SAF), likely needing small native plugins.
- Name, trademark and domain checks (EUIPO/TMview, USPTO class 9, app stores).
