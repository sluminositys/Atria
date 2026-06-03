import { ChevronDown, ChevronRight, FileCode2, FileText, Folder } from "lucide-react";
import { WorkspaceFolder, WorkspaceSnapshot, WorkspaceTreeItem } from "@atria/schema";
import { useAtriaStore } from "../app/store";
import styles from "../app/App.module.css";

interface FileTreeProps {
  snapshot: WorkspaceSnapshot;
}

export function FileTree({ snapshot }: FileTreeProps) {
  const { selectedFolderId, setSelectedFolder, openNode, createPage } = useAtriaStore();

  return (
    <div className={styles.fileTree} onContextMenu={(event) => event.preventDefault()}>
      {foldersFor(snapshot, null).map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          depth={0}
          snapshot={snapshot}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolder}
          onOpenNode={openNode}
          onCreatePage={createPage}
        />
      ))}
    </div>
  );
}

function FolderNode({
  folder,
  depth,
  snapshot,
  selectedFolderId,
  onSelectFolder,
  onOpenNode,
  onCreatePage,
}: {
  folder: WorkspaceFolder;
  depth: number;
  snapshot: WorkspaceSnapshot;
  selectedFolderId: string;
  onSelectFolder(folderId: string): void;
  onOpenNode(type: "page" | "artifact", id: string): void;
  onCreatePage(folderId: string): void;
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
          onSelectFolder(folder.id);
          onCreatePage(folder.id);
        }}
      >
        {folder.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
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
              onOpenNode={onOpenNode}
              onCreatePage={onCreatePage}
            />
          ))}
          {items.map((item) => (
            <TreeFile key={`${item.type}:${item.id}:${folder.id}`} item={item} snapshot={snapshot} depth={depth + 1} onOpenNode={onOpenNode} />
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
}: {
  item: WorkspaceTreeItem;
  snapshot: WorkspaceSnapshot;
  depth: number;
  onOpenNode(type: "page" | "artifact", id: string): void;
}) {
  if (item.type !== "page" && item.type !== "artifact") return null;
  const fileType = item.type;
  const page = item.type === "page" ? snapshot.pages.find((entry) => entry.id === item.id) : undefined;
  const artifact =
    item.type === "artifact" ? snapshot.artifacts.find((entry) => entry.id === item.id) : undefined;
  const title = page?.title ?? artifact?.title ?? item.id;
  const source = item.type === "artifact" ? "AI" : "HUMAN";
  const paddingLeft = 12 + depth * 16;

  return (
    <button
      className={styles.treeFile}
      style={{ paddingLeft }}
      onClick={() => onOpenNode(fileType, item.id)}
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
