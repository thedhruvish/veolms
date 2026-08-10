export const SIDEBAR_MAX_WIDTH_MIN = 220;
export const SIDEBAR_MAX_WIDTH_DEFAULT = 300;
export const SIDEBAR_MAX_WIDTH_LIMIT = 520;

export type SidebarIconStyle = "multicolor" | "monochrome";
export type SidebarMonochromeMode = "theme" | "neutral" | "custom";
export type SidebarContentLayout = "framed" | "edge-to-edge";
export type SidebarMode = "expanded" | "collapsed" | "hidden";

export interface SidebarPreferences {
  iconStyle?: SidebarIconStyle;
  monochromeMode?: SidebarMonochromeMode;
  monochromeColor?: string;
  contentLayout?: SidebarContentLayout;
  sidebarMaxWidth?: number;
  showCollapsedLabels?: boolean;
  showCollapsedLogo?: boolean;
  showThemeIcon?: boolean;
  highlightActive?: boolean;
}

export interface LearningPreferences {
  videoQuality: string;
  playbackSpeed: string;
  resumeFromLastPosition: boolean;
  startInTheaterMode: boolean;
  weeklyGoal: string;
  learningReminders: boolean;
  reminderDays: string[];
  reminderTime: string;
  timeZone: string;
  captionsByDefault: boolean;
  captionLanguage: string;
  autoScrollTranscript: boolean;
  highlightTranscriptLine: boolean;
  openCurrentSection: boolean;
  continueWithNextIncomplete: boolean;
  automaticallyMoveNextSection: boolean;
  keepCompletedLecturesVisible: boolean;
}

export const LEARNING_PREFERENCES_KEY = "veolms-learning-preferences";
export const LEARNING_PREFERENCE_DEFAULTS: LearningPreferences = {
  videoQuality: "auto",
  playbackSpeed: "1",
  resumeFromLastPosition: true,
  startInTheaterMode: false,
  weeklyGoal: "5",
  learningReminders: true,
  reminderDays: ["mon", "tue", "wed", "thu", "fri"],
  reminderTime: "19:00",
  timeZone: "Asia/Kolkata (IST)",
  captionsByDefault: false,
  captionLanguage: "English",
  autoScrollTranscript: true,
  highlightTranscriptLine: true,
  openCurrentSection: true,
  continueWithNextIncomplete: true,
  automaticallyMoveNextSection: true,
  keepCompletedLecturesVisible: true,
};

export const LEARNING_REMINDER_DAYS: readonly (readonly [
  day: string,
  label: string,
])[] = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];

export const normalizeSidebarMaxWidth = (
  value: number | string | undefined,
): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.min(
        SIDEBAR_MAX_WIDTH_LIMIT,
        Math.max(SIDEBAR_MAX_WIDTH_MIN, numericValue),
      )
    : SIDEBAR_MAX_WIDTH_DEFAULT;
};

export const readStored = (key: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value;
};

export const readStoredBoolean = (key: string, fallback: boolean): boolean =>
  readStored(key, String(fallback)) === "true";

export const readLearningPreferences = (): LearningPreferences => {
  try {
    const value = readStored(LEARNING_PREFERENCES_KEY, "");
    const parsedPreferences: unknown = value ? JSON.parse(value) : {};
    const storedPreferences =
      typeof parsedPreferences === "object" && parsedPreferences !== null
        ? (parsedPreferences as Partial<LearningPreferences>)
        : {};
    const preferences = {
      ...LEARNING_PREFERENCE_DEFAULTS,
      ...storedPreferences,
      reminderDays: Array.isArray(storedPreferences.reminderDays)
        ? storedPreferences.reminderDays
        : LEARNING_PREFERENCE_DEFAULTS.reminderDays,
    };
    delete (preferences as Record<string, unknown>).autoplayNextLecture;
    return preferences;
  } catch {
    return LEARNING_PREFERENCE_DEFAULTS;
  }
};
