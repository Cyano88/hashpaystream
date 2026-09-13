import { useEffect, useRef, useState } from "react";
import { communityRequest, type TradeThread } from "../lib/tradeCommunity";
import type { TradeOffer } from "../lib/tradeAgreement";
import { useStreamConfirm } from "./ui/StreamConfirmSheet";
export type TradeCheckoutWallet = {
  state: string;
  session?: { userToken: string; wallet: { id: string; address: string } };
  reconnect: () => Promise<void>;
};
type Status = {
  offerStatus: string;
  buyerReady: boolean;
  sellerReady: boolean;
  wallet: { walletId: string; address: string; chainId: number } | null;
  reservation: { id: string; createdAt: number } | null;
};
const button =
  "min-h-11 rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950";
export default function TradeCheckout({
  thread,
  offer,
  wallet,
  getAccessToken,
  onCancelAvailability,
}: {
  thread: TradeThread;
  offer: TradeOffer;
  wallet?: TradeCheckoutWallet;
  getAccessToken: () => Promise<string | null>;
  onCancelAvailability: (allowed: boolean) => void;
}) {
  const [status, setStatus] = useState<Status>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { confirm, confirmation } = useStreamConfirm();
  const alive = useRef(false),
    sequence = useRef(0),
    locked = useRef(false),
    currentWallet = useRef(wallet);
  currentWallet.current = wallet;
  const tokenReader = useRef(getAccessToken);
  tokenReader.current = getAccessToken;
  async function request(path: string, payload?: unknown) {
    const token = await tokenReader.current();
    if (!alive.current) throw Error("Account changed.");
    if (path === "settlement-wallet") {
      const selected = payload as { userToken: string; walletId: string };
      if (
        currentWallet.current?.state !== "ready" ||
        currentWallet.current.session?.userToken !== selected.userToken ||
        currentWallet.current.session?.wallet.id !== selected.walletId
      )
        throw Error("Your wallet session changed. Check it and try again.");
    }
    return communityRequest(path, token, payload);
  }
  async function refresh() {
    const n = ++sequence.current;
    try {
      const result = await request(
        "checkout?threadId=" + thread.id + "&offerId=" + offer.id,
      );
      if (!alive.current || n !== sequence.current) return;
      setStatus(result);
      setError("");
      onCancelAvailability(
        result.offerStatus === "accepted" &&
          !result.reservation &&
          !locked.current,
      );
    } catch (e) {
      if (alive.current && n === sequence.current) {
        setError((e as Error).message);
        onCancelAvailability(false);
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    onCancelAvailability(false);
    void refresh();
    const timer = setInterval(() => {
      if (!locked.current && document.visibilityState === "visible")
        void refresh();
    }, 15000);
    return () => {
      alive.current = false;
      sequence.current++;
      clearInterval(timer);
    };
  }, [thread.id, offer.id]);
  async function selectWallet() {
    if (locked.current) return;
    locked.current = true;
    sequence.current++;
    setBusy(true);
    setError("");
    onCancelAvailability(false);
    try {
      const connected = currentWallet.current;
      if (!connected?.session || connected.state !== "ready") {
        if (!connected) throw Error("Open your Circle wallet to continue.");
        await connected.reconnect();
        return;
      }
      const session = connected.session;
      const accepted = await confirm({
        title: "Use this settlement wallet?",
        description: `Arc testnet wallet ${session.wallet.address}. This wallet is fixed for these terms. Changing it requires a new offer. No payment or token approval is requested.`,
        action: "Confirm wallet",
      });
      if (!accepted || !alive.current) return;
      if (
        currentWallet.current?.state !== "ready" ||
        currentWallet.current.session?.userToken !== session.userToken ||
        currentWallet.current.session?.wallet.id !== session.wallet.id
      )
        throw Error("Your wallet session changed. Check it and try again.");
      await request("settlement-wallet", {
        threadId: thread.id,
        offerId: offer.id,
        walletId: session.wallet.id,
        userToken: session.userToken,
      });
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      locked.current = false;
      if (alive.current) {
        setBusy(false); /* Reconcile even when the response was lost. */
        const n = ++sequence.current;
        try {
          const result = await request(
            "checkout?threadId=" + thread.id + "&offerId=" + offer.id,
          );
          if (alive.current && n === sequence.current) {
            setStatus(result);
            onCancelAvailability(
              result.offerStatus === "accepted" && !result.reservation,
            );
            if (result.wallet) setError("");
          }
        } catch (e) {
          if (alive.current && n === sequence.current) {
            setError((e as Error).message);
            onCancelAvailability(false);
          }
        }
      }
    }
  }
  const eligible =
    offer.terms.currency === "USDC" &&
    offer.terms.escrowPolicyVersion === "trade-escrow-v1";
  const counterpartReady =
    thread.role === "buyer" ? status?.sellerReady : status?.buyerReady;
  return (
    <section
      className="space-y-2 border-t border-gray-200 pt-3 dark:border-white/10"
      aria-label="Trade checkout"
    >
      {confirmation}
      <h4 className="text-xs font-bold">Checkout</h4>
      {!status && !error && (
        <p role="status" className="text-xs text-gray-500 dark:text-gray-400">
          Checking checkout...
        </p>
      )}
      {status?.reservation ? (
        <>
          <p className="text-xs font-semibold">Checkout reserved</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Payment status is not verified. Keep this reservation while
            confirmation is reconciled.
          </p>
          <details className="text-xs">
            <summary className="min-h-8 cursor-pointer">
              Reservation reference
            </summary>
            <p className="break-all font-mono">{status.reservation.id}</p>
          </details>
        </>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Payments are not available yet. Wallet confirmation does not move
          money.
        </p>
      )}
      {status?.wallet && (
        <>
          <p className="text-xs font-semibold">Your wallet confirmed</p>
          <p className="break-all font-mono text-xs text-gray-500 dark:text-gray-400">
            {status.wallet.address}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Arc testnet
          </p>
        </>
      )}
      {status && !status.reservation && eligible && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {counterpartReady
            ? `The ${thread.role === "buyer" ? "seller" : "buyer"}'s wallet is confirmed.`
            : `Waiting for the ${thread.role === "buyer" ? "seller" : "buyer"}'s wallet.`}
        </p>
      )}
      {!eligible && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Checkout needs an offer with agreed USDC settlement terms.
        </p>
      )}
      {status &&
        !status.wallet &&
        !status.reservation &&
        status.offerStatus === "accepted" &&
        eligible &&
        !thread.blocked &&
        thread.listingStatus === "active" && (
          <button
            className={button}
            disabled={busy || wallet?.state === "connecting"}
            onClick={() => void selectWallet()}
          >
            {busy
              ? "Checking wallet..."
              : wallet?.state === "ready"
                ? "Confirm settlement wallet"
                : "Open Circle wallet"}
          </button>
        )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <button
        className="min-h-11 text-xs font-bold underline disabled:opacity-50"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh checkout
      </button>
    </section>
  );
}
