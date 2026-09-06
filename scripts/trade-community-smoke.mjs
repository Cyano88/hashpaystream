import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import { createPostgresTradeStore } from "../api/trade-store.ts";
import { createTradeCommunityStore } from "../api/trade-community-store.ts";
import { createTradeCommunityRouter } from "../api/trade-community.ts";
const url =
  process.env.TRADE_TEST_DATABASE_URL ||
  "postgresql://trade_test@127.0.0.1:55439/postgres";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
  throw Error("Local test database required");
const schema = "trade_community_" + randomBytes(8).toString("hex"),
  adminPool = new pg.Pool({ connectionString: url });
await adminPool.query(`create schema ${schema}`);
const pool = new pg.Pool({
    connectionString: url,
    options: `-c search_path=${schema}`,
    max: 6,
  }),
  store = createTradeCommunityStore(pool),
  listings = createPostgresTradeStore(pool);
const secret = "synthetic-community-secret-".repeat(3),
  env = {
    HASHPAYSTREAM_TRADE_ENABLED: "true",
    HASHPAYSTREAM_TRADE_OWNERSHIP_SECRET: secret,
  };
const owner = (user) =>
  createHmac("sha256", secret)
    .update(`hashpaystream.trade\0${user}`)
    .digest("hex");
const identity = async (req) => {
  const user = String(req.headers.authorization || "").replace("Bearer ", "");
  if (!["buyer", "seller", "intruder", "admin"].includes(user))
    throw Object.assign(Error("Invalid session"), { status: 401 });
  return user;
};
const app = express();
app.use(
  "/community",
  createTradeCommunityRouter({
    env: () => env,
    identity,
    admin: async (user) => user === "admin",
    store: () => store,
  }),
);
app.use((err, req, res, next) =>
  res.status(err.status || 500).json({ ok: false }),
);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port + "/community/";
async function call(path, user = "buyer", body) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(user ? { authorization: "Bearer " + user } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
try {
  const listing = {
    id: randomUUID(),
    title: "Synthetic enquiry item",
    price: "10",
    currency: "NGN",
    city: "Test area",
    category: "Clothing",
    condition: "Good",
    size: "M",
    description: "Synthetic test listing and disclosed wear.",
    delivery: "Either",
    photos: ["data:image/jpeg;base64,synthetic"],
    createdAt: Date.now(),
    owner: owner("seller"),
    status: "active",
    revision: 0,
  };
  await listings.save(listing, 0);
  assert.equal((await call("conversations", "")).status, 401);
  assert.equal(
    (await call("conversations", "seller", { listingId: listing.id })).status,
    409,
  );
  const started = await call("conversations", "buyer", {
    listingId: listing.id,
  });
  assert.equal(started.status, 200);
  const threadId = started.body.id;
  assert.equal(
    (await call("conversations", "buyer", { listingId: listing.id })).body.id,
    threadId,
  );
  assert.equal(
    (await call("messages?threadId=" + threadId, "intruder")).status,
    404,
  );
  assert.equal(
    (await call("conversations", "intruder")).body.threads.length,
    0,
  );
  const message = {
    threadId,
    id: randomUUID(),
    body: "Does this have any damage?",
  };
  const sent = await call("messages", "buyer", message);
  assert.equal(sent.status, 200);
  assert.equal(sent.body.message.mine, true);
  assert.equal(
    (await call("messages", "buyer", message)).body.message.id,
    message.id,
  );
  assert.equal(
    (await call("messages", "buyer", { ...message, body: "Changed replay" }))
      .status,
    409,
  );
  assert.equal(
    (
      await call("messages", "seller", {
        threadId,
        id: randomUUID(),
        body: "There is a disclosed mark on the sleeve.",
      })
    ).status,
    200,
  );
  const history = (await call("messages?threadId=" + threadId, "seller")).body;
  assert.equal(history.messages.length, 2);
  assert.equal(history.messages[0].mine, false);
  assert.equal(history.messages[1].mine, true);
  assert.equal("buyer" in history.thread, false);
  assert.equal("seller" in history.thread, false);
  assert.equal(
    (
      await call("messages", "intruder", {
        threadId,
        id: randomUUID(),
        body: "Unauthorized",
      })
    ).status,
    404,
  );
  assert.equal(
    (await call("blocks", "intruder", { threadId, blocked: true })).status,
    404,
  );
  assert.equal(
    (await call("blocks", "buyer", { threadId, blocked: true })).status,
    200,
  );
  assert.equal(
    (
      await call("messages", "seller", {
        threadId,
        id: randomUUID(),
        body: "Blocked reply",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("messages", "buyer", {
        threadId,
        id: randomUUID(),
        body: "Blocked send",
      })
    ).status,
    403,
  );
  await call("blocks", "seller", { threadId, blocked: false });
  assert.equal(
    (await call("messages?threadId=" + threadId, "seller")).body.thread.blocked,
    true,
  );
  await call("blocks", "buyer", { threadId, blocked: false });
  assert.equal(
    (
      await call("messages", "seller", {
        threadId,
        id: randomUUID(),
        body: "Reply after unblock",
      })
    ).status,
    200,
  );
  const report = {
    listingId: listing.id,
    threadId,
    reason: "Misleading listing",
    details: "Synthetic report for moderation testing only.",
  };
  const reported = await call("reports", "buyer", report);
  assert.equal(reported.status, 200);
  const reportId = reported.body.id;
  assert.equal((await call("reports", "buyer", report)).body.id, reportId);
  assert.equal((await call("reports", "intruder", report)).status, 404);
  assert.equal((await call("moderation", "buyer")).status, 403);
  assert.equal((await call("moderation?id=" + reportId, "seller")).status, 403);
  assert.equal((await call("moderation", "admin")).body.reports.length, 1);
  const evidence = (await call("moderation?id=" + reportId, "admin")).body
    .report.evidence;
  assert.equal(evidence.messages.length, 3);
  assert.equal(evidence.listing.photos[0], listing.photos[0]);
  assert.equal("owner" in evidence.listing, false);
  assert.equal(
    (
      await call("moderation", "buyer", {
        id: reportId,
        decision: "hide",
        admin: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("moderation", "admin", { id: reportId, decision: "hide" }))
      .status,
    200,
  );
  assert.equal((await listings.get(listing.id)).status, "removed");
  assert.equal((await listings.get(listing.id)).photos.length, 0);
  assert.equal(
    (
      await call("messages", "seller", {
        threadId,
        id: randomUUID(),
        body: "Closed conversation",
      })
    ).status,
    409,
  );
  assert.equal(
    (await call("moderation", "admin", { id: reportId, decision: "dismiss" }))
      .status,
    409,
  );
  assert.equal((await call("moderation", "admin")).body.reports.length, 0);
  assert.equal(
    (await call("moderation?id=" + reportId, "admin")).body.report.evidence
      .listing.photos.length,
    1,
  );
  // A confirmed send remains retry-safe after a subsequent block/removal.
  assert.equal((await call('messages','buyer',message)).status,200);
  // Real SQL pagination, identity quotas, and blocking serialized against sends.
  const second = { ...listing, id: randomUUID() };
  await listings.save(second, 0);
  const another = await store.start(owner("buyer"), second.id);
  for (let i = 0; i < 20; i++)
    await pool.query(
      "insert into hashpaystream_trade_messages(id,thread_id,sender,body,created_at) values($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        another,
        owner("buyer"),
        "Old message " + i,
        Date.now() - 86400000 + i,
      ],
    );
  for (let i = 0; i < 40; i++)
    await pool.query(
      "insert into hashpaystream_trade_messages(id,thread_id,sender,body,created_at) values($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        another,
        owner("seller"),
        "Old reply " + i,
        Date.now() - 86400000 + 100 + i,
      ],
    );
  const newest = await store.messages(owner("buyer"), another),
    older = await store.messages(owner("buyer"), another, newest.next);
  assert.equal(newest.messages.length, 50);
  assert.equal(older.messages.length, 10);
  assert.equal(
    new Set([...newest.messages, ...older.messages].map((m) => m.id)).size,
    60,
  );
  const race = await Promise.allSettled([
    store.send(owner("seller"), another, randomUUID(), "Concurrent reply"),
    store.block(owner("buyer"), another, true),
  ]);
  assert.equal(race[1].status, "fulfilled");
  await assert.rejects(
    () => store.send(owner("seller"), another, randomUUID(), "After block"),
    (e) => e.status === 403,
  );
  await store.block(owner('buyer'),another,false);
  const thirdThread=await store.start(owner('intruder'),second.id);
  const reportOne=await store.report(owner('seller'),second.id,another,'Harassment','Synthetic conversation report one.');
  const reportTwo=await store.report(owner('seller'),second.id,thirdThread,'Harassment','Synthetic conversation report two.');
  assert.notEqual(reportOne,reportTwo);
  await store.moderate(owner('admin'),reportOne,'dismiss');
  assert.notEqual(await store.report(owner('seller'),second.id,another,'Harassment','Synthetic subsequent issue report.'),reportOne);
  for(let i=0;i<20;i++)await pool.query('insert into hashpaystream_trade_messages(id,thread_id,sender,body,created_at) values($1,$2,$3,$4,$5)',[randomUUID(),another,owner('buyer'),'Rate fixture',Date.now()]);
  await assert.rejects(()=>store.send(owner('buyer'),another,randomUUID(),'Rate limited'),e=>e.status===429);
  console.log(
    "Trade enquiries passed: real PostgreSQL/HTTP participant isolation, idempotent messages, block/unblock, report evidence, admin denial/review, listing hide, closed messaging and pagination.",
  );
} finally {
  await new Promise((r) => server.close(r));
  await pool.end();
  await adminPool.query(`drop schema ${schema} cascade`);
  await adminPool.end();
}
