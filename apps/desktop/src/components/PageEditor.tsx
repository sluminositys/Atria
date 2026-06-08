import { useState } from "react";
import { X } from "lucide-react";
import { Artifact, Page, WorkspaceSnapshot } from "@atria/schema";
import { createEmptyDocument } from "@atria/core";
import { useAtriaStore } from "../app/store";
import { AtriaDocumentEditor } from "./editor/AtriaDocumentEditor";
import styles from "../app/App.module.css";

interface PageEditorProps {
  page: Page;
  artifacts: Artifact[];
  snapshot?: WorkspaceSnapshot;
}

export function PageEditor({ page, artifacts, snapshot }: PageEditorProps) {
  const { updatePage } = useAtriaStore();
  const [tagDraft, setTagDraft] = useState("");
  const workspaceLabel = snapshot?.title || "Local Workspace";

  function addTag() {
    const tag = tagDraft.trim().replace(/^#/, "");
    if (!tag || page.tags.includes(tag)) {
      setTagDraft("");
      return;
    }
    updatePage(page.id, { tags: [...page.tags, tag] });
    setTagDraft("");
  }

  function removeTag(tag: string) {
    updatePage(page.id, { tags: page.tags.filter((item) => item !== tag) });
  }

  return (
    <article className={styles.page}>
      <input
        className={styles.pageTitle}
        value={page.title}
        onChange={(event) => updatePage(page.id, { title: event.target.value })}
      />
      <div className={styles.pageMetaCompact}>
        <span>{workspaceLabel}</span>
        <span>Updated {new Date(page.updatedAt).toLocaleString()}</span>
        <div className={styles.tagEditor}>
          {page.tags.map((tag) => (
            <button key={tag} className={styles.tagChip} onClick={() => removeTag(tag)} title="Remove tag">
              #{tag}
              <X size={11} />
            </button>
          ))}
          <input
            value={tagDraft}
            placeholder="tag"
            onChange={(event) => setTagDraft(event.target.value)}
            onBlur={addTag}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTag();
              }
            }}
          />
        </div>
      </div>
      <AtriaDocumentEditor
        value={page.html ?? page.content ?? createEmptyDocument()}
        artifacts={artifacts}
        snapshot={snapshot}
        onChange={(content, html) => updatePage(page.id, { content, html })}
      />
    </article>
  );
}
