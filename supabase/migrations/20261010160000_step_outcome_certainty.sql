-- Preserve whether a failed step may already have changed an external system.
-- This is separate from status: "failed" does not necessarily mean "nothing happened".
alter table public.run_step_logs
  add column if not exists outcome_state text not null default 'not_attempted'
  check (outcome_state in ('confirmed', 'uncertain', 'not_attempted'));

comment on column public.run_step_logs.outcome_state is
  'External side-effect certainty: confirmed, uncertain (inspect before retry), or not_attempted.';
