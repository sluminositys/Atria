import type { PointerEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import katex from "katex";
import mermaid from "mermaid";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Artifact, AtriaBlock, AtriaBlockType } from "@atria/schema";
import { toFileAssetUrl } from "../app/workspaceClient";
import { RichTextBlock } from "./RichTextBlock";
import styles from "../app/App.module.css";
import "katex/dist/katex.min.css";

interface BlockRendererProps {
  pageId: string;
  block: AtriaBlock;
  active: boolean;
  artifacts: Artifact[];
  onEnterText(): void;
  onBackspaceText(): void;
  onSlashCommand(type: AtriaBlockType): void;
  onPasteImage(dataUrl: string): void;
  onChange(patch: Partial<AtriaBlock>): void;
}

type CanvasElement = {
  id: string;
  x: number;
  y: number;
  text: string;
};

export function BlockRenderer({
  block,
  active,
  artifacts,
  onEnterText,
  onBackspaceText,
  onSlashCommand,
  onPasteImage,
  onChange,
}: BlockRendererProps) {
  if (block.type === "heading") {
    return (
      <div className={styles.headingBlockWrap}>
        {active && (
          <select
            className={styles.headingLevelSelect}
            value={block.level}
            onChange={(event) => onChange({ level: Number(event.target.value) })}
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
            <option value={4}>H4</option>
          </select>
        )}
        <input
          className={styles.headingBlock}
          style={{ fontSize: block.level === 1 ? 30 : block.level === 2 ? 24 : block.level === 3 ? 20 : 17 }}
          value={block.text}
          placeholder="Heading"
          onChange={(event) => onChange({ text: event.target.value })}
        />
      </div>
    );
  }

  if (block.type === "text") {
    return (
      <RichTextBlock
        value={block.richText}
        active={active}
        onChange={(richText) => onChange({ richText })}
        onEnter={onEnterText}
        onBackspaceEmpty={onBackspaceText}
        onSlashCommand={onSlashCommand}
        onPasteImage={onPasteImage}
      />
    );
  }

  if (block.type === "callout") {
    return (
      <div className={styles.calloutBlock}>
        <input placeholder="Title" value={block.title} onChange={(event) => onChange({ title: event.target.value })} />
        <textarea placeholder="Text" value={block.text} onChange={(event) => onChange({ text: event.target.value })} />
      </div>
    );
  }

  if (block.type === "todo") {
    return (
      <label className={styles.todoBlock}>
        <input
          type="checkbox"
          checked={block.checked}
          onChange={(event) => onChange({ checked: event.target.checked })}
        />
        <input value={block.text} onChange={(event) => onChange({ text: event.target.value })} />
      </label>
    );
  }

  if (block.type === "card") {
    return (
      <div className={styles.cardBlock}>
        <input placeholder="Title" value={block.title} onChange={(event) => onChange({ title: event.target.value })} />
        <textarea placeholder="Text" value={block.text} onChange={(event) => onChange({ text: event.target.value })} />
      </div>
    );
  }

  if (block.type === "code") {
    return (
      <div className={styles.codeBlock}>
        <input value={block.language} onChange={(event) => onChange({ language: event.target.value })} />
        <textarea value={block.code} onChange={(event) => onChange({ code: event.target.value })} spellCheck={false} />
      </div>
    );
  }

  if (block.type === "image") {
    return <ImageBlock block={block} onChange={onChange} />;
  }

  if (block.type === "artifact") {
    const artifact = artifacts.find((item) => item.id === block.artifactId) ?? artifacts[0];
    return (
      <div className={styles.artifactEmbed}>
        <div className={styles.artifactEmbedTitle}>
          <strong>{artifact?.title ?? "HTML artifact"}</strong>
          <small>AI-created artifact</small>
        </div>
        <div className={styles.embedHeader}>
          <select value={artifact?.id ?? ""} onChange={(event) => onChange({ artifactId: event.target.value })}>
            {artifacts.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={180}
            max={1200}
            value={block.height}
            onChange={(event) => onChange({ height: Number(event.target.value) })}
          />
        </div>
        <input value={block.note} onChange={(event) => onChange({ note: event.target.value })} />
        {artifact && (
          <iframe
            src={artifact.entryUrl || toFileAssetUrl(artifact.filePath)}
            title={artifact.title}
            sandbox="allow-scripts allow-forms allow-popups"
            style={{ height: block.height }}
          />
        )}
      </div>
    );
  }

  if (block.type === "divider") return <hr className={styles.dividerBlock} />;

  if (block.type === "quote") {
    return (
      <blockquote className={styles.quoteBlock}>
        <textarea value={block.text} onChange={(event) => onChange({ text: event.target.value })} />
      </blockquote>
    );
  }

  if (block.type === "table") {
    return <TableBlock block={block} onChange={onChange} />;
  }

  if (block.type === "chart") {
    return <ChartBlock block={block} onChange={onChange} />;
  }

  if (block.type === "canvas") {
    return <CanvasBlock block={block} onChange={onChange} />;
  }

  if (block.type === "mermaid") {
    return <MermaidBlock block={block} onChange={onChange} />;
  }

  if (block.type === "latex") {
    return <LatexBlock block={block} onChange={onChange} />;
  }

  if (block.type === "interactive") return <div className={styles.interactiveBlock} />;

  if (block.type === "custom-html") {
    return <CustomHtmlBlock block={block} onChange={onChange} />;
  }

  if (block.type === "timeline") {
    return <TimelineBlock block={block} onChange={onChange} />;
  }

  if (block.type === "metric-card") {
    return (
      <div className={styles.metricBlock}>
        <input placeholder="Label" value={block.label} onChange={(event) => onChange({ label: event.target.value })} />
        <input placeholder="Value" value={block.value} onChange={(event) => onChange({ value: event.target.value })} />
        <input placeholder="Delta" value={block.delta} onChange={(event) => onChange({ delta: event.target.value })} />
      </div>
    );
  }

  if (block.type === "gallery") {
    return (
      <div className={styles.galleryBlock}>
        {block.images.map((image, index) => (
          <figure key={image.id}>
            <img src={image.src} alt={image.caption} />
            <input
              value={image.caption}
              onChange={(event) => {
                const images = [...block.images];
                images[index] = { ...image, caption: event.target.value };
                onChange({ images });
              }}
            />
          </figure>
        ))}
      </div>
    );
  }

  return null;
}

function ImageBlock({
  block,
  onChange,
}: {
  block: Extract<AtriaBlock, { type: "image" }>;
  onChange(patch: Partial<AtriaBlock>): void;
}) {
  return (
    <div
      className={styles.imageBlock}
      onPaste={(event) => {
        const item = Array.from(event.clipboardData.items).find((clipboardItem) =>
          clipboardItem.type.startsWith("image/"),
        );
        const file = item?.getAsFile();
        if (!file) return;
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") onChange({ src: reader.result });
        };
        reader.readAsDataURL(file);
      }}
    >
      {block.src && (
        <img
          src={block.src}
          alt={block.caption}
          style={{ width: block.width, maxWidth: "100%" }}
        />
      )}
      <input placeholder="Image URL" value={block.src} onChange={(event) => onChange({ src: event.target.value })} />
      <input placeholder="Caption" value={block.caption} onChange={(event) => onChange({ caption: event.target.value })} />
      <input
        type="range"
        min={120}
        max={1200}
        value={block.width}
        onChange={(event) => onChange({ width: Number(event.target.value) })}
      />
    </div>
  );
}

