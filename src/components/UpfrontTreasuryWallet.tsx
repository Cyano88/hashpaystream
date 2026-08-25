import { useEffect, useState } from "react";
import { useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { CheckCircleIcon, WalletIcon } from "@heroicons/react/24/outline";
import { upfrontXLayerChain } from "../lib/upfrontChains";

const short = (value: string) =>
  value.length > 14 ? `${value.slice(0, 7)}...${value.slice(-5)}` : value;

export default function UpfrontTreasuryWallet() {
  const { ready: authReady, authenticated, user } = usePrivy();
  const { wallets, ready } = useWallets();
  const { createWallet } = useCreateWallet();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [walletCheckTimedOut, setWalletCheckTimedOut] = useState(false);
  const [createdTreasury, setCreatedTreasury] = useState("");
  const embeddedWallets = wallets.filter(
    (wallet) =>
      wallet.walletClientType === "privy" ||
      wallet.walletClientType === "privy-v2",
  );
  const linkedEmbeddedWallets = (user?.linkedAccounts ?? []).flatMap(
    (account) =>
      account.type === "wallet" &&
      account.chainType === "ethereum" &&
      (account.walletClientType === "privy" ||
        account.walletClientType === "privy-v2")
        ? [account]
        : [],
  );
  const signer = embeddedWallets.length === 1 ? embeddedWallets[0] : undefined;
  const knownTreasuries = [
    ...new Set(
      [
        ...embeddedWallets.map((wallet) => wallet.address),
        ...linkedEmbeddedWallets.map((wallet) => wallet.address),
        ...(createdTreasury ? [createdTreasury] : []),
      ].map((address) => address.toLowerCase()),
    ),
  ];
  const treasury =
    knownTreasuries.length === 1 ? knownTreasuries[0] : undefined;
  const walletKnownButConnectorPending = Boolean(treasury && !signer);

  useEffect(() => {
    if (ready || !authReady || !authenticated) {
      setWalletCheckTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setWalletCheckTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, [authReady, authenticated, ready]);

  async function prepare() {
    setCreating(true);
    setError("");
    try {
      const wallet = await createWallet();
      setCreatedTreasury(wallet.address);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The treasury signer could not be created.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyTreasury() {
    if (!treasury) return;
    await navigator.clipboard.writeText(treasury);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-400/20 dark:bg-blue-400/10">
      <div className="flex items-start gap-3">
        <WalletIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-blue-950 dark:text-blue-100">
                Funding wallet
              </p>
              <p className="mt-1 text-[11px] leading-5 text-blue-800/80 dark:text-blue-200/80">
                This Privy wallet funds on {upfrontXLayerChain.name} and
                receives its repayments on Arc.
              </p>
            </div>
            {treasury && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                Ready
              </span>
            )}
          </div>
          {!ready && !treasury && !walletCheckTimedOut && (
            <p className="mt-3 text-xs text-blue-800">
              Checking wallet state...
            </p>
          )}
          {!treasury && (ready || walletCheckTimedOut) && (
            <button
              type="button"
              disabled={creating || !authReady || !authenticated}
              onClick={() => void prepare()}
              className="mt-3 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {creating
                ? "Creating treasury wallet..."
                : "Create treasury wallet"}
            </button>
          )}
          {walletCheckTimedOut && !treasury && (
            <p className="mt-2 text-[11px] leading-5 text-amber-800">
              The live wallet connection is taking longer than expected. You can
              safely create the wallet now; setup cannot move funds.
            </p>
          )}
          {knownTreasuries.length > 1 && (
            <p className="mt-3 text-xs leading-5 text-rose-700">
              Multiple embedded wallets are linked to this identity. Treasury
              selection is locked until an operator verifies the correct
              address.
            </p>
          )}
          {treasury && (
            <div className="mt-3 text-[11px]">
              <Row label="Funding and repayment address" address={treasury} />
              <button
                type="button"
                onClick={() => void copyTreasury()}
                className="mt-2 rounded-lg border border-blue-200 bg-white px-3 py-2 font-semibold text-blue-700"
              >
                {copied ? "Address copied" : "Copy full address"}
              </button>
            </div>
          )}
          {walletKnownButConnectorPending && (
            <p className="mt-2 text-[11px] leading-5 text-amber-800">
              Treasury address recovered. The signing connection is still
              loading, so transactions remain locked.
            </p>
          )}
          {treasury && (
            <p className="mt-3 text-[11px] leading-5 text-blue-800/80 dark:text-blue-200/80">
              Keep the approved USDC funding amount and a small OKB gas balance
              on X Layer. Add a small Arc Testnet USDC gas balance before
              claiming repayment. Every action still requires an explicit
              wallet confirmation.
            </p>
          )}
          {error && <p className="mt-3 text-xs text-rose-700">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, address }: { label: string; address?: string }) {
  return (
    <div className="rounded-xl border border-blue-200/70 bg-white/70 px-3 py-2 dark:border-blue-300/10 dark:bg-black/10">
      <p className="font-medium text-blue-700">{label}</p>
      <p className="mt-1 truncate font-mono text-blue-950 dark:text-blue-100">
        {address ? short(address) : "Awaiting dashboard setup"}
      </p>
    </div>
  );
}
