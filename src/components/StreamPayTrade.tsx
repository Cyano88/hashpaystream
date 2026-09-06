import StreamPayTradeEnquiries, {
  TradeItemActions,
} from "./StreamPayTradeEnquiries";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  AdjustmentsHorizontalIcon,
  BookmarkIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  tradeRequest,
  cachedTradePage,
  publicTradePage,
  tradePhotoSource,
  type PublishedListing,
} from "../lib/tradeApi";
import { StreamSelect } from "./ui/StreamSelect";
import { Link, useLocation, useNavigate } from "../lib/router";
import { useStreamPayPath } from "../lib/useStreamPayPath";
import {
  filterTradeListings,
  readTradePocket,
  sampleTradeListings,
  tradeCategories,
  tradePhoto,
  tradePrice,
  validateTradeDraft,
  writeTradePocket,
  type TradeListing,
  type TradePocket,
} from "../lib/tradePreview";

const tabs = ["Browse", "Sell", "Saved", "My listings"] as const;
type Tab = (typeof tabs)[number];
const field =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/15 dark:bg-zinc-900 dark:text-white";
const blank = (): TradeListing => ({
  id: crypto.randomUUID(),
  title: "",
  price: "",
  currency: "NGN",
  city: "",
  category: "Clothing",
  condition: "Good",
  size: "",
  description: "",
  delivery: "Either",
  photos: [],
  createdAt: Date.now(),
});

