use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

use super::git_history;

const MAX_DOCUMENT_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Deserialize)]
struct RpcRequest {
  id: Option<Value>,
  method: String,
  #[serde(default)]
  params: Value,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentActor {
  #[serde(default = "default_actor_id")]
  id: String,
  #[serde(default = "default_actor_label")]
  label: String,
  tool: Option<String>,
  model: Option<String>,
  run_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateDocumentInput {
  path: String,
  title: String,
  content: String,
  #[serde(default = "default_document_kind")]
  kind: String,
  #[serde(default)]
  tags: Vec<String>,
  document_id: Option<String>,
  transaction_id: Option<String>,
  intent: Option<String>,
  actor: Option<AgentActor>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplaceDocumentInput {
  path: String,
  content: String,
  title: Option<String>,
  tags: Option<Vec<String>>,
  base_revision: Option<String>,
  transaction_id: Option<String>,
  intent: Option<String>,
  actor: Option<AgentActor>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchDocumentInput {
  path: String,
  patches: Vec<DocumentPatch>,
  base_revision: Option<String>,
  transaction_id: Option<String>,
  intent: Option<String>,
  actor: Option<AgentActor>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum DocumentPatch {
  ReplaceText {
    search: String,
    replacement: String,
    #[serde(default = "one", rename = "expectedOccurrences")]
    expected_occurrences: usize,
  },
  ReplaceNode {
    #[serde(rename = "nodeId")]
    node_id: String,
    html: String,
  },
  InsertAfter {
    #[serde(rename = "nodeId")]
    node_id: String,
    html: String,
  },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MutationInput {
  path: String,
  base_revision: Option<String>,
  transaction_id: Option<String>,
  intent: Option<String>,
  actor: Option<AgentActor>,
}

pub fn run(workspace_path: Option<String>) -> Result<(), String> {
  let root = super::resolve_root(workspace_path)?;
  git_history::atria_git_initialize(Some(root.to_string_lossy().into_owned()))?;

  let stdin = io::stdin();
  let mut stdout = io::stdout().lock();
  for line in stdin.lock().lines() {
    let line = line.map_err(|error| error.to_string())?;
    if line.trim().is_empty() {
      continue;
    }
    let request: RpcRequest = match serde_json::from_str(&line) {
      Ok(request) => request,
      Err(error) => {
        write_message(
          &mut stdout,
          json!({
            "jsonrpc": "2.0",
            "id": null,
            "error": { "code": -32700, "message": error.to_string() }
          }),
        )?;
        continue;
      }
    };
    let Some(id) = request.id.clone() else {
      continue;
    };
    let response = match handle_request(&root, &request) {
      Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
      Err(error) => json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": -32603, "message": error }
      }),
    };
    write_message(&mut stdout, response)?;
  }
  Ok(())
}

fn handle_request(root: &Path, request: &RpcRequest) -> Result<Value, String> {
  match request.method.as_str() {
    "initialize" => Ok(json!({
      "protocolVersion": request.params.get("protocolVersion").and_then(Value::as_str).unwrap_or("2025-06-18"),
      "capabilities": { "tools": {} },
      "serverInfo": { "name": "atria", "version": env!("CARGO_PKG_VERSION") }
    })),
    "ping" => Ok(json!({})),
    "tools/list" => Ok(json!({ "tools": tool_definitions() })),
    "tools/call" => call_tool(root, &request.params),
    method => Err(format!("Unsupported MCP method: {method}")),
  }
}

fn call_tool(root: &Path, params: &Value) -> Result<Value, String> {
  let name = params
    .get("name")
    .and_then(Value::as_str)
    .ok_or_else(|| "Missing tool name".to_string())?;
  let arguments = params
    .get("arguments")
    .cloned()
    .unwrap_or_else(|| json!({}));
  let result = match name {
    "workspace_get_tree" => workspace_tree(root),
    "workspace_search" => workspace_search(root, &arguments),
    "document_list" => document_list(root),
    "document_read" => document_read(root, &arguments),
    "document_create" => document_create(root, arguments),
    "document_replace" => document_replace(root, arguments),
    "document_patch" => document_patch(root, arguments),
    "document_delete" => document_delete(root, arguments),
    "document_history" => document_history(root, &arguments),
    "document_diff" => document_diff(root, &arguments),
    "document_restore" => document_restore(root, arguments),
    _ => Err(format!("Unknown Atria tool: {name}")),
  };

  match result {
    Ok(value) => Ok(json!({
      "content": [{ "type": "text", "text": serde_json::to_string_pretty(&value).map_err(|error| error.to_string())? }],
      "structuredContent": value
    })),
    Err(error) => Ok(json!({
      "content": [{ "type": "text", "text": error }],
      "isError": true
    })),
  }
}

fn workspace_tree(root: &Path) -> Result<Value, String> {
  let mut entries = Vec::new();
  collect_workspace_entries(root, root, &mut entries)?;
  entries.sort_by(|left, right| left["path"].as_str().cmp(&right["path"].as_str()));
  Ok(json!({ "workspace": root, "entries": entries }))
}

fn workspace_search(root: &Path, arguments: &Value) -> Result<Value, String> {
  let query = required_string(arguments, "query")?.to_lowercase();
  let limit = arguments
    .get("limit")
    .and_then(Value::as_u64)
    .unwrap_or(20)
    .clamp(1, 100) as usize;
  let mut paths = Vec::new();
  collect_html_paths(root, root, &mut paths)?;
  let mut matches = Vec::new();
  for path in paths {
    let content = read_document_file(&path)?;
    let relative = relative_path(root, &path)?;
    let haystack = format!("{}\n{}", relative, content).to_lowercase();
    if haystack.contains(&query) {
      matches.push(json!({
        "path": relative,
        "title": html_title(&content).unwrap_or_else(|| file_name(&path)),
        "kind": document_kind(&content)
      }));
      if matches.len() >= limit {
        break;
      }
    }
  }
  Ok(json!({ "query": query, "matches": matches }))
}

fn document_list(root: &Path) -> Result<Value, String> {
  let mut paths = Vec::new();
  collect_html_paths(root, root, &mut paths)?;
  let documents = paths
    .into_iter()
    .map(|path| {
      let content = read_document_file(&path)?;
      Ok(json!({
        "path": relative_path(root, &path)?,
        "title": html_title(&content).unwrap_or_else(|| file_name(&path)),
        "documentId": meta_content(&content, "atria:document-id"),
        "kind": document_kind(&content),
        "bytes": content.len()
      }))
    })
    .collect::<Result<Vec<_>, String>>()?;
  Ok(json!({ "documents": documents }))
}

fn document_read(root: &Path, arguments: &Value) -> Result<Value, String> {
  let relative = required_string(arguments, "path")?;
  let path = safe_join(root, &relative)?;
  let content = read_document_file(&path)?;
  Ok(json!({
    "path": relative,
    "title": html_title(&content).unwrap_or_else(|| file_name(&path)),
    "documentId": meta_content(&content, "atria:document-id"),
    "kind": document_kind(&content),
    "revision": latest_revision(root, &relative)?,
    "content": content
  }))
}

fn document_create(root: &Path, arguments: Value) -> Result<Value, String> {
  let input: CreateDocumentInput =
    serde_json::from_value(arguments).map_err(|error| error.to_string())?;
  let path = safe_join(root, &input.path)?;
  if path.exists() {
    return Err(format!("Document already exists: {}", input.path));
  }
  let actor = input.actor.unwrap_or_default();
  let document_id = input
    .document_id
    .unwrap_or_else(|| Uuid::new_v4().to_string());
  let transaction_id = input
    .transaction_id
    .unwrap_or_else(|| Uuid::new_v4().to_string());
  let content = if input.kind == "rich-document" {
    semantic_document(
      &document_id,
      &input.title,
      &input.content,
      &actor,
      &input.tags,
    )
  } else if input.kind == "html-artifact" {
    normalize_text(&input.content)
  } else {
    return Err("kind must be rich-document or html-artifact".to_string());
  };
  write_document_file(&path, &content)?;
  let checkpoint = checkpoint(
    root,
    &input.path,
    &actor,
    input
      .intent
      .unwrap_or_else(|| format!("Create {}", input.title)),
    &transaction_id,
  )?;
  Ok(json!({
    "documentId": document_id,
    "path": input.path,
    "kind": input.kind,
    "transactionId": transaction_id,
    "checkpoint": checkpoint
  }))
}

fn document_replace(root: &Path, arguments: Value) -> Result<Value, String> {
  let input: ReplaceDocumentInput =
    serde_json::from_value(arguments).map_err(|error| error.to_string())?;
  ensure_base_revision(root, &input.path, input.base_revision.as_deref())?;
  let path = safe_join(root, &input.path)?;
  let current = read_document_file(&path)?;
  let actor = input.actor.unwrap_or_default();
  let transaction_id = input
    .transaction_id
    .unwrap_or_else(|| Uuid::new_v4().to_string());
  let content =
    if document_kind(&current) == "rich-document" && !is_semantic_document(&input.content) {
      let creator = actor_from_document(&current).unwrap_or_else(|| actor.clone());
      let id =
        meta_content(&current, "atria:document-id").unwrap_or_else(|| Uuid::new_v4().to_string());
      let title = input
        .title
        .or_else(|| html_title(&current))
        .unwrap_or_else(|| file_name(&path));
      let tags = input.tags.unwrap_or_else(|| tags_from_document(&current));
      semantic_document(&id, &title, &input.content, &creator, &tags)
    } else {
      normalize_text(&input.content)
    };
  write_document_file(&path, &content)?;
  let checkpoint = checkpoint(
    root,
    &input.path,
    &actor,
    input
      .intent
      .unwrap_or_else(|| format!("Replace {}", input.path)),
    &transaction_id,
  )?;
  Ok(json!({ "path": input.path, "transactionId": transaction_id, "checkpoint": checkpoint }))
}

fn document_patch(root: &Path, arguments: Value) -> Result<Value, String> {
  let input: PatchDocumentInput =
    serde_json::from_value(arguments).map_err(|error| error.to_string())?;
  ensure_base_revision(root, &input.path, input.base_revision.as_deref())?;
  let path = safe_join(root, &input.path)?;
  let current = read_document_file(&path)?;
  let next = apply_patches(current, &input.patches)?;
  write_document_file(&path, &next)?;
  let actor = input.actor.unwrap_or_default();
  let transaction_id = input
    .transaction_id
    .unwrap_or_else(|| Uuid::new_v4().to_string());
  let checkpoint = checkpoint(
    root,
    &input.path,
    &actor,
    input
      .intent
      .unwrap_or_else(|| format!("Patch {}", input.path)),
    &transaction_id,
  )?;
  Ok(json!({ "path": input.path, "transactionId": transaction_id, "checkpoint": checkpoint }))
}

fn document_delete(root: &Path, arguments: Value) -> Result<Value, String> {
  let input: MutationInput =
    serde_json::from_value(arguments).map_err(|error| error.to_string())?;
  ensure_base_revision(root, &input.path, input.base_revision.as_deref())?;
  let path = safe_join(root, &input.path)?;
  if path.exists() {
    fs::remove_file(&path).map_err(|error| error.to_string())?;
  }
  let actor = input.actor.unwrap_or_default();
  let transaction_id = input
    .transaction_id
    .unwrap_or_else(|| Uuid::new_v4().to_string());
  let checkpoint = checkpoint(
    root,
    &input.path,
    &actor,
    input
      .intent
      .unwrap_or_else(|| format!("Delete {}", input.path)),
    &transaction_id,
  )?;
  Ok(json!({ "path": input.path, "transactionId": transaction_id, "checkpoint": checkpoint }))
}

fn document_history(root: &Path, arguments: &Value) -> Result<Value, String> {
  let path = required_string(arguments, "path")?;
  let limit = arguments.get("limit").and_then(Value::as_u64).unwrap_or(50) as usize;
  let result = git_history::atria_git_document_history(
    Some(root.to_string_lossy().into_owned()),
    path,
    limit,
  )?;
  serde_json::to_value(result).map_err(|error| error.to_string())
}

fn document_diff(root: &Path, arguments: &Value) -> Result<Value, String> {
  let path = required_string(arguments, "path")?;
  let from = arguments
    .get("fromRevision")
    .and_then(Value::as_str)
    .map(String::from);
  let to = arguments
    .get("toRevision")
    .and_then(Value::as_str)
    .map(String::from);
  let result = git_history::atria_git_document_diff(
    Some(root.to_string_lossy().into_owned()),
    path,
    from,
    to,
  )?;
  serde_json::to_value(result).map_err(|error| error.to_string())
}

fn document_restore(root: &Path, arguments: Value) -> Result<Value, String> {
  let input: MutationInput =
    serde_json::from_value(arguments.clone()).map_err(|error| error.to_string())?;
  let revision = required_string(&arguments, "revision")?;
  let actor = input.actor.unwrap_or_default();
  let transaction_id = input
    .transaction_id
    .unwrap_or_else(|| Uuid::new_v4().to_string());
  let result = git_history::atria_git_restore_document(
    Some(root.to_string_lossy().into_owned()),
    input.path,
    revision,
    actor.label,
    Some("agent@atria.local".to_string()),
    input
      .intent
      .unwrap_or_else(|| "Restore document revision".to_string()),
    Some(transaction_id),
  )?;
  serde_json::to_value(result).map_err(|error| error.to_string())
}

fn apply_patches(mut content: String, patches: &[DocumentPatch]) -> Result<String, String> {
  for patch in patches {
    match patch {
      DocumentPatch::ReplaceText {
        search,
        replacement,
        expected_occurrences,
      } => {
        if search.is_empty() {
          return Err("replace-text search cannot be empty".to_string());
        }
        let occurrences = content.matches(search).count();
        if occurrences != *expected_occurrences {
          return Err(format!(
            "Expected {expected_occurrences} occurrence(s) but found {occurrences}"
          ));
        }
        content = content.replace(search, replacement);
      }
      DocumentPatch::ReplaceNode { node_id, html } => {
        let (start, end) = find_node_range(&content, node_id)?;
        content.replace_range(start..end, html);
      }
      DocumentPatch::InsertAfter { node_id, html } => {
        let (_, end) = find_node_range(&content, node_id)?;
        content.insert_str(end, html);
      }
    }
  }
  Ok(content)
}

fn find_node_range(content: &str, node_id: &str) -> Result<(usize, usize), String> {
  let opening = Regex::new(&format!(
    r#"(?is)<([a-z][\w:-]*)\b[^>]*\bdata-atria-id=["']{}["'][^>]*>"#,
    regex::escape(node_id)
  ))
  .map_err(|error| error.to_string())?;
  let capture = opening
    .captures(content)
    .ok_or_else(|| format!("Node not found: {node_id}"))?;
  let whole = capture
    .get(0)
    .ok_or_else(|| format!("Node not found: {node_id}"))?;
  let tag = capture
    .get(1)
    .ok_or_else(|| format!("Node tag missing: {node_id}"))?
    .as_str();
  let opening_end = whole.end();
  if whole.as_str().trim_end().ends_with("/>") || is_void_tag(tag) {
    return Ok((whole.start(), opening_end));
  }

  let tokens = Regex::new(&format!(r"(?is)</?{}\b[^>]*>", regex::escape(tag)))
    .map_err(|error| error.to_string())?;
  let mut depth = 1_i32;
  for token in tokens.find_iter(&content[opening_end..]) {
    if token.as_str().starts_with("</") {
      depth -= 1;
    } else if !token.as_str().trim_end().ends_with("/>") {
      depth += 1;
    }
    if depth == 0 {
      return Ok((whole.start(), opening_end + token.end()));
    }
  }
  Err(format!("Node is not closed: {node_id}"))
}

fn checkpoint(
  root: &Path,
  path: &str,
  actor: &AgentActor,
  intent: String,
  transaction_id: &str,
) -> Result<Value, String> {
  let result = git_history::atria_git_checkpoint(
    Some(root.to_string_lossy().into_owned()),
    vec![path.to_string()],
    actor.label.clone(),
    Some("agent@atria.local".to_string()),
    intent,
    Some(transaction_id.to_string()),
  )?;
  serde_json::to_value(result).map_err(|error| error.to_string())
}

fn ensure_base_revision(root: &Path, path: &str, expected: Option<&str>) -> Result<(), String> {
  let Some(expected) = expected else {
    return Ok(());
  };
  let current = latest_revision(root, path)?
    .and_then(|revision| revision.get("id").and_then(Value::as_str).map(String::from));
  if current.as_deref() == Some(expected) {
    Ok(())
  } else {
    Err(format!(
      "Document conflict: expected revision {expected}, current revision is {}",
      current.as_deref().unwrap_or("none")
    ))
  }
}

fn latest_revision(root: &Path, path: &str) -> Result<Option<Value>, String> {
  let revisions = git_history::atria_git_document_history(
    Some(root.to_string_lossy().into_owned()),
    path.to_string(),
    1,
  )?;
  let values = serde_json::to_value(revisions).map_err(|error| error.to_string())?;
  Ok(values.as_array().and_then(|items| items.first()).cloned())
}

fn semantic_document(
  id: &str,
  title: &str,
  content: &str,
  actor: &AgentActor,
  tags: &[String],
) -> String {
  let body = extract_body(content).unwrap_or_else(|| normalize_text(content));
  let mut metadata = vec![
    meta_tag("atria:document-id", id),
    meta_tag("atria:actor-id", &actor.id),
    meta_tag("atria:actor-label", &actor.label),
    meta_tag("atria:actor-kind", "agent"),
  ];
  if let Some(tool) = &actor.tool {
    metadata.push(meta_tag("atria:actor-tool", tool));
  }
  if let Some(model) = &actor.model {
    metadata.push(meta_tag("atria:actor-model", model));
  }
  if let Some(run_id) = &actor.run_id {
    metadata.push(meta_tag("atria:actor-run-id", run_id));
  }
  if !tags.is_empty() {
    metadata.push(meta_tag(
      "atria:tags",
      &serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string()),
    ));
  }
  [
    "<!doctype html>".to_string(),
    "<html lang=\"en\">".to_string(),
    "<head>".to_string(),
    "  <meta charset=\"utf-8\">".to_string(),
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">".to_string(),
    metadata.join("\n"),
    format!("  <title>{}</title>", escape_text(title)),
    "</head>".to_string(),
    format!("<body data-atria-document=\"{}\">", escape_attribute(id)),
    body,
    "</body>".to_string(),
    "</html>".to_string(),
    String::new(),
  ]
  .join("\n")
}

fn actor_from_document(content: &str) -> Option<AgentActor> {
  Some(AgentActor {
    id: meta_content(content, "atria:actor-id")?,
    label: meta_content(content, "atria:actor-label")?,
    tool: meta_content(content, "atria:actor-tool"),
    model: meta_content(content, "atria:actor-model"),
    run_id: meta_content(content, "atria:actor-run-id"),
  })
}

fn tags_from_document(content: &str) -> Vec<String> {
  meta_content(content, "atria:tags")
    .and_then(|value| serde_json::from_str(&value).ok())
    .unwrap_or_default()
}

fn is_semantic_document(content: &str) -> bool {
  content.contains("name=\"atria:document-id\"") || content.contains("name='atria:document-id'")
}

fn document_kind(content: &str) -> &'static str {
  if is_semantic_document(content) {
    "rich-document"
  } else {
    "html-artifact"
  }
}

fn html_title(content: &str) -> Option<String> {
  let regex = Regex::new(r"(?is)<title\b[^>]*>(.*?)</title>").ok()?;
  regex
    .captures(content)?
    .get(1)
    .map(|value| decode_entities(value.as_str()).trim().to_string())
}

fn extract_body(content: &str) -> Option<String> {
  let regex = Regex::new(r"(?is)<body\b[^>]*>(.*?)</body>").ok()?;
  regex
    .captures(content)?
    .get(1)
    .map(|value| normalize_text(value.as_str()))
}

fn meta_content(content: &str, name: &str) -> Option<String> {
  let regex = Regex::new(&format!(
    r#"(?is)<meta\b[^>]*\bname=["']{}["'][^>]*\bcontent=["']([^"']*)["'][^>]*>"#,
    regex::escape(name)
  ))
  .ok()?;
  regex
    .captures(content)?
    .get(1)
    .map(|value| decode_entities(value.as_str()))
}

fn meta_tag(name: &str, content: &str) -> String {
  format!(
    "  <meta name=\"{}\" content=\"{}\">",
    name,
    escape_attribute(content)
  )
}

fn normalize_text(value: &str) -> String {
  value
    .replace("\r\n", "\n")
    .replace('\r', "\n")
    .trim()
    .to_string()
}

fn escape_text(value: &str) -> String {
  value
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
}

fn escape_attribute(value: &str) -> String {
  escape_text(value).replace('\'', "&#39;")
}

fn decode_entities(value: &str) -> String {
  value
    .replace("&quot;", "\"")
    .replace("&#39;", "'")
    .replace("&gt;", ">")
    .replace("&lt;", "<")
    .replace("&amp;", "&")
}

fn write_document_file(path: &Path, content: &str) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  fs::write(path, content).map_err(|error| error.to_string())
}

fn read_document_file(path: &Path) -> Result<String, String> {
  let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
  if metadata.len() > MAX_DOCUMENT_BYTES {
    return Err(format!(
      "Document exceeds {} MB",
      MAX_DOCUMENT_BYTES / 1024 / 1024
    ));
  }
  fs::read_to_string(path).map_err(|error| error.to_string())
}

fn collect_workspace_entries(
  root: &Path,
  current: &Path,
  entries: &mut Vec<Value>,
) -> Result<(), String> {
  for item in fs::read_dir(current).map_err(|error| error.to_string())? {
    let item = item.map_err(|error| error.to_string())?;
    let path = item.path();
    let name = item.file_name().to_string_lossy().to_string();
    if current == root && (name == ".git" || name == ".atria") {
      continue;
    }
    let metadata = item.metadata().map_err(|error| error.to_string())?;
    entries.push(json!({
      "path": relative_path(root, &path)?,
      "kind": if metadata.is_dir() { "folder" } else { "file" },
      "bytes": if metadata.is_file() { metadata.len() } else { 0 }
    }));
    if metadata.is_dir() {
      collect_workspace_entries(root, &path, entries)?;
    }
  }
  Ok(())
}

fn collect_html_paths(root: &Path, current: &Path, paths: &mut Vec<PathBuf>) -> Result<(), String> {
  for item in fs::read_dir(current).map_err(|error| error.to_string())? {
    let item = item.map_err(|error| error.to_string())?;
    let path = item.path();
    let name = item.file_name().to_string_lossy().to_string();
    if current == root && (name == ".git" || name == ".atria") {
      continue;
    }
    if item
      .file_type()
      .map_err(|error| error.to_string())?
      .is_dir()
    {
      collect_html_paths(root, &path, paths)?;
    } else if path
      .extension()
      .and_then(|extension| extension.to_str())
      .is_some_and(|extension| extension.eq_ignore_ascii_case("html"))
    {
      paths.push(path);
    }
  }
  paths.sort();
  Ok(())
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
  let mut result = root.to_path_buf();
  for component in Path::new(relative).components() {
    match component {
      Component::Normal(part) => result.push(part),
      Component::CurDir => {}
      _ => return Err("Invalid workspace path".to_string()),
    }
  }
  Ok(result)
}

fn relative_path(root: &Path, path: &Path) -> Result<String, String> {
  Ok(
    path
      .strip_prefix(root)
      .map_err(|error| error.to_string())?
      .components()
      .filter_map(|component| {
        if let Component::Normal(part) = component {
          Some(part.to_string_lossy().into_owned())
        } else {
          None
        }
      })
      .collect::<Vec<_>>()
      .join("/"),
  )
}

fn file_name(path: &Path) -> String {
  path
    .file_name()
    .map(|name| name.to_string_lossy().into_owned())
    .unwrap_or_else(|| "Untitled".to_string())
}

fn required_string(arguments: &Value, key: &str) -> Result<String, String> {
  arguments
    .get(key)
    .and_then(Value::as_str)
    .map(String::from)
    .ok_or_else(|| format!("Missing {key}"))
}

fn write_message(output: &mut impl Write, value: Value) -> Result<(), String> {
  serde_json::to_writer(&mut *output, &value).map_err(|error| error.to_string())?;
  output.write_all(b"\n").map_err(|error| error.to_string())?;
  output.flush().map_err(|error| error.to_string())
}

fn tool_definitions() -> Vec<Value> {
  vec![
    tool("workspace_get_tree", "List the real files and folders in the active Atria library.", json!({ "type": "object", "properties": {} })),
    tool("workspace_search", "Search document paths and HTML content in the active Atria library.", json!({ "type": "object", "properties": { "query": { "type": "string" }, "limit": { "type": "integer", "minimum": 1, "maximum": 100 } }, "required": ["query"] })),
    tool("document_list", "List rich documents and HTML artifacts in the active Atria library.", json!({ "type": "object", "properties": {} })),
    tool("document_read", "Read a document and its current Git revision before editing it.", path_schema()),
    tool("document_create", "Create a semantic rich document or a complete HTML artifact and commit it as an agent revision.", json!({
      "type": "object",
      "properties": {
        "path": { "type": "string" },
        "title": { "type": "string", "description": "Document title shown by Atria above the editable body." },
        "content": { "type": "string", "description": "For rich-document, body HTML below the Atria title; do not repeat title as a leading h1. Give editable nodes stable data-atria-id attributes. For html-artifact, pass the complete standalone HTML document." },
        "kind": { "type": "string", "enum": ["rich-document", "html-artifact"], "default": "rich-document" },
        "tags": { "type": "array", "items": { "type": "string" } }, "documentId": { "type": "string" },
        "transactionId": { "type": "string" }, "intent": { "type": "string" }, "actor": actor_schema()
      }, "required": ["path", "title", "content"]
    })),
    tool("document_replace", "Replace a complete HTML artifact or the body below a rich-document title and commit the result. Pass baseRevision for optimistic concurrency.", mutation_schema(json!({ "content": { "type": "string" }, "title": { "type": "string" }, "tags": { "type": "array", "items": { "type": "string" } } }), vec!["path", "content"])),
    tool("document_patch", "Apply exact text or data-atria-id stable-node HTML patches and commit the result.", mutation_schema(json!({ "patches": { "type": "array", "minItems": 1, "items": { "type": "object", "properties": { "type": { "type": "string", "enum": ["replace-text", "replace-node", "insert-after"] }, "search": { "type": "string" }, "replacement": { "type": "string" }, "expectedOccurrences": { "type": "integer", "minimum": 1 }, "nodeId": { "type": "string" }, "html": { "type": "string" } }, "required": ["type"] } } }), vec!["path", "patches"])),
    tool("document_delete", "Delete a document and commit the deletion.", mutation_schema(json!({}), vec!["path"])),
    tool("document_history", "List document-level Git revisions with actor and transaction provenance.", json!({ "type": "object", "properties": { "path": { "type": "string" }, "limit": { "type": "integer", "minimum": 1, "maximum": 200 } }, "required": ["path"] })),
    tool("document_diff", "Read a unified diff for one document between two revisions.", json!({ "type": "object", "properties": { "path": { "type": "string" }, "fromRevision": { "type": "string" }, "toRevision": { "type": "string" } }, "required": ["path"] })),
    tool("document_restore", "Restore one historical document revision as a new agent commit.", mutation_schema(json!({ "revision": { "type": "string" } }), vec!["path", "revision"])),
  ]
}

fn tool(name: &str, description: &str, input_schema: Value) -> Value {
  json!({ "name": name, "description": description, "inputSchema": input_schema })
}

fn path_schema() -> Value {
  json!({ "type": "object", "properties": { "path": { "type": "string" } }, "required": ["path"] })
}

fn actor_schema() -> Value {
  json!({ "type": "object", "properties": { "id": { "type": "string" }, "label": { "type": "string" }, "tool": { "type": "string" }, "model": { "type": "string" }, "runId": { "type": "string" } } })
}

fn mutation_schema(extra: Value, required: Vec<&str>) -> Value {
  let mut properties = json!({
    "path": { "type": "string" }, "baseRevision": { "type": "string" }, "transactionId": { "type": "string" },
    "intent": { "type": "string" }, "actor": actor_schema()
  });
  if let (Some(target), Some(source)) = (properties.as_object_mut(), extra.as_object()) {
    target.extend(source.clone());
  }
  json!({ "type": "object", "properties": properties, "required": required })
}

fn default_actor_id() -> String {
  "ai-agent".to_string()
}
fn default_actor_label() -> String {
  "AI Agent".to_string()
}
fn default_document_kind() -> String {
  "rich-document".to_string()
}
fn one() -> usize {
  1
}

impl Default for AgentActor {
  fn default() -> Self {
    Self {
      id: default_actor_id(),
      label: default_actor_label(),
      tool: None,
      model: None,
      run_id: None,
    }
  }
}

fn is_void_tag(tag: &str) -> bool {
  matches!(
    tag.to_ascii_lowercase().as_str(),
    "area"
      | "base"
      | "br"
      | "col"
      | "embed"
      | "hr"
      | "img"
      | "input"
      | "link"
      | "meta"
      | "source"
      | "track"
      | "wbr"
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn semantic_documents_keep_agent_provenance() {
    let html = semantic_document(
      "doc-1",
      "Results",
      "<p>Done</p>",
      &AgentActor::default(),
      &["result".to_string()],
    );
    assert!(html.contains("atria:actor-kind"));
    assert_eq!(
      meta_content(&html, "atria:document-id").as_deref(),
      Some("doc-1")
    );
    assert_eq!(tags_from_document(&html), vec!["result"]);
  }

  #[test]
  fn patches_target_stable_nodes() {
    let html = "<body><section data-atria-id=\"s1\"><p>Old</p></section></body>".to_string();
    let next = apply_patches(
      html,
      &[DocumentPatch::ReplaceNode {
        node_id: "s1".to_string(),
        html: "<section data-atria-id=\"s1\">New</section>".to_string(),
      }],
    )
    .unwrap();
    assert!(next.contains(">New</section>"));
    assert!(!next.contains("Old"));
  }

  #[test]
  fn tool_contract_names_the_editor_body_and_stable_id() {
    let tools = tool_definitions();
    let create = tools
      .iter()
      .find(|tool| tool["name"] == "document_create")
      .unwrap();
    let patch = tools
      .iter()
      .find(|tool| tool["name"] == "document_patch")
      .unwrap();

    assert!(
      create["inputSchema"]["properties"]["content"]["description"]
        .as_str()
        .unwrap()
        .contains("do not repeat title")
    );
    assert!(patch["description"]
      .as_str()
      .unwrap()
      .contains("data-atria-id"));
  }
}
