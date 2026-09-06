create table if not exists hashpaystream.agreement_receipt_bindings (
  observation_id text primary key references hashpaystream.chain_observations(observation_id) on delete restrict,
  agreement_id text not null references hashpaystream.agreements(agreement_id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists agreement_receipt_bindings_agreement_idx on hashpaystream.agreement_receipt_bindings(agreement_id);
create trigger guard_agreement_receipt_binding_append_only before update or delete on hashpaystream.agreement_receipt_bindings
for each row execute function hashpaystream.reject_append_only_mutation();

create or replace function hashpaystream.guard_receipt_binding_insert()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from hashpaystream.chain_observations o join hashpaystream.ledger_transactions p
    on p.reference_type = 'chain_observation' and p.reference_id = o.observation_id and p.status = 'posted'
    where o.observation_id = new.observation_id and o.observation_type = 'confirmed') then
    raise exception 'RECEIPT_BINDING_REQUIRES_POSTED_EVIDENCE';
  end if;
  return new;
end;
$$;
create trigger guard_receipt_binding_insert before insert on hashpaystream.agreement_receipt_bindings
for each row execute function hashpaystream.guard_receipt_binding_insert();

create or replace function hashpaystream.guard_agreement_projection()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' or old.agreement_id is distinct from new.agreement_id then
    raise exception 'AGREEMENT_PROJECTION_IMMUTABLE';
  end if;
  if new.source_version < old.source_version then raise exception 'AGREEMENT_PROJECTION_VERSION_REGRESSION'; end if;
  if new.source_version = old.source_version and (new.source_hash is distinct from old.source_hash or new.projection is distinct from old.projection
    or new.authoritative_observed_at is distinct from old.authoritative_observed_at) then
    raise exception 'AGREEMENT_PROJECTION_SOURCE_CONFLICT';
  end if;
  return new;
end;
$$;
