import pg from "pg";
import { renderDurableStoreConnectionConfig } from "./durable-store.js";
import type { TradeListing } from "../src/lib/tradePreview.js";

export type ListingRecord = TradeListing & {
  owner: string;
  status: "active" | "sold" | "removed";
  revision: number;
};
export type TradeFilters = {
  q?: string;
  category?: string;
  city?: string;
  ids?: string[];
};
export interface TradeStore {
  list(
    owner?: string,
    before?: string,
    filters?: TradeFilters,
  ): Promise<ListingRecord[]>;
  get(id: string): Promise<ListingRecord | undefined>;
  save(record: ListingRecord, expected: number): Promise<ListingRecord>;
}
export function tradeFailure(message: string, status: number): never {
  throw Object.assign(new Error(message), { status });
}

// Photos belong to one listing row; discovery only reads metadata, never image bodies.
export function createPostgresTradeStore(pool: pg.Pool): TradeStore {
  let schema: Promise<unknown> | undefined;
  async function ready() {
    schema ??= pool
      .query(
        `create table if not exists hashpaystream_trade_listings (
      id uuid primary key, owner text not null, status text not null check (status in ('active','sold','removed')),
      revision integer not null check (revision > 0), data jsonb not null,
      created_at bigint not null
    ); create index if not exists hashpaystream_trade_owner on hashpaystream_trade_listings(owner);
    create index if not exists hashpaystream_trade_browse on hashpaystream_trade_listings(status,created_at desc,id desc);`,
      )
      .catch((error) => {
        schema = undefined;
        throw error;
      });
    await schema;
  }
  const pattern = (value?: string) =>
    value
      ? "%" +
        value.toLowerCase().replace(/[!%_]/g, (character) => "!" + character) +
        "%"
      : "";
  const map = (row: any): ListingRecord => ({
    ...row.data,
    id: row.id,
    owner: row.owner,
    status: row.status,
    revision: row.revision,
    createdAt: Number(row.created_at),
  });
  return {
    async list(owner, before, filters = {}) {
      await ready();
      const result = await pool.query(
        `select id,owner,status,revision,created_at,
        (data - 'photos') || jsonb_build_object('photos', (select jsonb_agg('photo:' || n::text) from generate_series(0,jsonb_array_length(data->'photos')-1) n)) as data
        from hashpaystream_trade_listings where ($1::text is null and (status='active' or $6::uuid[] is not null and status='sold') or owner=$1 and status<>'removed')
        and ($3::text = '' or lower(concat_ws(' ',data->>'title',data->>'category',data->>'condition',data->>'size',data->>'city')) like $3 escape '!')
        and ($4::text = '' or data->>'category'=$4) and ($5::text = '' or lower(data->>'city') like $5 escape '!')
        and ($6::uuid[] is null or id=any($6))
        and ($2::uuid is null or (created_at,id) < (select created_at,id from hashpaystream_trade_listings where id=$2)) order by created_at desc,id desc limit 25`,
        [
          owner ?? null,
          before ?? null,
          pattern(filters.q),
          filters.category ?? "",
          pattern(filters.city),
          filters.ids ?? null,
        ],
      );
      return result.rows.map(map);
    },
    async get(id) {
      await ready();
      const result = await pool.query(
        "select * from hashpaystream_trade_listings where id=$1",
        [id],
      );
      return result.rows[0] ? map(result.rows[0]) : undefined;
    },
    async save(record, expected) {
      await ready();
      const client = await pool.connect();
      try {
        await client.query("begin");
        // Serialize this seller's quota and writes across workers, including first publication.
        await client.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          [record.owner],
        );
        const existing = await client.query(
          "select * from hashpaystream_trade_listings where id=$1 for update",
          [record.id],
        );
        const current = existing.rows[0] ? map(existing.rows[0]) : undefined;
        if (current && current.owner !== record.owner)
          tradeFailure("Listing not found.", 404);
        if (current?.status === "removed")
          tradeFailure("Listing not found.", 404);
        if ((current?.revision ?? 0) !== expected)
          tradeFailure(
            "This listing changed. Refresh My listings before trying again.",
            409,
          );
        if (!current) {
          const count = await client.query(
            "select count(*)::int as count from hashpaystream_trade_listings where owner=$1 and status<>'removed'",
            [record.owner],
          );
          if (count.rows[0].count >= 20)
            tradeFailure(
              "You can keep up to 20 published listings. Remove an older listing first.",
              409,
            );
        }
        const next = {
          ...record,
          createdAt: current?.createdAt ?? record.createdAt,
          revision: expected + 1,
        };
        const { owner, status, revision, ...data } = next;
        if (current)
          await client.query(
            "update hashpaystream_trade_listings set status=$3,revision=$4,data=$5::jsonb where id=$1 and owner=$2",
            [next.id, owner, status, revision, JSON.stringify(data)],
          );
        else {
          const inserted = await client.query(
            `insert into hashpaystream_trade_listings(id,owner,status,revision,data,created_at)
            values($1,$2,$3,$4,$5::jsonb,$6) on conflict(id) do nothing returning id`,
            [
              next.id,
              owner,
              status,
              revision,
              JSON.stringify(data),
              next.createdAt,
            ],
          );
          if (!inserted.rowCount)
            tradeFailure(
              "Listing already exists. Refresh before trying again.",
              409,
            );
        }
        await client.query("commit");
        return next;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

let store: TradeStore | undefined;
export function configuredTradeStore() {
  const url = (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    ""
  ).trim();
  if (!url) tradeFailure("Trade storage is unavailable.", 503);
  store ??= createPostgresTradeStore(
    new pg.Pool({
      ...renderDurableStoreConnectionConfig(url),
      max: 4,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    }),
  );
  return store;
}
