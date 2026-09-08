import { useEffect, useRef, useState } from "react";
import { communityRequest, type TradeThread } from "../lib/tradeCommunity";
import {
  tradeTotal,
  validateTradeTerms,
  type TradeOffer,
  type TradeTerms,
} from "../lib/tradeAgreement";
import { StreamSelect } from "./ui/StreamSelect";
import { useStreamConfirm } from "./ui/StreamConfirmSheet";
const field =
  "mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-white/15 dark:bg-zinc-900";
const button =
  "min-h-11 rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950";
const initial: TradeTerms = {
  price: "",
  deliveryFee: "0",
  currency: "NGN",
  handover: "Pickup",
  location: "",
  dispatchDays: 3,
  inspectionHours: 48,
  returns: "",
  carrier: "",
};
export default function TradeAgreementCard({
  thread,
  getAccessToken,
}: {
  thread: TradeThread;
  getAccessToken: () => Promise<string | null>;
}) {
  const [offers, setOffers] = useState<TradeOffer[]>([]),
    [editing, setEditing] = useState(false),
    [terms, setTerms] = useState<TradeTerms>(() => ({
      ...initial,
      ...thread.listingTerms,
    })),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  const { confirm, confirmation } = useStreamConfirm(),
    alive = useRef(true),
    lock = useRef(false),
    pending = useRef<{ id: string; body: string }>(),
    seq = useRef(0);
  async function request(payload?: unknown) {
    const token = await getAccessToken();
    if (!alive.current) throw Error("Account changed.");
    return communityRequest(
      "offers" + (payload ? "" : "?threadId=" + thread.id),
      token,
      payload,
    );
  }
  async function load() {
    const n = ++seq.current;
    try {
      const r = await request();
      if (alive.current && n === seq.current) {
        setOffers(r.offers);
        setLoaded(true);
        setError("");
      }
    } catch (e) {
      if (alive.current && n === seq.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => {
      if (!lock.current && document.visibilityState === "visible") void load();
    }, 15000);
    return () => {
      alive.current = false;
      seq.current++;
      clearInterval(timer);
    };
  }, [thread.id]);
  async function act(action: string, offer?: TradeOffer) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      let id = offer?.id,
        validated: TradeTerms | undefined;
      if (action === "propose") {
        validated = validateTradeTerms(terms);
        const body = JSON.stringify(validated);
        if (pending.current?.body !== body)
          pending.current = { id: crypto.randomUUID(), body };
        id = pending.current.id;
      }
      if (action === "accept" || action === "cancel") {
        const yes = await confirm({
          title:
            action === "accept"
              ? "Accept these terms?"
              : "Cancel agreed terms?",
          description:
            action === "accept"
              ? "These exact item and handover terms will be saved for both of you. Payment is not available yet. No money will move."
              : "No payment has been collected. The item can be agreed with another buyer.",
          action: action === "accept" ? "Accept terms" : "Cancel terms",
        });
        if (!yes) return;
      }
      const r = await request({
        threadId: thread.id,
        id,
        action,
        ...(validated ? { terms: validated } : {}),
      });
      if (alive.current) {
        seq.current++;
        setOffers((old) => [
          r.offer,
          ...old.filter((x) => x.id !== r.offer.id),
        ]);
        if (action === "propose") {
          pending.current = undefined;
          setEditing(false);
        }
        await load();
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const latest = offers[0],
    accepted = offers.find((o) => o.status === "accepted"),
    seller = thread.role === "seller";
  function change<K extends keyof TradeTerms>(key: K, value: TradeTerms[K]) {
    setTerms((t) => ({
      ...t,
      [key]: value,
      ...(key === "handover" && value === "Pickup"
        ? { deliveryFee: "0", carrier: "" }
        : {}),
    }));
  }
  return (
    <section className="stream-card space-y-3 p-4" aria-label="Trade agreement">
      {confirmation}
      <h3 className="text-sm font-bold">Agreement</h3>
      {!loaded && !error && (
        <p className="text-xs text-gray-500">Loading terms...</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
          <button className="ml-2 underline" onClick={() => void load()}>
            Refresh
          </button>
        </p>
      )}
      {latest && !editing && (
        <>
          <p className="text-xs font-bold">
            {latest.status === "accepted"
              ? "Terms accepted"
              : latest.status === "proposed"
                ? "Review these terms"
                : latest.status === "expired"
                  ? "Offer expired"
                  : latest.status === "cancelled"
                    ? "Terms cancelled"
                    : latest.status === "declined"
                      ? "Offer declined"
                      : "Offer withdrawn"}
          </p>
          <p className="text-sm font-bold">{latest.snapshot.title}</p>
          <p className="text-xs text-gray-500">
            {latest.snapshot.condition} {latest.snapshot.size}
          </p>
          <details className="text-xs">
            <summary className="min-h-8 cursor-pointer">
              Item description at offer
            </summary>
            <p className="whitespace-pre-wrap break-words">
              {latest.snapshot.description}
            </p>
          </details>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt>Item</dt>
            <dd className="text-right">
              {latest.terms.price} {latest.terms.currency}
            </dd>
            <dt>Delivery</dt>
            <dd className="text-right">
              {latest.terms.deliveryFee} {latest.terms.currency}
            </dd>
            <dt className="font-bold">Total</dt>
            <dd className="text-right font-bold">
              {tradeTotal(latest.terms)} {latest.terms.currency}
            </dd>
          </dl>
          <p className="text-xs">
            {latest.terms.handover} in {latest.terms.location}. Handover within{" "}
            {latest.terms.dispatchDays} days after confirmed payment.
            Inspection: {latest.terms.inspectionHours} hours after receipt.
          </p>
          {latest.terms.carrier && (
            <p className="text-xs">
              Proposed carrier: {latest.terms.carrier}. Provider licensing is
              not verified by HashPayStream.
            </p>
          )}
          <p className="whitespace-pre-wrap break-words text-xs">
            Returns: {latest.terms.returns}
          </p>
          {latest.status === "proposed" && (
            <p className="text-xs text-gray-500">
              Offer expires {new Date(latest.expiresAt).toLocaleString()}.
            </p>
          )}
          <p className="text-xs text-gray-500">
            Payment is not available for Trade yet. Accepted terms do not mean
            the item is paid for.
          </p>
          <div className="flex flex-wrap gap-3">
            {latest.status === "proposed" &&
              !seller &&
              !thread.blocked &&
              thread.listingStatus === "active" && (
                <button
                  disabled={busy}
                  className={button}
                  onClick={() => void act("accept", latest)}
                >
                  Accept terms
                </button>
              )}
            {latest.status === "proposed" && (
              <button
                disabled={busy}
                className="min-h-11 text-xs font-bold"
                onClick={() =>
                  void act(seller ? "withdraw" : "decline", latest)
                }
              >
                {seller ? "Withdraw offer" : "Decline"}
              </button>
            )}
            {latest.status === "accepted" && (
              <button
                disabled={busy}
                className="min-h-11 text-xs font-bold"
                onClick={() => void act("cancel", latest)}
              >
                Cancel terms
              </button>
            )}
          </div>
        </>
      )}
      {loaded && !latest && !editing && (
        <p className="text-xs text-gray-500">
          {seller
            ? "Set the final price, item condition and handover terms for your buyer to review."
            : "Agree the details here. Your seller can send an offer for you to review."}
        </p>
      )}
      {seller &&
        loaded &&
        !accepted &&
        !thread.blocked &&
        thread.listingStatus === "active" &&
        !editing && (
          <button
            className={button}
            disabled={busy}
            onClick={() => {
              if (latest) setTerms(latest.terms);
              setEditing(true);
            }}
          >
            {latest ? "Propose new terms" : "Propose terms"}
          </button>
        )}
      {editing && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act("propose");
          }}
        >
          <StreamSelect
            label="Currency"
            value={terms.currency}
            options={["NGN", "USD", "USDC"].map((value) => ({
              value,
              label: value,
            }))}
            disabled={busy}
            onChange={(v) => change("currency", v as TradeTerms["currency"])}
          />
          <label className="block text-xs font-bold">
            Item price
            <input
              className={field}
              inputMode="decimal"
              required
              value={terms.price}
              disabled={busy}
              onChange={(e) => change("price", e.target.value)}
            />
          </label>
          <StreamSelect
            label="Handover"
            value={terms.handover}
            options={["Pickup", "Delivery"].map((value) => ({
              value,
              label: value,
            }))}
            disabled={busy}
            onChange={(v) => change("handover", v as TradeTerms["handover"])}
          />
          {terms.handover === "Delivery" && (
            <>
              <label className="block text-xs font-bold">
                Delivery cost
                <input
                  className={field}
                  inputMode="decimal"
                  required
                  value={terms.deliveryFee}
                  disabled={busy}
                  onChange={(e) => change("deliveryFee", e.target.value)}
                />
              </label>
              <label className="block text-xs font-bold">
                Delivery provider
                <input
                  className={field}
                  required
                  maxLength={120}
                  value={terms.carrier}
                  disabled={busy}
                  onChange={(e) => change("carrier", e.target.value)}
                />
              </label>
              <p className="text-xs text-gray-500">
                Choose a provider licensed to operate in the delivery area.
              </p>
            </>
          )}
          <label className="block text-xs font-bold">
            Handover area
            <input
              className={field}
              required
              maxLength={120}
              value={terms.location}
              disabled={busy}
              onChange={(e) => change("location", e.target.value)}
            />
          </label>
          <label className="block text-xs font-bold">
            Days after confirmed payment
            <input
              className={field}
              type="number"
              min={1}
              max={30}
              required
              value={terms.dispatchDays}
              disabled={busy}
              onChange={(e) => change("dispatchDays", Number(e.target.value))}
            />
          </label>
          <StreamSelect
            label="Inspection after receipt"
            value={String(terms.inspectionHours)}
            options={[24, 48, 72].map((n) => ({
              value: String(n),
              label: n + " hours",
            }))}
            disabled={busy}
            onChange={(v) => change("inspectionHours", Number(v))}
          />
          <label className="block text-xs font-bold">
            Return terms
            <textarea
              className={field}
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              placeholder="When a return is accepted, who pays return delivery, and the return deadline."
              value={terms.returns}
              disabled={busy}
              onChange={(e) => change("returns", e.target.value)}
            />
          </label>
          <p className="text-xs text-gray-500">
            The current listing description and photos will be preserved with
            this offer. Update the listing first if its condition has changed.
            Offers expire in 24 hours.
          </p>
          <div className="flex gap-3">
            <button className={button} disabled={busy}>
              {busy ? "Saving..." : "Send offer"}
            </button>
            <button
              type="button"
              className="min-h-11 text-xs font-bold"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {offers.length > 1 && (
        <details className="text-xs">
          <summary className="min-h-8 cursor-pointer">
            Earlier offers ({offers.length - 1})
          </summary>
          {offers.slice(1).map((o) => (
            <p key={o.id} className="py-2">
              {tradeTotal(o.terms)} {o.terms.currency} ? {o.status} ?{" "}
              {new Date(o.createdAt).toLocaleString()}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
