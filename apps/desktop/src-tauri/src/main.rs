#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use tauri::tray::TrayIconBuilder;

#[derive(Serialize)]
struct WorkspaceEntry {
  name: String,
  relative_path: String,
  absolute_path: String,
  kind: String,
}

#[derive(Serialize)]
struct WorkspaceReadResult {
  root_path: String,
  snapshot: Option<Value>,
  entries: Vec<WorkspaceEntry>,
}

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
    if current == root && name == ".atria" {
      continue;
    }

    let metadata = item.metadata().map_err(|error| error.to_string())?;
    let kind = if metadata.is_dir() { "folder" } else { "file" }.to_string();
    entries.push(WorkspaceEntry {
      name,
      relative_path: relative_slash(root, &path)?,
      absolute_path: path.to_string_lossy().to_string(),
      kind: kind.clone(),
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

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      if let Some(icon) = app.default_window_icon().cloned() {
        TrayIconBuilder::new()
          .icon(icon)
          .tooltip("Atria")
          .build(app)?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      atria_default_workspace_path,
      atria_read_workspace,
      atria_read_text_prefix,
      atria_write_workspace_snapshot,
      atria_read_text_file,
      atria_write_text_file,
      atria_create_directory,
      atria_delete_path,
      atria_write_data_url
    ])
    .run(tauri::generate_context!())
    .expect("error while running Atria");
}
