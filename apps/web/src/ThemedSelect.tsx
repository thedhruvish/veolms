import * as Select from "@radix-ui/react-select";
import { CaretDown, Check } from "@phosphor-icons/react";

export type ThemedSelectOption<Value extends string = string> = readonly [
  value: Value,
  label: string,
];

export interface ThemedSelectProps<Value extends string = string> {
  id?: string;
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly ThemedSelectOption<Value>[];
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

const joinClasses = (
  ...classes: Array<string | false | null | undefined>
): string => classes.filter(Boolean).join(" ");

/**
 * Shared, palette-aware select control. Radix provides the keyboard and
 * screen-reader behavior; this component keeps the visual treatment aligned
 * with the academy's semantic theme tokens everywhere it is used.
 */
export function ThemedSelect<Value extends string>({
  id,
  value,
  onValueChange,
  options,
  disabled = false,
  ariaLabel,
  className = "",
  triggerClassName = "",
  contentClassName = "",
}: ThemedSelectProps<Value>) {
  return (
    <Select.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <Select.Trigger
        id={id}
        className={joinClasses("themed-select__trigger", triggerClassName)}
        aria-label={ariaLabel}
      >
        <Select.Value />
        <Select.Icon className="themed-select__caret" aria-hidden="true">
          <CaretDown size={16} weight="bold" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className={joinClasses("themed-select__content", contentClassName)}
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <Select.Viewport
            className={joinClasses("themed-select__viewport", className)}
          >
            {options.map(([optionValue, optionLabel]) => (
              <Select.Item
                className="themed-select__item"
                value={optionValue}
                key={optionValue}
              >
                <Select.ItemText>{optionLabel}</Select.ItemText>
                <Select.ItemIndicator className="themed-select__indicator">
                  <Check size={15} weight="bold" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
