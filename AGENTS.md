<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Developer panel access is an auth-email allowlist (src/lib/developer.server.ts + optional DEVELOPER_EMAILS secret), never profiles.role; every dev server fn re-checks it server-side and audits writes to dev_audit_log (service-role only, no RLS policies). Why: one technical maintainer needs cross-table access without granting an app role.
- Developer Users profile edits use the service-role-only dev_update_profile RPC with a transaction-local trigger escape hatch; generic Data updates reject identity-protected fields with guidance. Why: preserve the profile trigger and RLS while permitting authorized developer edits.
- Developer impersonation uses a gated server function and shared eligibility checks; the Users list exposes only a developer-target boolean, and links remain transient UI state. Why: recheck authorization at issuance without exposing the allowlist or persisting login credentials.
