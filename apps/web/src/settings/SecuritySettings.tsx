import {
  DeviceMobile,
  Laptop,
  LockKey,
  ShieldCheck,
  SignOut,
  WarningCircle,
} from "@phosphor-icons/react";
import { SettingRow, SettingsToggle } from "./SettingsControls";

export function SecuritySettings() {
  return (
    <div className="settings-detail" aria-label="Privacy and security settings">
      <header className="settings-detail__header">
        <div>
          <h2>Privacy &amp; security</h2>
          <p>Protect your account and keep track of where it is active.</p>
        </div>
        <span className="settings-detail__saved">
          <WarningCircle size={17} weight="fill" /> Preview only
        </span>
      </header>

      <p
        id="security-unavailable-note"
        className="settings-danger-note"
        role="status"
      >
        Security services are not connected yet. These controls are read-only
        previews: settings will not be saved or enforced, and no device can be
        signed out from this page.
      </p>

      <section
        className="settings-section"
        aria-labelledby="protection-heading"
      >
        <header className="settings-section__heading">
          <ShieldCheck size={20} weight="duotone" />
          <div>
            <h3 id="protection-heading">Account protection</h3>
            <p>Add safeguards to the way you sign in.</p>
          </div>
        </header>
        <div className="settings-row-list">
          <SettingRow
            icon={LockKey}
            label="Two-factor authentication"
            note="Unavailable until server-side sign-in protection is connected."
          >
            <SettingsToggle
              checked={false}
              onChange={() => undefined}
              label="Two-factor authentication"
              disabled
            />
          </SettingRow>
          <SettingRow
            icon={DeviceMobile}
            label="New device alerts"
            note="Unavailable until account activity alerts are connected."
          >
            <SettingsToggle
              checked={false}
              onChange={() => undefined}
              label="New device alerts"
              disabled
            />
          </SettingRow>
          <SettingRow
            icon={ShieldCheck}
            label="Sign-in alerts"
            note="Unavailable until account activity alerts are connected."
          >
            <SettingsToggle
              checked={false}
              onChange={() => undefined}
              label="Sign-in alerts"
              disabled
            />
          </SettingRow>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="sessions-heading">
        <header className="settings-section__heading">
          <Laptop size={20} weight="duotone" />
          <div>
            <h3 id="sessions-heading">Active sessions</h3>
            <p>Preview layout only. Live session data is not connected yet.</p>
          </div>
        </header>
        <div className="settings-session-list">
          <div className="settings-session">
            <span className="settings-session__icon">
              <Laptop size={20} weight="duotone" />
            </span>
            <span>
              <strong>Example desktop</strong>
              <small>Live session status unavailable</small>
            </span>
            <em>Preview</em>
          </div>
          <div className="settings-session">
            <span className="settings-session__icon">
              <DeviceMobile size={20} weight="duotone" />
            </span>
            <span>
              <strong>Example mobile device</strong>
              <small>Live session status unavailable</small>
            </span>
            <button
              type="button"
              className="settings-action settings-action--quiet"
              aria-describedby="security-unavailable-note"
              disabled
            >
              <SignOut size={16} /> Sign out unavailable
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
