import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  ArrowPathIcon,
  CheckIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { LoadingRing } from "../ui/LoadingRing";

const API = "/api/hashpaystream/v1/funding-partners";

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
};
type Filter = "pending" | "all";

function statusLabel(status: ApplicationStatus) {
  if (status === "approved") return "Review access approved";
  if (status === "restricted") return "Declined";
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
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");

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

  async function review(
    applicationId: string,
    status: "approved" | "restricted",
  ) {
    setReviewing(applicationId);
    setError("");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: {
          authorization: `Bearer ${await token()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "review", applicationId, status }),
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
          item.id === applicationId ? body.application! : item,
        ),
      );
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
            Approve marketplace review access for verified HashPayStream
            accounts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-full border border-gray-200 px-3 text-[11px] font-semibold text-gray-600 disabled:opacity-50 dark:border-white/10 dark:text-gray-300"
        >
          <ArrowPathIcon className="h-3.5 w-3.5" /> Refresh
        </button>
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
          <ShieldCheckIcon className="mx-auto h-6 w-6 text-gray-300" />
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
                      {statusLabel(application.status)}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-[11px] text-gray-500">
                    {application.email}
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-gray-500">
                    {application.country} · {application.applicantType} ·{" "}
                    {application.experience} ·{" "}
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
                      onClick={() => void review(application.id, "restricted")}
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
                      onClick={() => void review(application.id, "approved")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gray-950 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="mt-4 rounded-xl bg-blue-50 px-3 py-2.5 text-[10px] leading-5 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
        Approval grants access to review the private marketplace. X Layer
        funding remains protected by the escrow owner's separate wallet
        allowlist and every transaction still requires explicit confirmation.
      </p>
    </section>
  );
}
