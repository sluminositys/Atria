import { TableView } from "@tiptap/extension-table";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView, NodeView, ViewMutationRecord } from "@tiptap/pm/view";
import { clamp, cssDimension, type NodeAlign, type NodeLayout } from "./nodeLayout";
import styles from "../../../app/App.module.css";

function style(name: string): string {
  return styles[name as keyof typeof styles] ?? name;
}

export class TableInteractionView extends TableView implements NodeView {
  private readonly view: EditorView;
  private readonly surface: HTMLElement;
  private readonly chrome: HTMLElement;
  private readonly resizeHandles: HTMLElement;

  constructor(node: ProseMirrorNode, cellMinWidth: number, view: EditorView) {
    super(node, cellMinWidth);
    this.view = view;
    this.dom.classList.add(style("nodeInteractionLayer"), style("tableInteractionLayer"));
    this.table.classList.add(style("documentTable"));

    this.surface = document.createElement("section");
    this.surface.className = style("documentTableSurface");
    this.dom.insertBefore(this.surface, this.table);
    this.surface.appendChild(this.table);

    this.chrome = this.createChrome();
    this.resizeHandles = this.createResizeHandles();
    this.dom.append(this.chrome, this.resizeHandles);
    this.syncLayout(node);
  }

  override update(node: ProseMirrorNode): boolean {
    const updated = super.update(node);
    if (updated) this.syncLayout(node);
    return updated;
  }

  selectNode() {
    this.dom.classList.add(style("nodeInteractionSelected"));
  }

  deselectNode() {
    this.dom.classList.remove(style("nodeInteractionSelected"));
  }

  override ignoreMutation(mutation: ViewMutationRecord): boolean {
    const target = mutation.target;
    if (target === this.dom || target === this.surface || this.chrome.contains(target) || this.resizeHandles.contains(target)) {
      return true;
    }
    return super.ignoreMutation(mutation);
  }

  private createChrome(): HTMLElement {
    const chrome = document.createElement("div");
    chrome.className = style("nodeChrome");
    chrome.contentEditable = "false";

    const drag = document.createElement("button");
    drag.className = style("nodeDragHandle");
    drag.type = "button";
    drag.title = "Drag table";
    drag.draggable = true;
    drag.setAttribute("data-drag-handle", "");
    const glyph = document.createElement("span");
    glyph.className = style("tableDragGlyph");
    glyph.setAttribute("aria-hidden", "true");
    drag.appendChild(glyph);
    drag.addEventListener("mousedown", () => this.selectTableNode());

    const more = document.createElement("button");
    more.className = style("nodeMoreButton");
    more.type = "button";
    more.title = "Table actions";
    const moreGlyph = document.createElement("span");
    moreGlyph.className = style("tableMoreGlyph");
    moreGlyph.setAttribute("aria-hidden", "true");
    more.appendChild(moreGlyph);
    more.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.selectTableNode();
    });

    chrome.append(drag, more);
    return chrome;
  }

  private createResizeHandles(): HTMLElement {
    const handles = document.createElement("div");
    handles.className = style("nodeResizeHandles");
    handles.contentEditable = "false";
    handles.append(this.createResizeHandle("w"), this.createResizeHandle("e"));
    return handles;
  }

  private createResizeHandle(edge: "w" | "e"): HTMLButtonElement {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = [style("nodeResizeHandle"), style(`nodeResizeHandle_${edge}`)].join(" ");
    handle.title = edge === "w" ? "Resize table from left" : "Resize table from right";
    handle.addEventListener("pointerdown", (event) => this.startWidthResize(edge, event));
    return handle;
  }

  private startWidthResize(edge: "w" | "e", event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.selectTableNode();

    const rect = this.dom.getBoundingClientRect();
    const editorRect = this.view.dom.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = rect.width;
    const maxWidth = Math.min(1280, Math.max(360, editorRect.width - 24));
    let nextWidth = startWidth;

    document.body.classList.add("atria-resizing");

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const rawWidth = edge === "w" ? startWidth - dx : startWidth + dx;
      nextWidth = Math.round(clamp(rawWidth, 320, maxWidth));
      this.dom.style.width = `${nextWidth}px`;
    };

    const onEnd = () => {
      document.body.classList.remove("atria-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      this.updateTableAttrs({ width: nextWidth });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
    window.addEventListener("pointercancel", onEnd, { once: true });
  }

  private selectTableNode() {
    const pos = this.findTablePos();
    if (pos === null) return;
    this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
  }

  private updateTableAttrs(attrs: Record<string, unknown>) {
    const pos = this.findTablePos();
    if (pos === null) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "table") return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
  }

  private findTablePos(): number | null {
    const contentPos = this.view.posAtDOM(this.contentDOM, 0);
    const $pos = this.view.state.doc.resolve(contentPos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name === "table") return $pos.before(depth);
    }
    const fallback = contentPos - 1;
    return this.view.state.doc.nodeAt(fallback)?.type.name === "table" ? fallback : null;
  }

  private syncLayout(node: ProseMirrorNode) {
    const attrs = node.attrs as { layout?: NodeLayout; align?: NodeAlign; width?: number | string | null };
    const layout = attrs.layout ?? "normal";
    const align = attrs.align ?? "center";
    const width = cssDimension(attrs.width);
    this.dom.classList.remove(
      style("nodeFrameLayout_normal"),
      style("nodeFrameLayout_wide"),
      style("nodeFrameLayout_full"),
      style("nodeFrameAlign_left"),
      style("nodeFrameAlign_center"),
      style("nodeFrameAlign_right"),
    );
    this.dom.classList.add(style(`nodeFrameLayout_${layout}`), style(`nodeFrameAlign_${align}`));
    if (width) {
      this.dom.style.width = width;
      this.dom.style.maxWidth = "100%";
    } else {
      this.dom.style.removeProperty("width");
      this.dom.style.removeProperty("max-width");
    }
  }
}
