#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::LazyLock;
use std::time::UNIX_EPOCH;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

mod git_history;

#[derive(Serialize)]
struct WorkspaceEntry {
  name: String,
  relative_path: String,
  absolute_path: String,
  kind: String,
  size: u64,
  modified_ms: Option<u64>,
}

#[derive(Serialize)]
struct WorkspaceReadResult {
  root_path: String,
  snapshot: Option<Value>,
  entries: Vec<WorkspaceEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceDirectoryStatus {
  exists: bool,
  directory: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentBridgeInfo {
  executable_path: String,
  available: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSearchMatch {
  relative_path: String,
  snippet: String,
}

const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;
static HTML_TAG_PATTERN: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"(?s)<[^>]*>").expect("valid HTML tag pattern"));

fn default_workspace_path() -> Result<PathBuf, String> {
  let exe = std::env::current_exe().map_err(|error| error.to_string())?;
  let base = exe
    .parent()
    .map(Path::to_path_buf)
    .or_else(|| std::env::current_dir().ok())
    .ok_or_else(|| "Cannot resolve executable directory".to_string())?;
  Ok(base.join("Atria Workspace"))
}

fn resolve_root(root_path: Option<String>) -> Result<PathBuf, String> {
  let root = match root_path {
    Some(path) if !path.trim().is_empty() => PathBuf::from(path),
    _ => default_workspace_path()?,
  };
  fs::create_dir_all(root.join(".atria")).map_err(|error| error.to_string())?;
  Ok(root)
}

fn safe_join(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
  let mut result = root.to_path_buf();
  for component in Path::new(relative_path).components() {
    match component {
      Component::Normal(part) => result.push(part),
      Component::CurDir => {}
      _ => return Err("Invalid workspace path".to_string()),
    }
  }
  Ok(result)
}

fn relative_slash(root: &Path, path: &Path) -> Result<String, String> {
  let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;
  Ok(
    relative
      .components()
      .filter_map(|component| match component {
        Component::Normal(part) => Some(part.to_string_lossy().to_string()),
        _ => None,
      })
      .collect::<Vec<_>>()
      .join("/"),
  )
}

fn collect_entries(root: &Path, current: &Path, entries: &mut Vec<WorkspaceEntry>) -> Result<(), String> {
  for item in fs::read_dir(current).map_err(|error| error.to_string())? {
    let item = item.map_err(|error| error.to_string())?;
    let path = item.path();
    let name = item.file_name().to_string_lossy().to_string();
    if current == root && (name == ".atria" || name == ".git") {
      continue;
    }

    let metadata = item.metadata().map_err(|error| error.to_string())?;
    let kind = if metadata.is_dir() { "folder" } else { "file" }.to_string();
    entries.push(WorkspaceEntry {
      name,
      relative_path: relative_slash(root, &path)?,
      absolute_path: path.to_string_lossy().to_string(),
      kind: kind.clone(),
      size: if metadata.is_file() { metadata.len() } else { 0 },
      modified_ms: metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64),
    });

    if metadata.is_dir() {
      collect_entries(root, &path, entries)?;
    }
  }
  Ok(())
}

#[tauri::command]
fn atria_default_workspace_path() -> Result<String, String> {
  Ok(default_workspace_path()?.to_string_lossy().to_string())
}

#[tauri::command]
fn atria_pick_workspace_directory(current_path: Option<String>, purpose: Option<String>) -> Option<String> {
  let title = if purpose.as_deref() == Some("create") {
    "Choose a parent folder for the new workspace"
  } else {
    "Open Atria workspace"
  };
  let mut dialog = rfd::FileDialog::new().set_title(title);
  if let Some(path) = current_path.filter(|path| !path.trim().is_empty()) {
    dialog = dialog.set_directory(path);
  }
  dialog
    .pick_folder()
    .map(|path| path.to_string_lossy().into_owned())
}

