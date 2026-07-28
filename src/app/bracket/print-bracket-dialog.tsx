"use client";

import { useEffect } from "react";
import { FileText, Printer, X } from "lucide-react";
import styles from "./print-bracket-dialog.module.css";

export type PrintBracketMode = "blank" | "current";

export function PrintBracketDialog({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: PrintBracketMode) => void;
}) {
  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-bracket-title"
        aria-describedby="print-bracket-description"
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close print options"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className={styles.headingIcon}>
          <Printer size={23} aria-hidden="true" />
        </div>
        <h2 id="print-bracket-title">Print bracket</h2>
        <p id="print-bracket-description">
          Choose what you want included on the printed bracket.
        </p>

        <div className={styles.options}>
          <button
            type="button"
            onClick={() => onSelect("blank")}
            autoFocus
          >
            <FileText size={20} aria-hidden="true" />
            <span>
              <strong>Blank bracket</strong>
              <small>First-round teams with empty pick lines</small>
            </span>
          </button>
          <button type="button" onClick={() => onSelect("current")}>
            <Printer size={20} aria-hidden="true" />
            <span>
              <strong>Current bracket</strong>
              <small>Print the picks currently displayed</small>
            </span>
          </button>
        </div>

        <button type="button" className={styles.cancelButton} onClick={onClose}>
          Cancel
        </button>
      </section>
    </div>
  );
}
