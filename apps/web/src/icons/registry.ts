import {
  ArrowRight,
  CheckIcon,
  ClockIcon,
  DeviceMobile,
  EnvelopeSimple,
  KeyIcon,
  LockIcon,
  ShieldCheckIcon,
  StarIcon,
  UserCircleIcon,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  ArrowRight as ArrowRightGlyph,
  Check,
  CircleAlert,
  CircleUserRound,
  Clock,
  Lock,
  Mail,
  UserRoundKey,
  ShieldCheck,
  Smartphone,
  Star,
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
  verified: { lucide: Check, phosphor: CheckIcon },
  person: { lucide: CircleUserRound, phosphor: UserCircleIcon },
  passkey: { lucide: UserRoundKey, phosphor: KeyIcon },
  authenticator: { lucide: Lock, phosphor: LockIcon },
  recommended: { lucide: Star, phosphor: StarIcon },
  shield: { lucide: ShieldCheck, phosphor: ShieldCheckIcon },
  refreshTimer: { lucide: Clock, phosphor: ClockIcon },
} as const satisfies Record<string, Record<IconPack, IconGlyph>>;

export type IconName = keyof typeof iconRegistry;
