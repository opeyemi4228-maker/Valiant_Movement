import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /api/payments/monnify/return?ref=...
 *
 * Where Monnify's hosted checkout sends the browser back after a deposit
 * attempt (success, failure, or the member just closing the tab). No money
 * moves here — it only routes the member back to the Finance tab with the
 * reference in the URL so the client can call `verifyDeposit` (a
 * server-verified status check; this redirect itself proves nothing).
 */
export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref");
  const url = new URL("/dashboard", request.url);
  url.searchParams.set("tab", "finance");
  if (ref) url.searchParams.set("financeRef", ref);
  return NextResponse.redirect(url);
}
