// Export…'s save panel on macOS, with a File Format popup under the name, as TextEdit has: the
// dialog plugin's panel takes a list of types only, merged into one with no way to choose. The
// popup's choice limits the panel to that type and swaps the extension in the name.
//
// The panel is a sheet on the window. The command waits for it to close (it runs off the main
// thread, `async`) and returns the path and the format's extension, or None when cancelled.
//
// Windows and Linux have a type list in their own save dialog: src/platform/tauri.js uses the
// dialog plugin there, and this is not called.

use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;

#[derive(Deserialize)]
pub struct Format {
  name: String,
  extension: String,
}

#[derive(Serialize)]
pub struct Chosen {
  path: String,
  extension: String,
}

// directory: where the panel opens (None: where it last was); name: without an extension;
// selected: the index of the format chosen at first
#[tauri::command(async)]
pub fn export_panel(
  window: WebviewWindow,
  directory: Option<String>,
  name: String,
  formats: Vec<Format>,
  selected: usize,
) -> Result<Option<Chosen>, String> {
  #[cfg(target_os = "macos")]
  return macos::run(&window, directory, name, formats, selected);
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (window, directory, name, formats, selected);
    Err("The export panel is macOS's.".into())
  }
}

#[cfg(target_os = "macos")]
mod macos {
  use super::{Chosen, Format};
  use block2::RcBlock;
  use objc2::rc::Retained;
  use objc2::{DefinedClass, MainThreadOnly, define_class, msg_send, sel};
  use objc2_app_kit::{NSModalResponse, NSPopUpButton, NSSavePanel, NSTextField, NSView, NSWindow};
  use objc2_foundation::{
    MainThreadMarker, NSArray, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, NSURL,
  };
  use std::sync::mpsc;
  use tauri::WebviewWindow;

  // NSModalResponseOK (not in objc2-app-kit's generated constants)
  const OK: NSModalResponse = 1;

  pub struct Ivars {
    panel: Retained<NSSavePanel>,
    extensions: Vec<String>,
  }

  define_class!(
    // the popup's target: a format chosen
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[name = "TextflowExportFormat"]
    #[ivars = Ivars]
    struct FormatTarget;

    unsafe impl NSObjectProtocol for FormatTarget {}

    impl FormatTarget {
      #[unsafe(method(formatChanged:))]
      fn format_changed(&self, sender: &NSPopUpButton) {
        let ivars = self.ivars();
        if let Some(extension) = usize::try_from(sender.indexOfSelectedItem())
          .ok()
          .and_then(|index| ivars.extensions.get(index))
        {
          set_format(&ivars.panel, extension, &ivars.extensions);
        }
      }
    }
  );

  impl FormatTarget {
    fn new(mtm: MainThreadMarker, panel: Retained<NSSavePanel>, extensions: Vec<String>) -> Retained<Self> {
      let this = Self::alloc(mtm).set_ivars(Ivars { panel, extensions });
      unsafe { msg_send![super(this), init] }
    }
  }

  // the panel saves this type only; the name takes its extension instead of another format's
  fn set_format(panel: &NSSavePanel, extension: &str, extensions: &[String]) {
    #[allow(deprecated)]
    panel.setAllowedFileTypes(Some(&NSArray::from_retained_slice(&[NSString::from_str(extension)])));
    let name = panel.nameFieldStringValue().to_string();
    let stem = match name.rsplit_once('.') {
      Some((stem, old)) if extensions.iter().any(|known| known.eq_ignore_ascii_case(old)) => stem.to_string(),
      _ => name,
    };
    panel.setNameFieldStringValue(&NSString::from_str(&format!("{stem}.{extension}")));
  }

  pub fn run(
    window: &WebviewWindow,
    directory: Option<String>,
    name: String,
    formats: Vec<Format>,
    selected: usize,
  ) -> Result<Option<Chosen>, String> {
    if formats.is_empty() {
      return Err("No formats to export to.".into());
    }
    // a pointer is not Send; AppKit is touched on the main thread only
    let ns_window = window.ns_window().map_err(|error| error.to_string())? as usize;
    let (sender, receiver) = mpsc::channel();
    window
      .run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().expect("run on the main thread");
        // SAFETY: the window lives as long as the app's only window, which is what calls this
        let ns_window = unsafe { &*(ns_window as *const NSWindow) };
        let extensions: Vec<String> = formats.iter().map(|format| format.extension.clone()).collect();
        let selected = selected.min(formats.len() - 1);

        let panel = NSSavePanel::savePanel(mtm);
        panel.setTitle(Some(&NSString::from_str("Export")));
        panel.setPrompt(Some(&NSString::from_str("Export")));
        panel.setCanCreateDirectories(true);
        if let Some(directory) = &directory {
          panel.setDirectoryURL(Some(&NSURL::fileURLWithPath_isDirectory(
            &NSString::from_str(directory),
            true,
          )));
        }
        panel.setNameFieldStringValue(&NSString::from_str(&format!("{name}.{}", extensions[selected])));
        set_format(&panel, &extensions[selected], &extensions);

        // "File Format: [Word ▾]", centred under the name
        let label = NSTextField::labelWithString(&NSString::from_str("File Format:"), mtm);
        label.sizeToFit();
        let popup = NSPopUpButton::initWithFrame_pullsDown(
          NSPopUpButton::alloc(mtm),
          NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(200.0, 25.0)),
          false,
        );
        // "Word (.docx)": the name the format goes by, and what the file will end in
        for format in &formats {
          popup.addItemWithTitle(&NSString::from_str(&format!("{} (.{})", format.name, format.extension)));
        }
        popup.selectItemAtIndex(selected as isize);
        let target = FormatTarget::new(mtm, panel.clone(), extensions.clone());
        // SAFETY: the target answers formatChanged:, and lives until the panel is closed (below)
        unsafe {
          popup.setTarget(Some(&target));
          popup.setAction(Some(sel!(formatChanged:)));
        }
        let (label_size, popup_size) = (label.frame().size, popup.frame().size);
        let gap = 8.0;
        let width = label_size.width + gap + popup_size.width + 40.0;
        let height = popup_size.height + 24.0;
        let view = NSView::initWithFrame(
          NSView::alloc(mtm),
          NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(width, height)),
        );
        label.setFrameOrigin(NSPoint::new(20.0, ((height - label_size.height) / 2.0).round()));
        popup.setFrameOrigin(NSPoint::new(
          20.0 + label_size.width + gap,
          ((height - popup_size.height) / 2.0).round(),
        ));
        view.addSubview(&label);
        view.addSubview(&popup);
        panel.setAccessoryView(Some(&view));

        let closed_panel = panel.clone();
        let handler = RcBlock::new(move |response: NSModalResponse| {
          // the popup holds its target weakly: kept here until the panel closes
          let _ = &target;
          let chosen = if response == OK {
            let index = usize::try_from(popup.indexOfSelectedItem())
              .unwrap_or(selected)
              .min(extensions.len() - 1);
            closed_panel.URL().and_then(|url| url.path()).map(|path| Chosen {
              path: path.to_string(),
              extension: extensions[index].clone(),
            })
          } else {
            None
          };
          let _ = sender.send(chosen);
        });
        panel.beginSheetModalForWindow_completionHandler(ns_window, &handler);
      })
      .map_err(|error| error.to_string())?;
    receiver
      .recv()
      .map_err(|_| "The export panel closed without an answer.".to_string())
  }
}
