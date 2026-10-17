// The app's only door to where it runs: the Tauri shell (the desktop app) or a plain browser
// (development, the browser pane). Nothing else imports @tauri-apps/*; both sides offer the same
// functions:
//
//   isApp                                 running in the desktop app
//   hasOverlayTitleBar                    the window's title bar is laid over the page, its
//                                         buttons at the top left (macOS): the app draws the
//                                         rest of the title bar, the title too (title-bar/)
//   ready ()                              the first document is drawn: show the window
//   setTitle (title)
//   setNativeTitleHidden (isHidden)       whether the window's own title is hidden (macOS; hidden
//                                         at first, shown while the app draws no title row)
//   pickFile (documentExtensions)         Open…: { path, name, text, modified }, or for a file
//                                         with one of documentExtensions (RTF, Word…: converted,
//                                         not edited) { path, name, bytes }; or null
//   readFile (path)                       { path, name, text, modified }
//   readBytes (path)                      { path, name, bytes }
//   writeFile (path, text, expected)      the new modification time; throws { kind: `changed` }
//                                         when the file's is no longer expected (null: no check)
//   saveAs (text, name, directory)        Save As…: { path, name, modified } or null; the dialog
//                                         opens in directory (ending in its separator) if given
//   exportFile (directory, name, formats, extension, convert)
//                                         Export…: asks where and in which of formats ([{ name,
//                                         extensions }]; extension: the one chosen at first; name:
//                                         without an extension; directory: null for the last one
//                                         used), then writes await convert(extension); the
//                                         extension written, or null
//   askToSave (name)                      `save`, `discard` or `cancel`
//   askToOverwrite (name)                 true to replace a file changed by someone else
//   askToClose (name, error)              true to close although saving failed
//   tell (title, text)                    a message, with OK
//   onMenu (handler)                      menu commands by id (src-tauri/src/menu.rs)
//   onFileDrop (handler)                  paths of files dropped on the window
//   onFileOpen (handler)                  the path of a file opened from Finder or Explorer
//                                         (Open With, a double click), also the one the app
//                                         was started with
//   onFullscreen (handler)                true when the window goes fullscreen, false when it
//                                         leaves it; called once at first with how it is
//   onCloseRequested (handler)            handler resolves true to let the window close
//   close ()                              asks to close the window (onCloseRequested decides)
//
// Errors thrown are { kind: `changed` | `notText` | `io`, message }.

// npm packages
import { isTauri } from '@tauri-apps/api/core'
// local functions
import * as app from './tauri.js'
import * as browser from './browser.js'

export default isTauri() ? app : browser
