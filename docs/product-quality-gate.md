# Atria Product Quality Gate

A feature is releasable only when its complete user workflow is reliable, visually resolved, persisted to ordinary Workspace files, and covered by an automated or repeatable native acceptance check. A rendered shell or a clickable placeholder does not count as an implemented feature.

## Release-wide requirements

- No browser-native `prompt`, `confirm`, or `alert` UI.
- Every asynchronous action exposes progress, success when useful, and a recoverable error state.
- Menus, dialogs, tooltips, and popovers stay inside the native viewport, close with Escape and outside interaction, and restore focus.
- Keyboard navigation, visible focus, accessible names, and disabled states match the actual command state.
- Text, icons, controls, Structured Nodes, tabs, and panels remain within their layout boundaries at 1024x700, 1360x820, and 1920x1080 logical pixels.
- Derived Indexes never retain missing files and rebuild from Workspace files after external Agent changes.
- Human and Agent edits persist through Document Transactions and produce attributable Git Revisions.
- Empty, loading, populated, error, and conflict states are explicitly accepted for every major view.
- The release produces no relevant console errors, failed local resources, remote runtime dependencies, or horizontal page overflow.

## Workspace and navigation

| Surface | Required commercial workflow |
| --- | --- |
| Workspace lifecycle | Create or choose a local Workspace, switch among valid recent Workspaces, recover from a missing Workspace, and refresh after external Agent writes without displaying raw absolute paths in normal UI. |
| File tree | Display the real hierarchy; create, inline-rename, move, and delete Documents, HTML Artifacts, and folders; highlight the active file; reject invalid and duplicate names; confirm destructive folder operations with affected-item counts; report filesystem failures. |
| Tabs | Open multiple files with stable widths, activate and close with mouse or keyboard, close via middle click, update after rename or delete, and never show obsolete Actor labels. |
| Search and recents | Search titles, paths, tags, and file content; debounce and cancel stale searches; show useful snippets and paths; keyboard-open results; show only the latest 20 existing files. |
| Tags | Show tag counts derived from files, reveal matching files in place, open a match, and handle no-tag and missing-file states. |
| File relations | Derive nodes and edges from real files, focus the active file, filter or search larger graphs, zoom and fit the visualization, expose readable relationships, and open either endpoint. |
| Status | Show the active content kind, reliable saving/saved/error state, useful counts, and current Workspace name without leaking its absolute path. |

## Document editing

| Surface | Required commercial workflow |
| --- | --- |
| Document metadata | Edit title and tags without layout shift; reject empty/duplicate tags; persist changes and update tabs, tree, search, and Git history. |
| Prose | Type, paste, select, undo, redo, format, link, list, quote, and navigate naturally as one continuous document. Selection-only commands must not mutate content without a real selection. |
| Source editing | Switch a semantic Document between visual and deterministic HTML source editing without data loss, surface invalid source, and preserve stable node identifiers. |
| Insert flows | Insert at the current selection from the right rail, slash menu, context menu, paste, and drop. A Structured Node is always a top-level sibling and never nests accidentally. |
| Structured Node controls | Select, drag, duplicate, align, size, change layout, and delete exactly one node. Controls remain singular, anchored, discoverable, and dismiss correctly. |
| Link editing | Create, edit, open, and remove links through an in-app popover with URL validation rather than a browser prompt. |
| Save and conflict | Group human typing into visible idle checkpoints, expose write failures, and prevent silent overwrite when the on-disk Revision changed externally. |

## Structured Nodes

| Node | Required commercial workflow |
| --- | --- |
| Card | Optional title and freely editable rich content; no placeholder product label; width, alignment, duplicate, and delete persist. |
| Callout | Editable title/content and an explicit tone menu with visible color choices; tone is not changed by cycling an unexplained dot. |
| Todo and quote | Behave as native editable document structures with nesting, Enter, Backspace, selection conversion, undo, and persistence. |
| Code | Editable highlighted source, language selection, line number and wrap controls, reliable scrolling, copy feedback, keyboard behavior, resize, and persistence. |
| Image | Choose, paste, or drop a local image; render via the native asset protocol; replace it; edit caption and alt text; resize with aspect ratio; reset or fit size; report missing files. |
| Table | Choose dimensions and headers, edit all cells, resize columns and table width, add/delete rows and columns, merge/split, align and color cells, navigate by keyboard, and avoid toolbar overflow. |
| Mermaid | Edit source or view one rendered result, preserve the last valid preview while typing, show line-aware render errors, reset or copy source, resize, and persist offline. |
| LaTeX | Support inline and display formulas, Latex-Suite-style snippets and tab stops, source/render switching, syntax errors, copy, resize, and offline persistence. |
| HTML | Edit source or view one sandboxed result, expose render and sandbox failures, support full-screen editing, resize, and persist without mixing preview and source. |
| Drawing | Use the bundled Excalidraw editor offline; draw, select, erase, type, undo/redo, zoom, import/export, edit in full screen, return to an accurate preview, resize, and persist the scene. |
| Artifact embed | Choose a real HTML Artifact, render it locally, reload, collapse, annotate, replace the target, open the Artifact tab, handle deletion, resize, and create a real graph edge. |

## HTML Artifacts, history, and Agent access

| Surface | Required commercial workflow |
| --- | --- |
| HTML Artifact | Render the original file in a sandbox; switch to syntax-aware source editing; search, edit, save, undo, and reload; preserve arbitrary HTML rather than converting it to a Document. |
| History and Diff | Load Revisions, compare any pair in readable source and rendered modes, show Actor/intent/time/change counts, create a checkpoint, confirm restore in-app, restore as a new Revision, and recover from Git errors. |
| Agent bridge | Report the actual bundled MCP status and version, copy a valid configuration, avoid exposing paths outside explicit setup actions, and keep all 11 tools aligned with the desktop Document Transaction behavior. |
| Agent conflicts | Require base Revisions for Agent mutations, surface stale-write conflicts, refresh the affected file, and preserve both human and Agent history. |

## Release evidence

- Type checking, unit tests, renderer production build, Rust tests, and Tauri release bundle pass from a clean worktree.
- Native WebView2 acceptance exercises every row above against a temporary real Workspace and leaves no test files behind.
- Visual screenshots are reviewed at all supported viewport sizes and Windows scaling factors.
- The exact installer is installed to an isolated directory; the desktop app, local assets, bundled MCP server, icons, and uninstall lifecycle are verified.
