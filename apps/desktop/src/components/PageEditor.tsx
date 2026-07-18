import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const [titleDraft, setTitleDraft] = useState(page.title);
  const [titleError, setTitleError] = useState("");
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const activePageIdRef = useRef(page.id);
  const committedTitleRef = useRef(page.title);
  const skipNextTitleBlurRef = useRef(false);
  const workspaceLabel = snapshot?.title || "Local Workspace";

  useEffect(() => {
    if (activePageIdRef.current !== page.id) {
      activePageIdRef.current = page.id;
      committedTitleRef.current = page.title;
      setTitleDraft(page.title);
      setTitleError("");
      return;
    }
    if (document.activeElement !== titleRef.current) {
      committedTitleRef.current = page.title;
      setTitleDraft(page.title);
    }
  }, [page.id, page.title]);

  useLayoutEffect(() => resizeTitle(titleRef.current), [titleDraft]);

  function commitTitle() {
    const title = titleDraft.trim();
    if (!title) {
      const previousTitle = committedTitleRef.current;
      setTitleDraft(previousTitle);
      setTitleError("A document title cannot be empty.");
      if (page.title !== previousTitle) updatePage(page.id, { title: previousTitle });
      return;
    }
    setTitleError("");
    if (title !== page.title) updatePage(page.id, { title });
    committedTitleRef.current = title;
  }

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
      <textarea
        ref={titleRef}
        className={styles.pageTitle}
        rows={1}
        wrap="soft"
        aria-label="Document title"
        aria-invalid={Boolean(titleError)}
        aria-describedby={titleError ? "document-title-error" : undefined}
        value={titleDraft}
        onFocus={() => {
          committedTitleRef.current = page.title;
        }}
        onChange={(event) => {
          const title = event.target.value.replace(/[\r\n]+/g, " ");
          setTitleDraft(title);
          setTitleError("");
          if (title.trim()) updatePage(page.id, { title });
        }}
        onBlur={() => {
          if (skipNextTitleBlurRef.current) {
            skipNextTitleBlurRef.current = false;
            return;
          }
          commitTitle();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitTitle();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            const previousTitle = committedTitleRef.current;
            skipNextTitleBlurRef.current = true;
            setTitleDraft(previousTitle);
            setTitleError("");
            if (page.title !== previousTitle) updatePage(page.id, { title: previousTitle });
            event.currentTarget.blur();
          }
        }}
      />
      {titleError && <div id="document-title-error" role="alert" className={styles.pageTitleError}>{titleError}</div>}
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
        value={page.content ?? page.html ?? createEmptyDocument()}
        artifacts={artifacts}
        snapshot={snapshot}
        onChange={(content, html) => updatePage(page.id, { content, html })}
      />
    </article>
  );
}

function resizeTitle(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "0px";
  element.style.height = `${Math.max(46, element.scrollHeight)}px`;
}
