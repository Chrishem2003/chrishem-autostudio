-- Gmail's send-only OAuth scope cannot call users.getProfile.
-- Verification is recorded only after the user confirms a real test email send.
alter table public.app_user_connections
  add column if not exists verified_at timestamptz;
