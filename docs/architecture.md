# Atria V2 Architecture

Atria is a desktop-first monorepo with one deep **Document Transaction Module**. The renderer and agent adapters request semantic operations; they do not implement persistence, revision, or migration rules themselves.

## Runtime map

```text
Human editor -----------+
                       |
CLI / MCP adapters -----+--> Document Transaction Module
                                      |
                         +------------+------------+
                         |            |            |
                    File adapter   Git adapter   Index adapter
                         |            |            |
                    Workspace      Revisions    Derived Index
```

## Modules

### Schema

`packages/schema` owns stable persisted data and external command validation. It defines **Document**, **HTML Artifact**, **Actor**, **Revision**, and **Document Transaction** contracts without desktop dependencies.

### Document Core

`packages/core` owns deterministic semantic HTML, transaction planning, base-revision conflict checks, migration from legacy page JSON, and in-memory adapters for tests. Its external interface is the primary test surface.

### Desktop adapters

`apps/desktop/src-tauri` owns workspace-contained paths, atomic file replacement, embedded Git operations, file discovery, and binary asset writes. Tauri commands are thin adapters at the Document Core seams.

### Renderer

`apps/desktop` owns the stable desktop shell, file navigation, tabs, rich editing, artifact preview, history, and diff presentation. Renderer state contains open UI state and current projections; it is not a second persistence model.

### Agent adapters

`packages/mcp` and the packaged agent entrypoint expose the same Document Transaction interface through stdio. Agent tools use base revisions and return revision identifiers.

### Derived index

Search, recent documents, tags, links, and graph relationships are projections over workspace files and revision metadata. The index can be removed and rebuilt without content loss.

## Dependency rules

- Schema has no dependency on Core, Tauri, React, or MCP.
- Core depends on Schema and platform-neutral libraries only.
- Desktop and agent adapters depend on Core and Schema.
- Renderer modules never invoke raw filesystem writes outside the typed workspace adapter.
- Heavy rendering features are dynamic imports and do not enter the initial renderer chunk.
- An **HTML Artifact** runs in a sandbox without access to Tauri IPC.

## Transaction sequence

1. A caller supplies actor, intent, base revision, target, and operation.
2. Document Core validates the operation and computes deterministic next content.
3. The file adapter atomically writes content and related metadata.
4. The Git adapter records the revision when the transaction requests a checkpoint.
5. The derived index updates from the resulting files.
6. The caller receives the current revision or an explicit conflict.
