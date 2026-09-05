create or replace function hashpaystream.reject_append_only_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'APPEND_ONLY_RECORD_IMMUTABLE';
end;
$$;

drop trigger if exists guard_domain_event_append_only on hashpaystream.domain_events;
create trigger guard_domain_event_append_only
before update or delete on hashpaystream.domain_events
for each row execute function hashpaystream.reject_append_only_mutation();

create or replace function hashpaystream.guard_command_update()
returns trigger
language plpgsql
as $$
begin
  if old.identity_domain is distinct from new.identity_domain
    or old.command_type is distinct from new.command_type
    or old.aggregate_type is distinct from new.aggregate_type
    or old.aggregate_id is distinct from new.aggregate_id
    or old.idempotency_key is distinct from new.idempotency_key
    or old.request_hash is distinct from new.request_hash
    or old.received_at is distinct from new.received_at then
    raise exception 'COMMAND_IDENTITY_IMMUTABLE';
  end if;
  if old.status in ('succeeded', 'failed') then
    raise exception 'TERMINAL_COMMAND_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_command_update on hashpaystream.commands;
create trigger guard_command_update
before update or delete on hashpaystream.commands
for each row execute function hashpaystream.guard_command_update();

create or replace function hashpaystream.guard_webhook_inbox_update()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'WEBHOOK_INBOX_RECORD_IMMUTABLE';
  end if;
  if old.provider is distinct from new.provider
    or old.delivery_id is distinct from new.delivery_id
    or old.event_type is distinct from new.event_type
    or old.payload_hash is distinct from new.payload_hash
    or old.payload is distinct from new.payload
    or old.received_at is distinct from new.received_at then
    raise exception 'WEBHOOK_INBOX_IDENTITY_IMMUTABLE';
  end if;
  if new.attempts < old.attempts then
    raise exception 'WEBHOOK_INBOX_ATTEMPT_REGRESSION';
  end if;
  if old.status in ('processed', 'dead_letter') then
    raise exception 'WEBHOOK_INBOX_TERMINAL_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_webhook_inbox_update on hashpaystream.webhook_inbox;
create trigger guard_webhook_inbox_update
before update or delete on hashpaystream.webhook_inbox
for each row execute function hashpaystream.guard_webhook_inbox_update();

create or replace function hashpaystream.guard_outbox_update()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'OUTBOX_RECORD_IMMUTABLE';
  end if;
  if old.topic is distinct from new.topic
    or old.aggregate_type is distinct from new.aggregate_type
    or old.aggregate_id is distinct from new.aggregate_id
    or old.payload_hash is distinct from new.payload_hash
    or old.payload is distinct from new.payload
    or old.created_at is distinct from new.created_at then
    raise exception 'OUTBOX_IDENTITY_IMMUTABLE';
  end if;
  if new.attempts < old.attempts then
    raise exception 'OUTBOX_ATTEMPT_REGRESSION';
  end if;
  if old.status in ('published', 'dead_letter') then
    raise exception 'OUTBOX_TERMINAL_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_outbox_update on hashpaystream.outbox;
create trigger guard_outbox_update
before update or delete on hashpaystream.outbox
for each row execute function hashpaystream.guard_outbox_update();

create table if not exists hashpaystream.service_requests (
  request_id text primary key,
  identity_domain text not null check (identity_domain in ('human', 'agent')),
  customer_reference text not null check (length(customer_reference) between 8 and 160),
  provider_reference text not null check (length(provider_reference) between 8 and 160),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  status text not null check (status in ('sent', 'countered', 'provider_accepted', 'awaiting_funding', 'funded', 'expired', 'completed', 'refunded', 'declined', 'cancelled')),
  current_version integer not null check (current_version > 0),
  agreement_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (updated_at >= created_at),
  unique (identity_domain, request_id)
);

create index if not exists service_requests_customer_idx
  on hashpaystream.service_requests (identity_domain, customer_reference, updated_at desc);
create index if not exists service_requests_provider_idx
  on hashpaystream.service_requests (identity_domain, provider_reference, updated_at desc);
create unique index if not exists service_requests_agreement_idx
  on hashpaystream.service_requests (agreement_id)
  where agreement_id is not null;

create or replace function hashpaystream.guard_service_request()
returns trigger
language plpgsql
as $$
begin
  if old.identity_domain is distinct from new.identity_domain
    or old.customer_reference is distinct from new.customer_reference
    or old.provider_reference is distinct from new.provider_reference
    or old.visibility is distinct from new.visibility
    or old.created_at is distinct from new.created_at then
    raise exception 'SERVICE_REQUEST_IDENTITY_IMMUTABLE';
  end if;
  if new.current_version < old.current_version then
    raise exception 'SERVICE_REQUEST_VERSION_REGRESSION';
  end if;
  if old.agreement_id is not null and old.agreement_id is distinct from new.agreement_id then
    raise exception 'SERVICE_REQUEST_AGREEMENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_service_request on hashpaystream.service_requests;
create trigger guard_service_request
before update or delete on hashpaystream.service_requests
for each row execute function hashpaystream.guard_service_request();

