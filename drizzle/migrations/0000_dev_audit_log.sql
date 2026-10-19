create table public.dev_audit_log (id uuid primary key default gen_random_uuid(), actor_email text not null, action text not null, target text, detail jsonb not null default '{}', created_at timestamptz not null default now());
create index dev_audit_log_created_at_idx on public.dev_audit_log (created_at desc);
revoke all on public.dev_audit_log from anon, authenticated;
grant all on public.dev_audit_log to service_role;
alter table public.dev_audit_log enable row level security;