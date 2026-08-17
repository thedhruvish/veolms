import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import type { Icon } from "@phosphor-icons/react";

interface SectionHeaderProps {
  icon: Icon;
  title: string;
  action?: string;
  onAction?: () => void;
}

export function SectionHeader({
  icon: Icon,
  title,
  action,
  onAction,
}: SectionHeaderProps) {
  return (
    <div className="dashboard-section-heading">
      <h2>
        <Icon size={19} weight="duotone" /> {title}
      </h2>
      {action && (
        <button type="button" onClick={onAction}>
          {action} <ArrowRight size={17} />
        </button>
      )}
    </div>
  );
}
