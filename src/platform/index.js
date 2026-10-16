// The app's only door to where it runs: the Tauri shell (the desktop app) or a plain browser
// (development, the browser pane). Nothing else imports @tauri-apps/*; both sides offer the same
// functions:
//
//   isApp                                 running in the desktop app
//   ready ()                              the first document is drawn: show the window
//   setTitle (title)
//   pickFile ()                           Open…: { path, name, text, modified } or null
//   readFile (path)                       { path, name, text, modified }
//   writeFile (path, text, expected)      the new modification time; throws { kind: `changed` }
//                                         when the file's is no longer expected (null: no check)
//   saveAs (text, name)                   Save As…: { path, name, modified } or null
//   askToSave (name)                      `save`, `discard` or `cancel`
//   askToOverwrite (name)                 true to replace a file changed by someone else
//   askToClose (name, error)              true to close although saving failed
//   tell (title, text)                    a message, with OK
//   onMenu (handler)                      menu commands by id (src-tauri/src/menu.rs)
//   onFileDrop (handler)                  paths of files dropped on the window
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
