import { Capacitor } from "@capacitor/core";
import { fetchWithTimeout } from "./fetchWithTimeout";
import type { TradeListing } from "./tradePreview";
export type PublishedListing = TradeListing & {
  status: "active" | "sold" | "removed";
  revision: number;
};
const API = "/api/hashpaystream/v1/trade/listings";
// Public results only. Never retain tokens, drafts, mine, or conversations here.
type PublicPage = {
  ok?: boolean;
  enabled?: boolean;
  listings?: PublishedListing[];
  next?: string | null;
};
const publicPages = new Map<string, { page: PublicPage; at: number }>();
const pendingPages = new Map<string, Promise<PublicPage>>();
let publicGeneration = 0;
export function cachedTradePage(query = "") {
  const entry = publicPages.get(query);
  return entry && Date.now() - entry.at < 5 * 60_000 ? entry.page : undefined;
}
export function publicTradePage(
  query = "",
  force = false,
): Promise<PublicPage> {
  const entry = publicPages.get(query);
  if (!force && entry && Date.now() - entry.at < 30_000)
    return Promise.resolve(entry.page);
  const pending = pendingPages.get(query);
  if (pending) return pending;
  const generation = publicGeneration;
  const request = tradeRequest(query)
    .then((page) => {
      if (generation === publicGeneration) {
        if (publicPages.size >= 20)
          publicPages.delete(publicPages.keys().next().value!);
        publicPages.set(query, { page, at: Date.now() });
      }
      return page;
    })
    .finally(() => {
      if (pendingPages.get(query) === request) pendingPages.delete(query);
    });
  pendingPages.set(query, request);
  return request;
}

export async function tradeRequest(
  query = "",
  token?: string | null,
  payload?: unknown,
) {
  if (payload && !token) throw new Error("Sign in again to manage listings.");
  const response = await fetchWithTimeout(API + query, {
    method: payload ? "POST" : "GET",
    cache: "no-store",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    enabled?: boolean;
    listings?: PublishedListing[];
    listing?: PublishedListing;
    next?: string | null;
    error?: string;
  };
  if (!response.ok || !body.ok)
    throw new Error(body.error || "Trade could not be loaded. Try again.");
  if (payload) {
    publicGeneration++;
    publicPages.clear();
    pendingPages.clear();
  }
  return body;
}

export async function tradePhotoSource(url: string) {
  if (
    !Capacitor.isNativePlatform() ||
    !url.startsWith("/api/hashpaystream/v1/trade/photos/")
  )
    return url;
  const response = await fetchWithTimeout(
    url + (url.includes("?") ? "&" : "?") + "format=json",
    { cache: "no-store" },
  );
  const body = await response.json();
  if (
    !response.ok ||
    !body.ok ||
    typeof body.photo !== "string" ||
    !body.photo.startsWith("data:image/jpeg;base64,")
  )
    throw new Error("Listing photo could not be loaded.");
  return body.photo as string;
}
