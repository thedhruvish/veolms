import { useState } from "react";
import { Archive, CheckCircle, CreditCard, DownloadSimple, WarningCircle } from "@phosphor-icons/react";
import type { ProfileRole } from "./profilePreferences";

export interface AccountSettingsProps {
  role: ProfileRole;
  onNavigatePage?: (page: string) => void;
}

export function AccountSettings({ role, onNavigatePage }: AccountSettingsProps) {
  const [exportRequested, setExportRequested] = useState(false);
  const [confirmDeactivation, setConfirmDeactivation] = useState(false);

  return (
    <div className="settings-detail" aria-label="Account settings">
      <header className="settings-detail__header">
        <div><h2>Account</h2><p>Review your plan, personal data, and account access.</p></div>
      </header>

      <section className="settings-section" aria-labelledby="membership-heading">
        <header className="settings-section__heading">
          <CreditCard size={20} weight="duotone" />
          <div><h3 id="membership-heading">Membership</h3><p>Your {role === "creator" ? "academy" : "learner"} account is ready to use.</p></div>
        </header>
        <div className="settings-account-plan">
          <div><span>Current access</span><strong>{role === "creator" ? "Creator workspace" : "Learning workspace"}</strong><small>Manage purchases and receipts from your order history.</small></div>
          <button type="button" className="settings-action" onClick={() => onNavigatePage?.(role === "creator" ? "orders" : "order-history")}><CreditCard size={16} /> View orders</button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="data-heading">
        <header className="settings-section__heading">
          <Archive size={20} weight="duotone" />
          <div><h3 id="data-heading">Your data</h3><p>Keep a portable copy of the information connected to this account.</p></div>
        </header>
        <div className="settings-account-plan">
          <div><strong>Export your data</strong><small>Prepare a downloadable archive of your profile and learning activity.</small></div>
          <button type="button" className="settings-action" onClick={() => setExportRequested(true)} disabled={exportRequested}>{exportRequested ? <CheckCircle size={16} weight="fill" /> : <DownloadSimple size={16} />}{exportRequested ? "Export requested" : "Request export"}</button>
        </div>
      </section>

      <section className="settings-section settings-section--danger" aria-labelledby="deactivate-heading">
        <header className="settings-section__heading">
          <WarningCircle size={20} weight="duotone" />
          <div><h3 id="deactivate-heading">Deactivate account</h3><p>Pause access without immediately deleting your account data.</p></div>
        </header>
        <div className="settings-account-plan">
          <div><strong>Need a break?</strong><small>You can request deactivation after reviewing the impact on your courses and purchases.</small></div>
          <button type="button" className="settings-action settings-action--danger" onClick={() => setConfirmDeactivation((current) => !current)}><WarningCircle size={16} />{confirmDeactivation ? "Cancel request" : "Review deactivation"}</button>
        </div>
        {confirmDeactivation && <p className="settings-danger-note" role="status">Deactivation is not connected to the server yet. Your account has not been changed.</p>}
      </section>
    </div>
  );
}
