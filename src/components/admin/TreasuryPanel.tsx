"use client";

import { useEffect, useRef, useState } from "react";
import { Landmark, Copy, ArrowDownLeft, ArrowUpRight, Loader2, ShieldCheck } from "lucide-react";
import { getTreasury, provisionTreasuryAccount, type TreasuryResult } from "@/app/actions/admin";
import { fmtNaira } from "@/lib/wallet-types";

const LEVEL_LABEL: Record<string, string> = {
  national: "National treasury",
  state: "State treasury",
  lga: "LGA treasury",
  ward: "Ward treasury",
};

/** The coordinator's own treasury — real balance from the 50/20/20/10 dues
 *  split, its dedicated account number, and a live statement. */
export function TreasuryPanel() {
  const [data, setData] = useState<TreasuryResult | null>(null);

  useEffect(() => {
    let alive = true;
    const pull = () => getTreasury().then((r) => alive && setData(r));
    pull();
    const t = setInterval(pull, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Provision the treasury's dedicated account ONCE (hits Monnify), then refresh.
  const provisionedRef = useRef(false);
  useEffect(() => {
    if (provisionedRef.current) return;
    provisionedRef.current = true;
    provisionTreasuryAccount()
      .then((ok) => { if (ok) getTreasury().then((r) => setData(r)); })
      .catch(() => {});
  }, []);

  if (!data) {
    return <div className="mb-5 h-40 animate-pulse rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)]" />;
  }
  if (!data.ok || !data.treasury) {
    return (
      <div className="mb-5 rounded-2xl border border-dashed border-[var(--color-line)] bg-white p-6 text-sm text-[var(--color-muted)]">
        Couldn&apos;t load your treasury right now — it will reappear on the next refresh.
      </div>
    );
  }

  const t = data.treasury;
  const acct = t.reservedAccounts[0];
  const copy = () => acct && navigator.clipboard?.writeText(acct.accountNumber).catch(() => {});

  return (
    <div className="mb-5 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      {/* Balance + dedicated account */}
      <div className="overflow-hidden rounded-2xl gradient-brand p-5 text-white shadow-sm">
        <div className="flex items-center gap-2 text-[13px] font-semibold opacity-90">
          <Landmark className="h-4 w-4" /> {LEVEL_LABEL[t.level] ?? "Treasury"} · {t.name}
        </div>
        <div className="mt-2 text-3xl font-extrabold tracking-tight">{fmtNaira(t.balance)}</div>
        <div className="mt-0.5 text-[12px] opacity-80">Funded by the 50/20/20/10 dues split{data.jurisdiction ? ` · ${data.jurisdiction}` : ""}</div>

        <div className="mt-4 rounded-xl bg-white/15 p-3 backdrop-blur">
          {acct ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{acct.bankName} · fund by transfer</div>
                <div className="text-lg font-extrabold tracking-wide">{acct.accountNumber}</div>
              </div>
              <button
                onClick={copy}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/20 px-3 py-2 text-xs font-bold transition hover:bg-white/30 active:scale-95"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[12px] opacity-90">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Dedicated account is being set up…
            </div>
          )}
        </div>
      </div>

      {/* Statement */}
      <div className="rounded-2xl border border-[var(--color-line)] bg-white">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <h3 className="text-sm font-bold text-[var(--color-navy)]">Treasury statement</h3>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-green)]">
            <ShieldCheck className="h-3.5 w-3.5" /> Auditable
          </span>
        </div>
        <div className="max-h-64 divide-y divide-[var(--color-line-soft)] overflow-y-auto">
          {data.ledger && data.ledger.length > 0 ? (
            data.ledger.map((r) => {
              const isIn = r.direction === "in";
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${isIn ? "bg-[var(--color-green)]/12 text-[var(--color-green)]" : "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"}`}>
                    {isIn ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[var(--color-ink)]">
                      {r.description ?? (isIn ? "Inflow" : "Withdrawal")}
                      {r.accountName ? ` → ${r.accountName}` : ""}
                    </div>
                    <div className="truncate text-[11px] text-[var(--color-faint)]">
                      {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      {r.authorizedBy ? ` · authorized by ${r.authorizedBy}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 text-sm font-bold tabular-nums ${isIn ? "text-[var(--color-green)]" : "text-[var(--color-ink)]"}`}>
                    {isIn ? "+" : "−"}{fmtNaira(r.amount)}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--color-muted)]">
              No movements yet. Dues shares will land here as members pay.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
