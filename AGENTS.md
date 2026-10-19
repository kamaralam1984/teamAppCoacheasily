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
