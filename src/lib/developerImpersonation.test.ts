import { describe, it } from "node:test";
import { equal, throws } from "node:assert/strict";
import { impersonationBlockedReason, validateImpersonationInput } from "./developerImpersonation";

const active = { auth_user_id: "login-id", status: "active", disabled: false, isDeveloper: false };
describe("Developer impersonation eligibility", () => {
  it("blocks profiles without a login", () => equal(impersonationBlockedReason({ ...active, auth_user_id: null }), "This person has no login."));
  it("blocks exited profiles", () => equal(impersonationBlockedReason({ ...active, status: "exited" }), "This person has exited."));
  it("blocks banned logins", () => equal(impersonationBlockedReason({ ...active, disabled: true }), "This person's login is disabled."));
  it("blocks all developer accounts including self", () => equal(impersonationBlockedReason({ ...active, isDeveloper: true }), "Developer accounts cannot be impersonated, including your own."));
  it("allows an active non-developer login", () => equal(impersonationBlockedReason(active), null));
});
describe("Impersonation redirect", () => {
  it("accepts the requested dashboard URL", () => equal(validateImpersonationInput({ profileId: "profile-id", redirectTo: "https://team.coacheasily.com/dashboard" }).redirectTo, "https://team.coacheasily.com/dashboard"));
  it("rejects executable URLs and non-dashboard destinations", () => {
    for (const redirectTo of ["javascript:alert(1)", "https://team.coacheasily.com/auth", "https://user:password@example.com/dashboard"]) {
      throws(() => validateImpersonationInput({ profileId: "profile-id", redirectTo }));
    }
  });
});