import { useEffect, useState } from "react";
import { CheckCircle, DeviceMobile, Laptop, LockKey, ShieldCheck, SignOut } from "@phosphor-icons/react";
import { SettingRow, SettingsToggle } from "./SettingsControls";

interface SecurityPreferences {
  twoFactor: boolean;
  newDeviceAlerts: boolean;
  loginAlerts: boolean;
}

const STORAGE_KEY = "veolms-security-preferences";
const defaults: SecurityPreferences = { twoFactor: false, newDeviceAlerts: true, loginAlerts: true };

function readPreferences(): SecurityPreferences {
  if (typeof window === "undefined") return defaults;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    return { ...defaults, ...(typeof parsed === "object" && parsed !== null ? parsed : {}) };
  } catch {
    return defaults;
  }
}

export function SecuritySettings() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [otherSessions, setOtherSessions] = useState(true);
  const update = (next: Partial<SecurityPreferences>) => setPreferences((current) => ({ ...current, ...next }));

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  return (
    <div className="settings-detail" aria-label="Privacy and security settings">
      <header className="settings-detail__header">
        <div>
          <h2>Privacy &amp; security</h2>
          <p>Protect your account and keep track of where it is active.</p>
        </div>
        <span className="settings-detail__saved"><CheckCircle size={17} weight="fill" /> Saved automatically</span>
      </header>

      <section className="settings-section" aria-labelledby="protection-heading">
        <header className="settings-section__heading">
          <ShieldCheck size={20} weight="duotone" />
          <div><h3 id="protection-heading">Account protection</h3><p>Add safeguards to the way you sign in.</p></div>
        </header>
        <div className="settings-row-list">
          <SettingRow icon={LockKey} label="Two-factor authentication" note="Require a verification code when signing in on a new device.">
            <SettingsToggle checked={preferences.twoFactor} onChange={(twoFactor) => update({ twoFactor })} label="Two-factor authentication" />
          </SettingRow>
          <SettingRow icon={DeviceMobile} label="New device alerts" note="Get notified when your account is used on a new device.">
            <SettingsToggle checked={preferences.newDeviceAlerts} onChange={(newDeviceAlerts) => update({ newDeviceAlerts })} label="New device alerts" />
          </SettingRow>
          <SettingRow icon={ShieldCheck} label="Sign-in alerts" note="Receive an alert for sign-ins from an unfamiliar location.">
            <SettingsToggle checked={preferences.loginAlerts} onChange={(loginAlerts) => update({ loginAlerts })} label="Sign-in alerts" />
          </SettingRow>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="sessions-heading">
        <header className="settings-section__heading">
          <Laptop size={20} weight="duotone" />
          <div><h3 id="sessions-heading">Active sessions</h3><p>Review the devices that currently have access to your account.</p></div>
        </header>
        <div className="settings-session-list">
          <div className="settings-session">
            <span className="settings-session__icon"><Laptop size={20} weight="duotone" /></span>
            <span><strong>This device</strong><small>Windows · Chrome · Active now</small></span>
            <em>Current</em>
          </div>
          {otherSessions && (
            <div className="settings-session">
              <span className="settings-session__icon"><DeviceMobile size={20} weight="duotone" /></span>
              <span><strong>Mobile device</strong><small>Android · Last active yesterday</small></span>
              <button type="button" className="settings-action settings-action--quiet" onClick={() => setOtherSessions(false)}><SignOut size={16} /> Sign out</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
