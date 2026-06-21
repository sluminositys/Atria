import { useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, FileText, Folder } from "lucide-react";
import { WorkspaceFolder, WorkspaceSnapshot, WorkspaceTreeItem } from "@atria/schema";
import { useAtriaStore } from "../app/store";
import styles from "../app/App.module.css";

interface FileTreeProps {
  snapshot: WorkspaceSnapshot;
}

type TreeMenu =
  | { x: number; y: number; kind: "folder"; folderId: string }
  | { x: number; y: number; kind: "page"; pageId: string };

export function FileTree({ snapshot }: FileTreeProps) {
  const {
    selectedFolderId,
    setSelectedFolder,
    toggleFolder,
    openNode,
    createPage,
    createFolder,
    deleteFolder,
    deletePage,
  } = useAtriaStore();
  const [menu, setMenu] = useState<TreeMenu | null>(null);

  return (
    <div className={styles.fileTree} onClick={() => setMenu(null)} onContextMenu={(event) => event.preventDefault()}>
      {foldersFor(snapshot, null).map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          depth={0}
          snapshot={snapshot}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolder}
          onToggleFolder={toggleFolder}
          onOpenNode={openNode}
          onMenu={(nextMenu) => setMenu(nextMenu)}
        />
      ))}
      {menu && (
        <div className={styles.contextMenu} style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          {menu.kind === "folder" ? (
            <>
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
            <button
              onClick={async () => {
                setMenu(null);
                await deletePage(menu.pageId);
              }}
            >
              Delete note
            </button>
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
  onSelectFolder,
  onToggleFolder,
  onOpenNode,
  onMenu,
}: {
  folder: WorkspaceFolder;
  depth: number;
  snapshot: WorkspaceSnapshot;
  selectedFolderId: string;
  onSelectFolder(folderId: string): void;
  onToggleFolder(folderId: string): void;
  onOpenNode(type: "page" | "artifact", id: string): void;
  onMenu(menu: TreeMenu): void;
}) {
  const children = foldersFor(snapshot, folder.id);
  const items = treeItemsFor(snapshot, folder.id);
  const isSelected = selectedFolderId === folder.id;
  const paddingLeft = 12 + depth * 16;

  return (
    <section>
      <button
        className={isSelected ? styles.folderRowActive : styles.folderRow}
        style={{ paddingLeft }}
        onClick={() => onSelectFolder(folder.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelectFolder(folder.id);
          onMenu({ x: event.clientX, y: event.clientY, kind: "folder", folderId: folder.id });
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
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
              onOpenNode={onOpenNode}
              onMenu={onMenu}
            />
          ))}
          {items.map((item) => (
            <TreeFile
              key={`${item.type}:${item.id}:${folder.id}`}
              item={item}
              snapshot={snapshot}
              depth={depth + 1}
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
  onOpenNode,
  onMenu,
}: {
  item: WorkspaceTreeItem;
  snapshot: WorkspaceSnapshot;
  depth: number;
  onOpenNode(type: "page" | "artifact", id: string): void;
  onMenu(menu: TreeMenu): void;
}) {
  if (item.type !== "page" && item.type !== "artifact") return null;
  const page = item.type === "page" ? snapshot.pages.find((entry) => entry.id === item.id) : undefined;
  const artifact =
    item.type === "artifact" ? snapshot.artifacts.find((entry) => entry.id === item.id) : undefined;
  const title = page?.title ?? artifact?.title ?? item.id;
  const source = (artifact?.source ?? page?.source) === "ai" ? "AI" : "HUMAN";
  const paddingLeft = 12 + depth * 16;
  const nodeType = item.type;

  return (
    <button
      className={styles.treeFile}
      style={{ paddingLeft }}
      onClick={() => onOpenNode(nodeType, item.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (item.type === "page") {
          onMenu({ x: event.clientX, y: event.clientY, kind: "page", pageId: item.id });
        }
      }}
    >
      {item.type === "artifact" ? <FileCode2 size={14} /> : <FileText size={14} />}
      <span>
        <strong>{title}</strong>
        <small>{source}</small>
      </span>
    </button>
  );
}

function foldersFor(snapshot: WorkspaceSnapshot, parentId: string | null): WorkspaceFolder[] {
  return snapshot.folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function treeItemsFor(snapshot: WorkspaceSnapshot, parentId: string): WorkspaceTreeItem[] {
  return snapshot.tree
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
