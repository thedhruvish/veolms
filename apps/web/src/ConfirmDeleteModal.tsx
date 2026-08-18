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
      className="fixed inset-0 z-[1500] flex items-center justify-center p-4 sm:p-5 bg-black/75 backdrop-blur-md box-border animate-[deleteModalFadeIn_0.18s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      aria-describedby="delete-modal-description"
    >
      <div
        className="relative w-full max-w-[420px] border border-white/10 rounded-2xl p-5 sm:p-6 bg-[var(--surface)] shadow-[0_24px_64px_rgba(0,0,0,0.6),0_4px_20px_rgba(0,0,0,0.3)] overflow-hidden box-border animate-[deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          className="absolute top-4 right-4 flex w-7 h-7 items-center justify-center border border-white/10 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-white/[0.06] hover:border-white/20 bg-transparent cursor-pointer p-0 transition-all duration-150"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={14} weight="bold" />
        </button>

        {/* Header with Icon and Text */}
        <div className="flex items-start gap-3.5 pr-8 mb-5">
          <div
            className="flex w-10 h-10 items-center justify-center rounded-xl text-red-400 bg-red-500/[0.12] border border-red-500/20 shadow-[0_2px_8px_rgba(239,68,68,0.12)] shrink-0"
            aria-hidden="true"
          >
            <Trash size={18} weight="duotone" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3
              id="delete-modal-title"
              className="m-0 mb-1 text-[var(--text)] text-[1.05rem] font-bold tracking-[-0.015em] leading-tight"
            >
              {title}
            </h3>
            <p
              id="delete-modal-description"
              className="m-0 text-[var(--muted)] text-[0.82rem] leading-[1.45]"
            >
              {message}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 max-[480px]:flex-col-reverse max-[480px]:w-full">
          <button
            type="button"
            style={{
              fontSize: "0.80rem",
              fontWeight: 700,
              height: "34px",
              borderRadius: "8px",
              gap: "6px",
              paddingLeft: "14px",
              paddingRight: "14px",
            }}
            className="inline-flex items-center justify-center border border-white/10 text-[var(--text)] bg-white/[0.05] cursor-pointer transition-all duration-150 hover:bg-white/10 max-[480px]:w-full max-[480px]:h-[38px]"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            style={{
              fontSize: "0.80rem",
              fontWeight: 700,
              height: "34px",
              borderRadius: "8px",
              gap: "6px",
              paddingLeft: "16px",
              paddingRight: "16px",
            }}
            className="relative inline-flex items-center justify-center border border-red-500/40 text-white bg-red-600 hover:bg-red-700 hover:border-red-500/60 active:scale-[0.98] cursor-pointer overflow-hidden shadow-[0_3px_10px_rgba(220,38,38,0.35)] hover:shadow-[0_4px_14px_rgba(220,38,38,0.45)] transition-all duration-150 ease-out select-none box-border w-[155px] min-w-[155px] max-w-[155px] max-[480px]:w-full max-[480px]:min-w-full max-[480px]:max-w-full max-[480px]:h-[38px]"
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
              className="absolute inset-0 bg-black/35 origin-left pointer-events-none"
              style={{
                transform: `scaleX(${holdProgress})`,
                transition: isHolding ? "none" : "transform 0.15s ease-out",
              }}
              aria-hidden="true"
            />
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <Trash size={15} weight="bold" />
              <span>{isHolding ? "Hold to Delete..." : `Hold to ${confirmLabel}`}</span>
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
