use std::fs;
use std::path::{Component, Path, PathBuf};

#[path = "../git_history.rs"]
mod git_history;
#[path = "../mcp_protocol.rs"]
mod mcp_protocol;

fn default_workspace_path() -> Result<PathBuf, String> {
  let exe = std::env::current_exe().map_err(|error| error.to_string())?;
  let base = exe
    .parent()
    .map(Path::to_path_buf)
    .or_else(|| std::env::current_dir().ok())
    .ok_or_else(|| "Cannot resolve executable directory".to_string())?;
  Ok(base.join("Atria Workspace"))
}

pub fn resolve_root(root_path: Option<String>) -> Result<PathBuf, String> {
  let root = match root_path {
    Some(path) if !path.trim().is_empty() => PathBuf::from(path),
    _ => default_workspace_path()?,
  };
  fs::create_dir_all(root.join(".atria")).map_err(|error| error.to_string())?;
  Ok(root)
}

pub fn safe_join(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
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

fn main() {
  if let Err(error) = mcp_protocol::run(resolve_workspace_argument()) {
    eprintln!("Atria MCP stopped: {error}");
    std::process::exit(1);
  }
}

fn resolve_workspace_argument() -> Option<String> {
  let mut arguments = std::env::args().skip(1);
  while let Some(argument) = arguments.next() {
    if argument == "--workspace" {
      return arguments.next();
    }
  }
  std::env::var("ATRIA_WORKSPACE").ok()
}
