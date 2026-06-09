use git2::{IndexAddOption, Repository, Signature, StatusOptions};
use serde::Serialize;
use std::fs;
use std::path::Path;

const ATRIA_GITIGNORE_LINES: &[&str] = &[
  ".atria/cache/",
  ".atria/index.sqlite",
  ".atria/index.sqlite-*",
  ".atria/locks/",
  ".atria/tmp/",
];

#[derive(Serialize)]
pub struct GitWorkspaceStatus {
  initialized: bool,
  head: Option<String>,
  branch: Option<String>,
  dirty: bool,
}

#[tauri::command]
pub fn atria_git_initialize(root_path: Option<String>) -> Result<GitWorkspaceStatus, String> {
  let root = super::resolve_root(root_path)?;
  let (repository, created) = open_or_initialize(&root)?;
  ensure_identity(&repository)?;
  ensure_gitignore(&root)?;
  if created || repository.head().is_err() {
    create_baseline_commit(&repository)?;
  }
  repository_status(&repository)
}

#[tauri::command]
pub fn atria_git_status(root_path: Option<String>) -> Result<GitWorkspaceStatus, String> {
  let root = super::resolve_root(root_path)?;
  let repository = Repository::open(root).map_err(|error| error.to_string())?;
  repository_status(&repository)
}

pub(crate) fn open_or_initialize(root: &Path) -> Result<(Repository, bool), String> {
  match Repository::open(root) {
    Ok(repository) => Ok((repository, false)),
    Err(_) => Repository::init(root)
      .map(|repository| (repository, true))
      .map_err(|error| error.to_string()),
  }
}

fn ensure_identity(repository: &Repository) -> Result<(), String> {
  let mut config = repository.config().map_err(|error| error.to_string())?;
  if config.get_string("user.name").is_err() {
    config
      .set_str("user.name", "Atria Local User")
      .map_err(|error| error.to_string())?;
  }
  if config.get_string("user.email").is_err() {
    config
      .set_str("user.email", "local@atria.invalid")
      .map_err(|error| error.to_string())?;
  }
  Ok(())
}

fn ensure_gitignore(root: &Path) -> Result<(), String> {
  let path = root.join(".gitignore");
  let existing = fs::read_to_string(&path).unwrap_or_default();
  let mut lines = existing.lines().map(str::to_owned).collect::<Vec<_>>();
  let mut changed = false;
  for required in ATRIA_GITIGNORE_LINES {
    if !lines.iter().any(|line| line.trim() == *required) {
      lines.push((*required).to_string());
      changed = true;
    }
  }
  if changed || !path.exists() {
    let content = format!("{}\n", lines.join("\n").trim_start());
    fs::write(path, content).map_err(|error| error.to_string())?;
  }
  Ok(())
}

fn create_baseline_commit(repository: &Repository) -> Result<(), String> {
  let mut index = repository.index().map_err(|error| error.to_string())?;
  index
    .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
    .map_err(|error| error.to_string())?;
  index.write().map_err(|error| error.to_string())?;
  let tree_id = index.write_tree().map_err(|error| error.to_string())?;
  let tree = repository.find_tree(tree_id).map_err(|error| error.to_string())?;
  let signature = Signature::now("Atria", "local@atria.invalid").map_err(|error| error.to_string())?;
  repository
    .commit(
      Some("HEAD"),
      &signature,
      &signature,
      "chore: initialize Atria workspace / 初始化 Atria 工作区",
      &tree,
      &[],
    )
    .map_err(|error| error.to_string())?;
  Ok(())
}

fn repository_status(repository: &Repository) -> Result<GitWorkspaceStatus, String> {
  let head = repository.head().ok();
  let head_id = head.as_ref().and_then(|reference| reference.target()).map(|id| id.to_string());
  let branch = head
    .as_ref()
    .and_then(|reference| reference.shorthand().ok())
    .map(str::to_owned);
  let mut options = StatusOptions::new();
  options.include_untracked(true).recurse_untracked_dirs(true);
  let dirty = !repository
    .statuses(Some(&mut options))
    .map_err(|error| error.to_string())?
    .is_empty();
  Ok(GitWorkspaceStatus {
    initialized: true,
    head: head_id,
    branch,
    dirty,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  #[test]
  fn initializes_a_clean_workspace_repository() {
    let nonce = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("clock")
      .as_nanos();
    let root = std::env::temp_dir().join(format!("atria-git-test-{}-{nonce}", std::process::id()));
    fs::create_dir_all(&root).expect("create workspace");
    fs::write(root.join("note.html"), "<p>Initial</p>").expect("write document");

    let status = atria_git_initialize(Some(root.to_string_lossy().to_string())).expect("initialize Git");
    let ignore = fs::read_to_string(root.join(".gitignore")).expect("read gitignore");

    assert!(status.initialized);
    assert!(status.head.is_some());
    assert!(!status.dirty);
    assert!(ignore.contains(".atria/cache/"));
    assert!(Repository::open(&root).is_ok());

    fs::remove_dir_all(root).expect("remove test workspace");
  }
}
