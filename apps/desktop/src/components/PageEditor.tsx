import { useEffect } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Artifact, AtriaBlock, AtriaBlockType, Page } from "@atria/schema";
import { useAtriaStore } from "../app/store";
import { BlockRenderer } from "./BlockRenderer";
import styles from "../app/App.module.css";

interface PageEditorProps {
  page: Page;
  artifacts: Artifact[];
}

export function PageEditor({ page, artifacts }: PageEditorProps) {
  const {
    activeBlockId,
    activeBlockPageId,
    updatePage,
    updateBlock,
    deleteBlock,
    moveBlock,
    addBlock,
    addImageFromDataUrl,
    setActiveBlock,
  } = useAtriaStore();

  useEffect(() => {
    if (activeBlockPageId !== page.id || !activeBlockId) return;
    document.querySelector(`[data-block-id="${activeBlockId}"]`)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeBlockId, activeBlockPageId, page.id]);

  return (
    <article className={styles.page}>
      <input
        className={styles.pageTitle}
        value={page.title}
        onChange={(event) => updatePage(page.id, { title: event.target.value })}
      />
      <div className={styles.pageMetaCompact}>
        <span>human</span>
        <input
          value={page.tags.join(", ")}
          placeholder="tags"
          onChange={(event) =>
            updatePage(page.id, {
              tags: event.target.value
                .split(/[,，\s]+/)
                .map((tag) => tag.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div className={styles.blockCanvas}>
        {page.blocks.map((block, index) => {
          const active = activeBlockPageId === page.id && activeBlockId === block.id;
          return (
            <section
              className={active ? styles.blockFrameActive : styles.blockFrame}
              key={block.id}
              data-block-id={block.id}
              onMouseDown={() => setActiveBlock(page.id, block.id)}
            >
              <div className={styles.blockGutter}>
                <button title="Insert below" onClick={() => addBlock("text", { afterBlockId: block.id })}>
                  <Plus size={13} />
                </button>
                <button disabled={index === 0} title="Move up" onClick={() => moveBlock(page.id, block.id, -1)}>
                  <ArrowUp size={13} />
                </button>
                <button
                  disabled={index === page.blocks.length - 1}
                  title="Move down"
                  onClick={() => moveBlock(page.id, block.id, 1)}
                >
                  <ArrowDown size={13} />
                </button>
                <button title="Delete block" onClick={() => deleteBlock(page.id, block.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
              <BlockRenderer
                pageId={page.id}
                block={block}
                active={active}
                artifacts={artifacts}
                onEnterText={() => addBlock("text", { afterBlockId: block.id })}
                onBackspaceText={() => {
                  if (index > 0) deleteBlock(page.id, block.id);
                }}
                onSlashCommand={(type: AtriaBlockType) => {
                  if (block.type === "text") updateBlock(page.id, block.id, { richText: "<p></p>" } as Partial<AtriaBlock>);
                  addBlock(type, { afterBlockId: block.id });
                }}
                onPasteImage={(dataUrl) => {
                  void addImageFromDataUrl(dataUrl, page.id, block.id);
                }}
                onChange={(patch: Partial<AtriaBlock>) => updateBlock(page.id, block.id, patch)}
              />
            </section>
          );
        })}
      </div>
    </article>
  );
}
