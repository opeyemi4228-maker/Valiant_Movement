import type { paymentKind, paymentStatus } from "@/db/schema";

/** Shared wallet/payment shapes — safe to import from client or server. */
export type PaymentKind = (typeof paymentKind.enumValues)[number];
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];
