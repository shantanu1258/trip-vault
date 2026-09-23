const KEY = "trip-vault:pending-invitation:v1";
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;

export function invitationCode(value: string | null): string | null {
  if (!value || !/^[a-z0-9 -]+$/i.test(value)) return null;
  const code = value.replace(/[ -]/g, "").toUpperCase();
  return code.length === 16 ? code : null;
}

export function clearPendingInvitation() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* URL continuation still works without storage. */
  }
}

export function pendingInvitationCode(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    const code = typeof value?.code === "string" ? invitationCode(value.code) : null;
    if (
      !code ||
      typeof value.expiresAt !== "number" ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= Date.now() ||
      value.expiresAt > Date.now() + MAX_AGE
    ) {
      clearPendingInvitation();
      return null;
    }
    return code;
  } catch {
    clearPendingInvitation();
    return null;
  }
}

export function rememberInvitation(value: string | null) {
  const code = invitationCode(value);
  if (!code || pendingInvitationCode() === code) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, expiresAt: Date.now() + MAX_AGE }));
  } catch {
    /* A blocked store must not block signup; the direct URL remains available. */
  }
}

export function pendingInvitationPath(): string | null {
  const code = pendingInvitationCode();
  return code ? `/join?${new URLSearchParams({ code })}` : null;
}
