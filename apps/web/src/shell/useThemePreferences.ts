import { useEffect } from "react";
import { applyAcademyThemeStylesheet } from "../themeStylesheet";
import { persistAcademyTheme } from "../themes";

export type ThemePreference = "light" | "dark" | "device";

interface UseThemePreferencesOptions {
  ready: boolean;
  theme: ThemePreference;
  academyTheme: string;
  displayedAcademyTheme: string;
  setResolvedTheme: (theme: "light" | "dark") => void;
}

export function useThemePreferences({
  ready,
  theme,
  academyTheme,
  displayedAcademyTheme,
  setResolvedTheme,
}: UseThemePreferencesOptions) {
  useEffect(() => {
    if (!ready) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const nextTheme =
        theme === "device" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.dataset.appearance = theme;
      setResolvedTheme(nextTheme);
    };
    applyTheme();
    localStorage.setItem("veolms-theme", theme);
    if (theme !== "device") return undefined;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [ready, setResolvedTheme, theme]);

  useEffect(() => {
    if (!ready) return;
    void applyAcademyThemeStylesheet(displayedAcademyTheme);
  }, [displayedAcademyTheme, ready]);

  useEffect(() => {
    if (!ready) return;
    persistAcademyTheme(academyTheme);
  }, [academyTheme, ready]);
}
