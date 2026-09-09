import { verifyTradeCircleWallet } from "../api/trade-wallet-verification.ts";
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
const walletFixtures = {
  buyer: {
    walletId: randomUUID(),
    address: "0x2222222222222222222222222222222222222222",
    chainId: 5042002,
  },
  seller: {
    walletId: randomUUID(),
    address: "0x3333333333333333333333333333333333333333",
    chainId: 5042002,
  },
};
let walletReads = 0;
const walletVerifier = (input, env) =>
  verifyTradeCircleWallet(input, env, async (_env, path, init) => {
    walletReads++;
    const selected = walletFixtures[init.userToken];
    if (!selected)
      throw Object.assign(Error("Synthetic expired session"), { status: 401 });
    if (path === "/v1/w3s/user")
      return { id: init.userToken, status: "ENABLED" };
    return {
      wallet: {
        id: selected.walletId,
        address: selected.address,
        userId: init.userToken,
        custodyType: "ENDUSER",
        accountType: "SCA",
        state: "LIVE",
        blockchain: "ARC-TESTNET",
      },
    };
  });
let activeStore = store;
const app = express();
app.use(
  "/community",
  createTradeCommunityRouter({
    env: () => env,
    identity,
    wallet: walletVerifier,
    admin: async (user) => user === "admin",
    store: () => activeStore,
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
  assert.equal((await call("messages", "buyer", message)).status, 200);
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
  await store.block(owner("buyer"), another, false);
  const thirdThread = await store.start(owner("intruder"), second.id);
  const reportOne = await store.report(
    owner("seller"),
    second.id,
    another,
    "Harassment",
    "Synthetic conversation report one.",
  );
  const reportTwo = await store.report(
    owner("seller"),
    second.id,
    thirdThread,
    "Harassment",
    "Synthetic conversation report two.",
  );
  assert.notEqual(reportOne, reportTwo);
  await store.moderate(owner("admin"), reportOne, "dismiss");
  assert.notEqual(
    await store.report(
      owner("seller"),
      second.id,
      another,
      "Harassment",
      "Synthetic subsequent issue report.",
    ),
    reportOne,
  );
  for (let i = 0; i < 20; i++)
    await pool.query(
      "insert into hashpaystream_trade_messages(id,thread_id,sender,body,created_at) values($1,$2,$3,$4,$5)",
      [randomUUID(), another, owner("buyer"), "Rate fixture", Date.now()],
    );
  await assert.rejects(
    () => store.send(owner("buyer"), another, randomUUID(), "Rate limited"),
    (e) => e.status === 429,
  );
  const item = { ...listing, id: randomUUID() };
  await listings.save(item, 0);
  const buying = await store.start(owner("buyer"), item.id),
    otherBuying = await store.start(owner("intruder"), item.id);
  const terms = {
    price: "10.25",
    deliveryFee: "0",
    currency: "NGN",
    handover: "Pickup",
    location: "Test area",
    dispatchDays: 3,
    deliveryDays: 7,
    escrowPolicyVersion: "trade-escrow-v1",
    inspectionHours: 48,
    returns:
      "Return within 3 days for undisclosed damage; seller pays return delivery.",
    carrier: "",
  };
  const offerId = randomUUID();
  await assert.rejects(
    () => store.offer(owner("buyer"), buying, offerId, "propose", terms),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => store.offers(owner("intruder"), buying),
    (e) => e.status === 404,
  );
  const offer = await store.offer(
    owner("seller"),
    buying,
    offerId,
    "propose",
    terms,
  );
  assert.equal(offer.status, "proposed");
  assert.equal(
    (await store.offer(owner("seller"), buying, offerId, "propose", terms)).id,
    offerId,
  );
  await assert.rejects(
    () =>
      store.offer(owner("seller"), buying, offerId, "propose", {
        ...terms,
        price: "11",
      }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () => store.offer(owner("seller"), buying, offerId, "accept"),
    (e) => e.status === 403,
  );
  const competingId = randomUUID();
  await store.offer(
    owner("seller"),
    otherBuying,
    competingId,
    "propose",
    terms,
  );
  const accepts = await Promise.allSettled([
    store.offer(owner("buyer"), buying, offerId, "accept"),
    store.offer(owner("intruder"), otherBuying, competingId, "accept"),
  ]);
  assert.equal(
    accepts.filter((r) => r.status === "fulfilled").length,
    1,
    "Only one buyer can reserve a one-off item",
  );
  const won = accepts[0].status === "fulfilled",
    winningId = won ? offerId : competingId,
    winningThread = won ? buying : otherBuying,
    winningBuyer = owner(won ? "buyer" : "intruder");
  assert.equal(
    (await store.offer(winningBuyer, winningThread, winningId, "accept"))
      .status,
    "accepted",
  );
  await assert.rejects(
    () =>
      store.offer(
        owner("seller"),
        winningThread,
        randomUUID(),
        "propose",
        terms,
      ),
    (e) => e.status === 409,
  );
  await store.block(winningBuyer, winningThread, true);
  assert.equal(
    (await store.offer(winningBuyer, winningThread, winningId, "cancel"))
      .status,
    "cancelled",
    "Blocking messages must not trap unfunded accepted terms",
  );
  await store.block(winningBuyer, winningThread, false);
  const staleId = randomUUID();
  await store.offer(owner("seller"), buying, staleId, "propose", terms);
  await listings.save(
    { ...item, description: "A changed description after the original offer." },
    1,
  );
  await assert.rejects(
    () => store.offer(owner("buyer"), buying, staleId, "accept"),
    (e) => e.status === 409,
  );
  assert.equal(
    (await store.offers(owner("buyer"), buying))[0].snapshot.description,
    listing.description,
  );
  const stored = (
    await pool.query(
      "select snapshot from hashpaystream_trade_offers where id=$1",
      [staleId],
    )
  ).rows[0];
  assert.deepEqual(stored.snapshot.photos, listing.photos);
  const expiredId = randomUUID();
  await store.offer(owner("seller"), buying, expiredId, "propose", terms);
  await pool.query(
    "update hashpaystream_trade_offers set expires_at=$2 where id=$1",
    [expiredId, Date.now() - 1],
  );
  await assert.rejects(
    () => store.offer(owner("buyer"), buying, expiredId, "accept"),
    (e) => e.status === 409,
  );
  assert.equal(
    (await store.offers(owner("buyer"), buying))[0].status,
    "expired",
  );
  await assert.rejects(
    () =>
      store.offer(owner("seller"), buying, randomUUID(), "propose", {
        ...terms,
        deliveryFee: "1",
      }),
    (e) => e.status === 400,
  );
  const legacyOfferId = randomUUID();
  await store.offer(owner("seller"), buying, legacyOfferId, "propose", terms);
  await pool.query(
    "update hashpaystream_trade_offers set terms=terms - 'escrowPolicyVersion' where id=$1",
    [legacyOfferId],
  );
  await assert.rejects(
    () => store.offer(owner("buyer"), buying, legacyOfferId, "accept"),
    (e) => e.status === 409 && e.message.includes("current escrow policy"),
  );
  const apiOffers = await call("offers?threadId=" + buying, "buyer");
  assert.equal(apiOffers.status, 200);
  assert.equal(apiOffers.body.paymentsEnabled, false);
  // Funding reservations use real SQL transactions and authenticated HTTP routes.
  const checkoutItem = { ...listing, id: randomUUID(), currency: "USDC" };
  await listings.save(checkoutItem, 0);
  const checkoutThread = await store.start(owner("buyer"), checkoutItem.id);
  const checkoutOffer = randomUUID();
  await store.offer(owner("seller"), checkoutThread, checkoutOffer, "propose", {
    ...terms,
    currency: "USDC",
  });
  await store.offer(owner("buyer"), checkoutThread, checkoutOffer, "accept");
  const request = { threadId: checkoutThread, offerId: checkoutOffer };
  const query =
    "funding-reservation?threadId=" +
    checkoutThread +
    "&offerId=" +
    checkoutOffer;
  assert.equal((await call("funding-reservation", "", request)).status, 401);
  assert.equal((await call(query, "intruder")).status, 404);
  assert.equal(
    (await call("funding-reservation", "seller", request)).status,
    403,
  );
  assert.equal(
    (
      await call("funding-reservation", "buyer", {
        ...request,
        factory: "client-spoof",
        paymentsEnabled: true,
      })
    ).status,
    503,
  );
  assert.equal((await call(query)).body.reservation, null);
  let prepared = 0;
  const context = async ({ buyer, seller }) => {
    assert.equal(buyer, owner("buyer"));
    assert.equal(seller, owner("seller"));
    prepared++;
    return {
      chainId: 5042002,
      factory: "0x1111111111111111111111111111111111111111",
      buyer: "0x2222222222222222222222222222222222222222",
      seller: "0x3333333333333333333333333333333333333333",
      arbiter: "0x4444444444444444444444444444444444444444",
      fundBy: Math.floor(Date.now() / 1000) + 3600,
    };
  };
  activeStore = createTradeCommunityStore(pool, context);
  assert.equal(
    (await call("funding-reservation", "buyer", request)).status,
    409,
  );
  const walletRequest = {
    ...request,
    walletId: walletFixtures.buyer.walletId,
    userToken: "buyer",
    address: "client-spoof",
    chainId: 196,
  };
  assert.equal(
    (await call("settlement-wallet", "intruder", walletRequest)).status,
    404,
  );
  assert.equal(walletReads, 0, "Nonparticipant must not trigger Circle calls");
  const linked = await call("settlement-wallet", "buyer", walletRequest);
  assert.equal(linked.status, 200);
  assert.equal(linked.body.wallet.address, walletFixtures.buyer.address);
  assert.equal(linked.body.wallet.chainId, 5042002);
  assert.deepEqual(
    (await call("settlement-wallet", "buyer", walletRequest)).body.wallet,
    linked.body.wallet,
  );
  assert.equal(
    (await call("settlement-wallet", "seller", walletRequest)).status,
    409,
    "Same wallet cannot be both parties",
  );
  assert.equal(
    (
      await call("settlement-wallet", "buyer", {
        ...request,
        walletId: walletFixtures.seller.walletId,
        userToken: "seller",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("settlement-wallet", "seller", {
        ...request,
        walletId: walletFixtures.seller.walletId,
        userToken: "seller",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "settlement-wallet?threadId=" +
          checkoutThread +
          "&offerId=" +
          checkoutOffer,
        "seller",
      )
    ).body.wallet.address,
    walletFixtures.seller.address,
  );
  const persistedWallets = (
    await pool.query("select * from hashpaystream_trade_settlement_wallets")
  ).rows;
  assert.equal(persistedWallets.length, 2);
  assert.equal(JSON.stringify(persistedWallets).includes("userToken"), false);
  const attempts = await Promise.all(
    Array.from({ length: 3 }, () =>
      call("funding-reservation", "buyer", request),
    ),
  );
  assert.ok(attempts.every((x) => x.status === 200));
  assert.equal(new Set(attempts.map((x) => x.body.reservation.id)).size, 1);
  assert.equal(
    prepared,
    1,
    "Concurrent retries must not rebind wallets, price or deadline",
  );
  const reserved = attempts[0].body.reservation;
  assert.equal(reserved.binding.contractTerms.amount, "10250000");
  assert.equal(reserved.paymentsEnabled, false);
  assert.equal(reserved.binding.fundingEnabled, false);
  assert.equal(JSON.stringify(reserved).includes("photos"), false);
  // Process restart and adapter outage must preserve recovery.
  activeStore = createTradeCommunityStore(pool);
  await store.block(owner("buyer"), checkoutThread, true);
  await listings.save({ ...checkoutItem, status: "removed" }, 1);
  assert.deepEqual((await call(query, "seller")).body.reservation, reserved);
  assert.deepEqual(
    (await call("funding-reservation", "buyer", request)).body.reservation,
    reserved,
  );
  await assert.rejects(
    () => store.offer(owner("buyer"), checkoutThread, checkoutOffer, "cancel"),
    (e) => e.status === 409,
  );
  assert.equal(
    (await store.offers(owner("buyer"), checkoutThread))[0].status,
    "accepted",
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from hashpaystream_trade_funding_reservations",
      )
    ).rows[0].n,
    1,
  );
  await store.block(owner("buyer"), checkoutThread, false);
  // Cancellation and checkout contend for the same locks; exactly one can win.
  const racingItem = { ...checkoutItem, id: randomUUID() };
  await listings.save(racingItem, 0);
  const racingThread = await store.start(owner("buyer"), racingItem.id),
    racingOffer = randomUUID();
  await store.offer(owner("seller"), racingThread, racingOffer, "propose", {
    ...terms,
    currency: "USDC",
  });
  await store.offer(owner("buyer"), racingThread, racingOffer, "accept");
  await store.settlementWallet(
    owner("buyer"),
    racingThread,
    racingOffer,
    walletFixtures.buyer,
  );
  await store.settlementWallet(
    owner("seller"),
    racingThread,
    racingOffer,
    walletFixtures.seller,
  );
  const unavailable = createTradeCommunityStore(pool, async () => {
    throw Error("Synthetic verification outage");
  });
  await assert.rejects(
    () =>
      unavailable.fundingReservation(
        owner("buyer"),
        racingThread,
        racingOffer,
        true,
      ),
    /Synthetic verification outage/,
  );
  assert.equal(
    await store.fundingReservation(owner("buyer"), racingThread, racingOffer),
    null,
  );
  const readyStore = createTradeCommunityStore(pool, context);
  const cancelRace = await Promise.allSettled([
    readyStore.fundingReservation(
      owner("buyer"),
      racingThread,
      racingOffer,
      true,
    ),
    store.offer(owner("seller"), racingThread, racingOffer, "cancel"),
  ]);
  assert.equal(cancelRace.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    cancelRace.find((x) => x.status === "rejected").reason.status,
    409,
    String(cancelRace.find((x) => x.status === "rejected").reason),
  );
  const raceReservation = await store.fundingReservation(
    owner("buyer"),
    racingThread,
    racingOffer,
  );
  const raceOffer = (await store.offers(owner("buyer"), racingThread))[0];
  assert.equal(raceOffer.status, raceReservation ? "accepted" : "cancelled");
  console.log(
    "Funding reservation passed: default-off gate, authenticated roles, concurrent retry recovery, immutable binding, restart/block/removal recovery, and cancellation hold.",
  );
  console.log(
    "Trade agreements passed: role isolation, immutable retries/snapshots, racing buyers, stale listing rejection, expiry, blocked cancellation, and payment containment.",
  );
  console.log(
    "Trade enquiries passed: real PostgreSQL/HTTP participant isolation, idempotent messages, block/unblock, report evidence, admin denial/review, listing hide, closed messaging and pagination.",
  );
} finally {
  await new Promise((r) => server.close(r));
  await pool.end();
  await adminPool.query(`drop schema ${schema} cascade`);
  await adminPool.end();
}
