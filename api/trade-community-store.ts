import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  createPostgresTradeStore,
  tradeFailure as fail,
} from "./trade-store.js";

type Client = pg.PoolClient;
export function createTradeCommunityStore(pool: pg.Pool) {
  let schema: Promise<void> | undefined;
  const listings = createPostgresTradeStore(pool);
  async function ready() {
    schema ??= (async () => {
      await listings.list();
      await pool.query(`
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
        create index if not exists trade_reports_open on hashpaystream_trade_reports(status,created_at);
      `);
    })().catch((error) => {
      schema = undefined;
      throw error;
    });
    await schema;
  }
  async function transaction<T>(fn: (client: Client) => Promise<T>) {
    await ready();
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async function pairLock(client: Client, a: string, b: string) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      "trade-pair:" + [a, b].sort().join(":"),
    ]);
  }
  async function blocks(client: Client, a: string, b: string) {
    const r = await client.query(
      "select blocker from hashpaystream_trade_blocks where (blocker=$1 and blocked=$2) or (blocker=$2 and blocked=$1)",
      [a, b],
    );
    return {
      blocked: r.rowCount! > 0,
      blockedByMe: r.rows.some((x) => x.blocker === a),
    };
  }
  async function thread(client: Client, id: string, viewer: string) {
    const r = await client.query(
      "select * from hashpaystream_trade_threads where id=$1 and (buyer=$2 or seller=$2)",
      [id, viewer],
    );
    if (!r.rows[0]) fail("Conversation not found.", 404);
    return r.rows[0];
  }
  const publicMessage = (row: any, viewer: string) => ({
    id: row.id,
    body: row.body,
    mine: row.sender === viewer,
    createdAt: Number(row.created_at),
  });
  return {
    async threads(viewer: string, before?: string) {
      await ready();
      const result = await pool.query(
        `select t.*, l.status as listing_status from hashpaystream_trade_threads t join hashpaystream_trade_listings l on l.id=t.listing_id where (buyer=$1 or seller=$1) and ($2::uuid is null or (t.updated_at,t.id)<(select updated_at,id from hashpaystream_trade_threads where id=$2 and (buyer=$1 or seller=$1))) order by t.updated_at desc,t.id desc limit 50`,
        [viewer, before ?? null],
      );
      return result.rows.map((r) => ({
        id: r.id,
        listingId: r.listing_id,
        title: r.title,
        role: r.buyer === viewer ? "buyer" : "seller",
        listingStatus: r.listing_status,
        updatedAt: Number(r.updated_at),
      }));
    },
    async start(viewer: string, listingId: string) {
      return transaction(async (client) => {
        const listing = (
          await client.query(
            "select * from hashpaystream_trade_listings where id=$1",
            [listingId],
          )
        ).rows[0];
        if (!listing || listing.status !== "active")
          fail("This listing is no longer available.", 409);
        if (listing.owner === viewer) fail("This is your listing.", 409);
        await pairLock(client, viewer, listing.owner);
        if ((await blocks(client, viewer, listing.owner)).blocked)
          fail("Messaging is unavailable between these accounts.", 403);
        await client.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          ["trade-start:" + viewer],
        );
        const existing = (
          await client.query(
            "select id from hashpaystream_trade_threads where listing_id=$1 and buyer=$2",
            [listingId, viewer],
          )
        ).rows[0];
        if (existing) return existing.id;
        const count = (
          await client.query(
            "select count(*)::int as count from hashpaystream_trade_threads where buyer=$1 and created_at>$2",
            [viewer, Date.now() - 86400000],
          )
        ).rows[0].count;
        if (count >= 20)
          fail(
            "You have reached the daily enquiry limit. Try again tomorrow.",
            429,
          );
        const latest = (
          await client.query(
            "select status from hashpaystream_trade_listings where id=$1 for share",
            [listingId],
          )
        ).rows[0];
        if (latest.status !== "active")
          fail("This listing is no longer available.", 409);
        const id = randomUUID(),
          now = Date.now();
        await client.query(
          "insert into hashpaystream_trade_threads(id,listing_id,buyer,seller,title,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$6)",
          [id, listingId, viewer, listing.owner, listing.data.title, now],
        );
        return id;
      });
    },
    async messages(viewer: string, id: string, before?: string) {
      return transaction(async (client) => {
        const t = await thread(client, id, viewer),
          other = t.buyer === viewer ? t.seller : t.buyer;
        const state = await blocks(client, viewer, other);
        const status = (
          await client.query(
            "select status from hashpaystream_trade_listings where id=$1",
            [t.listing_id],
          )
        ).rows[0].status;
        const rows = await client.query(
          `select * from hashpaystream_trade_messages where thread_id=$1 and ($2::uuid is null or (created_at,id)<(select created_at,id from hashpaystream_trade_messages where id=$2 and thread_id=$1)) order by created_at desc,id desc limit 50`,
          [id, before ?? null],
        );
        return {
          thread: {
            id: t.id,
            listingId: t.listing_id,
            title: t.title,
            role: t.buyer === viewer ? "buyer" : "seller",
            listingStatus: status,
            ...state,
          },
          messages: rows.rows.map((r) => publicMessage(r, viewer)).reverse(),
          next: rows.rows.length === 50 ? rows.rows.at(-1).id : null,
        };
      });
    },
    async send(viewer: string, id: string, messageId: string, body: string) {
      return transaction(async (client) => {
        const t = await thread(client, id, viewer);
        await pairLock(client, t.buyer, t.seller);
        const existing = (
          await client.query(
            "select * from hashpaystream_trade_messages where id=$1",
            [messageId],
          )
        ).rows[0];
        if (existing) {
          if (
            existing.thread_id !== id ||
            existing.sender !== viewer ||
            existing.body !== body
          )
            fail("Message conflict. Refresh and try again.", 409);
          return publicMessage(existing, viewer);
        }
        if ((await blocks(client, t.buyer, t.seller)).blocked)
          fail("Messaging is unavailable between these accounts.", 403);
        const status = (
          await client.query(
            "select status from hashpaystream_trade_listings where id=$1 for share",
            [t.listing_id],
          )
        ).rows[0].status;
        if (status === "removed")
          fail("This listing has been removed. Messaging is closed.", 409);
        await client.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          ["trade-send:" + viewer],
        );
        const now = Date.now(),
          recent = (
            await client.query(
              "select count(*)::int as count from hashpaystream_trade_messages where sender=$1 and created_at>$2",
              [viewer, now - 60000],
            )
          ).rows[0].count;
        if (recent >= 20)
          fail("You are sending messages too quickly. Try again shortly.", 429);
        const count = (
          await client.query(
            "select count(*)::int as count from hashpaystream_trade_messages where thread_id=$1",
            [id],
          )
        ).rows[0].count;
        if (count >= 500)
          fail("This conversation has reached its message limit.", 409);
        const inserted = await client.query(
          "insert into hashpaystream_trade_messages(id,thread_id,sender,body,created_at) values($1,$2,$3,$4,$5) on conflict(id) do nothing returning *",
          [messageId, id, viewer, body, now],
        );
        if (!inserted.rows[0])
          fail("Message conflict. Refresh and try again.", 409);
        await client.query(
          "update hashpaystream_trade_threads set updated_at=$2 where id=$1",
          [id, now],
        );
        return publicMessage(inserted.rows[0], viewer);
      });
    },
    async block(viewer: string, id: string, enabled: boolean) {
      return transaction(async (client) => {
        const t = await thread(client, id, viewer),
          other = t.buyer === viewer ? t.seller : t.buyer;
        await pairLock(client, viewer, other);
        if (enabled)
          await client.query(
            "insert into hashpaystream_trade_blocks(blocker,blocked,created_at) values($1,$2,$3) on conflict do nothing",
            [viewer, other, Date.now()],
          );
        else
          await client.query(
            "delete from hashpaystream_trade_blocks where blocker=$1 and blocked=$2",
            [viewer, other],
          );
      });
    },
    async report(
      viewer: string,
      listingId: string,
      threadId: string | undefined,
      reason: string,
      details: string,
    ) {
      return transaction(async (client) => {
        const listing = (
          await client.query(
            "select * from hashpaystream_trade_listings where id=$1 for share",
            [listingId],
          )
        ).rows[0];
        if (!listing) fail("Listing not found.", 404);
        if (listing.owner === viewer && !threadId)
          fail("You cannot report your own listing.", 409);
        let messages: any[] = [];
        if (threadId) {
          const t = await thread(client, threadId, viewer);
          if (t.listing_id !== listingId) fail("Conversation not found.", 404);
          messages = (
            await client.query(
              "select id,sender,body,created_at from hashpaystream_trade_messages where thread_id=$1 order by created_at desc,id desc limit 20",
              [threadId],
            )
          ).rows.map((r) => ({
            id: r.id,
            body: r.body,
            role: r.sender === t.buyer ? "buyer" : "seller",
            createdAt: Number(r.created_at),
          }));
        }
        await client.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          ["trade-report:" + viewer],
        );
        const existing = (
          await client.query(
            "select id from hashpaystream_trade_reports where reporter=$1 and listing_id=$2 and thread_id is not distinct from $3::uuid and status='open'",
            [viewer, listingId, threadId ?? null],
          )
        ).rows[0];
        if (existing) return existing.id;
        const recent = (
          await client.query(
            "select count(*)::int as count from hashpaystream_trade_reports where reporter=$1 and created_at>$2",
            [viewer, Date.now() - 86400000],
          )
        ).rows[0].count;
        if (recent >= 20) fail("You have reached the daily report limit.", 429);
        const id = randomUUID();
        await client.query(
          "insert into hashpaystream_trade_reports(id,reporter,listing_id,thread_id,reason,details,evidence,created_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
          [
            id,
            viewer,
            listingId,
            threadId ?? null,
            reason,
            details,
            JSON.stringify({
              listing: {
                ...listing.data,
                id: listing.id,
                status: listing.status,
              },
              messages,
            }),
            Date.now(),
          ],
        );
        return id;
      });
    },
    async reports() {
      await ready();
      const rows = await pool.query(
        "select id,listing_id,reason,details,created_at,evidence->'listing'->>'title' as title from hashpaystream_trade_reports where status='open' order by created_at,id limit 50",
      );
      return rows.rows.map((r) => ({
        id: r.id,
        listingId: r.listing_id,
        reason: r.reason,
        details: r.details,
        title: r.title,
        createdAt: Number(r.created_at),
      }));
    },
    async reportDetail(id: string) {
      await ready();
      const row = (
        await pool.query(
          "select id,reason,details,evidence,status from hashpaystream_trade_reports where id=$1",
          [id],
        )
      ).rows[0];
      if (!row) fail("Report not found.", 404);
      return row;
    },
    async moderate(admin: string, id: string, decision: "hide" | "dismiss") {
      return transaction(async (client) => {
        const report = (
          await client.query(
            "select * from hashpaystream_trade_reports where id=$1 for update",
            [id],
          )
        ).rows[0];
        if (!report) fail("Report not found.", 404);
        if (report.status !== "open")
          fail("Report has already been reviewed.", 409);
        if (decision === "hide")
          await client.query(
            "update hashpaystream_trade_listings set status='removed',revision=revision+1,data=jsonb_set(data,'{photos}','[]'::jsonb) where id=$1",
            [report.listing_id],
          );
        await client.query(
          "update hashpaystream_trade_reports set status='resolved',decision=$2,resolved_by=$3,resolved_at=$4 where id=$1",
          [id, decision, admin, Date.now()],
        );
      });
    },
  };
}
