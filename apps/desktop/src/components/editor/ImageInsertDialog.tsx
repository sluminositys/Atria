import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { Image as ImageIcon, Link, Upload, X } from "lucide-react";
import styles from "../../app/App.module.css";

interface ImageInsertDialogProps {
  open: boolean;
  error?: string;
  onClose(): void;
  onClearError?(): void;
  onInsertUrl(src: string): boolean | void;
  onInsertFile(file: File): Promise<boolean | void> | boolean | void;
}

export function ImageInsertDialog({ open, error, onClose, onClearError, onInsertUrl, onInsertFile }: ImageInsertDialogProps) {
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  async function insertFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    onClearError?.();
    await onInsertFile(file);
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const file = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void insertFile(file);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
    if (file) void insertFile(file);
  }

  return (
    <div className={styles.dialogBackdrop} onMouseDown={onClose}>
      <section
        className={[styles.imageDialog, dragging ? styles.imageDialogDragging : ""].join(" ")}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onPaste={handlePaste}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <header>
          <div>
            <strong>Insert Image</strong>
            <span>Choose, paste, drop, or use a URL</span>
          </div>
          <button title="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <button className={styles.filePickButton} onClick={() => fileInputRef.current?.click()}>
          <Upload size={17} />
          <span>Choose local image</span>
        </button>
        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void insertFile(file);
            event.currentTarget.value = "";
          }}
        />
        <div className={styles.imageDropTarget}>
          <ImageIcon size={18} />
          <span>Drop or paste image here</span>
        </div>
        <label className={styles.urlField}>
          <Link size={15} />
          <input value={url} placeholder="https://..." onChange={(event) => setUrl(event.target.value)} autoFocus />
          <button
            disabled={!url.trim()}
            onClick={() => {
              const src = url.trim();
              if (!src) return;
              const inserted = onInsertUrl(src);
              if (inserted !== false) setUrl("");
            }}
          >
            <ImageIcon size={15} />
          </button>
        </label>
        {error && <div className={styles.dialogError}>{error}</div>}
      </section>
    </div>
  );
}
