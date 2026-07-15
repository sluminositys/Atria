import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import type { WorkspaceFolder, WorkspaceSnapshot, WorkspaceTreeItem } from "@atria/schema";
import { FileNodeType, useAtriaStore } from "../app/store";
import { TreeOperationDialog } from "./TreeOperationDialog";
import styles from "../app/App.module.css";

interface FileTreeProps {
  snapshot: WorkspaceSnapshot;
}

type TreeMenuTarget =
  | { kind: "root" }
  | { kind: "folder"; folderId: string }
  | { kind: "file"; nodeType: FileNodeType; nodeId: string };

type TreeMenu = TreeMenuTarget & { x: number; y: number };

type TreeDialog =
  | { kind: "create-document"; folderId: string }
  | { kind: "create-text"; folderId: string }
  | { kind: "create-folder"; parentFolderId: string | null }
  | { kind: "rename-folder"; folderId: string }
  | { kind: "rename-file"; nodeType: FileNodeType; nodeId: string }
  | { kind: "delete-folder"; folderId: string }
  | { kind: "delete-file"; nodeType: FileNodeType; nodeId: string };

interface TreeDragData {
  kind: "folder" | FileNodeType;
  id: string;
}

const TREE_DRAG_TYPE = "application/x-atria-workspace-node";

