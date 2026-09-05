create schema if not exists hashpaystream;

create table if not exists hashpaystream.domain_events (
  event_id text primary key,
  identity_domain text not null check (identity_domain in ('human', 'agent', 'system')),
  aggregate_type text not null check (length(aggregate_type) between 1 and 80),
  aggregate_id text not null check (length(aggregate_id) between 1 and 160),
  sequence bigint not null check (sequence > 0),
  event_type text not null check (length(event_type) between 1 and 120),
  event_version integer not null default 1 check (event_version > 0),
  payload_hash character(64) not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (identity_domain, aggregate_type, aggregate_id, sequence)
);

create index if not exists domain_events_aggregate_order_idx
  on hashpaystream.domain_events (identity_domain, aggregate_type, aggregate_id, sequence);
create index if not exists domain_events_recorded_at_idx
  on hashpaystream.domain_events (recorded_at);

create table if not exists hashpaystream.commands (
  command_id text primary key,
  identity_domain text not null check (identity_domain in ('human', 'agent', 'system')),
  command_type text not null check (length(command_type) between 1 and 120),
  aggregate_type text not null check (length(aggregate_type) between 1 and 80),
  aggregate_id text not null check (length(aggregate_id) between 1 and 160),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  request_hash character(64) not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'received' check (status in ('received', 'processing', 'succeeded', 'failed')),
  result jsonb,
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{3,80}$'),
  received_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (identity_domain, command_type, idempotency_key),
  check ((status in ('received', 'processing') and completed_at is null)
    or (status in ('succeeded', 'failed') and completed_at is not null))
);

create index if not exists commands_status_received_idx
  on hashpaystream.commands (status, received_at);

create table if not exists hashpaystream.webhook_inbox (
  provider text not null check (provider in ('hash_paylink', 'circle', 'xlayer', 'arc')),
  delivery_id text not null check (length(delivery_id) between 8 and 200),
  event_type text not null check (length(event_type) between 1 and 120),
  payload_hash character(64) not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{3,80}$'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, delivery_id)
);

create index if not exists webhook_inbox_work_idx
  on hashpaystream.webhook_inbox (status, available_at)
  where status in ('received', 'processing');

