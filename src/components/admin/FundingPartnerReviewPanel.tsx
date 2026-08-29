import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, custom, getAddress, http, isAddress } from "viem";
import {
  upfrontSettlementV3Enabled,
  upfrontXLayerChain,
} from "../../lib/upfrontChains";
import {
  ArrowPathIcon,
  CheckIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { LoadingRing } from "../ui/LoadingRing";

const API = "/api/hashpaystream/v1/funding-partners";
const ESCROW = String(import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS ?? "").trim();
const ESCROW_ABI = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowedFunders", stateMutability: "view", inputs: [{ name: "funder", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "authorizeFunderAndActivate", stateMutability: "nonpayable", inputs: [{ name: "funder", type: "address" }], outputs: [] },
  { type: "function", name: "setFunderAllowed", stateMutability: "nonpayable", inputs: [{ name: "funder", type: "address" }, { name: "allowed", type: "bool" }], outputs: [] },
  { type: "function", name: "setPaused", stateMutability: "nonpayable", inputs: [{ name: "shouldPause", type: "bool" }], outputs: [] },
] as const;

type ApplicationStatus = "pending" | "approved" | "restricted";
type Application = {
  id: string;
  email: string;
  name: string;
  country: string;
  applicantType: "individual" | "company";
  experience: string;
  expectedFundingRange: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  walletAddress?: string;
};
type Filter = "pending" | "all";
type FundingState = "checking" | "enabled" | "disabled" | "unavailable";

function statusLabel(application: Application) {
  if (application.status === "approved" && !application.walletAddress) return "Wallet verification needed";
  if (application.status === "approved") return "Review access approved";
  if (application.status === "restricted") return "Declined";
  return "Needs review";
}

