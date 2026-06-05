# Make document transactions Git-backed

Every human or agent write crosses one **Document Transaction** interface that checks a base **Revision**, writes files atomically, and can create a standard Git commit. Workspace files and Git are the source of truth; search databases, recent-file lists, tags, and relationship graphs are rebuildable **Derived Indexes**.

## Consequences

- The desktop UI, CLI, and MCP use adapters at the same transaction seam instead of implementing separate write rules.
- Agent transactions commit atomically; human typing is grouped into explicit or idle checkpoints rather than one commit per keystroke.
- A restore creates a new revision and never rewrites history.
- V2 does not add CRDT or multi-user live collaboration; base-revision conflicts are explicit and local.
