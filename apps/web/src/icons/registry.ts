import {
  ArrowRight,
  DeviceMobile,
  EnvelopeSimple,
  Moon,
  Palette,
  Shapes,
  Sun,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  ArrowRight as ArrowRightGlyph,
  CircleAlert,
  Mail,
  Moon as MoonGlyph,
  Palette as PaletteGlyph,
  Shapes as ShapesGlyph,
  Smartphone,
  Sun as SunGlyph,
} from "lucide-react";
import type { ComponentType } from "react";

export const ICON_PACKS = ["lucide", "phosphor"] as const;

export type IconPack = (typeof ICON_PACKS)[number];

// Phosphor carries state in `weight`; Lucide has no equivalent, so the resolver
// translates these three steps into whichever knob the active pack offers.
export type IconEmphasis = "regular" | "bold" | "fill";

export interface IconGlyphProps {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  weight?: IconEmphasis;
  strokeWidth?: number;
}

export type IconGlyph = ComponentType<IconGlyphProps>;

// A semantic name earns its place only when both packs can draw it, so switching
// packs can never leave a hole. Nothing here is auth-specific: the same table is
// what a platform-wide switcher would read.
export const iconRegistry = {
  email: { lucide: Mail, phosphor: EnvelopeSimple },
  mobile: { lucide: Smartphone, phosphor: DeviceMobile },
  validationError: { lucide: CircleAlert, phosphor: WarningCircle },
  arrowRight: { lucide: ArrowRightGlyph, phosphor: ArrowRight },
  palette: { lucide: PaletteGlyph, phosphor: Palette },
  lightMode: { lucide: SunGlyph, phosphor: Sun },
  darkMode: { lucide: MoonGlyph, phosphor: Moon },
  iconPack: { lucide: ShapesGlyph, phosphor: Shapes },
} as const satisfies Record<string, Record<IconPack, IconGlyph>>;

export type IconName = keyof typeof iconRegistry;
