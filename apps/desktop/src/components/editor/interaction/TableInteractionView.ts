import { TableView } from "@tiptap/extension-table";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView, NodeView, ViewMutationRecord } from "@tiptap/pm/view";
import { cssDimension, dimensionToNumber, horizontalResize, type NodeAlign, type NodeLayout } from "./nodeLayout";
import styles from "../../../app/App.module.css";

function style(name: string): string {
  return styles[name as keyof typeof styles] ?? name;
}

export class TableInteractionView extends TableView implements NodeView {
  private readonly view: EditorView;
  private readonly surface: HTMLElement;
  private readonly chrome: HTMLElement;
  private readonly resizeHandles: HTMLElement;
  private readonly moreButton: HTMLButtonElement;
  private readonly actionMenu: HTMLElement;
  private currentNode: ProseMirrorNode;

  constructor(node: ProseMirrorNode, cellMinWidth: number, view: EditorView) {
    super(node, cellMinWidth);
    this.view = view;
    this.currentNode = node;
    this.dom.classList.add(style("nodeInteractionLayer"), style("tableInteractionLayer"));
    this.table.classList.add(style("documentTable"));

    this.surface = document.createElement("section");
    this.surface.className = style("documentTableSurface");
    this.dom.insertBefore(this.surface, this.table);
    this.surface.appendChild(this.table);

    const chrome = this.createChrome();
    this.chrome = chrome.element;
    this.moreButton = chrome.moreButton;
    this.actionMenu = this.createActionMenu();
    this.resizeHandles = this.createResizeHandles();
    this.dom.append(this.chrome, this.actionMenu, this.resizeHandles);
    this.syncLayout(node);
  }

  override update(node: ProseMirrorNode): boolean {
    const updated = super.update(node);
    if (updated) {
      this.currentNode = node;
      this.syncLayout(node);
    }
    return updated;
  }

  selectNode() {
    this.dom.classList.add(style("nodeInteractionSelected"));
  }

  deselectNode() {
    this.dom.classList.remove(style("nodeInteractionSelected"));
    this.closeActionMenu();
  }

  override ignoreMutation(mutation: ViewMutationRecord): boolean {
    const target = mutation.target;
    if (
      target === this.dom
      || target === this.surface
      || this.chrome.contains(target)
      || this.actionMenu.contains(target)
      || this.resizeHandles.contains(target)
    ) {
      return true;
    }
    return super.ignoreMutation(mutation);
  }

  destroy() {
    this.removeMenuListeners();
  }

