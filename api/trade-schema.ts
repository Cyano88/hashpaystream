import type pg from "pg";

// Shared initialization keeps discovery and checkout availability on the same schema.
export function createTradeSchemaInitializer(pool: pg.Pool) {
 let schema: Promise<void> | undefined;
 return async () => {
  if (!schema) {
    schema = pool.query(`create table if not exists hashpaystream_trade_listings (
      id uuid primary key, owner text not null, status text not null check (status in ('active','sold','removed')),
      revision integer not null check (revision > 0), data jsonb not null,
      created_at bigint not null
    ); create index if not exists hashpaystream_trade_owner on hashpaystream_trade_listings(owner);
    create index if not exists hashpaystream_trade_browse on hashpaystream_trade_listings(status,created_at desc,id desc);
        create table if not exists hashpaystream_trade_threads (
          id uuid primary key, listing_id uuid not null references hashpaystream_trade_listings(id),
          buyer text not null, seller text not null, title text not null, created_at bigint not null, updated_at bigint not null,
          unique(listing_id,buyer), check(buyer<>seller));
        create index if not exists trade_threads_buyer on hashpaystream_trade_threads(buyer,updated_at desc);
        create index if not exists trade_threads_seller on hashpaystream_trade_threads(seller,updated_at desc);
        create table if not exists hashpaystream_trade_messages (
          id uuid primary key, thread_id uuid not null references hashpaystream_trade_threads(id),
          sender text not null, body text not null check(length(body) between 1 and 2000), created_at bigint not null);
        create index if not exists trade_messages_thread on hashpaystream_trade_messages(thread_id,created_at,id);
        create index if not exists trade_messages_sender on hashpaystream_trade_messages(sender,created_at);
        create table if not exists hashpaystream_trade_blocks (
          blocker text not null, blocked text not null, created_at bigint not null, primary key(blocker,blocked),check(blocker<>blocked));
        create table if not exists hashpaystream_trade_reports (
          id uuid primary key, reporter text not null, listing_id uuid not null, thread_id uuid,
          reason text not null, details text not null, evidence jsonb not null, status text not null default 'open',
          created_at bigint not null, resolved_at bigint, resolved_by text, decision text);
        alter table hashpaystream_trade_reports drop constraint if exists hashpaystream_trade_reports_reporter_listing_id_key;
        create unique index if not exists trade_report_open_target on hashpaystream_trade_reports(reporter,listing_id,coalesce(thread_id,'00000000-0000-0000-0000-000000000000'::uuid)) where status='open';
        create table if not exists hashpaystream_trade_offers (
          id uuid primary key, thread_id uuid not null references hashpaystream_trade_threads(id),
          listing_id uuid not null references hashpaystream_trade_listings(id), listing_revision integer not null,
          terms jsonb not null, snapshot jsonb not null,
          status text not null check(status in ('proposed','accepted','declined','withdrawn','cancelled')),
          created_at bigint not null, expires_at bigint not null, decided_at bigint);
        create unique index if not exists trade_one_accepted_item on hashpaystream_trade_offers(listing_id) where status='accepted';
        create index if not exists trade_offers_thread on hashpaystream_trade_offers(thread_id,created_at);
        create table if not exists hashpaystream_trade_settlement_wallets (
          offer_id uuid not null references hashpaystream_trade_offers(id), actor text not null,
          wallet_id text not null, address text not null, chain_id integer not null check(chain_id in (5042002,196)),
          verified_at bigint not null, primary key(offer_id,actor), unique(offer_id,address));
        create table if not exists hashpaystream_trade_funding_reservations (
          id uuid primary key, offer_id uuid not null unique references hashpaystream_trade_offers(id),
          listing_id uuid not null unique references hashpaystream_trade_listings(id),
          binding jsonb not null, created_at bigint not null);
        alter table hashpaystream_trade_settlement_wallets alter column wallet_id type text using wallet_id::text;
        alter table hashpaystream_trade_settlement_wallets drop constraint if exists hashpaystream_trade_settlement_wallets_chain_id_check;
        alter table hashpaystream_trade_settlement_wallets add constraint hashpaystream_trade_settlement_wallets_chain_id_check check(chain_id in (5042002,196));
        create table if not exists hashpaystream_trade_checkout_evidence (
          offer_id uuid not null references hashpaystream_trade_offers(id), actor text not null,
          evidence_hash text not null, body text not null, created_at bigint not null,
          primary key(offer_id,actor,evidence_hash));
        create table if not exists hashpaystream_trade_hosted_participants (
          offer_id uuid not null references hashpaystream_trade_offers(id), actor text not null,
          user_id text not null, wallet_app_id text not null, primary key(offer_id,actor), unique(offer_id,user_id));
        create index if not exists trade_reports_open on hashpaystream_trade_reports(status,created_at);
      `).then(() => {}).catch(error => { schema = undefined; throw error; });
  }
  await schema;
 };
}

// An accepted offer reserves an item, but is not proof of payment.
export const tradeReservedSql = `(exists(select 1 from hashpaystream_trade_offers o where o.listing_id=hashpaystream_trade_listings.id and o.status='accepted') or exists(select 1 from hashpaystream_trade_funding_reservations r where r.listing_id=hashpaystream_trade_listings.id))`;
