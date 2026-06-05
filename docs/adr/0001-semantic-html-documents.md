# Use semantic HTML for co-editable documents

Atria stores a **Document** as deterministic semantic HTML because people need visual editing, agents need a readable patchable format, and Git needs stable text. A standalone **HTML Artifact** remains unmodified and renders in an isolated preview because arbitrary scripts, styles, and layout cannot safely round-trip through a WYSIWYG editor.

## Consequences

- The visual editor and source editor operate on the same **Document** content.
- Serialization must normalize attributes, whitespace, and stable node identifiers.
- Importing an **HTML Artifact** as a **Document** is an explicit lossy conversion, never an automatic save path.