fn validate_workspace_name(name: &str) -> Result<String, String> {
  let clean = name.trim();
  if clean.is_empty() {
    return Err("Enter a workspace name.".to_string());
  }
  if clean.chars().count() > 80 {
    return Err("Workspace names must be 80 characters or fewer.".to_string());
  }
  if clean == "." || clean == ".." || clean.ends_with(['.', ' ']) {
    return Err("Choose a workspace name without trailing spaces or periods.".to_string());
  }
  if clean.chars().any(|character| character.is_control() || r#"<>:"/\|?*"#.contains(character)) {
    return Err("The workspace name contains a character that is not allowed in folder names.".to_string());
  }
  let device_name = clean
    .split('.')
    .next()
    .unwrap_or(clean)
    .to_ascii_uppercase();
  let reserved = matches!(device_name.as_str(), "CON" | "PRN" | "AUX" | "NUL")
    || (device_name.len() == 4
      && (device_name.starts_with("COM") || device_name.starts_with("LPT"))
      && matches!(device_name.as_bytes()[3], b'1'..=b'9'));
  if reserved {
    return Err("Choose a different workspace name.".to_string());
  }
  Ok(clean.to_string())
}

#[tauri::command]
fn atria_workspace_directory_status(path: String) -> Result<WorkspaceDirectoryStatus, String> {
  let clean = path.trim();
  if clean.is_empty() {
    return Err("Workspace location is empty.".to_string());
  }
  let location = PathBuf::from(clean);
  if !location.exists() {
    return Ok(WorkspaceDirectoryStatus { exists: false, directory: false });
  }
  let metadata = fs::metadata(location).map_err(|error| error.to_string())?;
  Ok(WorkspaceDirectoryStatus { exists: true, directory: metadata.is_dir() })
}