function TableBlock({
  block,
  onChange,
}: {
  block: Extract<AtriaBlock, { type: "table" }>;
  onChange(patch: Partial<AtriaBlock>): void;
}) {
  const columns = block.columns.length ? block.columns : ["Column 1", "Column 2"];
  const rows = block.rows.length ? block.rows : [["", ""]];

  return (
    <div className={styles.tableBlockWrap}>
      <div className={styles.inlineActions}>
        <button onClick={() => onChange({ rows: [...rows, columns.map(() => "")] })}>+ row</button>
        <button onClick={() => onChange({ columns: [...columns, `Column ${columns.length + 1}`], rows: rows.map((row) => [...row, ""]) })}>
          + col
        </button>
      </div>
      <table className={styles.tableBlock}>
        <thead>
          <tr>
            {columns.map((column, columnIndex) => (
              <th key={columnIndex}>
                <input
                  value={column}
                  onChange={(event) => {
                    const nextColumns = [...columns];
                    nextColumns[columnIndex] = event.target.value;
                    onChange({ columns: nextColumns });
                  }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((_, cellIndex) => (
                <td key={cellIndex}>
                  <input
                    value={row[cellIndex] ?? ""}
                    onChange={(event) => {
                      const nextRows = rows.map((item) => [...item]);
                      nextRows[rowIndex]![cellIndex] = event.target.value;
                      onChange({ rows: nextRows });
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartBlock({
  block,
  onChange,
}: {
  block: Extract<AtriaBlock, { type: "chart" }>;
  onChange(patch: Partial<AtriaBlock>): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => JSON.stringify(block.series, null, 2));
  const keys = useMemo(
    () =>
      Array.from(
        new Set(block.series.flatMap((row) => Object.keys(row).filter((key) => key !== "name" && typeof row[key] === "number"))),
      ),
    [block.series],
  );

  return (
    <div className={styles.chartBlock}>
      <div className={styles.inlineActions}>
        <select value={block.chartType} onChange={(event) => onChange({ chartType: event.target.value as typeof block.chartType })}>
          <option value="line">line</option>
          <option value="bar">bar</option>
          <option value="area">area</option>
          <option value="pie">pie</option>
        </select>
        <button onClick={() => setEditing((value) => !value)}>{editing ? "preview" : "data"}</button>
      </div>
      {editing ? (
        <textarea
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            try {
              const parsed = JSON.parse(draft);
              if (Array.isArray(parsed)) onChange({ series: parsed });
            } catch {
              setDraft(JSON.stringify(block.series, null, 2));
            }
          }}
        />
      ) : block.series.length && keys.length ? (
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={block.series}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            {keys.map((key) => (
              <Line key={key} type="monotone" dataKey={key} stroke="#2f80ed" strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className={styles.emptyBlock}>No chart data</div>
      )}
    </div>
  );
}

function CanvasBlock({
  block,
  onChange,
}: {
  block: Extract<AtriaBlock, { type: "canvas" }>;
  onChange(patch: Partial<AtriaBlock>): void;
}) {
  const elements = (block.elements as CanvasElement[]).length ? (block.elements as CanvasElement[]) : [];
  const [dragging, setDragging] = useState<string | null>(null);

  function updateElement(id: string, patch: Partial<CanvasElement>) {
    onChange({ elements: elements.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    updateElement(dragging, {
      x: Math.max(0, Math.round(event.clientX - rect.left - 54)),
      y: Math.max(0, Math.round(event.clientY - rect.top - 22)),
    });
  }

  return (
    <div className={styles.canvasBlock}>
      <div className={styles.inlineActions}>
        <button
          onClick={() =>
            onChange({
              elements: [
                ...elements,
                { id: crypto.randomUUID(), x: 24, y: 24 + elements.length * 34, text: "Node" },
              ],
            })
          }
        >
          + node
        </button>
      </div>
      <div
        className={styles.canvasStage}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        {elements.map((item) => (
          <div
            key={item.id}
            className={styles.canvasNode}
            style={{ left: item.x, top: item.y }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(item.id);
            }}
          >
            <input value={item.text} onChange={(event) => updateElement(item.id, { text: event.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MermaidBlock({
  block,
  onChange,
}: {
  block: Extract<AtriaBlock, { type: "mermaid" }>;
  onChange(patch: Partial<AtriaBlock>): void;
}) {
  const [editing, setEditing] = useState(false);
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (editing) return;
    mermaid.initialize({ startOnLoad: false, theme: "neutral" });
    void mermaid
      .render(`mermaid-${block.id.replace(/[^a-z0-9]/gi, "")}`, block.code)
      .then((result) => setHtml(result.svg))
      .catch(() => setHtml(""));
  }, [block.code, block.id, editing]);

  return (
    <div className={styles.mermaidBlock} onDoubleClick={() => setEditing(true)}>
      <div className={styles.inlineActions}>
        <button onClick={() => setEditing((value) => !value)}>{editing ? "preview" : "edit"}</button>
      </div>
      {editing ? (
        <textarea value={block.code} onChange={(event) => onChange({ code: event.target.value })} spellCheck={false} />
      ) : (
        <div className={styles.renderedBlock} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

function LatexBlock({
  block,
  onChange,
}: {
  block: Extract<AtriaBlock, { type: "latex" }>;
  onChange(patch: Partial<AtriaBlock>): void;
}) {
  const [editing, setEditing] = useState(false);
  const html = katex.renderToString(block.formula || " ", {
    displayMode: block.display,
    throwOnError: false,
  });

  return (
    <div className={styles.latexBlock} onDoubleClick={() => setEditing(true)}>
      <div className={styles.inlineActions}>
        <button onClick={() => setEditing((value) => !value)}>{editing ? "preview" : "edit"}</button>
      </div>
      {editing ? (
        <input value={block.formula} onChange={(event) => onChange({ formula: event.target.value })} />
      ) : (
        <div className={styles.renderedBlock} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

function CustomHtmlBlock({
  block,
  onChange,
}: {
  block: Extract<AtriaBlock, { type: "custom-html" }>;
  onChange(patch: Partial<AtriaBlock>): void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={styles.customHtmlBlock} onDoubleClick={() => setEditing(true)}>
      <div className={styles.inlineActions}>
        <button onClick={() => setEditing((value) => !value)}>{editing ? "preview" : "edit"}</button>
      </div>
      {editing ? (
        <textarea value={block.html} onChange={(event) => onChange({ html: event.target.value })} />
      ) : (
        <iframe srcDoc={block.html} sandbox={block.sandbox ? "" : undefined} title={block.id} />
      )}
    </div>
  );
}

function TimelineBlock({
  block,
  onChange,
}: {
  block: Extract<AtriaBlock, { type: "timeline" }>;
  onChange(patch: Partial<AtriaBlock>): void;
}) {
  return (
    <div className={styles.timelineBlock}>
      <div className={styles.inlineActions}>
        <button
          onClick={() =>
            onChange({
              items: [...block.items, { at: new Date().toISOString().slice(0, 10), title: "", detail: "" }],
            })
          }
        >
          + item
        </button>
      </div>
      {block.items.map((item, index) => (
        <div key={index}>
          <input
            value={item.at}
            onChange={(event) => {
              const items = [...block.items];
              items[index] = { ...item, at: event.target.value };
              onChange({ items });
            }}
          />
          <input
            value={item.title}
            onChange={(event) => {
              const items = [...block.items];
              items[index] = { ...item, title: event.target.value };
              onChange({ items });
            }}
          />
          <textarea
            value={item.detail}
            onChange={(event) => {
              const items = [...block.items];
              items[index] = { ...item, detail: event.target.value };
              onChange({ items });
            }}
          />
        </div>
      ))}
    </div>
  );
}