export function FileTree({ snapshot }: FileTreeProps) {
  const {
    selectedFolderId,
    activeTabKey,
    setSelectedFolder,
    toggleFolder,
    openNode,
    createPage,
    createTextFile,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    renameNode,
    moveNode,
    deleteNode,
  } = useAtriaStore();
  const [menu, setMenu] = useState<TreeMenu | null>(null);
  const [dialog, setDialog] = useState<TreeDialog | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]');
    firstItem?.focus();
    function closeMenu(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    function closeOnResize() {
      setMenu(null);
    }
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [menu]);

  const runDrop = useCallback(async (action: () => Promise<void>) => {
    setOperationError("");
    try {
      await action();
    } catch (reason) {
      setOperationError(messageFor(reason));
    } finally {
      setDragTargetId(null);
    }
  }, []);

  function showMenu(event: React.MouseEvent, target: TreeMenuTarget) {
    event.preventDefault();
    event.stopPropagation();
    const width = 204;
    const height = target.kind === "folder" ? 260 : 170;
    setMenu({
      ...target,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    } as TreeMenu);
  }

  function openDialog(nextDialog: TreeDialog) {
    setMenu(null);
    setDialogError("");
    setDialog(nextDialog);
  }

  async function confirmDialog(value: string) {
    if (!dialog) return;
    setDialogBusy(true);
    setDialogError("");
    try {
      switch (dialog.kind) {
        case "create-document":
          await createPage(dialog.folderId, value);
          break;
        case "create-text":
          await createTextFile(dialog.folderId, value);
          break;
        case "create-folder":
          await createFolder(dialog.parentFolderId, value);
          break;
        case "rename-folder":
          await renameFolder(dialog.folderId, value);
          break;
        case "rename-file":
          await renameNode(dialog.nodeType, dialog.nodeId, value);
          break;
        case "delete-folder":
          await deleteFolder(dialog.folderId);
          break;
        case "delete-file":
          await deleteNode(dialog.nodeType, dialog.nodeId);
          break;
      }
      setDialog(null);
    } catch (reason) {
      setDialogError(messageFor(reason));
    } finally {
      setDialogBusy(false);
    }
  }

  const defaultFolderId = selectedFolderId || snapshot.folders[0]?.id || "";
  const dialogOptions = dialog ? optionsForDialog(snapshot, dialog) : undefined;

  return (
    <div
      className={styles.fileTree}
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) showMenu(event, { kind: "root" });
      }}
      onDragOver={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        const dragged = readDragData(event);
        if (!dragged) return;
        void runDrop(() => dragged.kind === "folder" ? moveFolder(dragged.id, null) : moveNode(dragged.kind, dragged.id, null));
      }}
      onDragEnd={() => setDragTargetId(null)}
    >
      {foldersFor(snapshot, null).map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          depth={0}
          snapshot={snapshot}
          selectedFolderId={selectedFolderId}
          activeTabKey={activeTabKey}
          onSelectFolder={setSelectedFolder}
          onToggleFolder={toggleFolder}
          onOpenNode={openNode}
          onMenu={showMenu}
          dragTargetId={dragTargetId}
          onDragTarget={setDragTargetId}
          onDropItem={(targetFolderId, dragged) => {
            void runDrop(() => dragged.kind === "folder"
              ? moveFolder(dragged.id, targetFolderId)
              : moveNode(dragged.kind, dragged.id, targetFolderId));
          }}
        />
      ))}
      {treeItemsFor(snapshot, null).map((item) => (
        <TreeFile
          key={`${item.type}:${item.id}:root`}
          item={item}
          snapshot={snapshot}
          depth={0}
          activeTabKey={activeTabKey}
          onOpenNode={openNode}
          onMenu={showMenu}
        />
      ))}

      {menu && (
        <div
          ref={menuRef}
          className={styles.contextMenu}
          role="menu"
          aria-label="File actions"
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={handleMenuKeyboard}
        >
          {menu.kind === "root" && (
            <>
              <MenuButton icon={FilePlus2} label="New document" onClick={() => openDialog({ kind: "create-document", folderId: defaultFolderId })} />
              <MenuButton icon={FileText} label="New text file" onClick={() => openDialog({ kind: "create-text", folderId: defaultFolderId })} />
              <MenuButton icon={FolderPlus} label="New folder" onClick={() => openDialog({ kind: "create-folder", parentFolderId: null })} />
            </>
          )}
          {menu.kind === "folder" && (
            <>
              <MenuButton icon={FilePlus2} label="New document" onClick={() => openDialog({ kind: "create-document", folderId: menu.folderId })} />
              <MenuButton icon={FileText} label="New text file" onClick={() => openDialog({ kind: "create-text", folderId: menu.folderId })} />
              <MenuButton icon={FolderPlus} label="New folder" onClick={() => openDialog({ kind: "create-folder", parentFolderId: menu.folderId })} />
              <div className={styles.contextMenuSeparator} />
              <MenuButton icon={Pencil} label="Rename" onClick={() => openDialog({ kind: "rename-folder", folderId: menu.folderId })} />
              <MenuButton icon={Trash2} label="Delete folder" danger onClick={() => openDialog({ kind: "delete-folder", folderId: menu.folderId })} />
            </>
          )}
          {menu.kind === "file" && (
            <>
              <MenuButton icon={Pencil} label="Rename" onClick={() => openDialog({ kind: "rename-file", nodeType: menu.nodeType, nodeId: menu.nodeId })} />
              <MenuButton icon={Trash2} label="Delete file" danger onClick={() => openDialog({ kind: "delete-file", nodeType: menu.nodeType, nodeId: menu.nodeId })} />
            </>
          )}
        </div>
      )}

      {operationError && (
        <div className={styles.treeOperationError} role="alert">
          <AlertCircle size={14} />
          <span>{operationError}</span>
          <button title="Dismiss" onClick={() => setOperationError("")}><X size={13} /></button>
        </div>
      )}

      {dialog && dialogOptions && (
        <TreeOperationDialog
          {...dialogOptions}
          busy={dialogBusy}
          error={dialogError}
          onCancel={() => {
            if (!dialogBusy) setDialog(null);
          }}
          onConfirm={(value) => void confirmDialog(value)}
        />
      )}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  danger = false,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  danger?: boolean;
  onClick(): void;
}) {
  return (
    <button role="menuitem" className={danger ? styles.contextMenuDanger : undefined} onClick={onClick}>
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

function FolderNode({
  folder,
  depth,
  snapshot,
  selectedFolderId,
  activeTabKey,
  onSelectFolder,
  onToggleFolder,
  onOpenNode,
  onMenu,
  dragTargetId,
  onDragTarget,
  onDropItem,
}: {
  folder: WorkspaceFolder;
  depth: number;
  snapshot: WorkspaceSnapshot;
  selectedFolderId: string;
  activeTabKey: string;
  onSelectFolder(folderId: string): void;
  onToggleFolder(folderId: string): void;
  onOpenNode(type: FileNodeType, id: string): void;
  onMenu(event: React.MouseEvent, target: TreeMenuTarget): void;
  dragTargetId: string | null;
  onDragTarget(folderId: string | null): void;
  onDropItem(folderId: string, dragged: TreeDragData): void;
}) {
  const children = foldersFor(snapshot, folder.id);
  const items = treeItemsFor(snapshot, folder.id);
  const isSelected = selectedFolderId === folder.id;
  const paddingLeft = 12 + depth * 16;

  return (
    <section>
      <button
        className={dragTargetId === folder.id ? styles.folderRowDrop : isSelected ? styles.folderRowActive : styles.folderRow}
        style={{ paddingLeft }}
        draggable
        onClick={() => onSelectFolder(folder.id)}
        onDoubleClick={() => onToggleFolder(folder.id)}
        onContextMenu={(event) => {
          onSelectFolder(folder.id);
          onMenu(event, { kind: "folder", folderId: folder.id });
        }}
        onDragStart={(event) => writeDragData(event, { kind: "folder", id: folder.id })}
        onDragEnd={() => onDragTarget(null)}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDragTarget(folder.id);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragTarget(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const dragged = readDragData(event);
          if (dragged) onDropItem(folder.id, dragged);
        }}
        title={folder.path ?? folder.name}
      >
        <span
          className={styles.folderChevron}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFolder(folder.id);
          }}
        >
          {folder.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <Folder size={14} />
        <span>{folder.name}</span>
      </button>
      {folder.expanded && (
        <>
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              snapshot={snapshot}
              selectedFolderId={selectedFolderId}
              activeTabKey={activeTabKey}
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
              onOpenNode={onOpenNode}
              onMenu={onMenu}
              dragTargetId={dragTargetId}
              onDragTarget={onDragTarget}
              onDropItem={onDropItem}
            />
          ))}
          {items.map((item) => (
            <TreeFile
              key={`${item.type}:${item.id}:${folder.id}`}
              item={item}
              snapshot={snapshot}
              depth={depth + 1}
              activeTabKey={activeTabKey}
              onOpenNode={onOpenNode}
              onMenu={onMenu}
            />
          ))}
        </>
      )}
    </section>
  );
}

