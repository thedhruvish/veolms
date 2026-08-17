function getProfileInitials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase())
    .join("");
}

export function ShellProfileAvatar({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null;
  displayName: string;
}) {
  return (
    <i className="shell-profile-avatar" aria-hidden="true">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          width={43}
          height={43}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
        />
      ) : (
        <strong>{getProfileInitials(displayName)}</strong>
      )}
    </i>
  );
}
