import auroraThemeStylesheet from "./styles/themes/aurora.css?url";
import barbieThemeStylesheet from "./styles/themes/barbie.css?url";
import brainwaveThemeStylesheet from "./styles/themes/brainwave.css?url";
import champagneThemeStylesheet from "./styles/themes/champagne.css?url";
import codexThemeStylesheet from "./styles/themes/codex.css?url";
import emberThemeStylesheet from "./styles/themes/ember.css?url";
import graphiteThemeStylesheet from "./styles/themes/graphite.css?url";
import groveThemeStylesheet from "./styles/themes/grove.css?url";
import lilacThemeStylesheet from "./styles/themes/lilac.css?url";
import limeThemeStylesheet from "./styles/themes/lime.css?url";
import midnightThemeStylesheet from "./styles/themes/midnight.css?url";
import oceanThemeStylesheet from "./styles/themes/ocean.css?url";
import roseThemeStylesheet from "./styles/themes/rose.css?url";
import signalThemeStylesheet from "./styles/themes/signal.css?url";
import sunlitThemeStylesheet from "./styles/themes/sunlit.css?url";
import violetThemeStylesheet from "./styles/themes/violet.css?url";

export const academyThemeStylesheets = {
  aurora: auroraThemeStylesheet,
  barbie: barbieThemeStylesheet,
  brainwave: brainwaveThemeStylesheet,
  champagne: champagneThemeStylesheet,
  codex: codexThemeStylesheet,
  ember: emberThemeStylesheet,
  graphite: graphiteThemeStylesheet,
  grove: groveThemeStylesheet,
  lilac: lilacThemeStylesheet,
  lime: limeThemeStylesheet,
  midnight: midnightThemeStylesheet,
  ocean: oceanThemeStylesheet,
  rose: roseThemeStylesheet,
  signal: signalThemeStylesheet,
  sunlit: sunlitThemeStylesheet,
  violet: violetThemeStylesheet,
} as const;

export type AcademyThemeStylesheetId = keyof typeof academyThemeStylesheets;

export function getAcademyThemeStylesheet(theme: string) {
  return (
    academyThemeStylesheets[theme as AcademyThemeStylesheetId] ??
    academyThemeStylesheets.codex
  );
}

const loadedThemeStylesheets = new Map<string, Promise<void>>();
let requestedAcademyTheme = "codex";

export function loadAcademyThemeStylesheet(theme: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();

  const id =
    theme in academyThemeStylesheets ? theme : ("codex" as const);
  const existing = document.querySelector<HTMLLinkElement>(
    `link[data-academy-theme="${id}"]`,
  );
  if (existing?.dataset.loaded === "true") return Promise.resolve();

  const pending = loadedThemeStylesheets.get(id);
  if (pending) return pending;

  const promise = new Promise<void>((resolve) => {
    const link =
      existing ?? document.createElement("link");
    link.rel = "stylesheet";
    link.href = getAcademyThemeStylesheet(id);
    link.dataset.academyTheme = id;
    const complete = () => {
      link.dataset.loaded = "true";
      resolve();
    };
    const failed = () => {
      link.dataset.error = "true";
      resolve();
    };
    link.addEventListener("load", complete, { once: true });
    link.addEventListener("error", failed, { once: true });
    if (!existing) document.head.append(link);
  });

  loadedThemeStylesheets.set(id, promise);
  return promise;
}

export async function applyAcademyThemeStylesheet(theme: string) {
  if (typeof document === "undefined") return;

  const id =
    theme in academyThemeStylesheets ? theme : ("codex" as const);
  requestedAcademyTheme = id;
  await loadAcademyThemeStylesheet(id);
  if (requestedAcademyTheme !== id) return;
  const active = document.querySelector<HTMLLinkElement>(
    `link[data-academy-theme="${id}"]`,
  );
  if (active?.dataset.error === "true") return;
  document.documentElement.dataset.palette = id;

  document
    .querySelectorAll<HTMLLinkElement>("link[data-academy-theme]")
    .forEach((link) => {
      if (link.dataset.academyTheme !== id) link.disabled = true;
    });
  if (active) active.disabled = false;
}
