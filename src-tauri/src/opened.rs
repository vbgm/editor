// Files the system asks the app to open: a double click in Finder or Explorer, Open With, a file
// dropped on the Dock icon. The app declares Markdown (.md, .markdown) as its editor, and RTF,
// Word and OpenDocument text as their viewer (they open as a new Markdown document), in
// tauri.conf.json (`fileAssociations`), which is what lists it under Open With.
//
// macOS hands them over as an event (`RunEvent::Opened`, in lib.rs), at launch as well as later.
// Windows and Linux start the app with the file as an argument; when it is already running, the
// new copy passes its arguments to this one and quits (the single-instance plugin, in lib.rs).
//
// A file can come before the web app has drawn its first document: it is kept until the web app
// takes it (`take_opened_file`, as it starts), and handed over as an `open-file` event after.
// The window holds one document, so of several files only the first is opened.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct Opened(Mutex<State>);

#[derive(Default)]
struct State {
  // the web app listens for `open-file`
  is_ready: bool,
  waiting: Option<String>,
}

pub fn hand_over(app: &AppHandle, path: PathBuf) {
  let path = path.to_string_lossy().into_owned();
  let opened = app.state::<Opened>();
  let mut state = opened.0.lock().unwrap();
  if !state.is_ready {
    state.waiting.get_or_insert(path);
    return;
  }
  let _ = app.emit("open-file", path);
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

// the first argument naming a file (others are flags); relative to the folder it was started in
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub fn from_arguments(arguments: &[String], folder: &Path) -> Option<PathBuf> {
  arguments
    .iter()
    .skip(1)
    .filter(|argument| !argument.starts_with('-'))
    .map(|argument| folder.join(argument))
    .find(|path| path.is_file())
}

#[tauri::command]
pub fn take_opened_file(opened: tauri::State<Opened>) -> Option<String> {
  let mut state = opened.0.lock().unwrap();
  state.is_ready = true;
  state.waiting.take()
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  #[test]
  fn finds_the_first_file_among_the_arguments() {
    let folder = std::env::temp_dir().join(format!("textflow-opened-{}", std::process::id()));
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("notes.md"), "").unwrap();
    fs::write(folder.join("other.md"), "").unwrap();
    let arguments = |list: &[&str]| list.iter().map(|argument| argument.to_string()).collect::<Vec<_>>();

    assert_eq!(
      from_arguments(
        &arguments(&["textflow", "--flag", "missing.md", "notes.md", "other.md"]),
        &folder
      ),
      Some(folder.join("notes.md"))
    );
    // an absolute path stays as it is
    let absolute = folder.join("other.md").to_string_lossy().into_owned();
    assert_eq!(
      from_arguments(&arguments(&["textflow", &absolute]), Path::new("/elsewhere")),
      Some(folder.join("other.md"))
    );
    // a folder is not a file; the program itself is never one
    assert_eq!(from_arguments(&arguments(&["notes.md", "."]), &folder), None);
    fs::remove_dir_all(&folder).unwrap();
  }
}
