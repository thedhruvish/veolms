import { Warning, X } from "@phosphor-icons/react";
import { useEffect } from "react";

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal({
  isOpen,
  title = "Delete Confirmation",
  message = "Are you sure you want to delete this item? This action cannot be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
}: ConfirmDeleteModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="delete-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      <div
        className="delete-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="delete-modal-close-btn"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={16} />
        </button>

        <div className="delete-modal-header">
          <div className="delete-modal-icon">
            <Warning size={22} weight="bold" />
          </div>
          <div>
            <h3 id="delete-modal-title">{title}</h3>
            <p>{message}</p>
          </div>
        </div>

        <div className="delete-modal-actions">
          <button
            type="button"
            className="delete-modal-btn-cancel"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="delete-modal-btn-confirm"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
