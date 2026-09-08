export type TradeTerms = {
  price: string;
  deliveryFee: string;
  currency: "NGN" | "USD" | "USDC";
  handover: "Pickup" | "Delivery";
  location: string;
  dispatchDays: number;
  inspectionHours: number;
  returns: string;
  carrier: string;
};
export type TradeOffer = {
  id: string;
  status:
    | "proposed"
    | "accepted"
    | "declined"
    | "withdrawn"
    | "cancelled"
    | "expired";
  terms: TradeTerms;
  snapshot: {
    title: string;
    condition: string;
    description: string;
    size: string;
  };
  listingRevision: number;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
};
export function tradeUnits(value: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value))
    throw Error("Use an amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function tradeTotal(terms: TradeTerms) {
  const amount = tradeUnits(terms.price) + tradeUnits(terms.deliveryFee);
  return (
    (amount / 100n).toString() +
    "." +
    (amount % 100n).toString().padStart(2, "0")
  );
}
export function validateTradeTerms(value: unknown): TradeTerms {
  const t = value as TradeTerms;
  if (
    !t ||
    typeof t !== "object" ||
    typeof t.price !== "string" ||
    typeof t.deliveryFee !== "string" ||
    tradeUnits(t.price) <= 0n
  )
    throw Error("Enter an item price greater than zero.");
  tradeUnits(t.deliveryFee);
  if (
    !["NGN", "USD", "USDC"].includes(t.currency) ||
    !["Pickup", "Delivery"].includes(t.handover)
  )
    throw Error("Choose a currency and handover method.");
  if (
    !Number.isInteger(t.dispatchDays) ||
    t.dispatchDays < 1 ||
    t.dispatchDays > 30 ||
    ![24, 48, 72].includes(t.inspectionHours)
  )
    throw Error("Choose a handover deadline and inspection period.");
  for (const [key, min, max] of [
    ["location", 2, 120],
    ["returns", 10, 1000],
    ["carrier", 0, 120],
  ] as const)
    if (
      typeof t[key] !== "string" ||
      t[key].trim().length < min ||
      t[key].length > max
    )
      throw Error("Complete the handover area and return terms.");
  if (t.handover === "Pickup" && tradeUnits(t.deliveryFee) !== 0n)
    throw Error("Pickup must have zero delivery cost.");
  if (t.handover === "Delivery" && !t.carrier.trim())
    throw Error("Name the proposed delivery provider.");
  return {
    price: t.price,
    deliveryFee: t.deliveryFee,
    currency: t.currency,
    handover: t.handover,
    location: t.location.trim(),
    dispatchDays: t.dispatchDays,
    inspectionHours: t.inspectionHours,
    returns: t.returns.trim(),
    carrier: t.handover === "Delivery" ? t.carrier.trim() : "",
  };
}
