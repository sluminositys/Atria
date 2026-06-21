# Atria

Atria is a local-first desktop document workspace for people and AI agents. It stores editable rich documents and complete HTML artifacts as ordinary files, renders them in one workspace, and records every human or agent revision in the workspace's embedded Git repository.

中文：Atria 是面向个人与 AI Agent 的本地优先桌面文档工作台。富文本文档与完整 HTML 报告都以普通文件保存，并在同一个工作区中编辑、预览、检索和管理；人工与 Agent 的每次修改都会进入工作区内置的 Git 历史。

## Architecture

- Tauri 2 desktop shell and native Rust workspace services
- React, TypeScript, Vite, TipTap, Zustand, and TanStack Query
- Semantic HTML as the editable document format
- Ordinary HTML files for complete agent-generated reports
- Embedded `git2` repository for document history, diff, and restore
- Bundled native MCP sidecar for Codex, Claude Code, and compatible agents
- On-demand Mermaid and KaTeX rendering

## Workspace Shape

```text
Atria Workspace/
  documents/
  reports/
  assets/
  .atria/
  .git/
```

Any local folder can be opened as an Atria workspace. When no folder is selected, Atria creates `Atria Workspace` beside the installed executable.

## Commands

```powershell
corepack pnpm install
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm test
corepack pnpm desktop
corepack pnpm --silent mcp -- --workspace "D:\path\to\workspace"
corepack pnpm --filter @atria/desktop tauri:build
```

Rust with the MSVC target is required for the desktop application and native MCP sidecar. The Tauri build produces the Windows installer under `apps/desktop/src-tauri/target/release/bundle/`.

See [docs/mcp-tools.md](docs/mcp-tools.md) for the Agent interface.
