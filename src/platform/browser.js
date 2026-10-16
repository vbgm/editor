// The browser's side of the platform (index.js lists the functions), for development: files are
// opened with the browser's file picker and saved as downloads. A page cannot write to a file it
// opened, so documents here have no path and are never saved by themselves.

export const isApp = false

// as the macOS app's, to try the layout: ?overlay-title-bar in the address
export const hasOverlayTitleBar = new URLSearchParams(location.search).has('overlay-title-bar')

export function ready () {}

export function setTitle (title) {
  document.title = title
}

export function readFile () {
  throw { kind: 'io', message: 'A browser cannot read files by path.' }
}

export function writeFile () {
  throw { kind: 'io', message: 'A browser cannot write files.' }
}

export function pickFile () {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain'
    input.addEventListener('cancel', () => resolve(null))
    input.addEventListener('change', async () => {
      const file = input.files[0]
      if (!file) return resolve(null)
      // ignoreBOM keeps a byte order mark in the text, so saving writes it back
      const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await file.arrayBuffer())
      resolve({ path: null, name: file.name, text, modified: null })
    })
    input.click()
  })
}

export function saveAs (text, name) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href))
  return { path: null, name, modified: null }
}

export function askToSave (name) {
  return confirm(`“${name}” has changes that are not saved. Discard them?`) ? 'discard' : 'cancel'
}

export function askToOverwrite () {
  return false
}

export function askToClose () {
  return false
}

export function tell (title, text) {
  alert(`${title}\n\n${text}`)
}

// no native menu or file drops in the browser
export function onMenu () {}

export function onFileDrop () {}

// no warning on leaving: Vite reloads the page while developing, and samples are edited freely
export function onCloseRequested () {}

export function close () {}
