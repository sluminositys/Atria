import { useState } from "react";
import { ChevronDown, ChevronRight, File, FileCode2, FileImage, FileText, Folder } from "lucide-react";
import { WorkspaceFolder, WorkspaceSnapshot, WorkspaceTreeItem } from "@atria/schema";
import { useAtriaStore } from "../app/store";
import styles from "../app/App.module.css";

interface FileTreeProps {
  snapshot: WorkspaceSnapshot;
}

type TreeMenu =
  | { x: number; y: number; kind: "root" }
  | { x: number; y: number; kind: "folder"; folderId: string }
  | { x: number; y: number; kind: "file"; nodeType: "page" | "artifact"; nodeId: string };

interface TreeDragData {
  kind: "folder" | "page" | "artifact";
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
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    renameNode,
    moveNode,
    deletePage,
  } = useAtriaStore();
  const [menu, setMenu] = useState<TreeMenu | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);

  return (
    <div
      className={styles.fileTree}
      onClick={() => setMenu(null)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (event.target === event.currentTarget) {
          setMenu({ x: event.clientX, y: event.clientY, kind: "root" });
        }
      }}
      onDragOver={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.target !== event.currentTarget) return;
        const dragged = readDragData(event);
        setDragTargetId(null);
        if (dragged?.kind === "folder") void moveFolder(dragged.id, null);
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
          onMenu={(nextMenu) => setMenu(nextMenu)}
          dragTargetId={dragTargetId}
          onDragTarget={setDragTargetId}
          onDropItem={(targetFolderId, dragged) => {
            setDragTargetId(null);
            if (dragged.kind === "folder") void moveFolder(dragged.id, targetFolderId);
            else void moveNode(dragged.kind, dragged.id, targetFolderId);
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
          onMenu={(nextMenu) => setMenu(nextMenu)}
        />
      ))}
      {menu && (
        <div className={styles.contextMenu} style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          {menu.kind === "root" ? (
            <>
              {(selectedFolderId || snapshot.folders[0]?.id) && (
                <button
                  onClick={async () => {
                    setMenu(null);
                    await createPage(selectedFolderId || snapshot.folders[0]!.id);
                  }}
                >
                  New note
                </button>
              )}
              <button
                onClick={async () => {
                  const name = window.prompt("Folder name", "New Folder");
                  setMenu(null);
                  if (name) await createFolder(null, name);
                }}
              >
                New folder
              </button>
            </>
          ) : menu.kind === "folder" ? (
            <>
              <button
                onClick={async () => {
                  const folder = snapshot.folders.find((item) => item.id === menu.folderId);
                  const name = window.prompt("Folder name", folder?.name ?? "");
                  setMenu(null);
                  if (name) await renameFolder(menu.folderId, name);
                }}
              >
                Rename
              </button>
              {snapshot.folders.find((item) => item.id === menu.folderId)?.parentId && (
                <button
                  onClick={async () => {
                    setMenu(null);
                    await moveFolder(menu.folderId, null);
                  }}
                >
                  Move to root
                </button>
              )}
              <button
                onClick={async () => {
                  setMenu(null);
                  await createPage(menu.folderId);
                }}
              >
                New note
              </button>
              <button
                onClick={async () => {
                  const name = window.prompt("Folder name", "New Folder");
                  setMenu(null);
                  if (name) await createFolder(menu.folderId, name);
                }}
              >
                New folder
              </button>
              <button
                onClick={async () => {
                  const folder = snapshot.folders.find((item) => item.id === menu.folderId);
                  setMenu(null);
                  if (folder?.path && window.confirm(`Delete ${folder.path}?`)) await deleteFolder(menu.folderId);
                }}
              >
                Delete folder
              </button>
            </>
          ) : (
            <>
              <button
                onClick={async () => {
                  const item = menu.nodeType === "page"
                    ? snapshot.pages.find((page) => page.id === menu.nodeId)
                    : snapshot.artifacts.find((artifact) => artifact.id === menu.nodeId);
                  const name = window.prompt("File name", item?.title ?? "");
                  setMenu(null);
                  if (name) await renameNode(menu.nodeType, menu.nodeId, name);
                }}
              >
                Rename
              </button>
              {menu.nodeType === "page" && (
                <button
                  onClick={async () => {
                    setMenu(null);
                    await deletePage(menu.nodeId);
                  }}
                >
                  Delete note
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
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
  onOpenNode(type: "page" | "artifact" | "asset", id: string): void;
  onMenu(menu: TreeMenu): void;
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
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelectFolder(folder.id);
          onMenu({ x: event.clientX, y: event.clientY, kind: "folder", folderId: folder.id });
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
  onOpenNode(type: "page" | "artifact" | "asset", id: string): void;
  onMenu(menu: TreeMenu): void;
}) {
  if (item.type !== "page" && item.type !== "artifact" && item.type !== "asset") return null;
  const page = item.type === "page" ? snapshot.pages.find((entry) => entry.id === item.id) : undefined;
  const artifact =
    item.type === "artifact" ? snapshot.artifacts.find((entry) => entry.id === item.id) : undefined;
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
      draggable={nodeType !== "asset"}
      onClick={() => onOpenNode(nodeType, item.id)}
      onDragStart={(event) => {
        if (nodeType !== "asset") writeDragData(event, { kind: nodeType, id: item.id });
      }}
      onContextMenu={(event) => {
        if (nodeType === "asset") return;
        event.preventDefault();
        event.stopPropagation();
        onMenu({ x: event.clientX, y: event.clientY, kind: "file", nodeType, nodeId: item.id });
      }}
      title={item.filePath}
    >
      <Icon size={14} />
      <strong>{title}</strong>
    </button>
  );
}

function writeDragData(event: React.DragEvent, data: TreeDragData): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(TREE_DRAG_TYPE, JSON.stringify(data));
}

function readDragData(event: React.DragEvent): TreeDragData | undefined {
  try {
    const value = JSON.parse(event.dataTransfer.getData(TREE_DRAG_TYPE)) as Partial<TreeDragData>;
    if ((value.kind === "folder" || value.kind === "page" || value.kind === "artifact") && typeof value.id === "string") {
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
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function treeItemsFor(snapshot: WorkspaceSnapshot, parentId: string | null): WorkspaceTreeItem[] {
  return snapshot.tree
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
