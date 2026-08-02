export const academy = {
  brandName: "ProCodrr",
  name: "ProCodrr Academy",
  description: "Practical courses for building reliable software.",
  home: {
    headline: "Learn by building software that lasts.",
    introduction:
      "Focused, practical courses for developers who want sound fundamentals and production-minded skills.",
  },
  catalogue: {
    introduction:
      "Practical learning paths designed around real software work.",
  },
} as const;

export function pageTitle(page?: string): string {
  return page ? `${page} | ${academy.brandName}` : academy.name;
}
