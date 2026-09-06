import { useStreamConfirm } from "./ui/StreamConfirmSheet";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { StreamSelect } from "./ui/StreamSelect";
import {
  communityRequest,
  type TradeThread,
  type TradeMessage,
  type TradeReport,
} from "../lib/tradeCommunity";
import type { PublishedListing } from "../lib/tradeApi";
const field =
  "w-full rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-950 dark:border-white/15 dark:bg-zinc-900 dark:text-white";
const button =
  "min-h-11 rounded-full bg-gray-950 px-5 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950";
type Access = { getAccessToken: () => Promise<string | null> };
function useAccess(getAccessToken: Access["getAccessToken"]) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return {
    alive,
    request: async (path: string, payload?: unknown) => {
      const token = await getAccessToken();
      if (!alive.current) throw new Error("Account changed.");
      return communityRequest(path, token, payload);
    },
  };
}
export function TradeReportForm({
  listingId,
  threadId,
  getAccessToken,
  onClose,
}: { listingId: string; threadId?: string; onClose: () => void } & Access) {
  const { alive, request } = useAccess(getAccessToken),
    [reason, setReason] = useState("Misleading listing"),
    [details, setDetails] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request("reports", { listingId, threadId, reason, details });
      if (alive.current) setSent(true);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="stream-card space-y-3 p-4" aria-label="Report form">
      <h3 className="text-sm font-bold">
        Report {threadId ? "conversation" : "listing"}
      </h3>
      {sent ? (
        <>
          <p role="status" className="text-sm">
            Report sent for review.
          </p>
          <button className={button} onClick={onClose}>
            Done
          </button>
        </>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <StreamSelect
            label="Report reason"
            value={reason}
            disabled={busy}
            options={[
              "Misleading listing",
              "Prohibited item",
              "Scam or fraud",
              "Harassment",
              "Other",
            ].map((value) => ({ value, label: value }))}
            onChange={setReason}
          />
          <label className="block text-xs font-bold">
            What happened?
            <textarea
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              value={details}
              disabled={busy}
              onChange={(e) => setDetails(e.target.value)}
              className={field + " mt-2"}
            />
          </label>
          <p className="text-xs text-zinc-500">
            {threadId
              ? "The listing and up to 20 recent messages will be included for review."
              : "The listing details and photos will be included for review."}
          </p>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button disabled={busy} className={button}>
              {busy ? "Sending..." : "Send report"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="min-h-11 text-xs font-bold"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
export function TradeItemActions({
  item,
  owner,
  isOwn,
  login,
  getAccessToken,
  onOpen,
}: {
  item: PublishedListing;
  owner: string;
  isOwn: boolean;
  login: () => void;
  onOpen: (id: string) => void;
} & Access) {
  const { alive, request } = useAccess(getAccessToken),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [report, setReport] = useState(false);
  async function ask() {
    if (!owner) {
      login();
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await request("conversations", { listingId: item.id });
      if (alive.current) onOpen(result.id);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {!isOwn && (
        <div className="flex flex-wrap items-center gap-4">
          {item.status === "active" && (
            <button
              disabled={busy}
              className={button}
              onClick={() => void ask()}
            >
              {busy ? "Opening..." : "Ask seller"}
            </button>
          )}
          <button
            className="min-h-11 text-xs font-bold text-zinc-500"
            onClick={() => (owner ? setReport(true) : login())}
          >
            Report listing
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {report && (
        <TradeReportForm
          listingId={item.id}
          getAccessToken={getAccessToken}
          onClose={() => setReport(false)}
        />
      )}
    </div>
  );
}
export default function StreamPayTradeEnquiries({
  threadId,
  onOpen,
  onBack,
  getAccessToken,
}: {
  threadId?: string;
  onOpen: (id: string) => void;
  onBack: () => void;
} & Access) {
  const { alive, request } = useAccess(getAccessToken),
    [threads, setThreads] = useState<TradeThread[]>([]),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [admin, setAdmin] = useState(false),
    [moderation, setModeration] = useState(false);
  const sequence = useRef(0);
  async function load(more = false) {
    const seq = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await request(
        "conversations" + (more && next ? "?before=" + next : ""),
      );
      if (alive.current && seq === sequence.current) {
        setThreads((old) =>
          more
            ? [
                ...old,
                ...result.threads.filter(
                  (x: TradeThread) => !old.some((y) => y.id === x.id),
                ),
              ]
            : result.threads,
        );
        setNext(result.next);
      }
    } catch (e) {
      if (alive.current && seq === sequence.current)
        setError((e as Error).message);
    } finally {
      if (alive.current && seq === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    request("capabilities")
      .then((r) => {
        if (alive.current) setAdmin(r.admin === true);
      })
      .catch(() => {});
    return () => {
      sequence.current++;
    };
  }, []);
  if (threadId)
    return (
      <TradeConversation
        key={threadId}
        threadId={threadId}
        getAccessToken={getAccessToken}
        onBack={onBack}
      />
    );
  if (moderation)
    return (
      <TradeModeration
        getAccessToken={getAccessToken}
        onBack={() => setModeration(false)}
      />
    );
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Enquiries</h2>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="min-h-11 text-xs font-bold"
        >
          Refresh
        </button>
      </div>
      {admin && (
        <button className={button} onClick={() => setModeration(true)}>
          Review reports
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="text-xs text-zinc-500">
          Loading enquiries...
        </p>
      )}
      {!loading && !error && !threads.length && (
        <p className="stream-card p-5 text-sm text-zinc-500">
          Questions about your listings and items you like will appear here.
        </p>
      )}
      {threads.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t.id)}
          className="stream-card block w-full space-y-1 p-4 text-left"
        >
          <span className="block truncate text-sm font-bold">{t.title}</span>
          <span className="block text-xs text-zinc-500">
            {t.role === "buyer" ? "Buying" : "Selling"}
            {t.listingStatus === "removed"
              ? " \u00b7 Listing removed"
              : t.listingStatus === "sold"
                ? " \u00b7 Sold"
                : ""}
          </span>
        </button>
      ))}
      {next && (
        <button
          disabled={loading}
          onClick={() => void load(true)}
          className={button}
        >
          More enquiries
        </button>
      )}
    </section>
  );
}
function TradeConversation({
  threadId,
  getAccessToken,
  onBack,
}: { threadId: string; onBack: () => void } & Access) {
  const { confirm, confirmation } = useStreamConfirm();
  const { alive, request } = useAccess(getAccessToken),
    [thread, setThread] = useState<TradeThread>(),
    [messages, setMessages] = useState<TradeMessage[]>([]),
    [next, setNext] = useState<string | null>(null),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState(false),
    [loading, setLoading] = useState(true);
  const pending = useRef<{ id: string; body: string }>(),
    sequence = useRef(0),
    working = useRef(false),
    hasPage = useRef(false);
  async function load(earlier = false) {
    const seq = ++sequence.current;
    try {
      const result = await request(
        "messages?threadId=" +
          threadId +
          (earlier && next ? "&before=" + next : ""),
      );
      if (!alive.current || seq !== sequence.current) return;
      setThread(result.thread);
      setMessages((old) =>
        Array.from(
          new Map(
            [...old, ...result.messages].map((m: TradeMessage) => [m.id, m]),
          ).values(),
        ).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
      );
      if (earlier || !hasPage.current) setNext(result.next);
      hasPage.current = true;
      setError("");
    } catch (e) {
      if (alive.current && seq === sequence.current)
        setError((e as Error).message);
    } finally {
      if (alive.current && seq === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !working.current)
        void load();
    }, 15000);
    return () => {
      sequence.current++;
      window.clearInterval(timer);
    };
  }, []);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (working.current || !text.trim()) return;
    working.current = true;
    setBusy(true);
    setError("");
    if (pending.current?.body !== text.trim())
      pending.current = { id: crypto.randomUUID(), body: text.trim() };
    try {
      const result = await request("messages", {
        threadId,
        ...pending.current,
      });
      if (alive.current) {
        setMessages((old) =>
          old.some((m) => m.id === result.message.id)
            ? old
            : [...old, result.message],
        );
        setText("");
        pending.current = undefined;
        await load();
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function block() {
    if (
      !thread ||
      working.current ||
      !(await confirm({
        title: thread.blockedByMe ? "Unblock messages?" : "Block messages?",
        description: thread.blockedByMe
          ? "You can message each other again."
          : "New messages will stop in both directions. Existing messages stay visible.",
        action: thread.blockedByMe ? "Unblock" : "Block messages",
      }))
    )
      return;
    working.current = true;
    setBusy(true);
    try {
      await request("blocks", { threadId, blocked: !thread.blockedByMe });
      if (alive.current) await load();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      {confirmation}
      <button
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 text-xs font-bold"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        All enquiries
      </button>
      <h2 className="text-lg font-bold">{thread?.title || "Conversation"}</h2>
      <div className="flex flex-wrap items-center gap-4">
        <button
          disabled={busy}
          onClick={() => void load()}
          className="min-h-11 text-xs font-bold"
        >
          Refresh
        </button>
        {thread && (
          <>
            <button
              disabled={busy}
              onClick={() => void block()}
              className="min-h-11 text-xs font-bold"
            >
              {thread.blockedByMe ? "Unblock messages" : "Block messages"}
            </button>
            <button
              disabled={busy}
              onClick={() => setReport(true)}
              className="min-h-11 text-xs font-bold text-zinc-500"
            >
              Report
            </button>
          </>
        )}
      </div>
      {report && thread && (
        <TradeReportForm
          listingId={thread.listingId}
          threadId={threadId}
          getAccessToken={getAccessToken}
          onClose={() => setReport(false)}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="text-xs text-zinc-500">
          Loading conversation...
        </p>
      )}
      {next && (
        <button
          onClick={() => void load(true)}
          className="min-h-11 text-xs font-bold"
        >
          Earlier messages
        </button>
      )}
      <div className="space-y-3" aria-label="Conversation messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[90%] rounded-2xl p-3 ${m.mine ? "ml-auto bg-blue-50 dark:bg-blue-500/10" : "stream-card"}`}
          >
            <p className="mb-1 text-[10px] font-bold text-zinc-500">
              {m.mine ? "You" : thread?.role === "buyer" ? "Seller" : "Buyer"}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
            <p className="mt-2 text-[10px] text-zinc-500">
              {new Date(m.createdAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      {thread && (thread.blocked || thread.listingStatus === "removed") ? (
        <p className="text-xs text-zinc-500">
          {thread.blocked
            ? "Messaging is blocked."
            : "This listing was removed. Messaging is closed."}
        </p>
      ) : (
        thread && (
          <form onSubmit={send} className="space-y-3">
            <label className="block text-xs font-bold">
              Message
              <textarea
                className={field + " mt-2"}
                rows={3}
                required
                maxLength={2000}
                disabled={busy}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ask about the item, condition or handover."
              />
            </label>
            <button
              className={button + " w-full"}
              disabled={busy || !text.trim()}
            >
              {busy ? "Sending..." : "Send message"}
            </button>
          </form>
        )
      )}
    </section>
  );
}
function TradeModeration({
  getAccessToken,
  onBack,
}: { onBack: () => void } & Access) {
  const { confirm, confirmation } = useStreamConfirm();
  const { alive, request } = useAccess(getAccessToken),
    [reports, setReports] = useState<TradeReport[]>([]),
    [selected, setSelected] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const result = await request("moderation");
      if (alive.current) setReports(result.reports);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request("moderation?id=" + id);
      if (alive.current) setSelected(result.report);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function decide(decision: "hide" | "dismiss") {
    if (
      busy ||
      !selected ||
      !(await confirm({
        title: decision === "hide" ? "Hide listing?" : "Dismiss report?",
        description:
          decision === "hide"
            ? "This listing will leave Browse and the report will close."
            : "The report will close. The listing will stay unchanged.",
        action: decision === "hide" ? "Hide listing" : "Dismiss report",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request("moderation", { id: selected.id, decision });
      if (alive.current) {
        setSelected(undefined);
        await load();
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      {confirmation}
      <button
        onClick={() => (selected ? setSelected(undefined) : onBack())}
        className="min-h-11 text-xs font-bold"
      >
        Back
      </button>
      <h2 className="text-lg font-bold">Review reports</h2>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {selected ? (
        <div className="stream-card space-y-3 p-4">
          <h3 className="font-bold">{selected.evidence.listing.title}</h3>
          <p className="text-sm">{selected.reason}</p>
          <p className="whitespace-pre-wrap break-words text-sm">
            {selected.details}
          </p>
          <p className="whitespace-pre-wrap break-words text-xs text-zinc-500">
            {selected.evidence.listing.description}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {selected.evidence.listing.photos.map(
              (photo: string, index: number) => (
                <img
                  key={index}
                  src={photo}
                  alt={`Reported item photo ${index + 1}`}
                  className="aspect-square w-full rounded-xl object-cover"
                />
              ),
            )}
          </div>
          {selected.evidence.messages.map((m: any) => (
            <p key={m.id} className="whitespace-pre-wrap break-words text-xs">
              <strong>{m.role}: </strong>
              {m.body}
            </p>
          ))}
          {selected.status === "open" && (
            <div className="flex flex-wrap gap-3">
              <button
                disabled={busy}
                className={button}
                onClick={() => void decide("hide")}
              >
                Hide listing
              </button>
              <button
                disabled={busy}
                className="min-h-11 text-xs font-bold"
                onClick={() => void decide("dismiss")}
              >
                Dismiss report
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            onClick={() => void load()}
            className="min-h-11 text-xs font-bold"
          >
            Refresh queue
          </button>
          {!reports.length && !error && (
            <p className="text-sm text-zinc-500">No open reports.</p>
          )}
          {reports.map((r) => (
            <button
              key={r.id}
              disabled={busy}
              onClick={() => void open(r.id)}
              className="stream-card block w-full space-y-1 p-4 text-left"
            >
              <span className="block text-sm font-bold">{r.title}</span>
              <span className="block text-xs text-zinc-500">{r.reason}</span>
            </button>
          ))}
        </>
      )}
    </section>
  );
}
