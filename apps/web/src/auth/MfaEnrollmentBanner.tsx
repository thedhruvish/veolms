import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { useCurrentUser } from "../services/auth";
import "./mfa-enrollment-banner.css";

interface MfaEnrollmentBannerProps {
  onSetup: () => void;
}

export function MfaEnrollmentBanner({ onSetup }: MfaEnrollmentBannerProps) {
  const { data: user } = useCurrentUser();

  const needsEnrollment = Boolean(
    user?.mfaMandatory && !user.totpEnabled && !user.passkeyEnabled,
  );

  if (!needsEnrollment) return null;

  return (
    <aside aria-live="polite" className="mfa-enrollment-banner" role="status">
      <span aria-hidden="true" className="mfa-enrollment-banner__icon">
        <ShieldCheck size={22} weight="duotone" />
      </span>
      <div className="mfa-enrollment-banner__copy">
        <strong>Secure your privileged account</strong>
        <p>Add a passkey or authenticator app before managing your academy.</p>
      </div>
      <button
        className="mfa-enrollment-banner__action"
        onClick={onSetup}
        type="button"
      >
        Set up MFA
        <ArrowRight aria-hidden="true" size={17} weight="bold" />
      </button>
    </aside>
  );
}
