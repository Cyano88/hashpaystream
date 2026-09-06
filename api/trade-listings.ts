import sharp from "sharp";
import { createHmac } from "node:crypto";
import { verifiedTradeIdentity } from "./trade-auth.js";
import { createTradeCommunityRouter } from "./trade-community.js";
import express, { type Request, type Response } from "express";
import { rateLimit } from "./rate-limit.js";
import {
  configuredTradeStore,
  tradeFailure as fail,
  type TradeStore,
  type ListingRecord,
} from "./trade-store.js";
import {
  validateTradeDraft,
  type TradeListing,
} from "../src/lib/tradePreview.js";

const ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function publicListing(record: ListingRecord) {
  const { owner: _owner, ...listing } = record;
  return {
    ...listing,
    photos: listing.photos.map(
      (_, index) =>
        `/api/hashpaystream/v1/trade/photos/${listing.id}/${index}?v=${listing.revision}`,
    ),
  };
}
async function listingInput(value: unknown): Promise<TradeListing> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Listing is invalid.", 400);
  const v = value as Record<string, unknown>;
  for (const key of [
    "id",
    "title",
    "price",
    "currency",
    "city",
    "category",
    "condition",
    "size",
    "description",
    "delivery",
  ]) {
    if (typeof v[key] !== "string") fail("Listing fields are invalid.", 400);
  }
  if (
    !ID.test(String(v.id)) ||
    String(v.size).length > 80 ||
    !Array.isArray(v.photos) ||
    v.photos.some((p) => typeof p !== "string")
  )
    fail("Listing fields are invalid.", 400);
  const item = Object.fromEntries(
    [
      "id",
      "title",
      "price",
      "currency",
      "city",
      "category",
      "condition",
      "size",
      "description",
      "delivery",
      "photos",
    ].map((key) => [key, v[key]]),
  ) as TradeListing;
  const issue = validateTradeDraft(item);
  if (issue) fail(issue, 400);
  // Only bounded JPEG bodies; remote URLs and executable formats never enter storage.
  for (const photo of item.photos) {
    const encoded = photo.slice("data:image/jpeg;base64,".length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4)
      fail("Photo is invalid.", 400);
    const bytes = Buffer.from(encoded, "base64");
    if (
      bytes.length < 100 ||
      bytes[0] !== 255 ||
      bytes[1] !== 216 ||
      bytes[2] !== 255 ||
      bytes.at(-2) !== 255 ||
      bytes.at(-1) !== 217
    )
      fail("Photo must be a JPEG image.", 400);
  }
  const photos: string[] = [];
  for (const photo of item.photos) {
    try {
      const bytes = await sharp(Buffer.from(photo.split(",")[1], "base64"), {
        limitInputPixels: 16_000_000,
        failOn: "warning",
      })
        .autoOrient()
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
      if (bytes.length > 1_500_000) fail("Photo is too large.", 400);
      photos.push("data:image/jpeg;base64," + bytes.toString("base64"));
    } catch {
      fail("Photo could not be decoded. Choose another JPEG image.", 400);
    }
  }
  return {
    ...item,
    photos,
    title: item.title.trim(),
    city: item.city.trim(),
    description: item.description.trim(),
    createdAt: Date.now(),
  };
}
export function createTradeRouter(
  overrides: Partial<{
    env: () => NodeJS.ProcessEnv;
    identity: typeof verifiedTradeIdentity;
    store: () => TradeStore;
  }> = {},
) {
  const deps = {
    env: () => process.env,
    identity: verifiedTradeIdentity,
    store: configuredTradeStore,
    ...overrides,
  };
  const router = express.Router();
  router.use(rateLimit({ name: "trade", windowMs: 60_000, max: 120 }));
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (deps.env().HASHPAYSTREAM_TRADE_ENABLED !== "true") {
      if (
        req.method === "GET" &&
        req.path === "/listings" &&
        !Object.keys(req.query).length
      )
        return res.json({ ok: true, enabled: false, listings: [] });
      return res
        .status(503)
        .json({ ok: false, error: "Publishing is not available yet." });
    }
    next();
  });
  const handle =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (error) {
        const status = Number((error as { status?: number }).status) || 500;
        res.status(status).json({
          ok: false,
          error:
            status >= 500
              ? "Trade is temporarily unavailable. Try again."
              : (error as Error).message,
        });
      }
    };
  async function owner(req: Request) {
    const env = deps.env(),
      secret = env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET ?? "";
    if (secret.length < 32) fail("Trade authentication is unavailable.", 503);
    const user = await deps.identity(req, env);
    return createHmac("sha256", secret)
      .update(`hashpaystream.trade\0${user}`)
      .digest("hex");
  }
  router.use(
    createTradeCommunityRouter({ env: deps.env, identity: deps.identity }),
  );
  router.get(
    "/listings",
    handle(async (req, res) => {
      const mine = req.query.mine === "1",
        before = req.query.before;
      if (
        before !== undefined &&
        (typeof before !== "string" || !ID.test(before))
      )
        fail("Invalid page.", 400);
      if (req.query.id !== undefined) {
        if (typeof req.query.id !== "string" || !ID.test(req.query.id))
          fail("Listing not found.", 404);
        const record = await deps.store().get(req.query.id);
        if (!record || record.status === "removed")
          fail("Listing not found.", 404);
        return res.json({
          ok: true,
          enabled: true,
          listing: publicListing(record),
        });
      }
      const filters: {
        q?: string;
        category?: string;
        city?: string;
        ids?: string[];
      } = {};
      for (const key of ["q", "category", "city"] as const) {
        if (
          req.query[key] !== undefined &&
          (typeof req.query[key] !== "string" ||
            String(req.query[key]).length > 120)
        )
          fail("Invalid search filter.", 400);
        filters[key] = String(req.query[key] ?? "").trim();
      }
      if (req.query.ids !== undefined) {
        if (typeof req.query.ids !== "string")
          fail("Invalid saved items.", 400);
        const ids = req.query.ids.split(",");
        if (ids.length > 100 || ids.some((id) => !ID.test(id)))
          fail("Invalid saved items.", 400);
        filters.ids = ids;
      }
      const listings = await deps
        .store()
        .list(
          mine ? await owner(req) : undefined,
          before as string | undefined,
          filters,
        );
      res.json({
        ok: true,
        enabled: true,
        listings: listings.map(publicListing),
        next: listings.length === 25 ? listings.at(-1)!.id : null,
      });
    }),
  );
  router.get(
    "/photos/:id/:index",
    handle(async (req, res) => {
      if (
        !ID.test(String(req.params.id)) ||
        !/^[0-3]$/.test(String(req.params.index))
      )
        fail("Photo not found.", 404);
      const listing = await deps.store().get(String(req.params.id));
      if (
        !listing ||
        listing.status === "removed" ||
        !listing.photos[Number(req.params.index)]
      )
        fail("Photo not found.", 404);
      if (req.query.format === "json")
        return res.json({
          ok: true,
          photo: listing.photos[Number(req.params.index)],
        });
      res.setHeader("X-Content-Type-Options", "nosniff");
      res
        .type("image/jpeg")
        .send(
          Buffer.from(
            listing.photos[Number(req.params.index)].split(",")[1],
            "base64",
          ),
        );
    }),
  );
  router.post(
    "/listings",
    rateLimit({ name: "trade-write", windowMs: 60_000, max: 10 }),
    // Authenticate before accepting the larger image body.
    async (req, res, next) => {
      try {
        res.locals.tradeOwner = await owner(req);
        next();
      } catch (error) {
        const status = Number((error as { status?: number }).status) || 500;
        res.status(status).json({
          ok: false,
          error:
            status >= 500
              ? "Trade authentication is unavailable."
              : (error as Error).message,
        });
      }
    },
    express.json({ limit: "8mb" }),
    handle(async (req, res) => {
      const body = req.body ?? {},
        seller = res.locals.tradeOwner as string;
      if (!Number.isInteger(body.revision) || body.revision < 0)
        fail("Listing revision is required.", 400);
      const store = deps.store();
      if (body.action === "publish") {
        const listing = await listingInput(body.listing);
        const record = await store.save(
          { ...listing, owner: seller, status: "active", revision: 0 },
          body.revision,
        );
        return res.json({ ok: true, listing: publicListing(record) });
      }
      if (!["sold", "remove"].includes(body.action) || !ID.test(body.id))
        fail("Invalid listing action.", 400);
      const current = await store.get(body.id);
      if (!current || current.owner !== seller || current.status === "removed")
        fail("Listing not found.", 404);
      const record = await store.save(
        {
          ...current,
          status: body.action === "sold" ? "sold" : "removed",
          ...(body.action === "remove" ? { photos: [] } : {}),
        },
        body.revision,
      );
      res.json({ ok: true, listing: publicListing(record) });
    }),
  );
  router.use(
    (error: any, _req: Request, res: Response, _next: express.NextFunction) =>
      res.status(error.status === 413 ? 413 : 400).json({
        ok: false,
        error:
          error.status === 413
            ? "Photos are too large. Use smaller images."
            : "Invalid request body.",
      }),
  );
  return router;
}
