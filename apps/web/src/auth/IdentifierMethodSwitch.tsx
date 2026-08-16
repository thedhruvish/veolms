import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/registry";
import type { IdentifierMethod } from "./identifier";

export interface IdentifierMethodSwitchProps {
  method: IdentifierMethod;
  onMethodChange: (method: IdentifierMethod) => void;
}

const METHOD_TABS: readonly (readonly [IdentifierMethod, string, IconName])[] =
  [
    ["mobile", "Mobile", "mobile"],
    ["email", "Email", "email"],
  ];

export function IdentifierMethodSwitch({
  method,
  onMethodChange,
}: IdentifierMethodSwitchProps) {
  return (
    <div
      aria-label="Sign-in method"
      className="auth-method-switch"
      role="tablist"
    >
      {METHOD_TABS.map(([value, label, glyph]) => (
        <button
          aria-selected={method === value}
          className="auth-method-switch__tab"
          key={value}
          onClick={() => onMethodChange(value)}
          onKeyDown={handleRovingTabKeyDown}
          role="tab"
          tabIndex={method === value ? 0 : -1}
          type="button"
        >
          <Icon
            aria-hidden
            emphasis={method === value ? "fill" : "regular"}
            name={glyph}
            size={16}
          />
          {label}
        </button>
      ))}
    </div>
  );
}