create table if not exists hashpaystream.service_request_versions (
  request_id text not null references hashpaystream.service_requests(request_id) on delete restrict,
  version integer not null check (version > 0),
  proposed_by text not null check (proposed_by in ('customer', 'provider')),
  terms_hash character(64) not null check (terms_hash ~ '^[a-f0-9]{64}$'),
  amount_units numeric(78, 0) not null check (amount_units > 0),
  duration_seconds integer not null check (duration_seconds >= 3600),
  cancellation_window_seconds integer not null check (cancellation_window_seconds >= 0 and cancellation_window_seconds < duration_seconds),
  early_pay_requested boolean not null default false,
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),
  created_at timestamptz not null,
  primary key (request_id, version),
  unique (request_id, terms_hash)
);

drop trigger if exists guard_service_request_version_append_only on hashpaystream.service_request_versions;
create trigger guard_service_request_version_append_only
before update or delete on hashpaystream.service_request_versions
for each row execute function hashpaystream.reject_append_only_mutation();

create table if not exists hashpaystream.agreements (
  agreement_id text primary key,
  identity_domain text not null check (identity_domain in ('human', 'agent')),
  request_id text,
  checkout_mode text not null check (checkout_mode in ('human', 'agentic')),
  agreement_product text not null check (agreement_product in ('direct', 'upfront')),
  authoritative_provider text not null default 'hash_paylink' check (authoritative_provider = 'hash_paylink'),
  project_reference text not null check (length(project_reference) between 8 and 160),
  network text not null check (length(network) between 1 and 80),
  chain_id numeric(78, 0) not null check (chain_id > 0),
  asset_address text not null check (asset_address ~ '^0x[a-f0-9]{40}$'),
  protected_amount_units numeric(78, 0) not null check (protected_amount_units > 0),
  accepted_terms_hash character(64) not null check (accepted_terms_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('awaiting_start', 'active', 'expired', 'completed', 'cancelled', 'refunded')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (updated_at >= created_at),
  unique (request_id),
  foreign key (identity_domain, request_id) references hashpaystream.service_requests(identity_domain, request_id) on delete restrict
);

create index if not exists agreements_status_idx
  on hashpaystream.agreements (identity_domain, agreement_product, status, updated_at desc);

create or replace function hashpaystream.guard_agreement_identity()
returns trigger
language plpgsql
as $$
begin
  if old.identity_domain is distinct from new.identity_domain
    or old.request_id is distinct from new.request_id
    or old.checkout_mode is distinct from new.checkout_mode
    or old.agreement_product is distinct from new.agreement_product
    or old.authoritative_provider is distinct from new.authoritative_provider
    or old.project_reference is distinct from new.project_reference
    or old.network is distinct from new.network
    or old.chain_id is distinct from new.chain_id
    or old.asset_address is distinct from new.asset_address
    or old.protected_amount_units is distinct from new.protected_amount_units
    or old.accepted_terms_hash is distinct from new.accepted_terms_hash
    or old.created_at is distinct from new.created_at then
    raise exception 'AGREEMENT_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_agreement_identity on hashpaystream.agreements;
create trigger guard_agreement_identity
before update or delete on hashpaystream.agreements
for each row execute function hashpaystream.guard_agreement_identity();

create table if not exists hashpaystream.agreement_projections (
  agreement_id text primary key references hashpaystream.agreements(agreement_id) on delete restrict,
  source_version bigint not null check (source_version >= 0),
  source_hash character(64) not null check (source_hash ~ '^[a-f0-9]{64}$'),
  projection jsonb not null check (jsonb_typeof(projection) = 'object'),
  authoritative_observed_at timestamptz not null,
  reconciled_at timestamptz not null default now()
);

create or replace function hashpaystream.guard_agreement_projection()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'AGREEMENT_PROJECTION_IMMUTABLE';
  end if;
  if new.source_version < old.source_version then
    raise exception 'AGREEMENT_PROJECTION_VERSION_REGRESSION';
  end if;
  if new.source_version = old.source_version and new.source_hash <> old.source_hash then
    raise exception 'AGREEMENT_PROJECTION_SOURCE_CONFLICT';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_agreement_projection on hashpaystream.agreement_projections;
create trigger guard_agreement_projection
before update or delete on hashpaystream.agreement_projections
for each row execute function hashpaystream.guard_agreement_projection();

create table if not exists hashpaystream.chain_observations (
  observation_id text primary key,
  network text not null check (length(network) between 1 and 80),
  chain_id numeric(78, 0) not null check (chain_id > 0),
  transaction_hash text not null check (transaction_hash ~ '^0x[a-f0-9]{64}$'),
  log_index integer not null check (log_index >= 0),
  observation_type text not null check (observation_type in ('seen', 'confirmed', 'reorged')),
  block_number numeric(78, 0) not null check (block_number >= 0),
  block_hash text not null check (block_hash ~ '^0x[a-f0-9]{64}$'),
  contract_address text not null check (contract_address ~ '^0x[a-f0-9]{40}$'),
  event_name text not null check (length(event_name) between 1 and 120),
  payload_hash character(64) not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  observed_at timestamptz not null default now(),
  unique (network, chain_id, transaction_hash, log_index, observation_type, block_hash)
);

create index if not exists chain_observations_transaction_idx
  on hashpaystream.chain_observations (network, chain_id, transaction_hash, log_index);

drop trigger if exists guard_chain_observation_append_only on hashpaystream.chain_observations;
create trigger guard_chain_observation_append_only
before update or delete on hashpaystream.chain_observations
for each row execute function hashpaystream.reject_append_only_mutation();
