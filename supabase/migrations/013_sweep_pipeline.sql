-- Sweep pipeline: link jobs to intents/deposits, index credited deposits

alter table public.sweep_jobs
  add column if not exists intent_id uuid null references public.stake_intents (id) on delete set null,
  add column if not exists deposit_record_id uuid null references public.deposit_records (id) on delete set null;

create unique index if not exists sweep_jobs_deposit_record_uidx
  on public.sweep_jobs (deposit_record_id)
  where deposit_record_id is not null and job_type = 'deposit_to_settlement';

create index if not exists deposit_records_credited_sweep_idx
  on public.deposit_records (status, credited_at)
  where status in ('credited', 'sweep_pending');

create index if not exists sweep_jobs_queued_idx
  on public.sweep_jobs (status, created_at)
  where status in ('queued', 'signing', 'broadcasted');
