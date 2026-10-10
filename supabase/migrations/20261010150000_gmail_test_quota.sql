-- Limit real Gmail verification messages to three per user per hour.
create table if not exists public.gmail_test_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists gmail_test_usage_user_created_idx
  on public.gmail_test_usage (user_id, created_at desc);

alter table public.gmail_test_usage enable row level security;
revoke all on table public.gmail_test_usage from public, anon, authenticated;
grant all on table public.gmail_test_usage to service_role;

create or replace function public.consume_gmail_test_quota()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _used integer;
begin
  if _user_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_user_id::text || ':gmail_test', 0));

  select count(*)::integer
    into _used
    from public.gmail_test_usage
   where user_id = _user_id
     and created_at >= now() - interval '1 hour';

  if _used >= 3 then
    return false;
  end if;

  insert into public.gmail_test_usage (user_id) values (_user_id);
  return true;
end;
$$;

revoke all on function public.consume_gmail_test_quota() from public, anon;
grant execute on function public.consume_gmail_test_quota() to authenticated;
