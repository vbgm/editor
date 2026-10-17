// Reading and saving Markdown files. The text goes back to disk exactly as the editor hands it
// over (BOM, line breaks): nothing here changes it. Documents in other formats (RTF, Word,
// OpenDocument: src/app/functions/convert) are read and written as bytes.
//
// Saving is atomic: the text goes to a temporary file next to the original, is flushed to disk,
// then renamed over the original, so a crash or a full disk can never leave half a file. The
// original's permissions are copied to the new file; a symlink is followed and its target
// replaced, not the link. Where the folder cannot be written to (only the file can), the file is
// written in place instead.
//
// Every read and save returns the file's modification time. A save passes the time it last saw:
// when the file was changed since (by another app, or synced in), it is not overwritten and the
// app is told (`changed`), so autosave never silently drops someone else's edits.
//
// The commands run off the main thread (`async`), so a slow disk never blocks the window.

use serde::Serialize;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
pub struct Opened {
  text: String,
  modified: u64,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileError {
  // changed on disk since it was last read or saved
  Changed,
  // not UTF-8
  NotText,
  Io { message: String },
}

impl From<io::Error> for FileError {
  fn from(error: io::Error) -> Self {
    FileError::Io {
      message: error.to_string(),
    }
  }
}

// milliseconds since 1970: exact enough to tell saves apart, and safe as a JavaScript number
fn modified_time(path: &Path) -> io::Result<u64> {
  let time = fs::metadata(path)?.modified()?;
  Ok(
    time
      .duration_since(UNIX_EPOCH)
      .map(|d| d.as_millis() as u64)
      .unwrap_or(0),
  )
}

#[tauri::command(async)]
pub fn read_file(path: String) -> Result<Opened, FileError> {
  let bytes = fs::read(&path)?;
  let modified = modified_time(Path::new(&path))?;
  let text = String::from_utf8(bytes).map_err(|_| FileError::NotText)?;
  Ok(Opened { text, modified })
}

// expected: the modification time last seen, None to write whatever is on disk (Save As, or the
// user chose to overwrite)
#[tauri::command(async)]
pub fn write_file(path: String, text: String, expected: Option<u64>) -> Result<u64, FileError> {
  // the target of a symlink, so the link stays a link
  let path = fs::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));
  if let Some(expected) = expected {
    // a file deleted meanwhile is simply written again
    if let Ok(modified) = modified_time(&path)
      && modified != expected
    {
      return Err(FileError::Changed);
    }
  }
  write_atomic(&path, text.as_bytes())
}

// a document converted from another format: its bytes, as they are
#[tauri::command(async)]
pub fn read_bytes(path: String) -> Result<tauri::ipc::Response, FileError> {
  Ok(tauri::ipc::Response::new(fs::read(&path)?))
}

// an exported document: the bytes are the request's body (not JSON), its path the `path` header,
// percent-encoded (a header is ASCII). It replaces whatever is there: the save dialog asked.
#[tauri::command(async)]
pub fn write_bytes(request: tauri::ipc::Request<'_>) -> Result<u64, FileError> {
  let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
    return Err(FileError::Io {
      message: "No bytes to write.".into(),
    });
  };
  let path = request
    .headers()
    .get("path")
    .and_then(|value| value.to_str().ok())
    .and_then(percent_decode)
    .ok_or_else(|| FileError::Io {
      message: "No path to write to.".into(),
    })?;
  let path = PathBuf::from(path);
  let path = fs::canonicalize(&path).unwrap_or(path);
  write_atomic(&path, bytes)
}

// encodeURIComponent's text back; None when it is not UTF-8
pub fn percent_decode(value: &str) -> Option<String> {
  let bytes = value.as_bytes();
  let mut decoded = Vec::with_capacity(bytes.len());
  let mut at = 0;
  while at < bytes.len() {
    if bytes[at] == b'%' {
      let hex = std::str::from_utf8(bytes.get(at + 1..at + 3)?).ok()?;
      decoded.push(u8::from_str_radix(hex, 16).ok()?);
      at += 3;
    } else {
      decoded.push(bytes[at]);
      at += 1;
    }
  }
  String::from_utf8(decoded).ok()
}

// the bytes to a temporary file next to the target, renamed over it; written in place where the
// folder cannot be written to
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<u64, FileError> {
  let permissions = fs::metadata(path).ok().map(|metadata| metadata.permissions());
  let temporary = temporary_path(path);
  match write_synced(&temporary, bytes, permissions) {
    Ok(()) => {
      if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(error.into());
      }
    }
    // the folder is not writable (or the disk is full: then this fails too, and says so)
    Err(_) => {
      let _ = fs::remove_file(&temporary);
      write_synced(path, bytes, None)?;
    }
  }
  Ok(modified_time(path)?)
}

