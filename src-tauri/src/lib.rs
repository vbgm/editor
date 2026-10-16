// The native shell: one window running the web app, the menu, and reading and saving files.
// Everything else is the web app; src/platform/tauri.js is its only side that talks to this.
//
// The window starts hidden and the web app shows it once it has drawn the document, so it never
// flashes white; should the web app fail to start, it is shown anyway after a while.
//
// The window comes back where it was, as large, maximized or fullscreen as it was (the
// window-state plugin, in the settings folder's .window-state.json), but not shown: the web app
// still shows it. On a screen that is gone it opens at the default place instead.
//
// Quitting (Cmd+Q, the Dock's Quit) is held back and handed to the web app as the `quit` menu
// command: it saves, or asks, then closes its window, and the app exits when the window is gone.

mod files;
mod menu;
mod title;

use std::time::Duration;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_window_state::StateFlags;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(
      tauri_plugin_window_state::Builder::new()
        .with_state_flags(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN)
        .build(),
    )
    .invoke_handler(tauri::generate_handler![
      files::read_file,
      files::write_file,
      title::set_title_hidden
    ])
    .setup(|app| {
      app.set_menu(menu::build(app.handle())?)?;
      app.on_menu_event(|app, event| {
        let _ = app.emit("menu", event.id().as_ref());
      });
      let handle = app.handle().clone();
      std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        if let Some(window) = handle.get_webview_window("main")
          && !window.is_visible().unwrap_or(true)
        {
          let _ = window.show();
        }
      });
      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::Destroyed = event {
        window.app_handle().exit(0);
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building the app");

  app.run(|app, event| {
    // code None: asked by the system or the user, not by exit() above
    if let RunEvent::ExitRequested { code: None, api, .. } = event
      && app.get_webview_window("main").is_some()
    {
      api.prevent_exit();
      let _ = app.emit("menu", "quit");
    }
  });
}
