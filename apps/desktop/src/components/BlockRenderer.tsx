import katex from "katex";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Artifact, AtriaBlock } from "@atria/schema";
import { RichTextBlock } from "./RichTextBlock";
import styles from "../app/App.module.css";
import "katex/dist/katex.min.css";

interface BlockRendererProps {
  block: AtriaBlock;
  artifacts: Artifact[];
  onChange(patch: Partial<AtriaBlock>): void;
}

export function BlockRenderer({ block, artifacts, onChange }: BlockRendererProps) {
  if (block.type === "heading") {
    return (
      <input
        className={styles.headingBlock}
        value={block.text}
        onChange={(event) => onChange({ text: event.target.value })}
      />
    );
  }

  if (block.type === "text") {
    return (
      <RichTextBlock
        value={block.richText}
        onChange={(richText) => onChange({ richText })}
      />
    );
  }

  if (block.type === "callout") {
    return (
      <div className={styles.calloutBlock}>
        <input value={block.title} onChange={(event) => onChange({ title: event.target.value })} />
        <textarea value={block.text} onChange={(event) => onChange({ text: event.target.value })} />
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
        <input value={block.title} onChange={(event) => onChange({ title: event.target.value })} />
        <textarea value={block.text} onChange={(event) => onChange({ text: event.target.value })} />
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
    return (
      <div className={styles.imageBlock}>
        {block.src && <img src={block.src} alt={block.caption} />}
        <input placeholder="Image URL" value={block.src} onChange={(event) => onChange({ src: event.target.value })} />
        <input placeholder="Caption" value={block.caption} onChange={(event) => onChange({ caption: event.target.value })} />
      </div>
    );
  }

  if (block.type === "artifact") {
    const artifact = artifacts.find((item) => item.id === block.artifactId) ?? artifacts[0];
    return (
      <div className={styles.artifactEmbed}>
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
            src={artifact.entryUrl}
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
    return (
      <table className={styles.tableBlock}>
        <thead>
          <tr>{block.columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (block.type === "chart") {
    const data = block.series.length
      ? block.series
      : [
          { name: "05-24", value: 0.62 },
          { name: "05-25", value: 0.68 },
          { name: "05-26", value: 0.71 },
          { name: "05-27", value: 0.73 },
          { name: "05-28", value: 0.78 },
        ];
    return (
      <div className={styles.chartBlock}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#2f80ed" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (block.type === "canvas") return <div className={styles.canvasBlock}>Canvas</div>;

  if (block.type === "mermaid") {
    return (
      <div className={styles.mermaidBlock}>
        <textarea value={block.code} onChange={(event) => onChange({ code: event.target.value })} />
      </div>
    );
  }

  if (block.type === "latex") {
    return (
      <div className={styles.latexBlock}>
        <input value={block.formula} onChange={(event) => onChange({ formula: event.target.value })} />
        <div dangerouslySetInnerHTML={{ __html: katex.renderToString(block.formula || " ", { throwOnError: false }) }} />
      </div>
    );
  }

  if (block.type === "interactive") return <div className={styles.interactiveBlock}>Interactive block</div>;

  if (block.type === "custom-html") {
    return (
      <div className={styles.customHtmlBlock}>
        <textarea value={block.html} onChange={(event) => onChange({ html: event.target.value })} />
        <iframe srcDoc={block.html} sandbox={block.sandbox ? "" : undefined} title={block.id} />
      </div>
    );
  }

  if (block.type === "timeline") {
    return (
      <div className={styles.timelineBlock}>
        {block.items.map((item) => (
          <div key={`${item.at}-${item.title}`}>
            <strong>{item.at}</strong>
            <span>{item.title}</span>
            <small>{item.detail}</small>
          </div>
        ))}
      </div>
    );
  }

  if (block.type === "metric-card") {
    return (
      <div className={styles.metricBlock}>
        <input value={block.label} onChange={(event) => onChange({ label: event.target.value })} />
        <strong>{block.value}</strong>
        <input value={block.value} onChange={(event) => onChange({ value: event.target.value })} />
        <small>{block.delta}</small>
      </div>
    );
  }

  if (block.type === "gallery") return <div className={styles.galleryBlock}>Gallery</div>;

  return null;
}

