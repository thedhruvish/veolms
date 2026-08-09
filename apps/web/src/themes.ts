export interface AcademyTheme {
  id: string;
  name: string;
  note: string;
  preview: string;
  darkInk: boolean;
}

export const academyThemes: readonly AcademyTheme[] = [
  {
    id: "graphite",
    name: "Graphite Studio",
    note: "New default",
    preview: "#8b68ff",
    darkInk: false,
  },
  {
    id: "codex",
    name: "Veo Onyx",
    note: "Charcoal & soft white",
    preview: "#f4f4f5",
    darkInk: true,
  },
  {
    id: "midnight",
    name: "Midnight Azure",
    note: "Deep blue & luminous",
    preview: "#4166d4",
    darkInk: false,
  },
  {
    id: "violet",
    name: "Original Violet",
    note: "Focused & expressive",
    preview: "#7148ff",
    darkInk: false,
  },
  {
    id: "ember",
    name: "Ember Orange",
    note: "Warm & focused",
    preview: "#ff8a34",
    darkInk: true,
  },
  {
    id: "sunlit",
    name: "Sunlit Yellow",
    note: "Bright & optimistic",
    preview: "#f6c945",
    darkInk: true,
  },
  {
    id: "grove",
    name: "Grove Green",
    note: "Calm & grounded",
    preview: "#4dda85",
    darkInk: true,
  },
  {
    id: "ocean",
    name: "Ocean Blue",
    note: "Clear & confident",
    preview: "#7193ff",
    darkInk: true,
  },
  {
    id: "rose",
    name: "Studio Rose",
    note: "Expressive & warm",
    preview: "#fb6f92",
    darkInk: true,
  },
  {
    id: "signal",
    name: "Signal Red",
    note: "Crisp & high-impact",
    preview: "#d92d4e",
    darkInk: false,
  },
  {
    id: "barbie",
    name: "Barbie Pink",
    note: "Bright & iconic",
    preview: "#ec4d9b",
    darkInk: true,
  },
  {
    id: "aurora",
    name: "Aurora Teal",
    note: "Cool & luminous",
    preview: "#28d8c6",
    darkInk: true,
  },
];

const paletteIds = new Set<string>(academyThemes.map((theme) => theme.id));
const paletteVersion = "graphite-default-v1";

export function getInitialAcademyTheme(): string {
  if (typeof window === "undefined") return "graphite";

  const savedVersion = window.localStorage.getItem(
    "veolms-academy-theme-version",
  );
  if (savedVersion !== paletteVersion) return "graphite";

  const savedTheme = window.localStorage.getItem("veolms-academy-theme");
  return savedTheme !== null && paletteIds.has(savedTheme)
    ? savedTheme
    : "graphite";
}

export function persistAcademyTheme(theme: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("veolms-academy-theme", theme);
  window.localStorage.setItem("veolms-academy-theme-version", paletteVersion);
}