function TreeFile({
  item,
  snapshot,
  depth,
  activeTabKey,
  onOpenNode,
  onMenu,
}: {
  item: WorkspaceTreeItem;
  snapshot: WorkspaceSnapshot;
  depth: number;
  activeTabKey: string;
  onOpenNode(type: FileNodeType, id: string): void;
  onMenu(event: React.MouseEvent, target: TreeMenuTarget): void;
}) {
  if (item.type !== "page" && item.type !== "artifact" && item.type !== "asset") return null;
  const page = item.type === "page" ? snapshot.pages.find((entry) => entry.id === item.id) : undefined;
  const artifact = item.type === "artifact" ? snapshot.artifacts.find((entry) => entry.id === item.id) : undefined;
  const asset = item.type === "asset" ? snapshot.assets.find((entry) => entry.id === item.id) : undefined;
  const title = page?.title ?? artifact?.title ?? asset?.title ?? item.id;
  const paddingLeft = 12 + depth * 16;
  const nodeType = item.type;
  const active = activeTabKey === `${nodeType}:${item.id}`;
  const Icon = item.type === "artifact" ? FileCode2 : asset?.kind === "image" ? FileImage : asset ? File : FileText;

  return (
    <button
      className={active ? styles.treeFileActive : styles.treeFile}
      style={{ paddingLeft }}
      draggable
      onClick={() => onOpenNode(nodeType, item.id)}
      onDragStart={(event) => writeDragData(event, { kind: nodeType, id: item.id })}
      onContextMenu={(event) => onMenu(event, { kind: "file", nodeType, nodeId: item.id })}
      title={item.filePath}
    >
      <Icon size={14} />
      <strong>{title}</strong>
    </button>
  );
}

