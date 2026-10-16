// The desktop app's side of the platform (index.js lists the functions). Files are read and
// written by the Rust side (src-tauri/src/files.rs), which also keeps saves atomic.

// npm packages
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open, save, message } from '@tauri-apps/plugin-dialog'

const markdownFilter = { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }

export const isApp = true

// macOS: tauri.macos.conf.json lays the title bar over the page (its buttons stay, its title is
// hidden: the app draws it)
export const hasOverlayTitleBar = /Mac/.test(navigator.userAgent)

function nameOf (path) {
  return path.split(/[\\/]/).pop()
}

// errors from the Rust side are { kind, message }; anything else (a refused permission) becomes one
function fileError (error) {
  return error?.kind ? error : { kind: 'io', message: String(error) }
}

export function ready () {
  return getCurrentWindow().show()
}

export function setTitle (title) {
  return getCurrentWindow().setTitle(title)
}

// macOS's own title, hidden while the app draws its title row (src-tauri/src/title.rs)
export function setNativeTitleHidden (isHidden) {
  return invoke('set_title_hidden', { hidden: isHidden })
}

export async function readFile (path) {
  try {
    const { text, modified } = await invoke('read_file', { path })
    return { path, name: nameOf(path), text, modified }
  } catch (error) {
    throw fileError(error)
  }
}

export async function writeFile (path, text, expected) {
  try {
    return await invoke('write_file', { path, text, expected })
  } catch (error) {
    throw fileError(error)
  }
}

export async function pickFile () {
  const path = await open({ multiple: false, directory: false, filters: [markdownFilter] })
  return path ? readFile(path) : null
}

export async function saveAs (text, name) {
  const path = await save({ defaultPath: name, filters: [markdownFilter] })
  if (!path) return null
  const modified = await writeFile(path, text, null)
  return { path, name: nameOf(path), modified }
}

export async function askToSave (name) {
  const answer = await message('Your changes will be lost if you don’t save them.', {
    title: `Do you want to save the changes made to “${name}”?`,
    kind: 'warning',
    buttons: { yes: 'Save', no: 'Don’t Save', cancel: 'Cancel' }
  })
  return { Save: 'save', 'Don’t Save': 'discard' }[answer] ?? 'cancel'
}

export async function askToOverwrite (name) {
  const answer = await message('Saving replaces the file with your version; the other changes are lost.', {
    title: `“${name}” was changed by another app.`,
    kind: 'warning',
    buttons: { ok: 'Replace', cancel: 'Cancel' }
  })
  return answer == 'Replace'
}

export async function askToClose (name, error) {
  const answer = await message(`${error.message ?? error.kind} Close anyway? Your changes will be lost.`, {
    title: `“${name}” could not be saved.`,
    kind: 'error',
    buttons: { ok: 'Close Anyway', cancel: 'Cancel' }
  })
  return answer == 'Close Anyway'
}

export async function tell (title, text) {
  await message(text, { title, kind: 'warning' })
}

export function onMenu (handler) {
  return listen('menu', event => handler(event.payload))
}

// going fullscreen and back resizes the window
export function onFullscreen (handler) {
  const window = getCurrentWindow()
  const check = () => window.isFullscreen().then(handler)
  check()
  return window.onResized(check)
}

export function onFileDrop (handler) {
  return getCurrentWebview().onDragDropEvent(event => {
    if (event.payload.type == 'drop' && event.payload.paths.length) handler(event.payload.paths)
  })
}

// the window closes only once the handler says so; the app quits with it (src-tauri/src/lib.rs)
export function onCloseRequested (handler) {
  const window = getCurrentWindow()
  return window.onCloseRequested(async event => {
    event.preventDefault()
    if (await handler()) await window.destroy()
  })
}

export function close () {
  return getCurrentWindow().close()
}
