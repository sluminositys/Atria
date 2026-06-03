import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Artifact, AtriaBlock, Page } from "@atria/schema";
import { useAtriaStore } from "../app/store";
import { BlockRenderer } from "./BlockRenderer";
import styles from "../app/App.module.css";

interface PageEditorProps {
  page: Page;
  artifacts: Artifact[];
}

export function PageEditor({ page, artifacts }: PageEditorProps) {
  const { updatePage, deletePage, updateBlock, deleteBlock, moveBlock } = useAtriaStore();

  return (
    <article className={styles.page}>
      <input
        className={styles.pageTitle}
        value={page.title}
        onChange={(event) => updatePage(page.id, { title: event.target.value })}
      />
      <div className={styles.pageMeta}>
        <span>human</span>
        <input
          value={page.tags.join(", ")}
          onChange={(event) =>
            updatePage(page.id, {
              tags: event.target.value
                .split(/[,，\s]+/)
                .map((tag) => tag.trim())
                .filter(Boolean),
            })
          }
        />
        <button onClick={() => deletePage(page.id)}>Delete</button>
      </div>
      <div className={styles.blocks}>
        {page.blocks.map((block, index) => (
          <section className={styles.blockShell} key={block.id}>
            <div className={styles.blockControls}>
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
              block={block}
              artifacts={artifacts}
              onChange={(patch: Partial<AtriaBlock>) => updateBlock(page.id, block.id, patch)}
            />
          </section>
        ))}
      </div>
    </article>
  );
}

