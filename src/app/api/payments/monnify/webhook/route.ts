import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/monnify";
import { finalizeDeposit, finalizeWithdrawalOutcome, markDepositFailed } from "@/lib/wallet-db";
import { notifyFinanceEvent } from "@/app/actions/finance";

/**
 * POST /api/payments/monnify/webhook
 *
 * Monnify's server-to-server callback for both collections (deposits) and
 * disbursements (withdrawals). This is the ONLY place a deposit is ever
 * credited from in production — `verifyDeposit` (called when the member
 * returns from checkout) is just a faster-feeling fallback that calls the
 * exact same idempotent `finalizeDeposit`, so whichever arrives first wins
 * and the other is a safe no-op.
 *
 * Payload shapes below match Monnify's documented webhook format as of this
 * writing. Before the first real sandbox transaction, confirm the exact
 * field names against a captured payload in the Monnify dashboard (Settings
 * → Webhooks lets you replay/inspect deliveries) — provider webhook shapes
 * are the part most likely to have shifted since.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("monnify-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("[monnify webhook] signature mismatch — rejecting");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: { eventType?: string; eventData?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventType = (payload.eventType ?? "").toUpperCase();
  const data = payload.eventData ?? {};

  try {
    if (eventType === "SUCCESSFUL_TRANSACTION") {
      const reference = String(data.paymentReference ?? "");
      const providerReference = String(data.transactionReference ?? reference);
      const paymentStatus = String(data.paymentStatus ?? "").toUpperCase();
      if (reference && (paymentStatus === "PAID" || paymentStatus === "OVERPAID")) {
        const res = await finalizeDeposit(reference, providerReference);
        if (res.ok && !res.alreadyFinalized && res.userId && res.amount) {
          await notifyFinanceEvent("deposit", res.amount, "Monnify");
        }
      } else if (reference) {
        await markDepositFailed(reference, paymentStatus.toLowerCase() || "failed");
      }
    } else if (eventType.includes("DISBURSEMENT")) {
      const reference = String(data.reference ?? "");
      const status = String(data.status ?? "").toUpperCase();
      if (reference) {
        const outcome = status === "SUCCESS" ? "success" : "failed";
        const res = await finalizeWithdrawalOutcome(reference, outcome, status.toLowerCase());
        if (res.ok && !res.alreadyFinalized && outcome === "success" && res.amount) {
          await notifyFinanceEvent("withdrawal", res.amount);
        }
      }
    }
  } catch (err) {
    // Log and still return 200 — Monnify retries on non-2xx, and a failure
    // here means our own bug, not a payload worth re-delivering endlessly.
    console.error("[monnify webhook] handling failed:", err);
  }

  return NextResponse.json({ ok: true });
}
