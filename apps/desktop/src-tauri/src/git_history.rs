use git2::{DiffOptions, IndexAddOption, Repository, Signature, Sort, StatusOptions};
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
#[serde(rename_all = "camelCase")]
pub struct GitWorkspaceStatus {
  initialized: bool,
  head: Option<String>,
  branch: Option<String>,
  dirty: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRevision {
  id: String,
  short_id: String,
  summary: String,
  actor: String,
  email: String,
  timestamp: i64,
  transaction_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCheckpointResult {
  revision: GitRevision,
  changed: bool,
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

#[tauri::command]
pub fn atria_git_checkpoint(
  root_path: Option<String>,
  relative_paths: Vec<String>,
  actor_name: String,
  actor_email: Option<String>,
  intent: String,
  transaction_id: Option<String>,
) -> Result<GitCheckpointResult, String> {
  let root = super::resolve_root(root_path)?;
  let (repository, created) = open_or_initialize(&root)?;
  ensure_identity(&repository)?;
  ensure_gitignore(&root)?;
  if created || repository.head().is_err() {
    create_baseline_commit(&repository)?;
  }

  let mut paths = relative_paths
    .into_iter()
    .map(|path| normalize_relative_path(&root, &path))
    .collect::<Result<Vec<_>, _>>()?;
  if root.join(".atria").join("workspace.json").exists() {
    paths.push(".atria/workspace.json".to_string());
  }
  paths.sort();
  paths.dedup();

  let mut index = repository.index().map_err(|error| error.to_string())?;
  for path in paths {
    let relative = Path::new(&path);
    if root.join(relative).exists() {
      index.add_path(relative).map_err(|error| error.to_string())?;
    } else {
      match index.remove_path(relative) {
        Ok(()) => {}
        Err(error) if error.code() == git2::ErrorCode::NotFound => {}
        Err(error) => return Err(error.to_string()),
      }
    }
  }
  index.write().map_err(|error| error.to_string())?;

  commit_index(
    &repository,
    &mut index,
    &actor_name,
    actor_email.as_deref().unwrap_or("local@atria.invalid"),
    &intent,
    transaction_id.as_deref(),
  )
}

#[tauri::command]
pub fn atria_git_document_history(
  root_path: Option<String>,
  relative_path: String,
  limit: usize,
) -> Result<Vec<GitRevision>, String> {
  let root = super::resolve_root(root_path)?;
  let path = normalize_relative_path(&root, &relative_path)?;
  let repository = Repository::open(root).map_err(|error| error.to_string())?;
  let mut walk = repository.revwalk().map_err(|error| error.to_string())?;
  if walk.push_head().is_err() {
    return Ok(Vec::new());
  }
  walk.set_sorting(Sort::TIME).map_err(|error| error.to_string())?;
  let mut revisions = Vec::new();
  for id in walk {
    let id = id.map_err(|error| error.to_string())?;
    let commit = repository.find_commit(id).map_err(|error| error.to_string())?;
    if commit_touches_path(&repository, &commit, &path)? {
      revisions.push(revision_from_commit(&commit));
      if revisions.len() >= limit.clamp(1, 200) {
        break;
      }
    }
  }
  Ok(revisions)
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

fn commit_index(
  repository: &Repository,
  index: &mut git2::Index,
  actor_name: &str,
  actor_email: &str,
  intent: &str,
  transaction_id: Option<&str>,
) -> Result<GitCheckpointResult, String> {
  let tree_id = index.write_tree().map_err(|error| error.to_string())?;
  let parent = repository.head().ok().and_then(|head| head.peel_to_commit().ok());
  if parent.as_ref().is_some_and(|commit| commit.tree_id() == tree_id) {
    return Ok(GitCheckpointResult {
      revision: revision_from_commit(parent.as_ref().expect("checked parent")),
      changed: false,
    });
  }

  let tree = repository.find_tree(tree_id).map_err(|error| error.to_string())?;
  let name = if actor_name.trim().is_empty() { "Atria user" } else { actor_name.trim() };
  let email = if actor_email.trim().is_empty() {
    "local@atria.invalid"
  } else {
    actor_email.trim()
  };
  let signature = Signature::now(name, email).map_err(|error| error.to_string())?;
  let mut message = intent.trim().to_string();
  message.push_str(&format!("\n\nAtria-Actor: {}", actor_name.trim()));
  if let Some(transaction_id) = transaction_id.filter(|value| !value.trim().is_empty()) {
    message.push_str(&format!("\nAtria-Transaction: {}", transaction_id.trim()));
  }
  let parents = parent.iter().collect::<Vec<_>>();
  let commit_id = repository
    .commit(Some("HEAD"), &signature, &signature, &message, &tree, &parents)
    .map_err(|error| error.to_string())?;
  let commit = repository.find_commit(commit_id).map_err(|error| error.to_string())?;
  Ok(GitCheckpointResult {
    revision: revision_from_commit(&commit),
    changed: true,
  })
}

fn commit_touches_path(repository: &Repository, commit: &git2::Commit<'_>, path: &str) -> Result<bool, String> {
  let tree = commit.tree().map_err(|error| error.to_string())?;
  let parent_tree = commit.parent(0).ok().and_then(|parent| parent.tree().ok());
  let mut options = DiffOptions::new();
  options.pathspec(path);
  let diff = repository
    .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut options))
    .map_err(|error| error.to_string())?;
  Ok(diff.deltas().len() > 0)
}

fn revision_from_commit(commit: &git2::Commit<'_>) -> GitRevision {
  let id = commit.id().to_string();
  let author = commit.author();
  let message = commit.message().unwrap_or_default();
  GitRevision {
    short_id: id.chars().take(8).collect(),
    id,
    summary: commit
      .summary()
      .ok()
      .flatten()
      .unwrap_or("Document checkpoint")
      .to_string(),
    actor: author.name().unwrap_or("Unknown actor").to_string(),
    email: author.email().unwrap_or_default().to_string(),
    timestamp: commit.time().seconds(),
    transaction_id: trailer_value(message, "Atria-Transaction"),
  }
}

fn trailer_value(message: &str, name: &str) -> Option<String> {
  let prefix = format!("{name}:");
  message
    .lines()
    .rev()
    .find_map(|line| line.trim().strip_prefix(&prefix).map(str::trim).map(str::to_owned))
}

fn normalize_relative_path(root: &Path, value: &str) -> Result<String, String> {
  let path = super::safe_join(root, value)?;
  let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;
  if relative.as_os_str().is_empty() {
    return Err("A document history path cannot be the workspace root".to_string());
  }
  Ok(
    relative
      .components()
      .filter_map(|component| match component {
        std::path::Component::Normal(part) => Some(part.to_string_lossy().to_string()),
        _ => None,
      })
      .collect::<Vec<_>>()
      .join("/"),
  )
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

  #[test]
  fn checkpoints_and_filters_document_history() {
    let nonce = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("clock")
      .as_nanos();
    let root = std::env::temp_dir().join(format!("atria-history-test-{}-{nonce}", std::process::id()));
    fs::create_dir_all(&root).expect("create workspace");
    fs::write(root.join("note.html"), "<p>Initial</p>").expect("write document");
    atria_git_initialize(Some(root.to_string_lossy().to_string())).expect("initialize Git");

    fs::write(root.join("note.html"), "<p>Changed</p>").expect("change document");
    let checkpoint = atria_git_checkpoint(
      Some(root.to_string_lossy().to_string()),
      vec!["note.html".to_string()],
      "Codex".to_string(),
      Some("codex@atria.invalid".to_string()),
      "Update result".to_string(),
      Some("transaction-1".to_string()),
    )
    .expect("checkpoint document");
    let unchanged = atria_git_checkpoint(
      Some(root.to_string_lossy().to_string()),
      vec!["note.html".to_string()],
      "Codex".to_string(),
      None,
      "No change".to_string(),
      None,
    )
    .expect("skip empty checkpoint");
    let history = atria_git_document_history(
      Some(root.to_string_lossy().to_string()),
      "note.html".to_string(),
      20,
    )
    .expect("document history");

    assert!(checkpoint.changed);
    assert!(!unchanged.changed);
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].transaction_id.as_deref(), Some("transaction-1"));
    assert_eq!(history[0].actor, "Codex");

    fs::remove_dir_all(root).expect("remove test workspace");
  }
}
