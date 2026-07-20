import { useEffect, useRef } from "react";
import type { ComponentType } from "react";
import {
  CheckSquare,
  Clock3,
  Code2,
  PenTool,
  FileCode2,
  FileText,
  Gauge,
  Hash,
  Image,
  PanelTop,
  Quote,
  Sigma,
  Table2,
} from "lucide-react";
import styles from "../../app/App.module.css";

export type SlashCommand =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "todo"
  | "quote"
  | "code"
  | "callout"
  | "card"
  | "artifact"
  | "image"
  | "table"
  | "mermaid"
  | "inline-math"
  | "latex"
  | "html"
  | "drawing"
  | "metric-card"
  | "timeline";

export interface SlashMenuState {
  x: number;
  y: number;
  selectedIndex: number;
  query: string;
}

interface SlashCommandMenuProps {
  state: SlashMenuState | null;
  onSelect(command: SlashCommand): void;
}

const commands: Array<{
  command: SlashCommand;
  label: string;
  group: string;
  icon: ComponentType<{ size?: number }>;
}> = [
  { command: "paragraph", label: "Paragraph", group: "Basic", icon: FileText },
  { command: "heading-1", label: "Heading 1", group: "Basic", icon: Hash },
  { command: "heading-2", label: "Heading 2", group: "Basic", icon: Hash },
  { command: "heading-3", label: "Heading 3", group: "Basic", icon: Hash },
  { command: "todo", label: "Todo list", group: "Basic", icon: CheckSquare },
  { command: "quote", label: "Quote", group: "Basic", icon: Quote },
  { command: "code", label: "Code block", group: "Basic", icon: Code2 },
  { command: "callout", label: "Callout", group: "AI Workspace", icon: FileText },
  { command: "card", label: "Result Card", group: "AI Workspace", icon: PanelTop },
  { command: "artifact", label: "Artifact", group: "AI Workspace", icon: FileCode2 },
  { command: "image", label: "Image", group: "Media", icon: Image },
  { command: "table", label: "Table", group: "Media", icon: Table2 },
  { command: "mermaid", label: "Mermaid", group: "Media", icon: Hash },
  { command: "inline-math", label: "Inline formula", group: "Media", icon: Sigma },
  { command: "latex", label: "Display formula", group: "Media", icon: Sigma },
  { command: "html", label: "Custom HTML", group: "Media", icon: Code2 },
  { command: "drawing", label: "Drawing", group: "Media", icon: PenTool },
  { command: "metric-card", label: "Metric", group: "AI Workspace", icon: Gauge },
  { command: "timeline", label: "Timeline", group: "AI Workspace", icon: Clock3 },
];

export function slashCommandCount(query = ""): number {
  return filteredCommands(query).length;
}

export function SlashCommandMenu({ state, onSelect }: SlashCommandMenuProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [state?.selectedIndex]);

  if (!state) return null;

  const visibleCommands = filteredCommands(state.query);
  let lastGroup = "";
  return (
    <div className={styles.slashMenu} style={{ left: state.x, top: state.y }}>
      {visibleCommands.map((item, index) => {
        const Icon = item.icon;
        const showGroup = item.group !== lastGroup;
        lastGroup = item.group;
        return (
          <div key={item.command}>
            {showGroup && <label>{item.group}</label>}
            <button
              ref={index === state.selectedIndex ? selectedRef : undefined}
              className={index === state.selectedIndex ? styles.slashItemActive : styles.slashItem}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item.command);
              }}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          </div>
        );
      })}
      {!visibleCommands.length && <div className={styles.slashEmpty}>No matching blocks</div>}
    </div>
  );
}

export function slashCommandAt(index: number, query = ""): SlashCommand {
  return filteredCommands(query)[index]?.command ?? commands[0]!.command;
}

function filteredCommands(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands;
  return commands.filter((item) =>
    `${item.label} ${item.group} ${item.command}`.toLowerCase().includes(normalized),
  );
}
