import express, { type Request, type Response } from "express";
import { createHmac } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { verifiedTradeIdentity } from "./trade-auth.js";
import { configuredTradePool, tradeFailure as fail } from "./trade-store.js";
import { createTradeCommunityStore } from "./trade-community-store.js";
import { rateLimit } from "./rate-limit.js";
const ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reasons = [
  "Misleading listing",
  "Prohibited item",
  "Scam or fraud",
  "Harassment",
  "Other",
];
function id(value: unknown) {
  if (typeof value !== "string" || !ID.test(value))
    fail("Invalid item reference.", 400);
  return value;
}
function content(value: unknown, max: number, min = 1) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max
  )
    fail("Text is missing or too long.", 400);
  return value.trim();
}
async function isAdmin(userId: string, env: NodeJS.ProcessEnv) {
  const allowed = (env.HASHPAYSTREAM_ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return false;
  const appId = env.PRIVY_APP_ID || env.VITE_PRIVY_APP_ID,
    appSecret = env.PRIVY_APP_SECRET;
  if (!appId || !appSecret)
    fail("Moderation authentication is unavailable.", 503);
  try {
    const user = await new PrivyClient({ appId, appSecret })
      .users()
      ._get(userId);
    return user.linked_accounts.some(
      (x) => x.type === "email" && allowed.includes(x.address.toLowerCase()),
    );
  } catch {
    fail("Moderation authentication is unavailable.", 503);
  }
}
let configured: ReturnType<typeof createTradeCommunityStore> | undefined;
export function createTradeCommunityRouter(
  overrides: Partial<{
    env: () => NodeJS.ProcessEnv;
    identity: typeof verifiedTradeIdentity;
    admin: typeof isAdmin;
    store: () => ReturnType<typeof createTradeCommunityStore>;
  }> = {},
) {
  const deps = {
    env: () => process.env,
    identity: verifiedTradeIdentity,
    admin: isAdmin,
    store: () =>
      (configured ??= createTradeCommunityStore(configuredTradePool())),
    ...overrides,
  };
  const router = express.Router();
  const secure =
    (
      fn: (
        req: Request,
        res: Response,
        viewer: string,
        userId: string,
      ) => Promise<unknown>,
    ) =>
    async (req: Request, res: Response) => {
      res.setHeader("Cache-Control", "no-store");
      try {
        if (deps.env().HASHPAYSTREAM_TRADE_ENABLED !== "true")
          fail("Trade is unavailable.", 503);
        const secret = deps.env().HASHPAYSTREAM_TRADE_OWNERSHIP_SECRET || "";
        if (secret.length < 32)
          fail("Trade authentication is unavailable.", 503);
        const user = await deps.identity(req, deps.env()),
          viewer = createHmac("sha256", secret)
            .update(`hashpaystream.trade\0${user}`)
            .digest("hex");
        await fn(req, res, viewer, user);
      } catch (error) {
        const status = Number((error as { status?: number }).status) || 500;
        res
          .status(status)
          .json({
            ok: false,
            error:
              status >= 500
                ? "Trade enquiries are temporarily unavailable. Try again."
                : (error as Error).message,
          });
      }
    };
  const parse = express.json({ limit: "32kb" });
  const writes = rateLimit({
    name: "trade-community-write",
    windowMs: 60000,
    max: 40,
  });
  router.get(
    "/capabilities",
    secure(async (req, res, _viewer, user) =>
      res.json({ ok: true, admin: await deps.admin(user, deps.env()) }),
    ),
  );
  router.get(
    "/conversations",
    secure(async (req, res, viewer) => {
      const threads = await deps
        .store()
        .threads(
          viewer,
          req.query.before === undefined ? undefined : id(req.query.before),
        );
      res.json({
        ok: true,
        threads,
        next: threads.length === 50 ? threads.at(-1)!.id : null,
      });
    }),
  );
  router.post(
    "/conversations",
    writes,
    parse,
    secure(async (req, res, viewer) =>
      res.json({
        ok: true,
        id: await deps.store().start(viewer, id(req.body?.listingId)),
      }),
    ),
  );
  router.get(
    "/messages",
    secure(async (req, res, viewer) =>
      res.json({
        ok: true,
        ...(await deps
          .store()
          .messages(
            viewer,
            id(req.query.threadId),
            req.query.before === undefined ? undefined : id(req.query.before),
          )),
      }),
    ),
  );
  router.post(
    "/messages",
    writes,
    parse,
    secure(async (req, res, viewer) =>
      res.json({
        ok: true,
        message: await deps
          .store()
          .send(
            viewer,
            id(req.body?.threadId),
            id(req.body?.id),
            content(req.body?.body, 2000),
          ),
      }),
    ),
  );
  router.post(
    "/blocks",
    writes,
    parse,
    secure(async (req, res, viewer) => {
      if (typeof req.body?.blocked !== "boolean")
        fail("Choose block or unblock.", 400);
      await deps.store().block(viewer, id(req.body.threadId), req.body.blocked);
      res.json({ ok: true });
    }),
  );
  router.post(
    "/reports",
    writes,
    parse,
    secure(async (req, res, viewer) => {
      const reason = content(req.body?.reason, 50);
      if (!reasons.includes(reason)) fail("Choose a report reason.", 400);
      const reportId = await deps
        .store()
        .report(
          viewer,
          id(req.body?.listingId),
          req.body?.threadId === undefined ? undefined : id(req.body.threadId),
          reason,
          content(req.body?.details, 1000, 10),
        );
      res.json({ ok: true, id: reportId });
    }),
  );
  router.get(
    "/moderation",
    secure(async (req, res, _viewer, user) => {
      if (!(await deps.admin(user, deps.env())))
        fail("Admin access required.", 403);
      if (req.query.id !== undefined)
        return res.json({
          ok: true,
          report: await deps.store().reportDetail(id(req.query.id)),
        });
      res.json({ ok: true, reports: await deps.store().reports() });
    }),
  );
  router.post(
    "/moderation",
    writes,
    parse,
    secure(async (req, res, viewer, user) => {
      if (!(await deps.admin(user, deps.env())))
        fail("Admin access required.", 403);
      if (!["hide", "dismiss"].includes(req.body?.decision))
        fail("Choose a moderation decision.", 400);
      await deps.store().moderate(viewer, id(req.body?.id), req.body.decision);
      res.json({ ok: true });
    }),
  );
  return router;
}