create table if not exists hashpaystream.outbox (
  outbox_id text primary key,
  topic text not null check (length(topic) between 1 and 120),
  aggregate_type text not null check (length(aggregate_type) between 1 and 80),
  aggregate_id text not null check (length(aggregate_id) between 1 and 160),
  payload_hash character(64) not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'published', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{3,80}$'),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists outbox_work_idx
  on hashpaystream.outbox (status, available_at)
  where status in ('pending', 'processing');

create table if not exists hashpaystream.ledger_accounts (
  account_id text primary key,
  identity_domain text not null check (identity_domain in ('human', 'agent', 'system')),
  owner_reference text not null check (length(owner_reference) between 8 and 160),
  network text not null check (length(network) between 1 and 80),
  asset_address text not null check (asset_address ~ '^0x[a-f0-9]{40}$'),
  purpose text not null check (purpose in (
    'user_available',
    'agreement_protected',
    'agreement_refundable',
    'advance_deployed',
    'funder_receivable',
    'provider_receivable',
    'platform_receivable',
    'external_clearing',
    'suspense'
  )),
  created_at timestamptz not null default now(),
  unique (identity_domain, owner_reference, network, asset_address, purpose)
);

create table if not exists hashpaystream.ledger_transactions (
  posting_id text primary key,
  posting_key text not null unique check (length(posting_key) between 8 and 200),
  request_hash character(64) not null check (request_hash ~ '^[a-f0-9]{64}$'),
  reference_type text not null check (length(reference_type) between 1 and 80),
  reference_id text not null check (length(reference_id) between 1 and 160),
  network text not null check (length(network) between 1 and 80),
  asset_address text not null check (asset_address ~ '^0x[a-f0-9]{40}$'),
  status text not null default 'draft' check (status in ('draft', 'posted')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  check ((status = 'draft' and posted_at is null) or (status = 'posted' and posted_at is not null))
);

create index if not exists ledger_transactions_reference_idx
  on hashpaystream.ledger_transactions (reference_type, reference_id, occurred_at);

create table if not exists hashpaystream.ledger_entries (
  posting_id text not null references hashpaystream.ledger_transactions(posting_id) on delete restrict,
  line_number smallint not null check (line_number > 0),
  account_id text not null references hashpaystream.ledger_accounts(account_id) on delete restrict,
  side text not null check (side in ('debit', 'credit')),
  amount_units numeric(78, 0) not null check (amount_units > 0),
  memo_code text not null check (memo_code ~ '^[a-z0-9_.-]{3,80}$'),
  created_at timestamptz not null default now(),
  primary key (posting_id, line_number)
);

create index if not exists ledger_entries_account_idx
  on hashpaystream.ledger_entries (account_id, posting_id);

create or replace function hashpaystream.guard_ledger_transaction()
returns trigger
language plpgsql
as $$
declare
  entry_count bigint;
  debit_total numeric(78, 0);
  credit_total numeric(78, 0);
  mismatched_accounts bigint;
begin
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'LEDGER_TRANSACTION_MUST_START_DRAFT';
  end if;
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception 'POSTED_LEDGER_TRANSACTION_IMMUTABLE';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status = 'posted' then
    raise exception 'POSTED_LEDGER_TRANSACTION_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' and new.status = 'posted' then
    select
      count(*),
      coalesce(sum(case when side = 'debit' then amount_units else 0 end), 0),
      coalesce(sum(case when side = 'credit' then amount_units else 0 end), 0)
    into entry_count, debit_total, credit_total
    from hashpaystream.ledger_entries
    where posting_id = new.posting_id;

    select count(*)
    into mismatched_accounts
    from hashpaystream.ledger_entries entry
    join hashpaystream.ledger_accounts account on account.account_id = entry.account_id
    where entry.posting_id = new.posting_id
      and (account.network <> new.network or account.asset_address <> new.asset_address);

    if entry_count < 2 or debit_total <= 0 or debit_total <> credit_total then
      raise exception 'LEDGER_TRANSACTION_UNBALANCED';
    end if;
    if mismatched_accounts > 0 then
      raise exception 'LEDGER_ACCOUNT_ASSET_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_ledger_transaction on hashpaystream.ledger_transactions;
create trigger guard_ledger_transaction
before insert or update or delete on hashpaystream.ledger_transactions
for each row execute function hashpaystream.guard_ledger_transaction();

create or replace function hashpaystream.guard_ledger_entry()
returns trigger
language plpgsql
as $$
declare
  target_posting_id text;
  transaction_status text;
begin
  target_posting_id := case when tg_op = 'DELETE' then old.posting_id else new.posting_id end;
  select status into transaction_status
  from hashpaystream.ledger_transactions
  where posting_id = target_posting_id;
  if transaction_status = 'posted' then
    raise exception 'POSTED_LEDGER_ENTRY_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists guard_ledger_entry on hashpaystream.ledger_entries;
create trigger guard_ledger_entry
before insert or update or delete on hashpaystream.ledger_entries
for each row execute function hashpaystream.guard_ledger_entry();

create or replace function hashpaystream.guard_ledger_account()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from hashpaystream.ledger_entries entry
    join hashpaystream.ledger_transactions ledger_tx
      on ledger_tx.posting_id = entry.posting_id
    where entry.account_id = old.account_id and ledger_tx.status = 'posted'
  ) then
    raise exception 'POSTED_LEDGER_ACCOUNT_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists guard_ledger_account on hashpaystream.ledger_accounts;
create trigger guard_ledger_account
before update or delete on hashpaystream.ledger_accounts
for each row execute function hashpaystream.guard_ledger_account();
