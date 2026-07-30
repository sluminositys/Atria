# Native Agent Interface

Atria ships one native MCP server, `atria-mcp.exe`. It reads and writes the same real files as the desktop application and commits every mutation to the same embedded Git repository. There is no second page/block database and no background directory watcher.

## Launch

For a development checkout:

```powershell
corepack pnpm --silent mcp -- --workspace "D:\path\to\Atria Workspace"
```

This prepares both the release executable and the target-triple sidecar consumed by Tauri while leaving stdout reserved for MCP JSON-RPC. Agent configurations should then point directly at `apps/desktop/src-tauri/target/release/atria-mcp.exe`.

For an installed build, point the Agent's stdio MCP configuration at the self-contained `atria-mcp.exe` installed beside `Atria.exe`:

```json
{
  "mcpServers": {
    "atria": {
      "command": "C:\\path\\to\\Atria\\atria-mcp.exe",
      "args": ["--workspace", "D:\\path\\to\\Atria Workspace"]
    }
  }
}
```

`ATRIA_WORKSPACE` can be used instead of `--workspace`. With neither, the server uses `Atria Workspace` beside its executable.

## Tools

| Tool | Purpose |
| --- | --- |
| `workspace_get_tree` | Read the real workspace file tree. |
| `workspace_search` | Search document paths and HTML content. |
| `document_list` | List semantic documents and HTML artifacts. |
| `document_read` | Read content plus the current Git revision. |
| `document_create` | Create a rich document or complete HTML artifact. |
| `document_replace` | Replace document content. |
| `document_patch` | Apply exact-text or stable-node HTML patches. |
| `document_delete` | Delete a document. |
| `document_history` | Read document-level Git history and provenance. |
| `document_diff` | Compare two document revisions. |
| `document_restore` | Restore an old revision as a new commit. |

## Document Contract

`document_create` accepts `kind: "rich-document"` for editable semantic HTML or `kind: "html-artifact"` for a complete HTML report. For a rich document, `title` is rendered by Atria above `content`, so the body HTML should not repeat the title as its first heading. Editable nodes use stable `data-atria-id` attributes and provenance metadata. Agent identity can include `id`, `label`, `tool`, `model`, and `runId`; mutations can also include `transactionId` and `intent`.

Agents must call `document_read` before replacing, patching, deleting, or restoring a document and pass its non-empty `revision.id` back as `baseRevision`. Missing and stale revisions reject the write instead of silently overwriting a human or another Agent's change.

For focused edits, prefer `document_patch`:

- `replace-text` requires `search`, `replacement`, and optionally `expectedOccurrences`.
- `replace-node` requires `nodeId` and replacement `html`.
- `insert-after` requires `nodeId` and inserted `html`.

All paths are workspace-relative. Parent traversal and absolute paths are rejected, and document reads are limited to 20 MB.
