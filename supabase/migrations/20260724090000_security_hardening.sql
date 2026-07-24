create extension if not exists pg_cron with schema pg_catalog;

alter table public.workspaces enable row level security;
alter table public.approved_users enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_state enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "members can read workspace profiles" on public.profiles;
drop policy if exists "members can read shared state" on public.workspace_state;
drop policy if exists "admins and editors can update shared state" on public.workspace_state;
drop policy if exists "members can read audit logs" on public.audit_logs;

revoke all on table public.workspaces from anon, authenticated;
revoke all on table public.approved_users from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.workspace_state from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on sequence public.audit_logs_id_seq from anon, authenticated;

grant select on table public.workspaces to service_role;
grant select, insert, update, delete on table public.approved_users to service_role;
grant select, update on table public.profiles to service_role;
grant select, insert, update on table public.workspace_state to service_role;
grant select, insert, delete on table public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;

create or replace function public.create_profile_for_approved_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare approved public.approved_users%rowtype;
begin
  select * into approved from public.approved_users where lower(email) = lower(new.email);
  if approved.email is null then
    raise exception 'This email address has not been invited.';
  end if;
  insert into public.profiles (id, email, full_name, role, workspace_id)
  values (new.id, lower(new.email), approved.full_name, approved.role, approved.workspace_id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.create_profile_for_approved_user() from public, anon, authenticated;

select cron.schedule(
  'purge-expired-import-profit-audit-logs',
  '17 2 * * *',
  $$delete from public.audit_logs where created_at < now() - interval '30 days'$$
);
