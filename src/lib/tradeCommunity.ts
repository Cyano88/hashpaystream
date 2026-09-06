import { fetchWithTimeout } from "./fetchWithTimeout";
export type TradeThread = {
  id: string;
  listingId: string;
  title: string;
  role: "buyer" | "seller";
  listingStatus: string;
  updatedAt: number;
  blocked?: boolean;
  blockedByMe?: boolean;
};
export type TradeMessage = {
  id: string;
  body: string;
  mine: boolean;
  createdAt: number;
};
export type TradeReport = {
  id: string;
  listingId: string;
  title: string;
  reason: string;
  details: string;
  createdAt: number;
};
export async function communityRequest(
  path: string,
  token: string | null,
  payload?: unknown,
) {
  if (!token) throw new Error("Sign in again to use enquiries.");
  const response = await fetchWithTimeout(
    "/api/hashpaystream/v1/trade/" + path,
    {
      method: payload ? "POST" : "GET",
      cache: "no-store",
      headers: {
        authorization: "Bearer " + token,
        ...(payload ? { "content-type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok)
    throw new Error(body.error || "This action could not be completed.");
  return body;
}