// hidden, next to the file (a rename only stays atomic within one volume)
fn temporary_path(path: &Path) -> PathBuf {
  let name = path
    .file_name()
    .map(|name| name.to_string_lossy().into_owned())
    .unwrap_or_default();
  path.with_file_name(format!(".{}.{}.saving", name, std::process::id()))
}

fn write_synced(path: &Path, bytes: &[u8], permissions: Option<fs::Permissions>) -> io::Result<()> {
  let mut file = fs::File::create(path)?;
  file.write_all(bytes)?;
  file.sync_all()?;
  if let Some(permissions) = permissions {
    fs::set_permissions(path, permissions)?;
  }
  Ok(())
}

// symlinks and permission modes are tested on Unix only (on Windows a symlink needs admin rights)
#[cfg(test)]
mod tests {
  use super::*;
  #[cfg(unix)]
  use std::os::unix::fs::{PermissionsExt, symlink};

  fn folder(name: &str) -> PathBuf {
    let folder = std::env::temp_dir().join(format!("textflow-files-test-{}-{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).unwrap();
    folder
  }

  fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
  }

  #[test]
  fn fixtures_are_saved_byte_for_byte() {
    let folder = folder("fixtures");
    for entry in fs::read_dir("../tests/fixtures").unwrap() {
      let source = entry.unwrap().path();
      let copy = folder.join(source.file_name().unwrap());
      fs::copy(&source, &copy).unwrap();
      let opened = read_file(text(&copy)).ok().unwrap();
      write_file(text(&copy), opened.text, Some(opened.modified))
        .ok()
        .unwrap();
      assert_eq!(fs::read(&source).unwrap(), fs::read(&copy).unwrap(), "{:?}", source);
    }
    // no temporary files left behind
    assert!(
      fs::read_dir(&folder)
        .unwrap()
        .all(|entry| !entry.unwrap().file_name().to_string_lossy().starts_with('.'))
    );
  }

  #[test]
  fn a_file_changed_since_is_not_overwritten() {
    let path = folder("changed").join("a.md");
    fs::write(&path, "theirs").unwrap();
    let modified = read_file(text(&path)).ok().unwrap().modified;
    assert!(matches!(
      write_file(text(&path), "mine".into(), Some(modified - 1)),
      Err(FileError::Changed)
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), "theirs");
    // without the check (Save As, or replacing on purpose)
    write_file(text(&path), "mine".into(), None).ok().unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "mine");
  }

  #[test]
  fn each_save_returns_the_time_the_next_one_expects() {
    let path = folder("times").join("a.md");
    let mut modified = write_file(text(&path), "1".into(), None).ok().unwrap();
    for content in ["2", "3", "4"] {
      modified = write_file(text(&path), content.into(), Some(modified)).ok().unwrap();
    }
    assert_eq!(fs::read_to_string(&path).unwrap(), "4");
  }

  #[cfg(unix)]
  #[test]
  fn permissions_and_symlinks_are_kept() {
    let folder = folder("links");
    let target = folder.join("target.md");
    let link = folder.join("link.md");
    fs::write(&target, "a").unwrap();
    fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).unwrap();
    symlink(&target, &link).unwrap();
    write_file(text(&link), "b".into(), None).ok().unwrap();
    assert!(fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
    assert_eq!(fs::read_to_string(&target).unwrap(), "b");
    assert_eq!(fs::metadata(&target).unwrap().permissions().mode() & 0o777, 0o600);
  }

  #[cfg(unix)]
  #[test]
  fn a_file_in_a_read_only_folder_is_written_in_place() {
    let folder = folder("read-only");
    let path = folder.join("a.md");
    fs::write(&path, "a").unwrap();
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o555)).unwrap();
    let result = write_file(text(&path), "b".into(), None);
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o755)).unwrap();
    assert!(result.is_ok());
    assert_eq!(fs::read_to_string(&path).unwrap(), "b");
  }

  #[test]
  fn paths_come_percent_encoded() {
    assert_eq!(
      percent_decode("%2FUsers%2Fa%20b%2FGr%C3%BC%C3%9Fe.docx").as_deref(),
      Some("/Users/a b/Grüße.docx")
    );
    assert_eq!(percent_decode("%zz"), None);
    assert_eq!(percent_decode("%C3"), None);
  }

  #[test]
  fn other_files_are_refused() {
    let path = folder("binary").join("a.png");
    fs::write(&path, [0x89, 0x50, 0xff, 0xfe]).unwrap();
    assert!(matches!(read_file(text(&path)), Err(FileError::NotText)));
  }
}
