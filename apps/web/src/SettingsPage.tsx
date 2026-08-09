import {
  Bell,
  GearSix,
  GraduationCap,
  Palette,
  ShieldCheck,
  SidebarSimple,
  UserCircle,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import type { DisplayMode } from "./settings/AppearanceSettings";
import { LearningSettings } from "./settings/LearningSettings";
import { ProfileSettings } from "./settings/ProfileSettings";
import type {
  ProfilePreferences,
  ProfileRole,
} from "./settings/profilePreferences";
import { SidebarSettings } from "./settings/SidebarSettings";
import type {
  SidebarMode,
  SidebarPreferences,
} from "./settings/settingsPreferences";

export type SettingsTab =
  | "profile"
  | "appearance"
  | "sidebar"
  | "learning"
  | "notifications"
  | "security"
  | "account";

type SettingsTabIcon = ComponentType<{
  size?: number;
  weight?: "duotone" | "fill" | "regular";
}>;

interface SettingsTabDefinition {
  id: SettingsTab;
  label: string;
  Icon: SettingsTabIcon;
}

const SETTINGS_TABS: readonly SettingsTabDefinition[] = [
  { id: "profile", label: "Profile", Icon: UserCircle },
  { id: "appearance", label: "Appearance", Icon: Palette },
  { id: "sidebar", label: "Sidebar", Icon: SidebarSimple },
  { id: "learning", label: "Learning", Icon: GraduationCap },
  { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "security", label: "Privacy & Security", Icon: ShieldCheck },
  { id: "account", label: "Account", Icon: GearSix },
];

interface SettingsPlaceholderProps {
  title: string;
}

function SettingsPlaceholder({ title }: SettingsPlaceholderProps) {
  return (
    <section
      className="courses-placeholder-empty settings-placeholder"
      aria-label={`${title} placeholder`}
    >
      <span className="courses-placeholder-empty-icon" aria-hidden="true">
        <GearSix size={34} weight="duotone" />
      </span>
      <h2>Nothing here yet</h2>
      <p>
        {title} is not implemented yet. This placeholder keeps the navigation
        path ready while the feature is being built.
      </p>
    </section>
  );
}

export interface SettingsPageProps {
  tab?: string;
  role?: ProfileRole;
  onNavigatePage?: (page: string) => void;
  onProfileSaved?: (profile: ProfilePreferences) => void;
  theme: DisplayMode;
  onThemeChange: (theme: DisplayMode) => void;
  academyTheme: string;
  onAcademyThemeChange: (themeId: string) => void;
  sidebarPreferences?: SidebarPreferences;
  onSidebarPreferencesChange: (preferences: SidebarPreferences) => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
}

export function SettingsPage({
  tab = "appearance",
  role = "student",
  onNavigatePage,
  onProfileSaved,
  theme,
  onThemeChange,
  academyTheme,
  onAcademyThemeChange,
  sidebarPreferences,
  onSidebarPreferencesChange,
  sidebarMode,
  onSidebarModeChange,
}: SettingsPageProps) {
  const activeTab: SettingsTab = SETTINGS_TABS.some((item) => item.id === tab)
    ? (tab as SettingsTab)
    : "appearance";
  const activeLabel =
    SETTINGS_TABS.find((item) => item.id === activeTab)?.label || "Appearance";

  const navigateTab = (id: SettingsTab) => onNavigatePage?.(`/settings/${id}`);

  return (
    <div className="settings-page" aria-labelledby="settings-page-title">
      <header className="settings-page__header">
        <div>
          <h1 id="settings-page-title">Settings</h1>
          <p>Manage your personal preferences and interface experience.</p>
        </div>
        <span className="settings-page__marker" aria-hidden="true">
          <GearSix size={24} weight="duotone" />
        </span>
      </header>

      <nav
        className="settings-tabs"
        aria-label="Settings sections"
        role="tablist"
      >
        {SETTINGS_TABS.map(({ id, label, Icon }) => (
          <button
            type="button"
            key={id}
            id={`settings-tab-${id}`}
            role="tab"
            aria-selected={activeTab === id}
            aria-controls="settings-tab-panel"
            className={activeTab === id ? "is-active" : ""}
            onClick={() => navigateTab(id)}
          >
            <Icon size={17} weight={activeTab === id ? "fill" : "regular"} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div
        id="settings-tab-panel"
        className="settings-tab-content"
        data-settings-tab={activeTab}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === "profile" && (
          <ProfileSettings
            role={role}
            onNavigatePage={onNavigatePage}
            onProfileSaved={onProfileSaved}
          />
        )}
        {activeTab === "appearance" && (
          <AppearanceSettings
            theme={theme}
            onThemeChange={onThemeChange}
            academyTheme={academyTheme}
            onAcademyThemeChange={onAcademyThemeChange}
          />
        )}
        {activeTab === "sidebar" && (
          <SidebarSettings
            sidebarPreferences={sidebarPreferences}
            onSidebarPreferencesChange={onSidebarPreferencesChange}
            academyTheme={academyTheme}
            sidebarMode={sidebarMode}
            onSidebarModeChange={onSidebarModeChange}
          />
        )}
        {activeTab === "learning" && <LearningSettings />}
        {!["profile", "appearance", "sidebar", "learning"].includes(
          activeTab,
        ) && <SettingsPlaceholder title={activeLabel} />}
      </div>
    </div>
  );
}
