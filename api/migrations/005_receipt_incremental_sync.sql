create table if not exists hashpaystream.receipt_projection_history (
  agreement_id text not null references hashpaystream.agreements(agreement_id),
  revision bigint not null check (revision >= 0),
  source_hash character(64) not null check (source_hash ~ '^[a-f0-9]{64}$'),
  projection jsonb not null check (jsonb_typeof(projection) = 'object'),
  recorded_at timestamptz not null default now(),
  primary key (agreement_id, revision)
);
create trigger guard_receipt_projection_history before update or delete on hashpaystream.receipt_projection_history
for each row execute function hashpaystream.reject_append_only_mutation();

create table if not exists hashpaystream.receipt_sync_health (
  singleton boolean primary key default true check (singleton),
  state text not null check (state in ('syncing','ready','blocked')),
  run_id uuid not null,
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{3,80}$'),
  updated_at timestamptz not null default now(),
  verified_at timestamptz
);
