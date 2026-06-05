# Atria Workspace

Atria organizes local, human-readable work produced and revised by people and AI agents. The workspace remains useful outside Atria because content lives in ordinary files and standard Git history.

## Language

**Workspace**:
A local directory that contains content files, Atria metadata, and a standard Git repository.
_Avoid_: Vault, database, project

**Document**:
A co-editable semantic HTML file whose content can round-trip through Atria's visual and source editors.
_Avoid_: Page, note, block document

**HTML Artifact**:
A standalone HTML file whose scripts, styles, and layout are preserved and rendered in an isolated preview.
_Avoid_: Document, report page

**Structured Node**:
A self-contained rich element inside a **Document**, such as math, code, a table, media, Mermaid, or a drawing reference.
_Avoid_: Block for ordinary prose

**Asset**:
A file referenced by a **Document** or **HTML Artifact**, including images, attachments, and drawings.

**Actor**:
The person or named AI agent responsible for a **Revision**.
_Avoid_: Source

**Revision**:
A Git-backed snapshot of one atomic content change together with actor and intent metadata.
_Avoid_: Save, version record

**Document Transaction**:
An atomic create, update, move, restore, or delete operation checked against a base **Revision**.
_Avoid_: Raw file write, autosave event

**Derived Index**:
Rebuildable local data for search, recents, tags, links, and graph relationships.
_Avoid_: Workspace database, source of truth

## Relationships

- A **Workspace** contains zero or more **Documents**, **HTML Artifacts**, and **Assets**.
- A **Document** contains prose and zero or more **Structured Nodes**.
- A **Document Transaction** produces one **Revision** and names exactly one **Actor**.
- A **Revision** may change a content file, its metadata, and referenced **Assets** together.
- A **Derived Index** is produced from files and revisions and can always be deleted and rebuilt.

## Example dialogue

> **Developer:** "Should an agent append a block to a page?"
> **Domain expert:** "It should apply a **Document Transaction** to a **Document**. Ordinary prose is edited directly; only math, code, tables, media, diagrams, and embeds are **Structured Nodes**."

## Flagged ambiguities

- `Page` and `note` previously described the same editable content as **Document**; V2 uses **Document**.
- `Block` previously included ordinary paragraphs and specialized embeds; V2 uses **Structured Node** only for specialized rich elements.
- `source` previously classified a whole file as human or AI; V2 records an **Actor** on every **Revision**.
