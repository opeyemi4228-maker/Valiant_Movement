import type { paymentKind, paymentStatus } from "@/db/schema";

/** Shared wallet/payment shapes — safe to import from client or server. */
export type PaymentKind = (typeof paymentKind.enumValues)[number];
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];

/** Format an amount as Naira, e.g. 5000 → "₦5,000". Pure — usable anywhere. */
export function fmtNaira(n: number): string {
  return "₦" + n.toLocaleString("en-NG");
}
