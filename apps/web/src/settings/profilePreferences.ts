export type ProfileRole = "student" | "creator";

export interface ProfilePreferences {
  displayName: string;
  avatarDataUrl: string | null;
  username?: string;
  mobileNumber?: string;
  mobileVerified?: boolean;
  linkedinUrl?: string;
  githubUrl?: string;
}

export interface ProfileIdentity extends ProfilePreferences {
  email: string;
  roleLabel: string;
}

const PROFILE_STORAGE_KEYS: Readonly<Record<ProfileRole, string>> = {
  student: "veolms-profile-student",
  creator: "veolms-profile-creator",
};

const PROFILE_DEFAULTS: Readonly<Record<ProfileRole, ProfileIdentity>> = {
  student: {
    displayName: "Ashi Singh",
    email: "ashi.singh@example.com",
    avatarDataUrl: "/assets/sofia-avatar.jpg",
    username: "",
    mobileNumber: "",
    mobileVerified: false,
    linkedinUrl: "",
    githubUrl: "",
    roleLabel: "Student",
  },
  creator: {
    displayName: "Anurag Singh",
    email: "anurag.singh@example.com",
    avatarDataUrl: "/assets/ethan-avatar.jpg",
    username: "",
    mobileNumber: "",
    mobileVerified: false,
    linkedinUrl: "",
    githubUrl: "",
    roleLabel: "Instructor",
  },
};

const isStoredAvatar = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

export const getStoredProfilePreferences = (
  role: ProfileRole,
): ProfilePreferences | null => {
  if (typeof window === "undefined") return null;

  try {
    const storedValue = window.localStorage.getItem(PROFILE_STORAGE_KEYS[role]);
    if (!storedValue) return null;

    const parsedValue: unknown = JSON.parse(storedValue);
    if (typeof parsedValue !== "object" || parsedValue === null) return null;

    const storedProfile = parsedValue as Partial<ProfilePreferences>;
    if (
      typeof storedProfile.displayName !== "string" ||
      !storedProfile.displayName.trim() ||
      !isStoredAvatar(storedProfile.avatarDataUrl)
    )
      return null;

    return {
      displayName: storedProfile.displayName.trim(),
      avatarDataUrl: storedProfile.avatarDataUrl,
      ...(typeof storedProfile.username === "string"
        ? { username: storedProfile.username }
        : {}),
      ...(typeof storedProfile.mobileNumber === "string"
        ? { mobileNumber: storedProfile.mobileNumber }
        : {}),
      ...(typeof storedProfile.mobileVerified === "boolean"
        ? { mobileVerified: storedProfile.mobileVerified }
        : {}),
      ...(typeof storedProfile.linkedinUrl === "string"
        ? { linkedinUrl: storedProfile.linkedinUrl }
        : {}),
      ...(typeof storedProfile.githubUrl === "string"
        ? { githubUrl: storedProfile.githubUrl }
        : {}),
    };
  } catch {
    return null;
  }
};

export const getProfileIdentity = (role: ProfileRole): ProfileIdentity => {
  const defaults = PROFILE_DEFAULTS[role];
  if (typeof window === "undefined") return { ...defaults };

  try {
    const storedValue = window.localStorage.getItem(PROFILE_STORAGE_KEYS[role]);
    if (!storedValue) return { ...defaults };

    const parsedValue: unknown = JSON.parse(storedValue);
    if (typeof parsedValue !== "object" || parsedValue === null)
      return { ...defaults };

    const storedProfile = parsedValue as Partial<ProfilePreferences>;
    const mobileNumber =
      typeof storedProfile.mobileNumber === "string"
        ? storedProfile.mobileNumber
        : defaults.mobileNumber;
    return {
      ...defaults,
      displayName:
        typeof storedProfile.displayName === "string" &&
        storedProfile.displayName.trim()
          ? storedProfile.displayName
          : defaults.displayName,
      avatarDataUrl: isStoredAvatar(storedProfile.avatarDataUrl)
        ? storedProfile.avatarDataUrl
        : defaults.avatarDataUrl,
      username:
        typeof storedProfile.username === "string"
          ? storedProfile.username
          : defaults.username,
      mobileNumber,
      mobileVerified: Boolean(
        mobileNumber && storedProfile.mobileVerified === true,
      ),
      linkedinUrl:
        typeof storedProfile.linkedinUrl === "string"
          ? storedProfile.linkedinUrl
          : defaults.linkedinUrl,
      githubUrl:
        typeof storedProfile.githubUrl === "string"
          ? storedProfile.githubUrl
          : defaults.githubUrl,
    };
  } catch {
    return { ...defaults };
  }
};

export const saveProfilePreferences = (
  role: ProfileRole,
  profile: ProfilePreferences,
): boolean => {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(
      PROFILE_STORAGE_KEYS[role],
      JSON.stringify(profile),
    );
    return true;
  } catch {
    return false;
  }
};

export const getProfileStorageKey = (role: ProfileRole) =>
  PROFILE_STORAGE_KEYS[role];
