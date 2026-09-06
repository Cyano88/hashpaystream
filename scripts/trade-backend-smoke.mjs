import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import express from "express";
import pg from "pg";
import sharp from "sharp";
import { createPostgresTradeStore } from "../api/trade-store.ts";
import { createTradeRouter } from "../api/trade-listings.ts";

const url =
  process.env.TRADE_TEST_DATABASE_URL ||
  "postgresql://trade_test@127.0.0.1:55439/postgres";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Trade tests require an isolated local database.");
const schema = "trade_test_" + randomBytes(8).toString("hex");
const admin = new pg.Pool({ connectionString: url });
await admin.query(`create schema ${schema}`);
const pool = new pg.Pool({
  connectionString: url,
  options: `-c search_path=${schema}`,
  max: 6,
});
const store = createPostgresTradeStore(pool);
const env = {
  HASHPAYSTREAM_TRADE_ENABLED: "true",
  HASHPAYSTREAM_APP_OWNERSHIP_SECRET: "synthetic-test-secret-".repeat(3),
};
const identity = async (req) => {
  const token = req.headers.authorization;
  if (!["Bearer seller-a", "Bearer buyer-b"].includes(token))
    throw Object.assign(new Error("Invalid session."), { status: 401 });
  return token.slice(7);
};
const app = express();
app.use(
  "/api/hashpaystream/v1/trade",
  createTradeRouter({ env: () => env, identity, store: () => store }),
);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const origin = "http://127.0.0.1:" + server.address().port;
const endpoint = origin + "/api/hashpaystream/v1/trade/listings";
async function call(query = "", token, payload) {
  const response = await fetch(endpoint + query, {
    method: payload ? "POST" : "GET",
    headers: {
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
try {
  const photo = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#abcabc" },
  })
    .withMetadata()
    .jpeg()
    .toBuffer();
  const listing = {
    id: randomUUID(),
    title: "Synthetic linen shirt",
    price: "12500",
    currency: "NGN",
    city: "Lagos, Nigeria",
    category: "Clothing",
    condition: "Good",
    size: "M",
    description: "Synthetic item with a small disclosed mark on the sleeve.",
    delivery: "Either",
    photos: ["data:image/jpeg;base64," + photo.toString("base64")],
  };
  env.HASHPAYSTREAM_TRADE_ENABLED = "false";
  assert.equal((await call()).body.enabled, false);
  assert.equal(
    (await call("", "seller-a", { action: "publish", revision: 0, listing }))
      .status,
    503,
  );
  env.HASHPAYSTREAM_TRADE_ENABLED = "true";
  assert.equal((await call()).body.listings.length, 0);
  assert.equal(
    (await call("", "invalid", { action: "publish", revision: 0, listing }))
      .status,
    401,
  );
  assert.equal((await call("?mine=1")).status, 401);
  const created = await call("", "seller-a", {
    action: "publish",
    revision: 0,
    listing: { ...listing, owner: "buyer-b", status: "sold" },
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.listing.revision, 1);
  assert.equal(created.body.listing.status, "active");
  assert.equal("owner" in created.body.listing, false);
  const publicRead = await call("", "buyer-b");
  assert.equal(publicRead.body.listings[0].id, listing.id);
  assert.equal((await call("?mine=1", "buyer-b")).body.listings.length, 0);
  assert.equal((await call("?mine=1", "seller-a")).body.listings.length, 1);
  assert.equal(
    (await call("?q=linen&city=Lagos&category=Clothing")).body.listings.length,
    1,
  );
  assert.equal((await call("?city=Abuja")).body.listings.length, 0);
  assert.equal((await call("?ids=" + listing.id)).body.listings.length, 1);
  assert.equal((await call("?q=%25")).body.listings.length, 0);
  const nativePhoto = await fetch(
    origin + created.body.listing.photos[0] + "&format=json",
  );
  assert.ok(
    (await nativePhoto.json()).photo.startsWith("data:image/jpeg;base64,"),
  );
  const image = await fetch(origin + created.body.listing.photos[0]);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  const metadata = await sharp(
    Buffer.from(await image.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.width, 80);
  assert.equal(
    (await call("", "buyer-b", { action: "publish", revision: 1, listing }))
      .status,
    404,
  );
  assert.equal(
    (
      await call("", "buyer-b", {
        action: "remove",
        revision: 1,
        id: listing.id,
      })
    ).status,
    404,
  );
  assert.equal(
    (await call("", "seller-a", { action: "publish", revision: 0, listing }))
      .status,
    409,
  );
  const edited = await call("", "seller-a", {
    action: "publish",
    revision: 1,
    listing: { ...listing, title: "Updated synthetic shirt" },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.listing.revision, 2);
  assert.equal(
    (
      await call("", "seller-a", {
        action: "sold",
        revision: 2,
        id: listing.id,
      })
    ).status,
    200,
  );
  assert.equal((await call()).body.listings.length, 0);
  assert.equal((await call("?id=" + listing.id)).body.listing.status, "sold");
  assert.equal(
    (
      await call("", "seller-a", {
        action: "remove",
        revision: 3,
        id: listing.id,
      })
    ).status,
    200,
  );
  assert.equal((await call("?id=" + listing.id)).status, 404);
  assert.equal(
    (await fetch(origin + created.body.listing.photos[0])).status,
    404,
  );
  // Exercise the actual SQL locking and optimistic concurrency, independent of HTTP limits.
  const base = {
    ...listing,
    id: randomUUID(),
    owner: "synthetic-owner",
    status: "active",
    revision: 0,
    createdAt: Date.now(),
  };
  await store.save(base, 0);
  const race = await Promise.allSettled([
    store.save({ ...base, title: "First editor" }, 1),
    store.save({ ...base, title: "Second editor" }, 1),
  ]);
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(race.find((x) => x.status === "rejected").reason.status, 409);
  const collision = { ...base, id: randomUUID() };
  const collisionResults = await Promise.allSettled([
    store.save(collision, 0),
    store.save({ ...collision, owner: "another-owner" }, 0),
  ]);
  assert.equal(
    collisionResults.filter((x) => x.status === "fulfilled").length,
    1,
  );
  const winner = collisionResults.find((x) => x.status === "fulfilled").value;
  assert.equal((await store.get(collision.id)).owner, winner.owner);
  for (let i = 0; i < 20; i++)
    await store.save(
      {
        ...base,
        id: randomUUID(),
        owner: "quota-owner",
        createdAt: Date.now() + i,
      },
      0,
    );
  await assert.rejects(
    () => store.save({ ...base, id: randomUUID(), owner: "quota-owner" }, 0),
    (e) => e.status === 409,
  );
  for (let i = 0; i < 8; i++)
    await store.save(
      {
        ...base,
        id: randomUUID(),
        owner: "page-owner",
        createdAt: Date.now() + i,
      },
      0,
    );
  const first = await store.list(),
    second = await store.list(undefined, first.at(-1).id);
  assert.equal(first.length, 25);
  assert.ok(second.length > 0);
  assert.equal(
    new Set([...first, ...second].map((x) => x.id)).size,
    first.length + second.length,
  );
  assert.ok(first.every((x) => x.photos[0] === "photo:0"));
  const validationApp = express();
  validationApp.use(
    "/trade",
    createTradeRouter({ env: () => env, identity, store: () => store }),
  );
  const validationServer = validationApp.listen(0, "127.0.0.1");
  await new Promise((r) => validationServer.once("listening", r));
  const validationUrl =
    "http://127.0.0.1:" + validationServer.address().port + "/trade/listings";
  try {
    for (const change of [
      { price: "0" },
      { size: "x".repeat(81) },
      { photos: ["https://example.com/photo.jpg"] },
      {
        photos: [
          "data:image/jpeg;base64," +
            Buffer.from("<svg></svg>").toString("base64"),
        ],
      },
      { photos: [listing.photos[0].slice(0, -4)] },
      { title: 123 },
    ]) {
      const response = await fetch(validationUrl, {
        method: "POST",
        headers: {
          authorization: "Bearer seller-a",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "publish",
          revision: 0,
          listing: { ...listing, id: randomUUID(), ...change },
        }),
      });
      assert.equal(response.status, 400);
    }
    const malformed = await fetch(validationUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer seller-a",
        "content-type": "application/json",
      },
      body: "{broken",
    });
    assert.equal(malformed.status, 400);
    const oversized = await fetch(validationUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer seller-a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ large: "x".repeat(8 * 1024 * 1024) }),
    });
    assert.equal(oversized.status, 413);
  } finally {
    await new Promise((r) => validationServer.close(r));
  }
  console.log(
    "Trade PostgreSQL + HTTP passed: publication, cross-account browse, ownership denial, edit/sold/remove, photo metadata removal, concurrent edits, ID collision, quota and pagination.",
  );
} finally {
  await new Promise((r) => server.close(r));
  await pool.end();
  await admin.query(`drop schema ${schema} cascade`);
  await admin.end();
}
