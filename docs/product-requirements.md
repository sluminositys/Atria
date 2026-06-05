# Atria V2 Product Requirements

Atria is a local-first, HTML-first, Git-native desktop workspace where people and AI agents organize and revise the same documents. It is not a CMS, public publishing system, general IDE, or cloud collaboration product.

## Core outcomes

- A real local directory is the **Workspace** and remains understandable outside Atria.
- A person can directly edit prose in a WYSIWYG surface without creating paragraph blocks.
- An agent can read and patch the same semantic HTML **Document** through stable CLI or MCP operations.
- Every agent change and every human checkpoint has attributable Git history, document-level diff, and restore.
- A standalone **HTML Artifact** preserves its original code and interactive result in an isolated preview.
- Search, recents, tags, links, and graph data are derived from files rather than maintained as competing content stores.

## Editing acceptance

- Multiple closable tabs preserve a stable application shell.
- Preset editing tools cover text styles, headings, links, lists, tasks, quotes, callouts, tables, images, math, code, Mermaid, HTML embeds, and drawings.
- Inline and block LaTeX render with KaTeX and support source-focused editing, snippets, delimiter pairing, and tab stops.
- Code nodes support language selection, indentation, copy, wrapping, line numbers, and lazy syntax highlighting without execution.
- Images support paste, drag and drop, replacement, captions, alignment, and resize.
- Tables support editable cells, row and column operations, headers, merge and split, alignment, and resize.
- Excalidraw-style drawings load on demand as separate editable assets; Mermaid remains the lightweight agent-oriented diagram format.

## History acceptance

- A document transaction checks its base revision and never silently overwrites a newer file.
- Agent transactions create atomic commits with actor, tool, run, and intent metadata.
- Human typing is grouped into checkpoints instead of creating one commit per keystroke.
- Rich documents have structural and text diff, HTML artifacts have source and rendered comparison, and all files have raw diff fallback.
- Restoring an earlier document state creates a new commit and does not rewrite history.

## Desktop acceptance

- The fixed activity rail, real file explorer, tab strip, editor, contextual tools, and status bar retain stable dimensions across views.
- Text, toolbars, popovers, tables, and media stay inside their layout containers at 1280x720, 1440x900, and 1920x1080 with Windows scaling at 100%, 125%, and 150%.
- Heavy renderers and editors are split from the initial bundle and loaded only when their content is visible or edited.
- Arbitrary HTML cannot access Atria IPC or escape the workspace sandbox.
- The shipped desktop application does not require a separately installed web server, Node.js runtime, or Git executable.

## Deliberate exclusions

- Multi-user live editing and CRDT synchronization.
- Arbitrary code execution from code nodes.
- Lossless WYSIWYG editing of unrestricted standalone HTML.
- Cloud accounts, remote deployment, and remote Git synchronization in V2 foundation work.
- A public plugin marketplace.
