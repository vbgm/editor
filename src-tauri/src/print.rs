// Print…
//
// macOS: the document's PDF (the one Export… writes, made by the web app) printed by PDFKit, as
// Preview prints: a sheet on the window, with its preview, the pages exactly the PDF's. The web
// view's own printing lays out the page with WebKit, which drops the CSS page's top margin.
//
// Windows and Linux: the page as print CSS lays it out (src/app/functions/print.js), printed by
// the web view (window.print() on Windows, GTK's print dialog on Linux).

// the PDF is the request's body (not JSON), its title the `title` header, percent-encoded (a
// header is ASCII). Returns once the sheet is shown.
#[tauri::command(async)]
pub fn print_pdf(window: tauri::WebviewWindow, request: tauri::ipc::Request<'_>) -> Result<(), String> {
  let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
    return Err("No PDF to print.".into());
  };
  let title = request
    .headers()
    .get("title")
    .and_then(|value| value.to_str().ok())
    .and_then(crate::files::percent_decode)
    .unwrap_or_default();
  #[cfg(target_os = "macos")]
  return macos::run(&window, bytes.clone(), title);
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (window, bytes, title);
    Err("Printing a PDF is macOS's.".into())
  }
}

#[tauri::command]
pub fn print_page(webview: tauri::Webview) -> Result<(), String> {
  webview.print().map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
mod macos {
  use objc2::rc::Retained;
  use objc2::{AnyThread, msg_send};
  use objc2_app_kit::{NSPrintInfo, NSWindow};
  use objc2_foundation::{MainThreadMarker, NSData, NSString};
  use objc2_pdf_kit::{PDFDisplayBox, PDFDocument, PDFPrintScalingMode};
  use std::sync::mpsc;
  use tauri::WebviewWindow;

  pub fn run(window: &WebviewWindow, bytes: Vec<u8>, title: String) -> Result<(), String> {
    // a pointer is not Send; AppKit is touched on the main thread only
    let ns_window = window.ns_window().map_err(|error| error.to_string())? as usize;
    let (sender, receiver) = mpsc::channel();
    window
      .run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().expect("run on the main thread");
        // SAFETY: the window lives as long as the app's only window, which is what calls this
        let ns_window = unsafe { &*(ns_window as *const NSWindow) };
        let data = NSData::with_bytes(&bytes);
        // SAFETY: PDFKit reads the data; a PDF it cannot read gives None
        let Some(document) = (unsafe { PDFDocument::initWithData(PDFDocument::alloc(), &data) }) else {
          let _ = sender.send(Err("The PDF could not be read.".to_string()));
          return;
        };
        // the printer and settings chosen last, on the PDF's paper, the page's margins its own
        let shared = NSPrintInfo::sharedPrintInfo();
        let info: Retained<NSPrintInfo> = unsafe { msg_send![&shared, copy] };
        if let Some(page) = unsafe { document.pageAtIndex(0) } {
          info.setPaperSize(unsafe { page.boundsForBox(PDFDisplayBox::MediaBox) }.size);
        }
        info.setTopMargin(0.0);
        info.setBottomMargin(0.0);
        info.setLeftMargin(0.0);
        info.setRightMargin(0.0);
        // SAFETY: on the main thread (mtm), with a print info PDFKit may read
        let Some(operation) = (unsafe {
          document.printOperationForPrintInfo_scalingMode_autoRotate(
            Some(&info),
            PDFPrintScalingMode::PageScaleNone,
            true,
            mtm,
          )
        }) else {
          let _ = sender.send(Err("The PDF could not be printed.".to_string()));
          return;
        };
        operation.setJobTitle(Some(&NSString::from_str(&title)));
        // SAFETY: no delegate, so no selector is called back
        unsafe {
          operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            ns_window,
            None,
            None,
            std::ptr::null_mut(),
          );
        }
        let _ = sender.send(Ok(()));
      })
      .map_err(|error| error.to_string())?;
    receiver
      .recv()
      .map_err(|_| "The print sheet did not open.".to_string())?
  }
}
