# Atria Architecture

Atria is structured as a desktop-first monorepo. The renderer is responsible for the human workspace UI, while the TypeScript core owns workspace semantics. MCP tools call the same core package as the UI-facing services.

```text
apps/desktop      React + Vite renderer and Tauri shell
apps/mcp-server   Local MCP server entrypoint
packages/schema   Zod schemas and stable data contracts
packages/core     Workspace, page, artifact, timeline, search, settings services
packages/editor   TipTap editor extensions and block adapters
packages/artifact Artifact preview and sandbox helpers
packages/mcp      MCP tools/resources/prompts backed by core services
packages/ui       Shared UI primitives
packages/ai       AI provider settings and prompt contracts
```

The first persistence target is a local workspace directory with JSON metadata and HTML artifact folders.