export default function StreamPayTrade() {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  // Remount all private state on an identity change; late loads cannot leak across accounts.
  const owner = ready && authenticated ? user?.id || "" : "";
  return (
    <TradeScreen
      key={owner || "visitor"}
      owner={owner}
      ready={ready}
      login={login}
      getAccessToken={getAccessToken}
    />
  );
}
function TradeScreen({
  owner,
  ready,
  login,
  getAccessToken,
}: {
  owner: string;
  ready: boolean;
  login: () => void;
  getAccessToken: () => Promise<string | null>;
}) {
  const { search } = useLocation(),
    navigate = useNavigate(),
    home = useStreamPayPath("/home"),
    base = useStreamPayPath("/trade");
  const params = new URLSearchParams(search),
    requested = params.get("view");
  const tab: Tab =
    tabs.find((t) => t.toLowerCase().replaceAll(" ", "-") === requested) ||
    "Browse";
  const initialPage = useRef(cachedTradePage()).current;
  const [mode, setMode] = useState<"loading" | "preview" | "live" | "error">(
    initialPage ? (initialPage.enabled ? "live" : "preview") : "loading",
  );
  const [market, setMarket] = useState<PublishedListing[]>(
      initialPage?.listings || [],
    ),
    [mine, setMine] = useState<PublishedListing[]>([]);
  const [detail, setDetail] = useState<PublishedListing>(),
    [revision, setRevision] = useState(0),
    [nextPage, setNextPage] = useState<string | null>(
      initialPage?.next || null,
    );
  const [marketError, setMarketError] = useState(""),
    [marketBusy, setMarketBusy] = useState(false);
  const requestSequence = useRef(0);
  const mineSequence = useRef(0);
  const all = mode === "preview" ? sampleTradeListings : market;
  const item =
    detail?.id === params.get("item")
      ? detail
      : all.find((i) => i.id === params.get("item"));
  const [pocket, setPocket] = useState<TradePocket>({ saved: [], drafts: [] }),
    [loaded, setLoaded] = useState(!owner);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [city, setCity] = useState("");
  const [draft, setDraft] = useState<TradeListing>(blank),
    [notice, setNotice] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterRoot = useRef<HTMLDivElement>(null),
    filterButton = useRef<HTMLButtonElement>(null),
    locationInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    if (!filtersOpen) return;
    locationInput.current?.focus();
    const close = (event: PointerEvent) => {
      if (!filterRoot.current?.contains(event.target as Node))
        setFiltersOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [filtersOpen]);
  function loadPocket() {
    setError("");
    readTradePocket(owner)
      .then((p) => {
        if (alive.current) {
          setPocket(p);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      });
  }
  useEffect(() => {
    alive.current = true;
    if (owner) loadPocket();
    return () => {
      alive.current = false;
    };
  }, [owner]);
  async function refreshMarket(more = false, force = true) {
    const sequence = ++requestSequence.current;
    setMarketBusy(true);
    setMarketError("");
    try {
      const filters = new URLSearchParams();
      {
        if (query.trim()) filters.set("q", query.trim());
        if (category !== "All") filters.set("category", category);
        if (city.trim()) filters.set("city", city.trim());
        if (tab === "Saved") {
          const ids = pocket.saved
            .filter((id) => !id.startsWith("sample-"))
            .slice(0, 100);
          if (ids.length) filters.set("ids", ids.join(","));
        }
      }
      if (more && nextPage) filters.set("before", nextPage);
      const result = await publicTradePage(
        filters.size ? "?" + filters : "",
        force,
      );
      if (!alive.current || sequence !== requestSequence.current) return;
      setMode(result.enabled ? "live" : "preview");
      setMarket((previous) =>
        more
          ? [
              ...previous,
              ...(result.listings || []).filter(
                (x) => !previous.some((y) => y.id === x.id),
              ),
            ]
          : result.listings || [],
      );
      setNextPage(result.next || null);
    } catch (e) {
      if (alive.current && sequence === requestSequence.current) {
        setMarketError(
          e instanceof Error ? e.message : "Trade could not be loaded.",
        );
        setMode((previous) => (previous === "loading" ? "error" : previous));
      }
    } finally {
      if (alive.current && sequence === requestSequence.current)
        setMarketBusy(false);
    }
  }
  async function refreshMine() {
    if (!owner) return;
    const sequence = ++mineSequence.current;
    try {
      const token = await getAccessToken();
      if (!alive.current) return;
      if (!token) throw new Error("Sign in again to load your listings.");
      const own = await tradeRequest("?mine=1", token);
      if (alive.current && sequence === mineSequence.current)
        setMine(own.listings || []);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Your listings could not be loaded.",
        );
    }
  }
  useEffect(() => {
    if (mode === "live") void refreshMine();
  }, [owner, mode]);
  // Mode changes are results, not new fetch triggers. Private Pocket loading
  // affects only Saved; switching Sell or enquiries must not reload Browse.
  const savedFilter = tab === "Saved" ? pocket.saved.join(",") : "";
  useEffect(() => {
    if (mode === "preview") return;
    if (
      mode !== "loading" &&
      (requested === "enquiries" || tab === "Sell" || tab === "My listings")
    )
      return;
    const timer = window.setTimeout(
      () => void refreshMarket(false, false),
      query || city ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      requestSequence.current++;
    };
  }, [query, category, city, tab, requested === "enquiries", savedFilter]);
  const detailId = params.get("item");
  useEffect(() => {
    if (mode !== "live" || !detailId) return;
    let current = true;
    tradeRequest("?id=" + encodeURIComponent(detailId))
      .then((result) => {
        if (current) setDetail(result.listing);
      })
      .catch((e) => {
        if (current) {
          setDetail(undefined);
          setMarketError(e.message);
        }
      });
    return () => {
      current = false;
    };
  }, [mode, detailId]);
  async function publish() {
    const issue = validateTradeDraft(draft);
    if (issue) {
      setError(issue);
      return;
    }
    if (busy || mode !== "live") return;
    setBusy(true);
    setError("");
    try {
      const result = await tradeRequest("", await getAccessToken(), {
        action: "publish",
        revision,
        listing: draft,
      });
      if (!alive.current) return;
      if (!result.listing)
        throw new Error("Publication could not be confirmed.");
      setRevision(result.listing.revision);
      setMine((previous) => [
        result.listing!,
        ...previous.filter((x) => x.id !== result.listing!.id),
      ]);
      go("My listings");
      setNotice("Listing published. Others can now find it.");
      setDraft(blank());
      setRevision(0);
      // Keep publication success separate from optional device-draft cleanup.
      try {
        const next = {
          ...pocket,
          drafts: pocket.drafts.filter((x) => x.id !== draft.id),
        };
        await writeTradePocket(owner, next);
        if (alive.current) setPocket(next);
      } catch {
        if (alive.current)
          setNotice(
            "Listing published. The device draft could not be removed.",
          );
      }
      if (alive.current) void refreshMarket();
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Listing was not published.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function editPublished(listing: PublishedListing) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const photos = await Promise.all(
        listing.photos.map(async (url) => {
          const response = await fetch(await tradePhotoSource(url));
          if (!response.ok)
            throw new Error("Listing photos could not be loaded.");
          return tradePhoto(
            new File([await response.blob()], "listing.jpg", {
              type: "image/jpeg",
            }),
          );
        }),
      );
      if (alive.current) {
        setDraft({ ...listing, photos });
        setRevision(listing.revision);
        go("Sell");
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Listing could not be edited.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function changeListing(
    listing: PublishedListing,
    action: "sold" | "remove",
  ) {
    if (
      busy ||
      !window.confirm(
        action === "sold"
          ? "Mark this listing as sold?"
          : "Remove this published listing?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await tradeRequest("", await getAccessToken(), {
        action,
        id: listing.id,
        revision: listing.revision,
      });
      if (alive.current) {
        setNotice(
          action === "sold" ? "Listing marked sold." : "Listing removed.",
        );
        await Promise.all([refreshMarket(), refreshMine()]);
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Listing could not be updated.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function go(next: Tab, id?: string) {
    const u = new URL(base, window.location.origin);
    u.searchParams.set("view", next.toLowerCase().replaceAll(" ", "-"));
    if (id) u.searchParams.set("item", id);
    navigate(u.pathname + u.search);
    setNotice("");
    setError("");
    setFiltersOpen(false);
  }
  async function commit(next: TradePocket) {
    if (!owner) {
      login();
      return false;
    }
    if (!loaded || busy) return false;
    setBusy(true);
    setError("");
    try {
      await writeTradePocket(owner, next);
      if (alive.current) setPocket(next);
      return true;
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Changes could not be saved.",
        );
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function saveItem(id: string) {
    if (pocket.saved.length >= 100 && !pocket.saved.includes(id)) {
      setError("You can save up to 100 items. Unsave an older item first.");
      return;
    }
    await commit({
      ...pocket,
      saved: pocket.saved.includes(id)
        ? pocket.saved.filter((x) => x !== id)
        : [...pocket.saved, id],
    });
  }
  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (revision > 0 || busy) return;
    const issue = validateTradeDraft(draft);
    if (issue) {
      setError(issue);
      return;
    }
    if (
      pocket.drafts.length >= 20 &&
      !pocket.drafts.some((d) => d.id === draft.id)
    ) {
      setError("You can keep up to 20 drafts. Remove an older draft first.");
      return;
    }
    if (
      await commit({
        ...pocket,
        drafts: [
          {
            ...draft,
            title: draft.title.trim(),
            city: draft.city.trim(),
            description: draft.description.trim(),
          },
          ...pocket.drafts.filter((d) => d.id !== draft.id),
        ],
      })
    ) {
      setNotice("Draft saved on this device. It is not published.");
      setDraft(blank());
    }
  }
  const visible = filterTradeListings(
    tab === "Saved" ? all.filter((i) => pocket.saved.includes(i.id)) : all,
    query,
    category,
    city,
  );
  const signIn = (
    <div className="stream-card space-y-3 px-6 py-10 text-center">
      <BookmarkIcon className="mx-auto h-7 w-7 text-blue-600" />
      <h2 className="text-lg font-bold">Keep it in your Pocket</h2>
      <p className="text-sm text-zinc-500">
        Sign in to save items and prepare your listings.
      </p>
      <button
        disabled={!ready}
        onClick={login}
        className="rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {ready ? "Sign in" : "Loading sign-in"}
      </button>
    </div>
  );
  return (
    <section className="stream-screen w-full max-w-md space-y-4 pb-6 pt-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={home}
            aria-label="Back to Home"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 dark:border-white/15"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Trade</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === "live" && (
            <button
              aria-label="Trade enquiries"
              onClick={() => navigate(base + "?view=enquiries")}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 dark:border-white/15"
            >
              <ChatBubbleLeftRightIcon className="h-5 w-5" />
            </button>
          )}
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
            {mode === "preview"
              ? "Sample listings"
              : mode === "live"
                ? "Trade pilot"
                : "Connecting"}
          </span>
        </div>
      </header>
      <nav aria-label="Trade sections" className="stream-segment grid-cols-4">
        {tabs.map((name) => (
          <button
            key={name}
            onClick={() => go(name)}
            aria-current={
              tab === name && requested !== "enquiries" ? "page" : undefined
            }
            className={`min-h-11 rounded-full text-xs font-extrabold ${tab === name && requested !== "enquiries" ? "bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950" : "text-gray-500 dark:text-gray-400"}`}
          >
            {name}
          </button>
        ))}
      </nav>
      {marketError && (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 p-3 text-xs text-red-700"
        >
          {marketError}
          <button
            onClick={() => void refreshMarket()}
            className="ml-3 min-h-11 font-bold underline"
          >
            Retry
          </button>
        </p>
      )}
      <span role="status" className="sr-only">
        {mode === "loading"
          ? "Loading listings"
          : marketBusy
            ? "Updating listings"
            : ""}
      </span>
      {error && (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
          {owner && !loaded && (
            <button
              onClick={loadPocket}
              className="ml-3 min-h-11 font-bold underline"
            >
              Retry
            </button>
          )}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-2xl bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
        >
          {notice}
        </p>
      )}
      {requested === "enquiries" ? (
        !owner ? (
          signIn
        ) : (
          <StreamPayTradeEnquiries
            key={params.get("conversation") || "inbox"}
            threadId={params.get("conversation") || undefined}
            getAccessToken={getAccessToken}
            onOpen={(id) =>
              navigate(
                base + "?view=enquiries&conversation=" + encodeURIComponent(id),
              )
            }
            onBack={() => navigate(base + "?view=enquiries")}
          />
        )
      ) : item ? (
        <div className="space-y-5">
          <button
            onClick={() => go(tab)}
            className="inline-flex min-h-11 items-center gap-2 text-xs font-bold"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to items
          </button>
          <ItemArt item={item} large />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-2xl font-bold tracking-tight">
                {tradePrice(item)}
              </p>
              <h2 className="mt-1 text-lg font-semibold">{item.title}</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {item.city} · {item.condition} · {item.size}
              </p>
            </div>
            <SaveButton
              item={item}
              saved={pocket.saved.includes(item.id)}
              disabled={busy || !ready || (!!owner && !loaded)}
              onClick={() => void saveItem(item.id)}
            />
          </div>
          <div className="stream-card space-y-3 p-5">
            <h3 className="text-sm font-bold">About this item</h3>
            <p className="text-sm leading-6 text-zinc-500">
              {item.description.replace(/^Sample listing\. /, "")}
            </p>
            <p className="text-xs font-semibold">
              {item.delivery === "Either"
                ? "Delivery or local pickup"
                : item.delivery}
            </p>
          </div>
          {mode === "live" && (
            <TradeItemActions
              key={item.id}
              item={item as PublishedListing}
              owner={owner}
              isOwn={mine.some((listing) => listing.id === item.id)}
              login={login}
              getAccessToken={getAccessToken}
              onOpen={(id) =>
                navigate(
                  base +
                    "?view=enquiries&conversation=" +
                    encodeURIComponent(id),
                )
              }
            />
          )}
          <p className="text-xs leading-5 text-zinc-500">
            {mode === "preview"
              ? "Sample item. Not for sale."
              : (item as PublishedListing).status === "sold"
                ? "Sold"
                : "Agree on the details here. Checkout is not available yet."}
          </p>
        </div>
      ) : tab === "My listings" ? (
        !owner ? (
          signIn
        ) : !loaded ? (
          <p role="status" className="text-sm text-zinc-500">
            Loading listings...
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">My listings</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {mode === "live"
                  ? "Manage your published items and drafts."
                  : "Unpublished drafts on this device."}
              </p>
            </div>
            {mode === "live" && (
              <section className="space-y-3">
                <h3 className="text-sm font-bold">Published items</h3>
                {mine.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Your published items will appear here.
                  </p>
                ) : (
                  mine.map((listing) => (
                    <div key={listing.id} className="stream-card space-y-3 p-3">
                      <div className="flex items-center gap-3">
                        <TradeImage
                          src={listing.photos[0]}
                          alt=""
                          className="h-14 w-14 rounded-xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold">
                            {listing.title}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {tradePrice(listing)} ·{" "}
                            {listing.status === "sold" ? "Sold" : "Published"}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {listing.status === "active" && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => void editPublished(listing)}
                              className="min-h-11 text-xs font-bold"
                            >
                              Edit listing
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void changeListing(listing, "sold")
                              }
                              className="min-h-11 text-xs font-bold"
                            >
                              Mark sold
                            </button>
                          </>
                        )}
                        <button
                          disabled={busy}
                          onClick={() => void changeListing(listing, "remove")}
                          className="min-h-11 text-xs font-bold text-red-600"
                        >
                          Remove listing
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}
            <section className="space-y-3">
              <h3 className="text-sm font-bold">
                Your drafts · {pocket.drafts.length}
              </h3>
              {pocket.drafts.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Your saved drafts will appear here.
                </p>
              ) : (
                pocket.drafts.map((d) => (
                  <div
                    key={d.id}
                    className="stream-card flex items-center gap-3 p-3"
                  >
                    <TradeImage
                      src={d.photos[0]}
                      alt=""
                      className="h-14 w-14 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{d.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {tradePrice(d)} · Draft
                      </p>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setDraft(d);
                        setRevision(0);
                        go("Sell");
                      }}
                      className="min-h-11 px-2 text-xs font-bold"
                    >
                      Edit
                    </button>
                    <button
                      disabled={busy}
                      aria-label={`Delete draft ${d.title}`}
                      onClick={() => {
                        if (
                          window.confirm("Delete this draft from this device?")
                        )
                          void commit({
                            ...pocket,
                            drafts: pocket.drafts.filter((x) => x.id !== d.id),
                          });
                      }}
                      className="flex h-11 w-11 items-center justify-center text-zinc-500"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </section>
            <button
              onClick={() => {
                setDraft(blank());
                setRevision(0);
                go("Sell");
              }}
              className="min-h-11 rounded-full bg-gray-950 px-5 text-xs font-bold text-white dark:bg-white dark:text-gray-950"
            >
              Create a listing
            </button>
          </div>
        )
      ) : tab === "Sell" ? (
        !owner ? (
          signIn
        ) : !loaded ? (
          <p role="status" className="text-sm text-zinc-500">
            Loading your drafts…
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Give it a second life.
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Add clear photos, measurements and any defects.
              </p>
            </div>
            <form onSubmit={saveDraft} className="space-y-4">
              <div>
                <span className="mb-2 block text-xs font-bold">
                  Photos · up to 4
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {draft.photos.map((photo, index) => (
                    <div key={photo.slice(-30) + index} className="relative">
                      <TradeImage
                        src={photo}
                        alt={`Item photo ${index + 1}`}
                        className="aspect-square w-full rounded-xl object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            photos: d.photos.filter((_, i) => i !== index),
                          }))
                        }
                        aria-label={`Remove photo ${index + 1}`}
                        className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-950"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {draft.photos.length < 4 && (
                    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-300 text-zinc-500">
                      <PhotoIcon className="h-6 w-6" />
                      <span className="text-[10px] font-bold">Add photo</span>
                      <input
                        aria-label="Add item photos"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        disabled={busy}
                        className="sr-only"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = "";
                          if (files.length + draft.photos.length > 4) {
                            setError("Choose up to four photos.");
                            return;
                          }
                          setBusy(true);
                          setError("");
                          try {
                            const photos = await Promise.all(
                              files.map(tradePhoto),
                            );
                            if (alive.current)
                              setDraft((d) => ({
                                ...d,
                                photos: [...d.photos, ...photos].slice(0, 4),
                              }));
                          } catch (e) {
                            if (alive.current)
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Photo could not be loaded.",
                              );
                          } finally {
                            if (alive.current) setBusy(false);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Show the actual item and any wear. JPG, PNG or WebP, under 10
                  MB each.
                </p>
              </div>
              <Field label="Item title">
                <input
                  required
                  minLength={4}
                  maxLength={80}
                  className={field}
                  placeholder="e.g. Blue linen shirt"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <StreamSelect
                    label="Category"
                    className=""
                    disabled={busy}
                    value={draft.category}
                    options={tradeCategories.map((value) => ({
                      value,
                      label: value,
                    }))}
                    onChange={(value) =>
                      setDraft({
                        ...draft,
                        category: value as TradeListing["category"],
                      })
                    }
                  />
                </Field>
                <Field label="Condition">
                  <StreamSelect
                    label="Condition"
                    className=""
                    disabled={busy}
                    value={draft.condition}
                    options={["Like new", "Good", "Fair"].map((value) => ({
                      value,
                      label: value,
                    }))}
                    onChange={(value) =>
                      setDraft({ ...draft, condition: value })
                    }
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price">
                  <input
                    required
                    inputMode="decimal"
                    className={field}
                    placeholder="0.00"
                    value={draft.price}
                    onChange={(e) =>
                      setDraft({ ...draft, price: e.target.value })
                    }
                  />
                </Field>
                <Field label="Currency">
                  <StreamSelect
                    label="Currency"
                    className=""
                    disabled={busy}
                    value={draft.currency}
                    options={["NGN", "USD", "USDC"].map((value) => ({
                      value,
                      label: value,
                    }))}
                    onChange={(value) =>
                      setDraft({
                        ...draft,
                        currency: value as TradeListing["currency"],
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="City or area">
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  className={field}
                  placeholder="City, country"
                  value={draft.city}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                />
              </Field>
              <Field label="Size or dimensions">
                <input
                  maxLength={80}
                  className={field}
                  placeholder="Label size and actual measurements"
                  value={draft.size}
                  onChange={(e) => setDraft({ ...draft, size: e.target.value })}
                />
              </Field>
              <Field label="Description and defects">
                <textarea
                  required
                  minLength={20}
                  maxLength={1500}
                  rows={4}
                  className={field}
                  placeholder="Material, measurements, signs of wear and anything a buyer should know."
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </Field>
              <Field label="Handover">
                <StreamSelect
                  label="Handover"
                  className=""
                  disabled={busy}
                  value={draft.delivery}
                  options={[
                    { value: "Either", label: "Delivery or local pickup" },
                    { value: "Delivery", label: "Delivery" },
                    { value: "Pickup", label: "Local pickup" },
                  ]}
                  onChange={(value) =>
                    setDraft({
                      ...draft,
                      delivery: value as TradeListing["delivery"],
                    })
                  }
                />
              </Field>
              <p className="text-xs leading-5 text-zinc-500">
                Use a trackable courier authorised in your area.
              </p>
              {mode === "live" && (
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => void publish()}
                  className="min-h-12 w-full rounded-full bg-gray-950 text-sm font-bold text-white dark:bg-white dark:text-gray-950 disabled:opacity-50"
                >
                  {busy
                    ? "Working..."
                    : revision
                      ? "Update listing"
                      : "Publish listing"}
                </button>
              )}
              <button
                disabled={busy || revision > 0}
                type="submit"
                className="min-h-12 w-full rounded-full bg-blue-600 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save draft"}
              </button>
              <p className="text-center text-[11px] text-zinc-500">
                {mode === "live"
                  ? "Publishing makes your photos and item details public. Drafts stay on this device."
                  : "Device-only draft. Not published."}
              </p>
            </form>
          </div>
        )
      ) : tab === "Saved" && !owner ? (
        signIn
      ) : tab === "Saved" && !loaded ? (
        <p role="status" className="text-sm text-zinc-500">
          Loading saved items...
        </p>
      ) : (
        <>
          {tab === "Browse" && (
            <div className="rounded-2xl bg-[#e8eee3] px-4 py-3 text-[#243b2b]">
              <h2 className="text-[20px] font-bold leading-tight tracking-tight">
                Your once-loved.
                <br />
                Someone’s next find.
              </h2>
            </div>
          )}
          <div className="space-y-3">
            <div
              ref={filterRoot}
              className="relative"
              onKeyDown={(e) => {
                if (e.key === "Escape" && filtersOpen) {
                  setFiltersOpen(false);
                  filterButton.current?.focus();
                }
              }}
            >
              <div className="flex items-center gap-2">
                <label className="relative block min-w-0 flex-1">
                  <span className="sr-only">Search items</span>
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-zinc-400" />
                  <input
                    type="search"
                    maxLength={120}
                    className={field + " pl-11"}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find your next favourite"
                  />
                </label>
                <button
                  ref={filterButton}
                  type="button"
                  aria-label="Filter by location"
                  aria-expanded={filtersOpen}
                  aria-controls="trade-location-filter"
                  onClick={() => setFiltersOpen((open) => !open)}
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${city ? "border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950" : "border-zinc-200 bg-white text-zinc-600 dark:border-white/15 dark:bg-zinc-900 dark:text-white"}`}
                >
                  <AdjustmentsHorizontalIcon className="h-5 w-5" />
                </button>
              </div>
              {filtersOpen && (
                <div
                  id="trade-location-filter"
                  className="absolute inset-x-0 top-full z-30 mt-2 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-white/15 dark:bg-zinc-900"
                >
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold">
                      City or area
                    </span>
                    <input
                      ref={locationInput}
                      maxLength={80}
                      className={field}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Enter a location"
                    />
                  </label>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setCity("")}
                      className="min-h-11 px-2 text-xs font-bold text-zinc-500"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFiltersOpen(false);
                        filterButton.current?.focus();
                      }}
                      className="min-h-11 rounded-full bg-gray-950 px-5 text-xs font-bold text-white dark:bg-white dark:text-gray-950"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div
              className="flex gap-2 overflow-x-auto pb-1"
              aria-label="Category filters"
            >
              {["All", ...tradeCategories].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-semibold ${category === c ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "border border-zinc-200 text-zinc-500 dark:border-white/15"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            {city && (
              <button
                type="button"
                onClick={() => setCity("")}
                aria-label="Clear location filter"
                className="inline-flex min-h-9 items-center gap-2 rounded-full bg-zinc-100 px-3 text-xs font-semibold dark:bg-white/10"
              >
                {city}
                <XMarkIcon className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">
              {tab === "Saved"
                ? "Your shortlist"
                : query || category !== "All" || city
                  ? "Search results"
                  : "Latest finds"}
            </h2>
            <span role="status" className="text-[11px] text-zinc-500">
              {mode === "loading"
                ? "Loading"
                : marketBusy
                  ? "Updating"
                  : `${visible.length} ${visible.length === 1 ? "item" : "items"}`}
            </span>
          </div>
          {mode === "loading" ? (
            <div
              aria-label="Loading listings"
              className="grid grid-cols-2 gap-3"
            >
              {[0, 1].map((id) => (
                <div
                  key={id}
                  className="aspect-square rounded-2xl bg-zinc-100 dark:bg-zinc-900"
                />
              ))}
            </div>
          ) : mode === "error" && !visible.length ? null : visible.length ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              {visible.map((listing) => (
                <article key={listing.id} className="min-w-0">
                  <div className="relative">
                    <button
                      onClick={() => go(tab, listing.id)}
                      aria-label={`View ${listing.title}`}
                      className="block w-full text-left"
                    >
                      <ItemArt item={listing} />
                    </button>
                    <div className="absolute right-2 top-2">
                      <SaveButton
                        item={listing}
                        saved={pocket.saved.includes(listing.id)}
                        disabled={busy || !ready || (!!owner && !loaded)}
                        onClick={() => void saveItem(listing.id)}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => go(tab, listing.id)}
                    className="mt-2 block w-full text-left"
                  >
                    <p className="text-sm font-bold">{tradePrice(listing)}</p>
                    <h3 className="mt-1 truncate text-xs font-medium">
                      {listing.title}
                    </h3>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {[
                        listing.size,
                        listing.condition,
                        (listing as PublishedListing).status === "sold"
                          ? "Sold"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" \u00b7 ")}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {listing.city}
                    </p>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="stream-card px-5 py-10 text-center">
              <BookmarkIcon className="mx-auto h-7 w-7 text-zinc-400" />
              <h3 className="mt-3 font-bold">
                {tab === "Saved"
                  ? "Nothing saved here yet"
                  : !query && category === "All" && !city
                    ? "Be the first to list"
                    : "No matching items"}
              </h3>
              <p className="mt-2 text-xs text-zinc-500">
                {tab === "Saved"
                  ? "Tap the bookmark on an item to keep it here."
                  : !query && category === "All" && !city
                    ? "Give something you once loved a new home."
                    : "Try another search, category or location."}
              </p>
              <button
                onClick={() => {
                  setQuery("");
                  setCategory("All");
                  setCity("");
                  go("Browse");
                }}
                className="mt-3 min-h-11 text-xs font-bold text-blue-600"
              >
                Browse all items
              </button>
            </div>
          )}
          {mode === "live" && nextPage && (
            <button
              disabled={marketBusy}
              onClick={() => void refreshMarket(true)}
              className="min-h-11 w-full text-xs font-bold"
            >
              {marketBusy ? "Loading..." : "Load more items"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold">{label}</span>
      {children}
    </label>
  );
}
function SaveButton({
  item,
  saved,
  disabled,
  onClick,
}: {
  item: TradeListing;
  saved: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`${saved ? "Unsave" : "Save"} ${item.title}`}
      aria-pressed={saved}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-sm disabled:opacity-50"
    >
      <BookmarkIcon className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
    </button>
  );
}
function ItemArt({
  item,
  large = false,
}: {
  item: TradeListing;
  large?: boolean;
}) {
  const palette: Record<string, string> = {
    Clothing: "#e9e4db",
    Shoes: "#e4e8e9",
    Bags: "#e9dfd0",
    Home: "#e5e9de",
  };
  if (item.photos.length)
    return (
      <div className="space-y-2">
        <TradeImage
          src={item.photos[0]}
          alt={item.title}
          className={`w-full rounded-[20px] object-cover ${large ? "aspect-[4/3]" : "aspect-[4/5]"}`}
        />
        {large && item.photos.length > 1 && (
          <div className="grid grid-cols-3 gap-2">
            {item.photos.slice(1).map((photo, index) => (
              <TradeImage
                key={photo}
                src={photo}
                alt={`${item.title}, photo ${index + 2}`}
                className="aspect-square w-full rounded-xl object-cover"
              />
            ))}
          </div>
        )}
      </div>
    );
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-[20px] ${large ? "aspect-[4/3]" : "aspect-[4/5]"}`}
      style={{ background: palette[item.category] }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 200 220"
        className="h-[82%] w-[82%] text-[#5d665b]"
      >
        <ellipse
          cx="100"
          cy="183"
          rx="54"
          ry="7"
          fill="currentColor"
          opacity=".08"
        />
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {item.category === "Clothing" ? (
            <>
              <path
                d="M72 48 44 64 28 104 55 114 64 94 61 174h78l-3-80 9 20 27-10-16-40-28-16-13 13H85Z"
                fill="#faf8f2"
              />
              <path d="m72 48 13 28 15-15 15 15 13-28M100 64v108M73 114h16M112 114h16" />
            </>
          ) : item.category === "Bags" ? (
            <>
              <path d="m54 84-9 90h110l-9-90Z" fill="#faf8f2" />
              <path d="M78 95V66c0-30 44-30 44 0v29M58 164h84" />
            </>
          ) : item.category === "Shoes" ? (
            <>
              <path
                d="m49 104 21 11 29-21 22 34 36 15c13 6 18 25-1 28H44c-8-12-9-38 5-67Z"
                fill="#faf8f2"
              />
              <path d="M42 155h118M91 117l20-6M98 128l22-6M105 138l22-5" />
            </>
          ) : (
            <>
              <path d="m75 59-32 65h114l-32-65Z" fill="#faf8f2" />
              <path d="M100 125v47M72 176h56M140 126v22" />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

function TradeImage({
  src,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [resolved, setResolved] = useState<string>();
  useEffect(() => {
    let current = true;
    setResolved(undefined);
    if (src)
      void tradePhotoSource(src)
        .then((value) => {
          if (current) setResolved(value);
        })
        .catch(() => {});
    return () => {
      current = false;
    };
  }, [src]);
  return <img {...props} src={resolved} />;
}
