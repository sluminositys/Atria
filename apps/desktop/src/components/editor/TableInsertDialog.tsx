import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Table2, X } from "lucide-react";
import styles from "../../app/App.module.css";

interface TableInsertDialogProps {
  open: boolean;
  onClose(): void;
  onInsert(rows: number, columns: number, headerRow: boolean): void;
}

const gridRows = 8;
const gridColumns = 10;
const maximumDimension = 20;

export function TableInsertDialog({ open, onClose, onInsert }: TableInsertDialogProps) {
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [headerRow, setHeaderRow] = useState(true);
  const dialogRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setRows(3);
    setColumns(3);
    setHeaderRow(true);
    const frame = window.requestAnimationFrame(() => focusGridCell(3, 3));
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!open) return null;

  function updateRows(value: string) {
    setRows(clampDimension(value));
  }

  function updateColumns(value: string) {
    setColumns(clampDimension(value));
  }

  function insertTable() {
    onInsert(rows, columns, headerRow);
    onClose();
  }

  function focusGridCell(row: number, column: number) {
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-table-cell="${row}:${column}"]`)
      ?.focus();
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLButtonElement>, row: number, column: number) {
    let nextRow = row;
    let nextColumn = column;
    if (event.key === "ArrowUp") nextRow -= 1;
    else if (event.key === "ArrowDown") nextRow += 1;
    else if (event.key === "ArrowLeft") nextColumn -= 1;
    else if (event.key === "ArrowRight") nextColumn += 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      insertTable();
      return;
    } else return;
    event.preventDefault();
    nextRow = Math.min(gridRows, Math.max(1, nextRow));
    nextColumn = Math.min(gridColumns, Math.max(1, nextColumn));
    setRows(nextRow);
    setColumns(nextColumn);
    focusGridCell(nextRow, nextColumn);
  }

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [],
    ).filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={styles.dialogBackdrop} onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={styles.tableInsertDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapFocus}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <strong id={titleId}>Insert table</strong>
            <span>{rows} x {columns}</span>
          </div>
          <button type="button" aria-label="Close table dialog" title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div ref={gridRef} className={styles.tableSizeGrid} role="grid" aria-label="Table size">
          {Array.from({ length: gridRows * gridColumns }, (_, index) => {
            const cellRow = Math.floor(index / gridColumns) + 1;
            const cellColumn = (index % gridColumns) + 1;
            const active = cellRow <= rows && cellColumn <= columns;
            const current = cellRow === rows && cellColumn === columns;
            return (
              <button
                key={`${cellRow}:${cellColumn}`}
                type="button"
                role="gridcell"
                aria-label={`${cellRow} rows, ${cellColumn} columns`}
                aria-selected={active}
                data-table-cell={`${cellRow}:${cellColumn}`}
                tabIndex={current ? 0 : -1}
                className={active ? styles.tableSizeCellActive : styles.tableSizeCell}
                title={`${cellRow} rows, ${cellColumn} columns`}
                onMouseEnter={() => {
                  setRows(cellRow);
                  setColumns(cellColumn);
                }}
                onFocus={() => {
                  setRows(cellRow);
                  setColumns(cellColumn);
                }}
                onClick={() => {
                  setRows(cellRow);
                  setColumns(cellColumn);
                }}
                onKeyDown={(event) => handleGridKeyDown(event, cellRow, cellColumn)}
              />
            );
          })}
        </div>
        <div className={styles.tableDimensionFields}>
          <label>
            <span>Rows</span>
            <input type="number" min="1" max={maximumDimension} value={rows} onChange={(event) => updateRows(event.target.value)} />
          </label>
          <span aria-hidden="true">x</span>
          <label>
            <span>Columns</span>
            <input type="number" min="1" max={maximumDimension} value={columns} onChange={(event) => updateColumns(event.target.value)} />
          </label>
        </div>
        <label className={styles.tableHeaderOption}>
          <input type="checkbox" checked={headerRow} onChange={(event) => setHeaderRow(event.target.checked)} />
          <Table2 size={15} />
          <span>Header row</span>
        </label>
        <footer className={styles.tableDialogActions}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className={styles.tableDialogInsert} onClick={insertTable}>Insert table</button>
        </footer>
      </section>
    </div>
  );
}

function clampDimension(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(maximumDimension, Math.max(1, parsed));
}
