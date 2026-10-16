// Whether macOS draws the window's title (macOS only; elsewhere this does nothing). The title bar
// is laid over the page (tauri.macos.conf.json) and the app draws the title in its own title row,
// centred in the window, so macOS's is hidden from the start (`hiddenTitle`). In fullscreen macOS
// moves its buttons and title into its own bar, which the page cannot draw into: there the app
// draws no row and shows macOS's title again. No Tauri call changes it once the window is made,
// so this sets NSWindow's `titleVisibility`.

use tauri::WebviewWindow;

#[tauri::command]
pub fn set_title_hidden(window: WebviewWindow, hidden: bool) -> tauri::Result<()> {
  #[cfg(target_os = "macos")]
  {
    use objc2_app_kit::{NSWindow, NSWindowTitleVisibility};
    // a pointer is not Send; AppKit is touched on the main thread only
    let ns_window = window.ns_window()? as usize;
    window.run_on_main_thread(move || {
      // SAFETY: the window lives as long as the app's only window, which is what calls this
      let ns_window = unsafe { &*(ns_window as *const NSWindow) };
      ns_window.setTitleVisibility(if hidden {
        NSWindowTitleVisibility::Hidden
      } else {
        NSWindowTitleVisibility::Visible
      });
    })?;
  }
  #[cfg(not(target_os = "macos"))]
  let _ = (window, hidden);
  Ok(())
}