#[tauri::command]
fn atria_create_workspace_directory(parent_path: String, name: String) -> Result<String, String> {
  let parent = PathBuf::from(parent_path.trim());
  if !parent.is_dir() {
    return Err("Choose an existing parent folder.".to_string());
  }
  let clean_name = validate_workspace_name(&name)?;
  let destination = parent.join(clean_name);
  if destination.exists() {
    return Err("A file or folder with that name already exists.".to_string());
  }
  fs::create_dir(&destination).map_err(|error| error.to_string())?;
  Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
fn atria_agent_bridge_info() -> Result<AgentBridgeInfo, String> {
  let executable = std::env::current_exe().map_err(|error| error.to_string())?;
  let sibling = executable
    .parent()
    .map(|directory| directory.join("atria-mcp.exe"))
    .ok_or_else(|| "Cannot resolve executable directory".to_string())?;

  #[cfg(debug_assertions)]
  let candidate = if sibling.exists() {
    sibling
  } else {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("target")
      .join("release")
      .join("atria-mcp.exe")
  };
  #[cfg(not(debug_assertions))]
  let candidate = sibling;

  Ok(AgentBridgeInfo {
    available: candidate.is_file(),
    executable_path: candidate.to_string_lossy().into_owned(),
  })
}

#[tauri::command]
fn atria_quit_app(app: tauri::AppHandle) {
  app.exit(0);
}

#[tauri::command]
fn atria_request_app_quit(app: tauri::AppHandle) {
  request_frontend_quit(&app);
}

fn show_main_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

fn request_frontend_quit(app: &tauri::AppHandle) {
  show_main_window(app);
  if app.emit("atria://quit-requested", ()).is_err() {
    app.exit(0);
  }
}

#[tauri::command]
fn atria_read_workspace(root_path: Option<String>) -> Result<WorkspaceReadResult, String> {
  let root = resolve_root(root_path)?;
  let snapshot_path = root.join(".atria").join("workspace.json");
  let snapshot = if snapshot_path.exists() {
    let raw = fs::read_to_string(snapshot_path).map_err(|error| error.to_string())?;
    Some(serde_json::from_str(&raw).map_err(|error| error.to_string())?)
  } else {
    None
  };

  let mut entries = Vec::new();
  collect_entries(&root, &root, &mut entries)?;
  entries.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

  Ok(WorkspaceReadResult {
    root_path: root.to_string_lossy().to_string(),
    snapshot,
    entries,
  })
}

#[tauri::command]
fn atria_search_workspace(
  root_path: Option<String>,
  query: String,
  limit: Option<usize>,
) -> Result<Vec<WorkspaceSearchMatch>, String> {
  let needle = query.trim().to_lowercase();
  if needle.is_empty() {
    return Ok(Vec::new());
  }

  let root = resolve_root(root_path)?;
  let mut entries = Vec::new();
  collect_entries(&root, &root, &mut entries)?;
  let limit = limit.unwrap_or(100).clamp(1, 100);
  let mut matches = Vec::new();
  for entry in entries {
    if entry.kind != "file" || !is_searchable_document(&entry.relative_path) {
      continue;
    }

    let path_matches = entry.relative_path.to_lowercase().contains(&needle);
    let file = fs::File::open(&entry.absolute_path).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    file
      .take(MAX_SEARCH_FILE_BYTES)
      .read_to_end(&mut bytes)
      .map_err(|error| error.to_string())?;
    let content = String::from_utf8_lossy(&bytes);
    let snippet = search_snippet(&content, &needle);
    if path_matches || snippet.is_some() {
      matches.push(WorkspaceSearchMatch {
        relative_path: entry.relative_path,
        snippet: snippet.unwrap_or_else(|| "Path match".to_string()),
      });
      if matches.len() >= limit {
        break;
      }
    }
  }

  Ok(matches)
}

fn is_searchable_document(path: &str) -> bool {
  matches!(
    Path::new(path)
      .extension()
      .and_then(|extension| extension.to_str())
      .map(str::to_lowercase)
      .as_deref(),
    Some("html" | "htm" | "md" | "txt" | "json" | "csv" | "tex")
  )
}

fn search_snippet(content: &str, needle: &str) -> Option<String> {
  let lower = content.to_lowercase();
  let byte_index = lower.find(needle)?;
  let character_index = lower[..byte_index].chars().count();
  let characters = content.chars().collect::<Vec<_>>();
  let start = character_index.saturating_sub(70);
  let end = (character_index + needle.chars().count() + 110).min(characters.len());
  let raw = characters[start..end].iter().collect::<String>();
  let without_tags = HTML_TAG_PATTERN.replace_all(&raw, " ");
  let clean = without_tags.split_whitespace().collect::<Vec<_>>().join(" ");
  Some(format!(
    "{}{}{}",
    if start > 0 { "..." } else { "" },
    clean,
    if end < characters.len() { "..." } else { "" }
  ))
}

#[tauri::command]
fn atria_write_workspace_snapshot(root_path: Option<String>, snapshot: Value) -> Result<(), String> {
  let root = resolve_root(root_path)?;
  let snapshot_path = root.join(".atria").join("workspace.json");
  let raw = serde_json::to_string_pretty(&snapshot).map_err(|error| error.to_string())?;
  fs::write(snapshot_path, raw).map_err(|error| error.to_string())
}

#[tauri::command]
fn atria_read_text_file(root_path: Option<String>, relative_path: String) -> Result<String, String> {
  let root = resolve_root(root_path)?;
  let path = safe_join(&root, &relative_path)?;
  fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn atria_workspace_file_metadata(
  root_path: Option<String>,
  relative_path: String,
) -> Result<WorkspaceEntry, String> {
  let root = resolve_root(root_path)?;
  let path = safe_join(&root, &relative_path)?;
  let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
  if !metadata.is_file() {
    return Err(format!("Workspace file does not exist: {relative_path}"));
  }
  let name = path
    .file_name()
    .map(|value| value.to_string_lossy().into_owned())
    .ok_or_else(|| format!("Workspace file does not exist: {relative_path}"))?;
  Ok(WorkspaceEntry {
    name,
    relative_path: relative_slash(&root, &path)?,
    absolute_path: path.to_string_lossy().into_owned(),
    kind: "file".to_string(),
    size: metadata.len(),
    modified_ms: metadata
      .modified()
      .ok()
      .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
      .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64),
  })
}

#[tauri::command]
fn atria_read_text_prefix(
  root_path: Option<String>,
  relative_path: String,
  max_bytes: usize,
) -> Result<String, String> {
  let root = resolve_root(root_path)?;
  let path = safe_join(&root, &relative_path)?;
  let file = fs::File::open(path).map_err(|error| error.to_string())?;
  let mut bytes = Vec::new();
  file
    .take(max_bytes.clamp(256, 65_536) as u64)
    .read_to_end(&mut bytes)
    .map_err(|error| error.to_string())?;
  Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
fn atria_write_text_file(root_path: Option<String>, relative_path: String, content: String) -> Result<(), String> {
  let root = resolve_root(root_path)?;
  let path = safe_join(&root, &relative_path)?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn atria_create_directory(root_path: Option<String>, relative_path: String) -> Result<(), String> {
  let root = resolve_root(root_path)?;
  let path = safe_join(&root, &relative_path)?;
  fs::create_dir_all(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn atria_move_path(
  root_path: Option<String>,
  from_relative_path: String,
  to_relative_path: String,
) -> Result<(), String> {
  let root = resolve_root(root_path)?;
  let source = safe_join(&root, &from_relative_path)?;
  let destination = safe_join(&root, &to_relative_path)?;
  if !source.exists() {
    return Err(format!("Source path does not exist: {from_relative_path}"));
  }
  if destination.exists() {
    return Err(format!("Destination already exists: {to_relative_path}"));
  }
  if let Some(parent) = destination.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  fs::rename(source, destination).map_err(|error| error.to_string())
}

#[tauri::command]
fn atria_delete_path(root_path: Option<String>, relative_path: String) -> Result<(), String> {
  let root = resolve_root(root_path)?;
  let path = safe_join(&root, &relative_path)?;
  if !path.exists() {
    return Ok(());
  }
  let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
  if metadata.is_dir() {
    fs::remove_dir_all(path).map_err(|error| error.to_string())
  } else {
    fs::remove_file(path).map_err(|error| error.to_string())
  }
}

#[tauri::command]
fn atria_write_data_url(root_path: Option<String>, relative_path: String, data_url: String) -> Result<String, String> {
  let (_, encoded) = data_url
    .split_once(',')
    .ok_or_else(|| "Invalid data URL".to_string())?;
  let bytes = STANDARD.decode(encoded).map_err(|error| error.to_string())?;
  let root = resolve_root(root_path)?;
  let path = safe_join(&root, &relative_path)?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  fs::write(&path, bytes).map_err(|error| error.to_string())?;
  Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn atria_open_workspace_file(root_path: Option<String>, relative_path: String) -> Result<(), String> {
  let root = resolve_root(root_path)?;
  let path = safe_join(&root, &relative_path)?;
  if !path.is_file() {
    return Err(format!("Workspace file does not exist: {relative_path}"));
  }

  #[cfg(target_os = "windows")]
  let mut command = Command::new("explorer.exe");
  #[cfg(target_os = "macos")]
  let mut command = Command::new("open");
  #[cfg(all(unix, not(target_os = "macos")))]
  let mut command = Command::new("xdg-open");

  command.arg(path).spawn().map_err(|error| error.to_string())?;
  Ok(())
}

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      if let Some(icon) = app.default_window_icon().cloned() {
        let show = MenuItem::with_id(app, "atria_tray_show", "Show Atria", true, None::<&str>)?;
        let separator = PredefinedMenuItem::separator(app)?;
        let quit = MenuItem::with_id(app, "atria_tray_quit", "Quit Atria", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show, &separator, &quit])?;
        TrayIconBuilder::new()
          .icon(icon)
          .tooltip("Atria")
          .menu(&menu)
          .show_menu_on_left_click(false)
          .on_menu_event(|app, event| match event.id().as_ref() {
            "atria_tray_show" => show_main_window(app),
            "atria_tray_quit" => request_frontend_quit(app),
            _ => {}
          })
          .on_tray_icon_event(|tray, event| {
            if matches!(
              event,
              TrayIconEvent::Click { button: MouseButton::Left, .. }
                | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. }
            ) {
              show_main_window(tray.app_handle());
            }
          })
          .build(app)?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      atria_default_workspace_path,
      atria_pick_workspace_directory,
      atria_workspace_directory_status,
      atria_create_workspace_directory,
      atria_agent_bridge_info,
      atria_request_app_quit,
      atria_quit_app,
      atria_read_workspace,
      atria_search_workspace,
      atria_read_text_prefix,
      atria_write_workspace_snapshot,
      atria_read_text_file,
      atria_workspace_file_metadata,
      atria_write_text_file,
      atria_create_directory,
      atria_move_path,
      atria_delete_path,
      atria_write_data_url,
      atria_open_workspace_file,
      git_history::atria_git_initialize,
      git_history::atria_git_status,
      git_history::atria_git_checkpoint,
      git_history::atria_git_document_history,
      git_history::atria_git_document_diff,
      git_history::atria_git_restore_document,
      git_history::atria_git_read_document_revision
    ])
    .run(tauri::generate_context!())
    .expect("error while running Atria");
}

#[cfg(test)]
mod tests {
  use super::{
    atria_create_workspace_directory, atria_move_path, atria_open_workspace_file,
    atria_workspace_directory_status, atria_workspace_file_metadata, is_searchable_document,
    search_snippet, validate_workspace_name,
  };
  use std::fs;
  use std::path::PathBuf;

  #[test]
  fn limits_search_to_document_formats() {
    assert!(is_searchable_document("reports/result.HTML"));
    assert!(is_searchable_document("notes/summary.md"));
    assert!(!is_searchable_document("assets/chart.png"));
  }

  #[test]
  fn creates_plain_text_snippets_without_breaking_unicode() {
    let snippet = search_snippet("<h1>实验结果</h1><p>Recall improved</p>", "recall").unwrap();
    assert_eq!(snippet, "实验结果 Recall improved");
  }

  #[test]
  fn moves_real_workspace_paths_and_creates_the_destination_parent() {
    let root = std::env::temp_dir().join(format!("atria-move-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("note.html"), "content").unwrap();

    atria_move_path(
      Some(root.to_string_lossy().into_owned()),
      "note.html".to_string(),
      "Notes/renamed.html".to_string(),
    )
    .unwrap();

    assert!(!root.join("note.html").exists());
    assert_eq!(fs::read_to_string(root.join("Notes/renamed.html")).unwrap(), "content");
    fs::remove_dir_all(root).unwrap();
  }

  #[test]
  fn refuses_to_open_a_missing_workspace_file() {
    let root = std::env::temp_dir().join(format!("atria-open-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let error = atria_open_workspace_file(
      Some(root.to_string_lossy().into_owned()),
      "missing.pdf".to_string(),
    )
    .unwrap_err();

    assert!(error.contains("does not exist"));
    fs::remove_dir_all(root).unwrap();
  }

  #[test]
  fn reads_metadata_for_a_real_workspace_file() {
    let root = std::env::temp_dir().join(format!("atria-metadata-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(root.join("Assets")).unwrap();
    fs::write(root.join("Assets").join("sample.bin"), [1_u8, 2, 3, 4]).unwrap();

    let entry = atria_workspace_file_metadata(
      Some(root.to_string_lossy().into_owned()),
      "Assets/sample.bin".to_string(),
    )
    .unwrap();

    assert_eq!(entry.relative_path, "Assets/sample.bin");
    assert_eq!(entry.size, 4);
    assert_eq!(entry.kind, "file");
    assert!(entry.modified_ms.is_some());
    fs::remove_dir_all(root).unwrap();
  }

  #[test]
  fn creates_a_named_workspace_without_materializing_its_contents() {
    let parent = std::env::temp_dir().join(format!("atria-workspace-parent-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&parent).unwrap();

    let created = atria_create_workspace_directory(
      parent.to_string_lossy().into_owned(),
      "Research Notes".to_string(),
    )
    .unwrap();
    let created = PathBuf::from(created);
    assert!(created.is_dir());
    assert!(!created.join(".atria").exists());
    assert!(atria_create_workspace_directory(
      parent.to_string_lossy().into_owned(),
      "Research Notes".to_string(),
    )
    .unwrap_err()
    .contains("already exists"));

    fs::remove_dir_all(parent).unwrap();
  }

  #[test]
  fn reports_missing_workspaces_without_creating_them() {
    let missing = std::env::temp_dir().join(format!("atria-missing-{}", uuid::Uuid::new_v4()));
    let status = atria_workspace_directory_status(missing.to_string_lossy().into_owned()).unwrap();
    assert!(!status.exists);
    assert!(!status.directory);
    assert!(!missing.exists());
  }

  #[test]
  fn rejects_unsafe_or_reserved_workspace_names() {
    for name in ["", "..", "report/2026", "draft.", "CON", "LPT1.txt"] {
      assert!(validate_workspace_name(name).is_err(), "{name} should be rejected");
    }
    assert_eq!(validate_workspace_name("Atria Research").unwrap(), "Atria Research");
  }
}