function formatRange(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export default function FundingPartnerReviewPanel() {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [fundingState, setFundingState] = useState<Record<string, FundingState>>({});
  const [escrowPaused, setEscrowPaused] = useState<boolean>();
  const [pausing, setPausing] = useState(false);

  const token = useCallback(async () => {
    const value = await getAccessToken();
    if (!value) throw new Error("Sign in again to review funding partners.");
    return value;
  }, [getAccessToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}?review=1`, {
        cache: "no-store",
        headers: { authorization: `Bearer ${await token()}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        applications?: Application[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          body.error || "Funding applications could not be loaded.",
        );
      setApplications(body.applications ?? []);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Funding applications could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!upfrontSettlementV3Enabled) return;
    const candidates = applications.filter(
      (application) =>
        application.status === "approved" &&
        Boolean(application.walletAddress) &&
        isAddress(application.walletAddress!),
    );
    if (!candidates.length || !isAddress(ESCROW)) return;

    let cancelled = false;
    setFundingState((current) => ({
      ...current,
      ...Object.fromEntries(
        candidates.map((application) => [application.id, "checking"]),
      ),
    }));
    const publicClient = createPublicClient({
      chain: upfrontXLayerChain,
      transport: http(),
    });
    void Promise.all([
      publicClient.readContract({
        address: getAddress(ESCROW),
        abi: ESCROW_ABI,
        functionName: "paused",
      }),
      Promise.all(
        candidates.map((application) =>
          publicClient.readContract({
            address: getAddress(ESCROW),
            abi: ESCROW_ABI,
            functionName: "allowedFunders",
            args: [getAddress(application.walletAddress!)],
          }),
        ),
      ),
    ])
      .then(([paused, allowed]) => {
        if (cancelled) return;
        setEscrowPaused(paused);
        setFundingState((current) => ({
          ...current,
          ...Object.fromEntries(
            candidates.map((application, index) => [
              application.id,
              !paused && allowed[index] ? "enabled" : "disabled",
            ]),
          ),
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setFundingState((current) => ({
          ...current,
          ...Object.fromEntries(
            candidates.map((application) => [application.id, "unavailable"]),
          ),
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [applications]);

  async function pauseFunding() {
    setPausing(true);
    setError("");
    try {
      if (!isAddress(ESCROW)) throw new Error("The X Layer escrow is not configured.");
      const embedded = wallets.filter(wallet => wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2");
      if (embedded.length !== 1) throw new Error("Your admin Privy wallet is not ready.");
      const account = getAddress(embedded[0].address);
      const escrow = getAddress(ESCROW);
      const publicClient = createPublicClient({ chain: upfrontXLayerChain, transport: http() });
      const owner = await publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "owner" });
      if (getAddress(owner) !== account) throw new Error("This admin profile does not control the X Layer escrow.");
      const paused = await publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "paused" });
      if (!paused) {
        await embedded[0].switchChain(upfrontXLayerChain.id);
        const walletClient = createWalletClient({ account, chain: upfrontXLayerChain, transport: custom(await embedded[0].getEthereumProvider()) });
        const request = await publicClient.simulateContract({ account, address: escrow, abi: ESCROW_ABI, functionName: "setPaused", args: [true] });
        const hash = await walletClient.writeContract(request.request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The X Layer pause transaction reverted.");
      }
      setEscrowPaused(true);
      setFundingState(current => Object.fromEntries(Object.keys(current).map(id => [id, "disabled"])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Funding could not be paused.");
    } finally {
      setPausing(false);
    }
  }

  async function review(
    application: Application,
    status: "approved" | "restricted",
  ) {
    setReviewing(application.id);
    setError("");
    try {
      const shouldUpdateEscrow = status === "restricted" || upfrontSettlementV3Enabled;
      if (shouldUpdateEscrow) {
        if (!application.walletAddress || !isAddress(application.walletAddress) || !isAddress(ESCROW)) throw new Error("This profile's Privy wallet is not verified yet.");
        const embedded = wallets.filter(wallet => wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2");
        if (embedded.length !== 1) throw new Error("Your admin Privy wallet is not ready.");
        const account = getAddress(embedded[0].address);
        const escrow = getAddress(ESCROW);
        const funder = getAddress(application.walletAddress);
        const publicClient = createPublicClient({ chain: upfrontXLayerChain, transport: http() });
        const [owner, allowed, paused] = await Promise.all([
          publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "owner" }),
          publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "allowedFunders", args: [funder] }),
          publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "paused" }),
        ]);
        if (getAddress(owner) !== account) throw new Error("This admin profile does not control the X Layer escrow.");
        const needsTransaction = status === "approved" ? (!allowed || paused) : allowed;
        if (needsTransaction) {
          await embedded[0].switchChain(upfrontXLayerChain.id);
          const walletClient = createWalletClient({ account, chain: upfrontXLayerChain, transport: custom(await embedded[0].getEthereumProvider()) });
          const hash = status === "approved"
            ? await walletClient.writeContract((await publicClient.simulateContract({ account, address: escrow, abi: ESCROW_ABI, functionName: "authorizeFunderAndActivate", args: [funder] })).request)
            : await walletClient.writeContract((await publicClient.simulateContract({ account, address: escrow, abi: ESCROW_ABI, functionName: "setFunderAllowed", args: [funder, false] })).request);
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error("The X Layer authorization transaction reverted.");
        }
      }
      const response = await fetch(API, {
        method: "POST",
        headers: {
          authorization: `Bearer ${await token()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "review", applicationId: application.id, status }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        application?: Application;
        error?: string;
      };
      if (!response.ok || !body.application)
        throw new Error(
          body.error || "The review decision could not be saved.",
        );
      setApplications((current) =>
        current.map((item) =>
          item.id === application.id ? body.application! : item,
        ),
      );
      setFundingState((current) => ({
        ...current,
        [application.id]: status === "approved" && upfrontSettlementV3Enabled ? "enabled" : "disabled",
      }));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The review decision could not be saved.",
      );
    } finally {
      setReviewing("");
    }
  }

  const pendingCount = applications.filter(
    (application) => application.status === "pending",
  ).length;
  const visible = useMemo(
    () =>
      filter === "pending"
        ? applications.filter((application) => application.status === "pending")
        : applications,
    [applications, filter],
  );

  return (
    <section
      id="funding-partners"
      className="mt-5 rounded-2xl border border-gray-200 p-5 dark:border-white/10"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">
            <UserGroupIcon className="h-4 w-4 text-blue-500" /> Funding partner
            requests
          </p>
          <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
            Approve private funding-request access for verified HashPayStream accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {escrowPaused === false && (
          <button
            type="button"
            onClick={() => void pauseFunding()}
            disabled={pausing}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-amber-500 px-3 text-[11px] font-bold text-gray-950 disabled:opacity-50"
          >
            <XMarkIcon className="h-3.5 w-3.5" /> {pausing ? "Pausing" : "Pause funding"}
          </button>
        )}
        {escrowPaused === true && <span className="inline-flex h-9 items-center rounded-full bg-amber-100 px-3 text-[11px] font-bold text-amber-700 dark:bg-amber-400/15 dark:text-amber-200">Funding paused</span>}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-full border border-gray-200 px-3 text-[11px] font-semibold text-gray-600 disabled:opacity-50 dark:border-white/10 dark:text-gray-300"
        >
          <ArrowPathIcon className="h-3.5 w-3.5" /> Refresh
        </button>
        </div>
      </div>
      <div
        className="mt-4 flex w-fit rounded-full bg-gray-100 p-1 dark:bg-white/[0.05]"
        aria-label="Funding application filter"
      >
        <button
          type="button"
          onClick={() => setFilter("pending")}
          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${filter === "pending" ? "bg-white text-gray-950 shadow-sm dark:bg-white/10 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
        >
          Pending {pendingCount}
        </button>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${filter === "all" ? "bg-white text-gray-950 shadow-sm dark:bg-white/10 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
        >
          All {applications.length}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300"
        >
          {error}
        </div>
      )}
      {loading && !applications.length && (
        <div className="flex min-h-32 items-center justify-center">
          <LoadingRing
            className="h-4 w-4 text-gray-300"
            label="Loading funding partner requests"
          />
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-gray-200 py-9 text-center dark:border-white/10">
          <UserGroupIcon className="mx-auto h-6 w-6 text-gray-300" />
          <p className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
            {filter === "pending"
              ? "No requests need review"
              : "No funding applications yet"}
          </p>
        </div>
      )}
      {visible.length > 0 && (
        <div className="mt-4 space-y-3">
          {visible.map((application) => (
            <article
              key={application.id}
              className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.035]"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-xs font-bold text-gray-950 dark:text-white">
                      {application.name}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${application.status === "pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200" : application.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200" : "bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-300"}`}
                    >
                      {statusLabel(application)}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-[11px] text-gray-500">
                    {application.email}
                  </p>
                  {application.walletAddress && <p className="mt-1 break-all font-mono text-[10px] text-gray-400">{application.walletAddress}</p>}
                  {application.status === "approved" && !application.walletAddress && <p className="mt-2 text-[10px] leading-5 text-amber-600 dark:text-amber-300">Ask this account to open Funding partners once so HashPayStream can verify its Privy wallet.</p>}
                  <p className="mt-2 text-[11px] leading-5 text-gray-500">
                    {application.country} / {application.applicantType} /{" "}
                    {application.experience} /{" "}
                    {formatRange(application.expectedFundingRange)}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-400">
                    Submitted {formatDate(application.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {application.status !== "restricted" && (
                    <button
                      type="button"
                      disabled={reviewing === application.id}
                      onClick={() => void review(application, "restricted")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-600 disabled:opacity-40 dark:border-white/10 dark:text-gray-300"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                      Decline
                    </button>
                  )}
                  {application.status !== "approved" && (
                    <button
                      type="button"
                      disabled={reviewing === application.id}
                      onClick={() => void review(application, "approved")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gray-950 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  )}
                  {application.status === "approved" && application.walletAddress && (
                    !upfrontSettlementV3Enabled ? (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100 px-3 py-2 text-[11px] font-bold text-amber-700 dark:bg-amber-400/15 dark:text-amber-200">
                        Funding paused for upgrade
                      </span>
                    ) : (fundingState[application.id] ?? "checking") === "enabled" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-100 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200">
                        <CheckIcon className="h-3.5 w-3.5" />
                        Funding enabled
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          reviewing === application.id ||
                          (fundingState[application.id] ?? "checking") === "checking"
                        }
                        onClick={() => void review(application, "approved")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gray-950 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950"
                      >
                        <CheckIcon className="h-3.5 w-3.5" />
                        {(fundingState[application.id] ?? "checking") === "checking"
                          ? "Checking funding"
                          : fundingState[application.id] === "unavailable"
                            ? "Check funding"
                            : "Enable funding"}
                      </button>
                    )
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="mt-4 rounded-xl bg-blue-50 px-3 py-2.5 text-[10px] leading-5 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
        Approval allows this account to receive private funding requests. X Layer
        funding remains protected by the escrow owner's separate wallet
        allowlist and every transaction still requires explicit confirmation.
      </p>
    </section>
  );
}
