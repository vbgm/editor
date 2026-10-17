// The native menu bar. Items that act on the document send their id to the web app as a `menu`
// event (src/platform/tauri.js); clipboard items and the window items are the system's own.
//
// Undo and Redo are our own items, not the system's: the system's would undo in the web view,
// which knows nothing of the editor's history. Close and Quit are our own too, so the app can
// save, or ask, first.
//
// Export… asks where and in which format (export.rs on macOS: a File Format popup in the panel).
// Print… prints the document's PDF on macOS, the page laid out for paper elsewhere (print.rs).
//
// Windows and Linux have no app menu: Exit goes to the File menu there. Show Sidebar has no
// shortcut there yet (macOS's Ctrl+Cmd+S has no counterpart).

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
  let item = |id: &str, label: &str, shortcut: Option<&str>| MenuItem::with_id(app, id, label, true, shortcut);
  let separator = || PredefinedMenuItem::separator(app);

  let new = item("new", "New", Some("CmdOrCtrl+N"))?;
  let open = item("open", "Open…", Some("CmdOrCtrl+O"))?;
  let close = item("close", "Close Window", Some("CmdOrCtrl+W"))?;
  let save = item("save", "Save", Some("CmdOrCtrl+S"))?;
  let save_as = item("saveAs", "Save As…", Some("CmdOrCtrl+Shift+S"))?;
  let export = item("export", "Export…", Some("CmdOrCtrl+Shift+E"))?;
  let print = item("print", "Print…", Some("CmdOrCtrl+P"))?;
  let quit = item(
    "quit",
    if cfg!(target_os = "macos") {
      "Quit Editor"
    } else {
      "Exit"
    },
    Some("CmdOrCtrl+Q"),
  )?;
  let (separator_1, separator_2, separator_3) = (separator()?, separator()?, separator()?);
  let mut file_items: Vec<&dyn IsMenuItem<R>> = vec![
    &new,
    &open,
    &separator_1,
    &close,
    &save,
    &save_as,
    &separator_2,
    &export,
    &print,
  ];
  if !cfg!(target_os = "macos") {
    file_items.extend([&separator_3 as &dyn IsMenuItem<R>, &quit]);
  }
  let file = Submenu::with_items(app, "File", true, &file_items)?;

  let edit = Submenu::with_items(
    app,
    "Edit",
    true,
    &[
      &item("undo", "Undo", Some("CmdOrCtrl+Z"))?,
      &item("redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?,
      &separator()?,
      &PredefinedMenuItem::cut(app, None)?,
      &PredefinedMenuItem::copy(app, None)?,
      &PredefinedMenuItem::paste(app, None)?,
      &PredefinedMenuItem::select_all(app, None)?,
    ],
  )?;

  let sidebar_shortcut = if cfg!(target_os = "macos") {
    Some("Ctrl+Cmd+S")
  } else {
    None
  };
  let view = Submenu::with_items(
    app,
    "View",
    true,
    &[
      &item("toolbar", "Show Toolbar", Some("Alt+CmdOrCtrl+T"))?,
      &item("sidebar", "Show Sidebar", sidebar_shortcut)?,
      &item("markdown", "Show Markdown", Some("CmdOrCtrl+Shift+M"))?,
      &separator()?,
      &PredefinedMenuItem::fullscreen(app, None)?,
    ],
  )?;

  #[cfg(target_os = "macos")]
  {
    let app_menu = Submenu::with_items(
      app,
      "Textflow",
      true,
      &[
        &PredefinedMenuItem::about(app, None, None)?,
        &separator()?,
        &PredefinedMenuItem::services(app, None)?,
        &separator()?,
        &PredefinedMenuItem::hide(app, None)?,
        &PredefinedMenuItem::hide_others(app, None)?,
        &PredefinedMenuItem::show_all(app, None)?,
        &separator()?,
        &quit,
      ],
    )?;
    let window = Submenu::with_items(
      app,
      "Window",
      true,
      &[
        &PredefinedMenuItem::minimize(app, None)?,
        &PredefinedMenuItem::maximize(app, None)?,
      ],
    )?;
    window.set_as_windows_menu_for_nsapp()?;
    Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window])
  }
  #[cfg(not(target_os = "macos"))]
  Menu::with_items(app, &[&file, &edit, &view])
}
