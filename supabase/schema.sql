create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.workspaces (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Import and Profit Workspace')
on conflict (id) do nothing;

create table if not exists public.approved_users (
  email text primary key,
  full_name text not null,
  role text not null default 'admin' check (role in ('admin', 'editor', 'viewer')),
  workspace_id uuid not null references public.workspaces(id),
  created_at timestamptz not null default now()
);

insert into public.approved_users (email, full_name, role, workspace_id) values
  ('senthil@datapower.co.in', 'Senthil K', 'admin', '00000000-0000-0000-0000-000000000001'),
  ('selva@ringke.co.in', 'Selva S', 'admin', '00000000-0000-0000-0000-000000000001'),
  ('joel.bruno@exaktheit.in', 'Joel B', 'admin', '00000000-0000-0000-0000-000000000001')
on conflict (email) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  workspace_id = excluded.workspace_id;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  workspace_id uuid not null references public.workspaces(id),
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  state jsonb not null,
  version bigint not null default 1,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id),
  user_email text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_workspace_created_idx
  on public.audit_logs (workspace_id, created_at desc);

create or replace function public.create_profile_for_approved_user()
returns trigger
language plpgsql
security definer set search_path = public
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_approved_user();

alter table public.profiles enable row level security;
alter table public.workspace_state enable row level security;
alter table public.audit_logs enable row level security;

create policy "members can read workspace profiles" on public.profiles
for select to authenticated using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
);

create policy "members can read shared state" on public.workspace_state
for select to authenticated using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
);

create policy "admins and editors can update shared state" on public.workspace_state
for all to authenticated using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  and (select role from public.profiles where id = auth.uid()) in ('admin', 'editor')
) with check (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  and (select role from public.profiles where id = auth.uid()) in ('admin', 'editor')
);

create policy "members can read audit logs" on public.audit_logs
for select to authenticated using (
  workspace_id = (select workspace_id from public.profiles where id = auth.uid())
);

revoke update, delete on public.audit_logs from anon, authenticated;
