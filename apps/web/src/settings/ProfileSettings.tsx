import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  ArrowRight,
  At,
  Camera,
  CheckCircle,
  CircleNotch,
  GithubLogo,
  IdentificationCard,
  LinkedinLogo,
  LockKey,
  Phone,
  SealCheck,
  Trash,
  UserFocus,
  WifiSlash,
} from "@phosphor-icons/react";
import {
  getProfileIdentity,
  saveProfilePreferences,
} from "./profilePreferences";
import type {
  ProfileIdentity,
  ProfilePreferences,
  ProfileRole,
} from "./profilePreferences";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface ProfileSettingsProps {
  role?: ProfileRole;
  onNavigatePage?: (page: string) => void;
  onProfileSaved?: (profile: ProfilePreferences) => void;
}

const toEditableProfile = (profile: ProfileIdentity): ProfilePreferences => ({
  displayName: profile.displayName,
  avatarDataUrl: profile.avatarDataUrl,
  username: profile.username ?? "",
  mobileNumber: profile.mobileNumber ?? "",
  mobileVerified: profile.mobileVerified ?? false,
  linkedinUrl: profile.linkedinUrl ?? "",
  githubUrl: profile.githubUrl ?? "",
});

const profilesMatch = (left: ProfilePreferences, right: ProfilePreferences) =>
  left.displayName === right.displayName &&
  left.avatarDataUrl === right.avatarDataUrl &&
  (left.username ?? "") === (right.username ?? "") &&
  (left.mobileNumber ?? "") === (right.mobileNumber ?? "") &&
  Boolean(left.mobileVerified) === Boolean(right.mobileVerified) &&
  (left.linkedinUrl ?? "") === (right.linkedinUrl ?? "") &&
  (left.githubUrl ?? "") === (right.githubUrl ?? "");

const getInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase())
    .join("");
};

