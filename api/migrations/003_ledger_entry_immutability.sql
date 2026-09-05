-- Protect both ends of an entry move and serialize entries against finalization.
create or replace function hashpaystream.guard_ledger_entry()
returns trigger language plpgsql as $$
declare transaction_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select status into transaction_status from hashpaystream.ledger_transactions
      where posting_id = old.posting_id for update;
    if transaction_status = 'posted' then raise exception 'POSTED_LEDGER_ENTRY_IMMUTABLE'; end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select status into transaction_status from hashpaystream.ledger_transactions
      where posting_id = new.posting_id for update;
    if transaction_status = 'posted' then raise exception 'POSTED_LEDGER_ENTRY_IMMUTABLE'; end if;
    perform 1 from hashpaystream.ledger_accounts where account_id = new.account_id for share;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;