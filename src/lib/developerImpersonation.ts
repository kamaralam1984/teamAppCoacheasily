export interface ImpersonationTarget {
  auth_user_id: string | null;
  status: string;
  disabled: boolean;
  isDeveloper: boolean;
}

export function impersonationBlockedReason(target: ImpersonationTarget): string | null {
  if (!target.auth_user_id) return "This person has no login.";
  if (target.status === "exited") return "This person has exited.";
  if (target.disabled) return "This person's login is disabled.";
  if (target.isDeveloper) return "Developer accounts cannot be impersonated, including your own.";
  return null;
}

export function validateImpersonationInput(input: { profileId: string; redirectTo: string }) {
  if (!input?.profileId) throw new Error("Choose a person first.");
  let url: URL;
  try { url = new URL(input.redirectTo); } catch { throw new Error("Use a valid app dashboard address."); }
  if (!(["https:", "http:"].includes(url.protocol)) || url.username || url.password || url.pathname !== "/dashboard" || url.search || url.hash) {
    throw new Error("Use a valid app dashboard address.");
  }
  return input;
}