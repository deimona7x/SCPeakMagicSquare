-- Supabase schema for Peak & Magic
-- Run this once in Supabase Dashboard > SQL Editor.

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    nickname text not null,
    block text,
    server text,
    extra_servers text[] not null default '{}',
    role text not null default 'user',
    status text not null default 'pending',
    character_class text,
    power text,
    level text,
    nickname_change_request jsonb,
    created_at bigint,
    approved_by uuid,
    approved_at bigint,
    rejected_by uuid,
    rejected_at bigint,
    status_updated_by uuid,
    status_updated_at bigint,
    nickname_updated_by uuid,
    nickname_updated_at bigint,
    profile_updated_at bigint,
    extra_servers_updated_by uuid,
    extra_servers_updated_at bigint,
    role_updated_by uuid,
    role_updated_at bigint
);

create table if not exists public.server_state (
    server text not null,
    key text not null,
    value jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (server, key)
);

create table if not exists public.server_logs (
    id uuid primary key default gen_random_uuid(),
    server text not null,
    timestamp bigint not null,
    time text,
    user_name text,
    user_server text,
    floor integer,
    action text,
    target text,
    created_at timestamptz not null default now()
);

create table if not exists public.attendance (
    id uuid primary key default gen_random_uuid(),
    server text not null,
    uid uuid not null references auth.users(id) on delete cascade,
    nickname text,
    block text,
    user_server text,
    event text,
    sub_event text,
    image_url text,
    timestamp bigint not null,
    week_number text not null,
    points integer not null default 1,
    validation_status text not null default 'pending',
    rejection_reason text,
    validated_by uuid references auth.users(id),
    validated_by_name text,
    validated_at bigint,
    created_at timestamptz not null default now()
);

alter table public.attendance
    add column if not exists validation_status text not null default 'pending',
    add column if not exists rejection_reason text,
    add column if not exists validated_by uuid references auth.users(id),
    add column if not exists validated_by_name text,
    add column if not exists validated_at bigint;

create index if not exists profiles_status_idx on public.profiles(status);
create index if not exists profiles_nickname_idx on public.profiles(nickname);
create index if not exists server_logs_server_timestamp_idx on public.server_logs(server, timestamp desc);
create index if not exists attendance_server_week_idx on public.attendance(server, week_number);
create index if not exists attendance_uid_event_week_idx on public.attendance(uid, event, week_number);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (
        id,
        email,
        nickname,
        block,
        server,
        character_class,
        power,
        level,
        role,
        status,
        created_at
    )
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'block',
        new.raw_user_meta_data->>'server',
        new.raw_user_meta_data->>'characterClass',
        new.raw_user_meta_data->>'power',
        new.raw_user_meta_data->>'level',
        'user',
        'pending',
        (extract(epoch from now()) * 1000)::bigint
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.server_state enable row level security;
alter table public.server_logs enable row level security;
alter table public.attendance enable row level security;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and upper(role) in ('MASTER', 'STAFF', 'ADMIN')
          and status = 'approved'
    );
$$;

create or replace function public.can_access_server(target_server text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and status = 'approved'
          and (
              public.is_staff()
              or server = target_server
              or target_server = any(extra_servers)
          )
    );
$$;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_staff());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own_or_staff" on public.profiles;
create policy "profiles_update_own_or_staff"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_staff())
with check (id = auth.uid() or public.is_staff());

drop policy if exists "server_state_access" on public.server_state;
create policy "server_state_access"
on public.server_state for all
to authenticated
using (public.can_access_server(server))
with check (public.can_access_server(server));

drop policy if exists "server_logs_access" on public.server_logs;
create policy "server_logs_access"
on public.server_logs for all
to authenticated
using (public.can_access_server(server))
with check (public.can_access_server(server));

drop policy if exists "attendance_access" on public.attendance;
create policy "attendance_access"
on public.attendance for all
to authenticated
using (public.can_access_server(server))
with check (public.can_access_server(server));

do $$
begin
    begin
        alter publication supabase_realtime add table public.server_state;
    exception when duplicate_object then null;
    end;
    begin
        alter publication supabase_realtime add table public.server_logs;
    exception when duplicate_object then null;
    end;
    begin
        alter publication supabase_realtime add table public.attendance;
    exception when duplicate_object then null;
    end;
    begin
        alter publication supabase_realtime add table public.profiles;
    exception when duplicate_object then null;
    end;
end $$;

-- After your first account registers, bootstrap a Master manually:
-- update public.profiles set role = 'MASTER', status = 'approved' where email = 'your@email.com';