export function ProfileSettings({
  role = "student",
  onNavigatePage,
  onProfileSaved,
}: ProfileSettingsProps) {
  const initialIdentity = useMemo(() => getProfileIdentity(role), [role]);
  const [savedProfile, setSavedProfile] = useState<ProfilePreferences>(() =>
    toEditableProfile(initialIdentity),
  );
  const [draftProfile, setDraftProfile] = useState<ProfilePreferences>(() =>
    toEditableProfile(initialIdentity),
  );
  const [nameError, setNameError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [mobileError, setMobileError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDirty = !profilesMatch(draftProfile, savedProfile);
  const displayName = draftProfile.displayName.trim() || "Your name";
  const showAvatar = Boolean(draftProfile.avatarDataUrl) && !avatarFailed;

  useEffect(() => {
    const identity = getProfileIdentity(role);
    const editableProfile = toEditableProfile(identity);
    setSavedProfile(editableProfile);
    setDraftProfile(editableProfile);
    setNameError("");
    setUsernameError("");
    setMobileError("");
    setPhotoError("");
    setVerificationRequested(false);
    setVerificationCode("");
    setSaveStatus("idle");
  }, [role]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [draftProfile.avatarDataUrl]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  const updateDisplayName = (value: string) => {
    setDraftProfile((current) => ({ ...current, displayName: value }));
    if (value.trim()) setNameError("");
    setSaveStatus("idle");
  };

  const updateUsername = (value: string) => {
    setDraftProfile((current) => ({
      ...current,
      username: value.replace(/^@/, ""),
    }));
    setUsernameError("");
    setSaveStatus("idle");
  };

  const updateMobileNumber = (value: string) => {
    setDraftProfile((current) => ({
      ...current,
      mobileNumber: value,
      mobileVerified:
        current.mobileNumber === value ? current.mobileVerified : false,
    }));
    setVerificationRequested(false);
    setVerificationCode("");
    setMobileError("");
    setSaveStatus("idle");
  };

  const updateProfileLink = (
    field: "linkedinUrl" | "githubUrl",
    value: string,
  ) => {
    setDraftProfile((current) => ({ ...current, [field]: value }));
    setSaveStatus("idle");
  };

  const requestMobileVerification = () => {
    if (!draftProfile.mobileNumber?.trim()) {
      setMobileError("Enter a mobile number first.");
      return;
    }
    setMobileError("");
    setVerificationCode("");
    setVerificationRequested(true);
  };

  const verifyMobileNumber = () => {
    if (!/^\d{6}$/.test(verificationCode)) {
      setMobileError("Enter the 6-digit verification code.");
      return;
    }
    setDraftProfile((current) => ({ ...current, mobileVerified: true }));
    setVerificationRequested(false);
    setVerificationCode("");
    setMobileError("");
    setSaveStatus("idle");
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose an image file and try again.");
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        setPhotoError(
          "We couldn’t read that photo. Choose another image and try again.",
        );
        return;
      }
      setDraftProfile((current) => ({
        ...current,
        avatarDataUrl: reader.result as string,
      }));
      setPhotoError("");
      setSaveStatus("idle");
    });
    reader.addEventListener("error", () => {
      setPhotoError(
        "We couldn’t read that photo. Choose another image and try again.",
      );
    });
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setDraftProfile((current) => ({ ...current, avatarDataUrl: null }));
    setPhotoError("");
    setSaveStatus("idle");
  };

  const discardChanges = () => {
    setDraftProfile(savedProfile);
    setNameError("");
    setUsernameError("");
    setMobileError("");
    setPhotoError("");
    setVerificationRequested(false);
    setVerificationCode("");
    setSaveStatus("idle");
  };

  const saveChanges = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = draftProfile.displayName.trim();
    const normalizedUsername = draftProfile.username?.trim() ?? "";

    if (!normalizedName) {
      setNameError("Enter the name you want to use in this academy.");
      setSaveStatus("error");
      return;
    }

    if (normalizedUsername && !/^[a-zA-Z0-9._-]+$/.test(normalizedUsername)) {
      setUsernameError(
        "Use letters, numbers, dots, underscores, or hyphens only.",
      );
      setSaveStatus("error");
      return;
    }

    if (!isOnline) return;

    const nextProfile = {
      ...draftProfile,
      displayName: normalizedName,
      username: normalizedUsername,
      mobileNumber: draftProfile.mobileNumber?.trim() ?? "",
      linkedinUrl: draftProfile.linkedinUrl?.trim() ?? "",
      githubUrl: draftProfile.githubUrl?.trim() ?? "",
    };
    setSaveStatus("saving");
    await Promise.resolve();

    if (!saveProfilePreferences(role, nextProfile)) {
      setSaveStatus("error");
      return;
    }

    setSavedProfile(nextProfile);
    setDraftProfile(nextProfile);
    setSaveStatus("saved");
    onProfileSaved?.(nextProfile);
  };

  const hasFieldError = Boolean(nameError || usernameError || mobileError);

  const statusContent = !isOnline ? (
    <>
      <WifiSlash size={17} /> You’re offline. Reconnect to save your changes.
    </>
  ) : saveStatus === "saving" ? (
    <>
      <CircleNotch className="settings-profile__spinner" size={17} /> Saving
      changes…
    </>
  ) : saveStatus === "saved" ? (
    <>
      <CheckCircle size={17} weight="fill" /> Changes saved
    </>
  ) : saveStatus === "error" && hasFieldError ? (
    <>Review the highlighted field, then try again.</>
  ) : saveStatus === "error" && !nameError ? (
    <>We couldn’t save your changes. Your edits are still here—try again.</>
  ) : isDirty ? (
    <>Unsaved changes</>
  ) : (
    <>Your profile is up to date</>
  );

  const avatar = (className: string) => (
    <span className={className} aria-hidden="true">
      {showAvatar ? (
        <img
          src={draftProfile.avatarDataUrl ?? undefined}
          alt=""
          onError={() => setAvatarFailed(true)}
        />
      ) : (
        <strong>{getInitials(displayName)}</strong>
      )}
    </span>
  );

  return (
    <section
      className="settings-profile"
      aria-labelledby="profile-settings-title"
    >
      <header className="settings-profile__header">
        <div>
          <h2 id="profile-settings-title">Profile details</h2>
          <p>Manage how people recognize and connect with you.</p>
        </div>
        <span
          className={`settings-profile__status settings-profile__status--${!isOnline ? "offline" : saveStatus}`}
          role="status"
          aria-live="polite"
        >
          {statusContent}
        </span>
      </header>

      <div className="settings-profile__layout">
        <aside
          className="settings-profile__identity"
          aria-labelledby="profile-photo-title"
        >
          <div className="settings-profile__identity-heading">
            <UserFocus size={21} weight="duotone" />
            <div>
              <h3 id="profile-photo-title">Profile photo</h3>
              <p>Use a clear, square image for the best result.</p>
            </div>
          </div>

          <div className="settings-profile__photo">
            {avatar("settings-profile__avatar settings-profile__avatar--large")}
            <button
              type="button"
              className="settings-profile__camera"
              aria-label="Choose a new profile photo"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera size={18} weight="fill" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            className="settings-profile__file-input"
            type="file"
            accept="image/*"
            aria-label="Profile photo file"
            aria-describedby={
              photoError
                ? "profile-photo-help profile-photo-error"
                : "profile-photo-help"
            }
            tabIndex={-1}
            onChange={handlePhotoChange}
          />
          <p id="profile-photo-help" className="settings-profile__photo-help">
            Choose an image from your device, or use your initials instead.
          </p>
          {photoError && (
            <p
              id="profile-photo-error"
              className="settings-profile__error"
              role="alert"
            >
              {photoError}
            </p>
          )}

          <div className="settings-profile__photo-actions">
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              <Camera size={17} /> Change photo
            </button>
            <button
              type="button"
              onClick={removePhoto}
              disabled={!draftProfile.avatarDataUrl}
            >
              <Trash size={17} /> Remove
            </button>
          </div>
        </aside>

        <form
          className="settings-profile__form"
          onSubmit={saveChanges}
          noValidate
        >
          <div className="settings-profile__form-heading">
            <IdentificationCard size={22} weight="duotone" aria-hidden="true" />
            <div>
              <h3>Personal details</h3>
              <p>Choose how your name and contact details appear.</p>
            </div>
          </div>

          <div className="settings-profile__fields">
            <div className="settings-profile__field-grid">
              <div className="settings-profile__field">
                <label htmlFor="profile-display-name">Display name</label>
                <input
                  id="profile-display-name"
                  name="displayName"
                  value={draftProfile.displayName}
                  autoComplete="name"
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={
                    nameError
                      ? "profile-display-name-help profile-display-name-error"
                      : "profile-display-name-help"
                  }
                  onChange={(event) => updateDisplayName(event.target.value)}
                />
                <small id="profile-display-name-help">
                  This is the name shown on your profile.
                </small>
                {nameError && (
                  <small
                    id="profile-display-name-error"
                    className="settings-profile__error"
                    role="alert"
                  >
                    {nameError}
                  </small>
                )}
              </div>

              <div className="settings-profile__field">
                <label htmlFor="profile-username">Username</label>
                <span className="settings-profile__input-shell">
                  <At size={17} aria-hidden="true" />
                  <input
                    id="profile-username"
                    name="username"
                    value={draftProfile.username ?? ""}
                    autoComplete="username"
                    placeholder="username"
                    aria-invalid={Boolean(usernameError)}
                    aria-describedby={
                      usernameError
                        ? "profile-username-help profile-username-error"
                        : "profile-username-help"
                    }
                    onChange={(event) => updateUsername(event.target.value)}
                  />
                </span>
                <small id="profile-username-help">
                  People can mention you as @
                  {draftProfile.username?.trim() || "username"}.
                </small>
                {usernameError && (
                  <small
                    id="profile-username-error"
                    className="settings-profile__error"
                    role="alert"
                  >
                    {usernameError}
                  </small>
                )}
              </div>
            </div>

            <div className="settings-profile__field settings-profile__field--email">
              <label htmlFor="profile-email">Email address</label>
              <div className="settings-profile__email-control">
                <span className="settings-profile__readonly-input">
                  <LockKey size={17} aria-hidden="true" />
                  <input
                    id="profile-email"
                    name="email"
                    value={initialIdentity.email}
                    autoComplete="email"
                    readOnly
                    aria-readonly="true"
                  />
                </span>
                <button
                  type="button"
                  className="settings-profile__security-link"
                  onClick={() => onNavigatePage?.("/settings/security")}
                >
                  Manage sign-in &amp; security <ArrowRight size={17} />
                </button>
              </div>
              <small>
                Your sign-in email is managed separately from your profile.
              </small>
            </div>
          </div>

          <div className="settings-profile__form-section-heading">
            <Phone size={21} weight="duotone" aria-hidden="true" />
            <div>
              <h4>Contact &amp; profiles</h4>
              <p>Add a verified mobile number and optional social links.</p>
            </div>
          </div>

          <div className="settings-profile__fields settings-profile__fields--secondary">
            <div className="settings-profile__field">
              <label htmlFor="profile-mobile">Mobile number</label>
              <div className="settings-profile__phone-control">
                <span className="settings-profile__input-shell">
                  <Phone size={17} aria-hidden="true" />
                  <input
                    id="profile-mobile"
                    name="mobileNumber"
                    type="tel"
                    value={draftProfile.mobileNumber ?? ""}
                    autoComplete="tel"
                    placeholder="Enter mobile number"
                    aria-invalid={Boolean(mobileError)}
                    aria-describedby={
                      mobileError
                        ? "profile-mobile-help profile-mobile-error"
                        : "profile-mobile-help"
                    }
                    onChange={(event) => updateMobileNumber(event.target.value)}
                  />
                </span>
                {draftProfile.mobileVerified ? (
                  <span className="settings-profile__verified-badge">
                    <SealCheck size={17} weight="fill" /> Verified
                  </span>
                ) : (
                  <button
                    type="button"
                    className="settings-profile__verify-action"
                    onClick={requestMobileVerification}
                  >
                    {verificationRequested ? "Resend code" : "Send code"}
                  </button>
                )}
              </div>
              <small id="profile-mobile-help">
                Changing the number will require verification again.
              </small>
              {mobileError && (
                <small
                  id="profile-mobile-error"
                  className="settings-profile__error"
                  role="alert"
                >
                  {mobileError}
                </small>
              )}

              {verificationRequested && !draftProfile.mobileVerified && (
                <div className="settings-profile__verification-panel">
                  <div>
                    <label htmlFor="profile-verification-code">
                      Verification code
                    </label>
                    <input
                      id="profile-verification-code"
                      value={verificationCode}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="6-digit code"
                      onChange={(event) => {
                        setVerificationCode(
                          event.target.value.replace(/\D/g, ""),
                        );
                        setMobileError("");
                      }}
                    />
                  </div>
                  <button type="button" onClick={verifyMobileNumber}>
                    Verify number
                  </button>
                </div>
              )}
            </div>

            <div className="settings-profile__field-grid">
              <div className="settings-profile__field">
                <label htmlFor="profile-linkedin">LinkedIn</label>
                <span className="settings-profile__input-shell">
                  <LinkedinLogo size={17} aria-hidden="true" />
                  <input
                    id="profile-linkedin"
                    name="linkedinUrl"
                    type="url"
                    value={draftProfile.linkedinUrl ?? ""}
                    inputMode="url"
                    placeholder="linkedin.com/in/your-name"
                    onChange={(event) =>
                      updateProfileLink("linkedinUrl", event.target.value)
                    }
                  />
                </span>
              </div>

              <div className="settings-profile__field">
                <label htmlFor="profile-github">GitHub</label>
                <span className="settings-profile__input-shell">
                  <GithubLogo size={17} aria-hidden="true" />
                  <input
                    id="profile-github"
                    name="githubUrl"
                    type="url"
                    value={draftProfile.githubUrl ?? ""}
                    inputMode="url"
                    placeholder="github.com/username"
                    onChange={(event) =>
                      updateProfileLink("githubUrl", event.target.value)
                    }
                  />
                </span>
              </div>
            </div>
          </div>

          <footer className="settings-profile__form-footer">
            <p>Review your details before saving.</p>
            <div>
              <button
                type="button"
                className="settings-profile__secondary-action"
                disabled={!isDirty || saveStatus === "saving"}
                onClick={discardChanges}
              >
                Discard
              </button>
              <button
                type="submit"
                className="settings-profile__primary-action"
                disabled={!isDirty || !isOnline || saveStatus === "saving"}
                aria-busy={saveStatus === "saving"}
              >
                {saveStatus === "saving" ? "Saving…" : "Save changes"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </section>
  );
}
