\set ON_ERROR_STOP on
insert into public.automations (id, user_id, status)
values ('00000000-0000-4000-8000-000000000002', null, 'live')
on conflict (id) do update set user_id = excluded.user_id, status = excluded.status;

select public.enqueue_execution_job(
  '00000000-0000-4000-8000-000000000002',
  'webhook',
  'concurrent-claim-' || n::text,
  jsonb_build_object('fixture', n),
  null,
  3,
  now()
)
from generate_series(1, 8) as n;