  private createChrome(): { element: HTMLElement; moreButton: HTMLButtonElement } {
    const chrome = document.createElement("div");
    chrome.className = style("nodeChrome");
    chrome.contentEditable = "false";

    const drag = document.createElement("button");
    drag.className = style("nodeDragHandle");
    drag.type = "button";
    drag.title = "Drag table";
    drag.setAttribute("aria-label", "Drag table");
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
    more.setAttribute("aria-label", "Table actions");
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", "false");
    const moreGlyph = document.createElement("span");
    moreGlyph.className = style("tableMoreGlyph");
    moreGlyph.setAttribute("aria-hidden", "true");
    more.appendChild(moreGlyph);
    more.addEventListener("pointerdown", (event) => event.stopPropagation());
    more.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.selectTableNode();
      this.toggleActionMenu();
    });

    chrome.append(drag, more);
    return { element: chrome, moreButton: more };
  }

  private createActionMenu(): HTMLElement {
    const menu = document.createElement("div");
    menu.className = style("nodeMoreMenu");
    menu.hidden = true;
    menu.contentEditable = "false";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Table actions");
    menu.addEventListener("pointerdown", (event) => event.stopPropagation());
    menu.addEventListener("mousedown", (event) => event.preventDefault());
    menu.addEventListener("keydown", (event) => this.handleMenuKeyDown(event));

    menu.append(
      this.createMenuLabel("Layout"),
      this.createChoiceRow(["normal", "wide", "full"], "layout"),
      this.createMenuLabel("Align"),
      this.createChoiceRow(["left", "center", "right"], "align"),
      this.createMenuLabel("Actions"),
      this.createMenuButton("Duplicate", () => this.duplicateTable()),
      this.createMenuButton("Delete", () => this.deleteTable()),
    );
    return menu;
  }

  private createMenuLabel(text: string): HTMLLabelElement {
    const label = document.createElement("label");
    label.textContent = text;
    return label;
  }

  private createChoiceRow(values: string[], attribute: "layout" | "align"): HTMLDivElement {
    const row = document.createElement("div");
    values.forEach((value) => {
      const button = this.createMenuButton(value, () => {
        this.updateTableAttrs({ [attribute]: value });
        this.closeActionMenu(true);
      });
      button.dataset.tableChoice = `${attribute}:${value}`;
      button.setAttribute("role", "menuitemradio");
      row.appendChild(button);
    });
    return row;
  }

  private createMenuButton(text: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = style("nodeTool");
    button.setAttribute("role", "menuitem");
    const label = document.createElement("span");
    label.textContent = text;
    button.appendChild(label);
    button.addEventListener("click", action);
    return button;
  }

  private toggleActionMenu() {
    if (this.actionMenu.hidden) this.openActionMenu();
    else this.closeActionMenu(true);
  }

  private openActionMenu() {
    this.syncActionMenu();
    this.actionMenu.hidden = false;
    this.moreButton.setAttribute("aria-expanded", "true");
    window.addEventListener("pointerdown", this.handleOutsidePointer);
    window.addEventListener("keydown", this.handleWindowKeyDown);
    window.requestAnimationFrame(() => this.actionMenu.querySelector<HTMLButtonElement>("button")?.focus());
  }

  private closeActionMenu(restoreFocus = false) {
    if (this.actionMenu.hidden) return;
    this.actionMenu.hidden = true;
    this.moreButton.setAttribute("aria-expanded", "false");
    this.removeMenuListeners();
    if (restoreFocus) this.moreButton.focus();
  }

  private removeMenuListeners() {
    window.removeEventListener("pointerdown", this.handleOutsidePointer);
    window.removeEventListener("keydown", this.handleWindowKeyDown);
  }

  private readonly handleOutsidePointer = (event: PointerEvent) => {
    const target = event.target as Node;
    if (!this.actionMenu.contains(target) && !this.moreButton.contains(target)) this.closeActionMenu();
  };

  private readonly handleWindowKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeActionMenu(true);
    }
  };

  private handleMenuKeyDown(event: KeyboardEvent) {
    const buttons = Array.from(this.actionMenu.querySelectorAll<HTMLButtonElement>("button"));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !buttons.length) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  private syncActionMenu() {
    const attrs = this.currentNode.attrs as { layout?: NodeLayout; align?: NodeAlign };
    this.actionMenu.querySelectorAll<HTMLButtonElement>("[data-table-choice]").forEach((button) => {
      const [attribute, value] = button.dataset.tableChoice?.split(":") ?? [];
      const active = attrs[attribute as "layout" | "align"] === value;
      button.className = style(active ? "nodeToolActive" : "nodeTool");
      button.setAttribute("aria-checked", String(active));
    });
  }

  private duplicateTable() {
    const pos = this.findTablePos();
    const node = pos === null ? null : this.view.state.doc.nodeAt(pos);
    if (pos === null || !node) return;
    const attrs = { ...node.attrs, atriaId: crypto.randomUUID() };
    const duplicate = node.type.create(attrs, node.content, node.marks);
    const duplicatePos = pos + node.nodeSize;
    const transaction = this.view.state.tr.insert(duplicatePos, duplicate);
    this.view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, duplicatePos)));
    this.closeActionMenu();
  }

  private deleteTable() {
    const pos = this.findTablePos();
    const node = pos === null ? null : this.view.state.doc.nodeAt(pos);
    if (pos === null || !node) return;
    this.closeActionMenu();
    this.view.dispatch(this.view.state.tr.delete(pos, pos + node.nodeSize));
    this.view.focus();
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
    const tablePosition = this.findTablePos();
    const tableNode = tablePosition === null ? null : this.view.state.doc.nodeAt(tablePosition);
    const attrs = tableNode?.attrs as { align?: NodeAlign; offsetX?: number | string | null } | undefined;
    const align = attrs?.align ?? "center";
    const startOffsetX = dimensionToNumber(attrs?.offsetX) ?? 0;
    let nextWidth = startWidth;
    let nextOffsetX = startOffsetX;

    document.body.classList.add("atria-resizing");

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const resized = horizontalResize(startWidth, startOffsetX, dx, edge, align, 320, maxWidth);
      nextWidth = resized.size;
      nextOffsetX = resized.offset;
      this.dom.style.width = `${nextWidth}px`;
      this.dom.style.translate = `${nextOffsetX}px 0`;
    };

    const onEnd = () => {
      document.body.classList.remove("atria-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      this.updateTableAttrs({ width: nextWidth, offsetX: nextOffsetX });
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
    const attrs = node.attrs as {
      atriaId?: string | null;
      layout?: NodeLayout;
      align?: NodeAlign;
      width?: number | string | null;
      offsetX?: number | string | null;
    };
    const layout = attrs.layout ?? "normal";
    const align = attrs.align ?? "center";
    const width = cssDimension(attrs.width);
    const offsetX = dimensionToNumber(attrs.offsetX) ?? 0;
    if (attrs.atriaId) this.dom.setAttribute("data-atria-id", attrs.atriaId);
    else this.dom.removeAttribute("data-atria-id");
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
    if (offsetX) this.dom.style.translate = `${Math.round(offsetX)}px 0`;
    else this.dom.style.removeProperty("translate");
  }
}
