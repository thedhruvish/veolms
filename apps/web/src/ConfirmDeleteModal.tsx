import { Trash, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  holdDurationMs?: number;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal({
  isOpen,
  title = "Delete Confirmation",
  message = "Are you sure you want to delete this item? This action cannot be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  holdDurationMs = 1200,
  onConfirm,
  onClose,
}: ConfirmDeleteModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  const holdTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const resetHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      cancelAnimationFrame(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    startTimeRef.current = null;
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  const triggerConfirm = useCallback(() => {
    resetHold();
    onConfirm();
    onClose();
  }, [resetHold, onConfirm, onClose]);

  const startHold = useCallback(() => {
    if (holdTimerRef.current !== null) return;
    setIsHolding(true);
    startTimeRef.current = performance.now();

    const update = (now: number) => {
      if (!startTimeRef.current) return;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(1, elapsed / holdDurationMs);
      setHoldProgress(progress);

      if (progress >= 1) {
        triggerConfirm();
      } else {
        holdTimerRef.current = requestAnimationFrame(update);
      }
    };

    holdTimerRef.current = requestAnimationFrame(update);
  }, [holdDurationMs, triggerConfirm]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        resetHold();
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      resetHold();
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      resetHold();
    };
  }, [isOpen, onClose, resetHold]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="delete-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      aria-describedby="delete-modal-description"
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
          <X size={16} weight="bold" />
        </button>

        <div className="delete-modal-header">
          <div className="delete-modal-icon" aria-hidden="true">
            <Trash size={20} />
          </div>
          <div className="delete-modal-text">
            <h3 id="delete-modal-title">{title}</h3>
            <p id="delete-modal-description">{message}</p>
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
            ref={confirmBtnRef}
            type="button"
            className={`delete-modal-btn-confirm${isHolding ? " is-holding" : ""}`}
            onMouseDown={startHold}
            onMouseUp={resetHold}
            onMouseLeave={resetHold}
            onTouchStart={startHold}
            onTouchEnd={resetHold}
            onTouchCancel={resetHold}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!isHolding) startHold();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                resetHold();
              }
            }}
            aria-label={`Hold to ${confirmLabel}`}
          >
            {/* Smooth Fill Progress Bar */}
            <span
              className="delete-modal-btn-confirm__progress"
              style={{
                transform: `scaleX(${holdProgress})`,
              }}
              aria-hidden="true"
            />
            <span className="delete-modal-btn-confirm__content">
              <Trash size={16} />
              <span>{isHolding ? "Hold to Delete..." : `Hold to ${confirmLabel}`}</span>
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
