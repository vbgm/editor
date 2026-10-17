// The desktop app's side of the platform (index.js lists the functions). Files are read and
// written by the Rust side (src-tauri/src/files.rs), which also keeps saves atomic.

// npm packages
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open, save, message } from '@tauri-apps/plugin-dialog'

const markdownFilter = { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }

function extensionOf (path) {
  const match = /\.([^./\\]+)$/.exec(path)
  return match ? match[1].toLowerCase() : ''
}

export const isApp = true

// macOS: tauri.macos.conf.json lays the title bar over the page (its buttons stay, its title is
// hidden: the app draws it)
export const hasOverlayTitleBar = /Mac/.test(navigator.userAgent)

const isMac = /Mac/.test(navigator.userAgent)

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

export async function readBytes (path) {
  try {
    const buffer = await invoke('read_bytes', { path })
    return { path, name: nameOf(path), bytes: new Uint8Array(buffer) }
  } catch (error) {
    throw fileError(error)
  }
}

// one filter with every kind: macOS shows the first filter only, without a way to switch
export async function pickFile (documentExtensions = []) {
  const filters = [{ name: 'Documents', extensions: [...markdownFilter.extensions, ...documentExtensions] }]
  const path = await open({ multiple: false, directory: false, filters })
  if (!path) return null
  return documentExtensions.includes(extensionOf(path)) ? readBytes(path) : readFile(path)
}

export async function saveAs (text, name, directory) {
  const path = await save({ defaultPath: (directory ?? '') + name, filters: [markdownFilter] })
  if (!path) return null
  const modified = await writeFile(path, text, null)
  return { path, name: nameOf(path), modified }
}

// macOS: the app's own save panel with a File Format popup (src-tauri/src/export.rs; the dialog
// plugin's merges the formats into one list). Windows and Linux: their dialog's list of types, the
// format told by the name's extension (one without a known extension gets the first one's)
export async function exportFile (directory, name, formats, extension, convert) {
  const selected = Math.max(0, formats.findIndex(format => format.extensions.includes(extension)))
  let path
  if (isMac) {
    const chosen = await invoke('export_panel', {
      directory,
      name,
      formats: formats.map(format => ({ name: format.name, extension: format.extensions[0] })),
      selected
    })
    if (!chosen) return null
    path = chosen.path
    extension = chosen.extension
  } else {
    const ordered = [formats[selected], ...formats.filter((_, index) => index != selected)]
    path = await save({ defaultPath: `${directory ?? ''}${name}.${formats[selected].extensions[0]}`, filters: ordered })
    if (!path) return null
    extension = extensionOf(path)
    if (!formats.some(format => format.extensions.includes(extension))) {
      extension = formats[selected].extensions[0]
      path += `.${extension}`
    }
  }
  const bytes = await convert(extension)
  try {
    await invoke('write_bytes', bytes, { headers: { path: encodeURIComponent(path) } })
  } catch (error) {
    throw fileError(error)
  }
  return extension
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

// a file opened from Finder or Explorer (src-tauri/src/opened.rs): the one that started the app,
// then any opened later; listening first, so none comes in between
export async function onFileOpen (handler) {
  await listen('open-file', event => handler(event.payload))
  const path = await invoke('take_opened_file')
  if (path) handler(path)
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
