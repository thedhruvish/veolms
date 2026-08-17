import { useEffect, useState } from "react";
import {
  readShortcutPlatformPreference,
  resolveShortcutPlatform,
  SHORTCUT_PLATFORM_PREFERENCE_DEFAULT,
  SHORTCUT_PLATFORM_PREFERENCE_EVENT,
  SHORTCUT_PLATFORM_PREFERENCE_KEY,
} from "./keyboardShortcuts";
import type {
  ShortcutPlatform,
  ShortcutPlatformPreference,
} from "./keyboardShortcuts";

export function useShortcutPlatformPreference(): ShortcutPlatformPreference {
  // Keep the prerendered markup and the first client render identical. Reading
  // localStorage during the state initializer can otherwise change shortcut
  // labels (for example Ctrl to Command) before React has hydrated the page.
  const [preference, setPreference] = useState<ShortcutPlatformPreference>(
    SHORTCUT_PLATFORM_PREFERENCE_DEFAULT,
  );

  useEffect(() => {
    const syncPreference = () =>
      setPreference(readShortcutPlatformPreference());
    const syncStoredPreference = (event: StorageEvent) => {
      if (event.key === SHORTCUT_PLATFORM_PREFERENCE_KEY) syncPreference();
    };

    syncPreference();
    window.addEventListener(SHORTCUT_PLATFORM_PREFERENCE_EVENT, syncPreference);
    window.addEventListener("storage", syncStoredPreference);
    return () => {
      window.removeEventListener(
        SHORTCUT_PLATFORM_PREFERENCE_EVENT,
        syncPreference,
      );
      window.removeEventListener("storage", syncStoredPreference);
    };
  }, []);

  return preference;
}

export function useShortcutPlatform(): ShortcutPlatform {
  const preference = useShortcutPlatformPreference();
  const [platform, setPlatform] = useState<ShortcutPlatform>(() =>
    resolveShortcutPlatform(preference, ""),
  );

  useEffect(() => {
    setPlatform(resolveShortcutPlatform(preference));
  }, [preference]);

  return platform;
}
