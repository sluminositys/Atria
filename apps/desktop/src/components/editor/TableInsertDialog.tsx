import { useState } from "react";
import { Table2, X } from "lucide-react";
import styles from "../../app/App.module.css";

interface TableInsertDialogProps {
  open: boolean;
  onClose(): void;
  onInsert(rows: number, columns: number, headerRow: boolean): void;
}

const gridRows = 8;
const gridColumns = 10;

export function TableInsertDialog({ open, onClose, onInsert }: TableInsertDialogProps) {
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [headerRow, setHeaderRow] = useState(true);

  if (!open) return null;

  return (
    <div className={styles.dialogBackdrop} onMouseDown={onClose}>
      <section className={styles.tableInsertDialog} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>Insert table</strong>
            <span>{rows} x {columns}</span>
          </div>
          <button title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className={styles.tableSizeGrid} role="grid" aria-label="Table size">
          {Array.from({ length: gridRows * gridColumns }, (_, index) => {
            const cellRow = Math.floor(index / gridColumns) + 1;
            const cellColumn = (index % gridColumns) + 1;
            const active = cellRow <= rows && cellColumn <= columns;
            return (
              <button
                key={`${cellRow}:${cellColumn}`}
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
                  onInsert(cellRow, cellColumn, headerRow);
                  onClose();
                }}
              />
            );
          })}
        </div>
        <label className={styles.tableHeaderOption}>
          <input type="checkbox" checked={headerRow} onChange={(event) => setHeaderRow(event.target.checked)} />
          <Table2 size={15} />
          <span>Header row</span>
        </label>
      </section>
    </div>
  );
}
