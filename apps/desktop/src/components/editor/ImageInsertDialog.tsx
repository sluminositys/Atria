import { useRef, useState } from "react";
import { Image as ImageIcon, Link, Upload, X } from "lucide-react";
import styles from "../../app/App.module.css";

interface ImageInsertDialogProps {
  open: boolean;
  onClose(): void;
  onInsertUrl(src: string): void;
  onInsertFile(file: File): void;
}

export function ImageInsertDialog({ open, onClose, onInsertUrl, onInsertFile }: ImageInsertDialogProps) {
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  return (
    <div className={styles.dialogBackdrop} onMouseDown={onClose}>
      <section className={styles.imageDialog} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>Insert Image</strong>
            <span>Paste an image URL or choose a local image</span>
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
            onInsertFile(file);
            onClose();
          }}
        />
        <label className={styles.urlField}>
          <Link size={15} />
          <input value={url} placeholder="https://..." onChange={(event) => setUrl(event.target.value)} autoFocus />
          <button
            disabled={!url.trim()}
            onClick={() => {
              const src = url.trim();
              if (!src) return;
              onInsertUrl(src);
              setUrl("");
              onClose();
            }}
          >
            <ImageIcon size={15} />
          </button>
        </label>
      </section>
    </div>
  );
}
