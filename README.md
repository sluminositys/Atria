# Atria

Atria is a desktop-first HTML artifact workspace for AI-assisted coding and research workflows. It helps collect, preview, organize, annotate, and reuse AI-generated HTML reports while giving humans an Obsidian-like workspace and Notion-like block editing experience. Atria exposes MCP-native tools so Codex, Claude Code, and other coding agents can register artifacts, create pages, append blocks, and build daily/weekly/monthly summaries directly inside the same workspace.

中文：Atria 是一个桌面优先的 HTML-first AI 工作台，用于收纳 AI 生成的 HTML 报告、人工 block 笔记和 MCP 原生 agent 接入。

## Stack

- Tauri desktop shell
- React + TypeScript + Vite renderer
- CSS Modules + CSS variables
- TipTap / ProseMirror editor
- Zustand state
- TanStack Query async state
- Zod schemas
- pnpm workspace
- Node.js + TypeScript MCP server
- File-system-first workspace data

## Workspace Shape

```text
workspace/
  artifacts/
  pages/
  timeline/
  projects/
  assets/
  templates/
  .atria/
```

## Commands

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm build
corepack pnpm test
corepack pnpm mcp
```

Rust is required for the final Tauri desktop build. The renderer and TypeScript packages can be developed and verified independently with Node.js.