function optionsForDialog(snapshot: WorkspaceSnapshot, dialog: TreeDialog) {
  const folder = "folderId" in dialog ? snapshot.folders.find((item) => item.id === dialog.folderId) : undefined;
  const parent = "parentFolderId" in dialog
    ? snapshot.folders.find((item) => item.id === dialog.parentFolderId)
    : undefined;
  const node = "nodeId" in dialog ? fileNode(snapshot, dialog.nodeType, dialog.nodeId) : undefined;
  const location = folder?.name ?? parent?.name ?? snapshot.title;

  switch (dialog.kind) {
    case "create-document":
      return {
        title: "New document",
        description: `Create a document in ${location}.`,
        inputLabel: "Document title",
        initialValue: "Untitled",
        confirmLabel: "Create",
      };
    case "create-text":
      return {
        title: "New text file",
        description: `Create a plain text or code file in ${location}.`,
        inputLabel: "File name",
        initialValue: "Untitled.md",
        confirmLabel: "Create",
      };
    case "create-folder":
      return {
        title: "New folder",
        description: `Create a folder in ${location}.`,
        inputLabel: "Folder name",
        initialValue: "New Folder",
        confirmLabel: "Create",
      };
    case "rename-folder":
      return {
        title: "Rename folder",
        description: "Nested files keep their document identity and history.",
        inputLabel: "Folder name",
        initialValue: folder?.name ?? "",
        confirmLabel: "Rename",
      };
    case "rename-file":
      return {
        title: "Rename file",
        description: "The open tab and document history follow the renamed file.",
        inputLabel: "File name",
        initialValue: fileName(node?.filePath ?? node?.title ?? ""),
        confirmLabel: "Rename",
      };
    case "delete-folder": {
      const prefix = folder?.path ? `${folder.path}/` : "";
      const folderCount = snapshot.folders.filter((item) => item.path?.startsWith(prefix) && item.id !== folder?.id).length;
      const fileCount = snapshot.tree.filter((item) => item.filePath?.startsWith(prefix)).length;
      return {
        title: `Delete ${folder?.name ?? "folder"}?`,
        description: `This removes ${fileCount} ${fileCount === 1 ? "file" : "files"}${folderCount ? ` and ${folderCount} nested ${folderCount === 1 ? "folder" : "folders"}` : ""} from the Workspace.`,
        confirmLabel: "Delete",
        destructive: true,
      };
    }
    case "delete-file":
      return {
        title: `Delete ${node?.title ?? "file"}?`,
        description: "The file is removed from the Workspace. Earlier committed revisions remain in Git history.",
        confirmLabel: "Delete",
        destructive: true,
      };
  }
}

function fileNode(snapshot: WorkspaceSnapshot, type: FileNodeType, id: string) {
  if (type === "page") return snapshot.pages.find((item) => item.id === id);
  if (type === "artifact") return snapshot.artifacts.find((item) => item.id === id);
  return snapshot.assets.find((item) => item.id === id);
}

function handleMenuKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  const offset = event.key === "ArrowDown" ? 1 : -1;
  items[(current + offset + items.length) % items.length]?.focus();
}

function writeDragData(event: React.DragEvent, data: TreeDragData): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(TREE_DRAG_TYPE, JSON.stringify(data));
}

function readDragData(event: React.DragEvent): TreeDragData | undefined {
  try {
    const value = JSON.parse(event.dataTransfer.getData(TREE_DRAG_TYPE)) as Partial<TreeDragData>;
    if (
      (value.kind === "folder" || value.kind === "page" || value.kind === "artifact" || value.kind === "asset")
      && typeof value.id === "string"
    ) {
      return { kind: value.kind, id: value.id };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function foldersFor(snapshot: WorkspaceSnapshot, parentId: string | null): WorkspaceFolder[] {
  return snapshot.folders
    .filter((folder) => folder.parentId === parentId)
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

function treeItemsFor(snapshot: WorkspaceSnapshot, parentId: string | null): WorkspaceTreeItem[] {
  return snapshot.tree
    .filter((item) => item.parentId === parentId)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
