import React from "react";
import type { MouseEventHandler, ReactNode } from "react";

interface IconButtonProps {
  label: string;
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  pressed?: boolean;
}

export function IconButton({
  label,
  children,
  className = "",
  onClick,
  pressed,
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${className}`}
    >
      {children}
    </button>
  );
}
