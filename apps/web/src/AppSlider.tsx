import type { CSSProperties, InputHTMLAttributes } from "react";

export type AppSliderVariant = "accent" | "temperature" | "player" | "volume";

export interface AppSliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  variant?: AppSliderVariant;
}

type AppSliderStyle = CSSProperties & {
  "--app-slider-progress": string;
};

const toFiniteNumber = (
  value: string | number | readonly string[] | undefined,
  fallback: number,
): number => {
  const numericValue = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

export function AppSlider({
  className = "",
  max = 100,
  min = 0,
  style,
  value,
  defaultValue,
  variant = "accent",
  ...props
}: AppSliderProps) {
  const minimum = toFiniteNumber(min, 0);
  const maximum = toFiniteNumber(max, 100);
  const currentValue = toFiniteNumber(value ?? defaultValue, minimum);
  const progress =
    maximum <= minimum
      ? 0
      : Math.min(
          100,
          Math.max(0, ((currentValue - minimum) / (maximum - minimum)) * 100),
        );
  const sliderStyle = {
    ...style,
    "--app-slider-progress": `${progress}%`,
  } as AppSliderStyle;

  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      className={`app-slider app-slider--${variant} ${className}`.trim()}
      style={sliderStyle}
    />
  );
}
