"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Wallet,
  HeartHandshake,
  CalendarCheck,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Clock,
  XCircle,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Loader2,
  Banknote,
  Eye,
  EyeOff,
  AlertTriangle,
  RefreshCcw,
} from "lucide-react";
import { naira, campaigns } from "@/data/finance";
import { ensureDuesNotifications, getDuesStatus } from "@/app/actions/finance";
import {
  getWalletSummary,
  initializeDeposit,
  verifyDeposit,
  listWithdrawalBanks,
  resolveWithdrawalAccount,
  requestWithdrawal,
  type WalletSummary,
} from "@/app/actions/wallet";
import type { PaymentDTO } from "@/lib/wallet-db";
import { fmtNaira, type PaymentKind } from "@/lib/wallet-types";

const TYPE_META: Record<PaymentKind, { icon: typeof Wallet; color: string; label: string; sign: "in" | "out" }> = {
  deposit: { icon: ArrowDownLeft, color: "var(--color-green)", label: "Deposit", sign: "in" },
  withdrawal: { icon: ArrowUpRight, color: "var(--color-danger)", label: "Withdrawal", sign: "out" },
  dues: { icon: CalendarCheck, color: "var(--color-brand-strong)", label: "Membership dues", sign: "out" },
  adjustment: { icon: Banknote, color: "var(--color-amber)", label: "Adjustment", sign: "in" },
};

export function MemberFinance({ name, active = true }: { name: string; active?: boolean }) {
  const firstName = name.split(/\s+/)[0];
  const router = useRouter();
  const searchParams = useSearchParams();

  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [modal, setModal] = useState<"deposit" | "withdrawal" | null>(null);
  const [showBalance, setShowBalance] = useState(true);
  const [dues, setDues] = useState<{ due: string; amount: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3600);
  }, []);

  const refresh = useCallback(async () => {
    // Both calls already retry + never throw server-side; a `null` here
    // means every retry was exhausted, so keep whatever's on screen instead
    // of flashing a zeroed balance. Independent reads — run together.
    try {
      const [s, d] = await Promise.all([getWalletSummary(), getDuesStatus()]);
      if (s) setSummary(s);
      if (d) setDues({ due: d.due, amount: d.amount });
    } catch {
      /* transient — the next poll recovers */
    }
  }, []);

  // Initial load + a background poll (deposits/withdrawals settle async, via
  // webhook, so the balance can change without any action on this screen).
  useEffect(() => {
    // Paused while another tab is active — this component stays mounted
    // (so switching back is instant) but its background poll stands down;
    // reactivating re-fires immediately below so the balance is never stale.
    if (!active) return;
    const kick = setTimeout(() => {
      refresh();
      ensureDuesNotifications().catch(() => {});
    }, 0); // after paint — no sync setState in the effect body
    const t = setInterval(refresh, 1500); // tightened — matches the rest of the app's real-time feel
    return () => {
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [refresh, active]);

  // Returning from a Monnify checkout redirect: verify server-side (never
  // trust the URL itself) and clean the query string either way.
  useEffect(() => {
    const ref = searchParams.get("financeRef");
    if (!ref) return;
    verifyDeposit(ref).then((res) => {
      if (res.status === "paid") flash("✅ Deposit confirmed — your balance is updated.");
      else if (res.status === "pending") flash("⏳ Deposit received — confirming with the bank, this can take a minute.");
      else if (res.status === "failed") flash("Deposit didn't go through — no funds were taken.");
      refresh();
    });
    router.replace("/dashboard?tab=finance");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { deposited, withdrawn, duesThisMonth } = useMemo(() => {
    let deposited = 0, withdrawn = 0;
    let duesThisMonth = false;
    const now = new Date();
    for (const t of summary?.payments ?? []) {
      if (t.status !== "completed") continue;
      if (t.kind === "deposit") deposited += t.amount;
      else if (t.kind === "withdrawal") withdrawn += t.amount;
      else if (t.kind === "dues") {
        const d = new Date(t.createdAt);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) duesThisMonth = true;
      }
    }
    return { deposited, withdrawn, duesThisMonth };
  }, [summary]);

  const balance = summary?.balance ?? 0;
  const loaded = summary !== null;

  return (
    <div className="h-full overflow-y-auto">
      {toast && (
        <div className="fixed inset-x-0 top-4 z-[75] flex justify-center px-4">
          <div className="max-w-md rounded-2xl bg-[var(--color-navy)] px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}

      <div className="w-full px-4 py-5 lg:px-8">
        {/* ============================== Wallet ============================== */}
        <div className="relative overflow-hidden rounded-3xl gradient-brand p-6 text-white shadow-sm">
          <div className="absolute -right-8 -top-10 size-44 rounded-full bg-white/10" />
          <div className="absolute -bottom-14 right-20 size-36 rounded-full bg-white/10" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                <Wallet className="h-4 w-4" /> Valiant Wallet
              </div>
              {loaded && !summary!.monnifyConfigured && (
                <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white/90 ring-1 ring-white/25">
                  <AlertTriangle className="h-3 w-3" /> Payments not connected
                </span>
              )}
            </div>

            <div className="mt-4 flex items-end gap-3">
              <div className="text-4xl font-extrabold tracking-tight tabular-nums">
                {!loaded ? "···" : showBalance ? naira(balance) : "₦ • • • • •"}
              </div>
              <button
                onClick={() => setShowBalance((v) => !v)}
                className="mb-1 grid size-7 place-items-center rounded-full text-white/80 transition hover:bg-white/15"
                aria-label={showBalance ? "Hide balance" : "Show balance"}
              >
                {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-sm text-white/85">
              Available balance · {firstName}, every naira here funds real ward organising 🦅
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => setModal("deposit")}
                disabled={!loaded}
                className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[var(--color-brand-strong)] shadow-sm transition hover:bg-white/90 disabled:opacity-50"
              >
                <ArrowDownLeft className="h-4 w-4" /> Deposit
              </button>
              <button
                onClick={() => setModal("withdrawal")}
                disabled={!loaded}
                className="flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-bold text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
              >
                <ArrowUpRight className="h-4 w-4" /> Withdraw
              </button>
            </div>
          </div>
        </div>

        {/* ============================== Stats ============================== */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<ArrowDownLeft className="h-5 w-5" />} value={naira(deposited, true)} label="Deposited" good />
          <Stat icon={<ArrowUpRight className="h-5 w-5" />} value={naira(withdrawn, true)} label="Withdrawn" />
          <Stat icon={<HeartHandshake className="h-5 w-5" />} value={naira(0, true)} label="Given" />
          <Stat
            icon={duesThisMonth ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            value={duesThisMonth ? "Paid" : "Due"}
            label={`Dues — ${new Date().toLocaleDateString("en-GB", { month: "short" })}`}
            good={duesThisMonth}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* ----------------------- Dues card ----------------------- */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
                <CalendarCheck className="h-5 w-5" />
              </span>
              <h3 className="font-bold text-[var(--color-navy)]">Membership dues</h3>
            </div>
            <div
              className={`mt-4 flex items-center justify-between rounded-xl px-3 py-2.5 ${
                duesThisMonth ? "bg-[var(--color-green)]/8" : "bg-[var(--color-amber)]/10"
              }`}
            >
              <span
                className={`flex items-center gap-2 text-sm font-semibold ${
                  duesThisMonth ? "text-[var(--color-green)]" : "text-[var(--color-amber)]"
                }`}
              >
                {duesThisMonth ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                {duesThisMonth ? "This month · paid" : "This month · pending"}
              </span>
              <span className="text-sm font-bold text-[var(--color-ink)]">{fmtNaira(dues?.amount ?? 5_000)}</span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-[var(--color-muted)]">
              <div className="flex justify-between">
                <span>Next due</span>
                <span className="font-semibold text-[var(--color-ink-soft)]">
                  {dues ? new Date(dues.due).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Plan</span>
                <span className="font-semibold text-[var(--color-ink-soft)]">{fmtNaira(dues?.amount ?? 5_000)} / month</span>
              </div>
            </div>
            <p className="mt-4 text-xs text-[var(--color-faint)]">
              Deducted automatically from your wallet on the due date — keep it funded and you&apos;re covered.
            </p>
          </div>

          {/* ------------------ Campaigns to support ----------------- */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
                  <HeartHandshake className="h-5 w-5" />
                </span>
                <h3 className="font-bold text-[var(--color-navy)]">Causes you can back</h3>
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-faint)]">
                  Preview
                </span>
              </div>
              <span className="text-xs font-semibold text-[var(--color-faint)]">{campaigns.filter((c) => c.status === "active").length} active</span>
            </div>
            <div className="space-y-4">
              {campaigns
                .filter((c) => c.status === "active")
                .map((c) => {
                  const pct = Math.min(100, Math.round((c.raised / c.goal) * 100));
                  return (
                    <div key={c.id} className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-[var(--color-ink)]">{c.name}</span>
                          <span className="shrink-0 text-xs font-bold text-[var(--color-brand-strong)]">{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--color-line)]">
                          <div className="h-full rounded-full gradient-brand" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--color-faint)]">
                          {naira(c.raised, true)} raised · {c.donors.toLocaleString()} donors
                        </div>
                      </div>
                      <button
                        disabled
                        title="Campaign giving is coming soon"
                        className="shrink-0 cursor-not-allowed rounded-full bg-[var(--color-navy)]/40 px-4 py-2 text-xs font-bold text-white"
                      >
                        Give
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* ============================ Transactions ============================ */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
            <h3 className="font-bold text-[var(--color-navy)]">Recent transactions</h3>
            <button onClick={refresh} className="flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-strong)]">
              <RefreshCcw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          <div className="divide-y divide-[var(--color-line-soft)]">
            {!loaded ? (
              <div className="grid place-items-center py-14 text-sm text-[var(--color-faint)]">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : summary!.payments.length === 0 ? (
              <div className="grid place-items-center px-6 py-14 text-center">
                <ArrowRight className="mb-2 h-6 w-6 text-[var(--color-faint)]" />
                <p className="text-sm text-[var(--color-muted)]">No transactions yet — your first deposit will show up here.</p>
              </div>
            ) : (
              summary!.payments.map((t) => <TxRow key={t.id} t={t} />)
            )}
          </div>
        </div>

        {/* ---------------------------- Transparency --------------------------- */}
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--color-brand)]/25 bg-[var(--color-brand-tint)] p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[var(--color-brand-strong)]">
            <Landmark className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-bold text-[var(--color-ink)]">
              <ShieldCheck className="h-4 w-4 text-[var(--color-green)]" /> Full transparency
            </div>
            <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
              Every deposit, withdrawal and dues payment is recorded in your ledger, permanently and auditably.
            </p>
          </div>
        </div>
      </div>

      {modal === "deposit" && (
        <DepositModal
          onClose={() => setModal(null)}
          configured={summary?.monnifyConfigured ?? false}
          onStarted={(msg) => flash(msg)}
        />
      )}
      {modal === "withdrawal" && (
        <WithdrawalModal
          balance={balance}
          configured={summary?.withdrawalsConfigured ?? false}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            flash(msg);
            setModal(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------- Tx row -------------------------------- */

function TxRow({ t }: { t: PaymentDTO }) {
  const meta = TYPE_META[t.kind];
  const Icon = meta.icon;
  const isIn = meta.sign === "in";
  const label =
    t.kind === "withdrawal" && t.destinationAccountName
      ? `Withdrawal to ${t.destinationAccountName}`
      : t.description ?? meta.label;
  const date = new Date(t.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="flex items-center gap-3 p-4 transition hover:bg-[var(--color-surface-2)]">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{label}</div>
        <div className="truncate text-xs text-[var(--color-faint)]">{date}</div>
      </div>
      {t.status === "pending" && (
        <span className="hidden items-center gap-1 rounded-full bg-[var(--color-amber)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-amber)] sm:flex">
          <Clock className="h-3 w-3" /> Pending
        </span>
      )}
      {(t.status === "failed" || t.status === "reversed") && (
        <span className="hidden items-center gap-1 rounded-full bg-[var(--color-danger)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-danger)] sm:flex">
          <XCircle className="h-3 w-3" /> {t.status === "reversed" ? "Refunded" : "Failed"}
        </span>
      )}
      <span
        className={`shrink-0 text-sm font-bold tabular-nums ${
          t.status !== "completed" ? "text-[var(--color-faint)]" : isIn ? "text-[var(--color-green)]" : "text-[var(--color-ink)]"
        }`}
      >
        {isIn ? "+" : "−"} {naira(t.amount)}
      </span>
    </div>
  );
}

/* ------------------------------ Deposit modal ------------------------------ */

const QUICK = [5_000, 10_000, 25_000, 50_000];

function DepositModal({
  onClose,
  configured,
  onStarted,
}: {
  onClose: () => void;
  configured: boolean;
  onStarted: (msg: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(raw.replace(/\D/g, "")) || 0;
  const canSubmit = amount >= 100 && !submitting && configured;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const res = await initializeDeposit(amount);
    if (res.ok && res.checkoutUrl) {
      onStarted("Redirecting you to complete the deposit securely…");
      window.location.href = res.checkoutUrl; // full-page redirect to Monnify's hosted checkout
      return;
    }
    setSubmitting(false);
    setError(res.error ?? "Couldn't start the deposit — please try again.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <div className="animate-rise relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-green)]/12 text-[var(--color-green)]">
              <ArrowDownLeft className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-[var(--color-navy)]">Deposit to wallet</h3>
              <p className="text-[11px] text-[var(--color-faint)]">Top up your Valiant Wallet via Monnify</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="grid size-8 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {!configured && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-[var(--color-amber)]/10 p-3 text-[13px] text-[var(--color-ink-soft)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-amber)]" />
              Payments aren&apos;t connected yet. An admin needs to add Monnify API keys before deposits can be made.
            </div>
          )}
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">Amount</label>
          <div className="mt-1.5 flex items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 focus-within:border-[var(--color-brand)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--color-brand)]/12">
            <span className="text-2xl font-extrabold text-[var(--color-faint)]">₦</span>
            <input
              autoFocus
              inputMode="numeric"
              value={amount ? amount.toLocaleString() : ""}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="0"
              className="w-full bg-transparent py-3.5 pl-2 text-2xl font-extrabold tabular-nums text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)]"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => setRaw(String(q))}
                className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]"
              >
                {naira(q, true)}
              </button>
            ))}
          </div>

          {error && <p className="mt-3 text-xs font-medium text-[var(--color-danger)]">{error}</p>}

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl gradient-brand py-3.5 text-sm font-bold text-white shadow-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting…</>
            ) : (
              <><Banknote className="h-4 w-4" /> Deposit {amount ? naira(amount) : ""}</>
            )}
          </button>
          <p className="mt-2.5 flex items-center justify-center gap-1 text-[11px] text-[var(--color-faint)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-green)]" /> Secured by Monnify · card, bank transfer or USSD
          </p>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Withdrawal modal ----------------------------- */

function WithdrawalModal({
  balance,
  configured,
  onClose,
  onDone,
}: {
  balance: number;
  configured: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [raw, setRaw] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      if (!configured) {
        setBanksLoading(false);
        return;
      }
      listWithdrawalBanks().then((b) => {
        setBanks(b);
        setBanksLoading(false);
      });
    }, 0); // after paint — no sync setState in the effect body
    return () => clearTimeout(id);
  }, [configured]);

  const amount = Number(raw.replace(/\D/g, "")) || 0;
  const overBalance = amount > balance;

  // Resolve the account name once both bank + a full 10-digit number are set.
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      setAccountName(null);
      setResolveError(null);
      if (!bankCode || accountNumber.length !== 10) return;
      setResolving(true);
      resolveWithdrawalAccount(accountNumber, bankCode).then((res) => {
        if (!alive) return;
        setResolving(false);
        if (res.ok) setAccountName(res.accountName ?? null);
        else setResolveError(res.error ?? "Couldn't verify that account.");
      });
    }, 0); // after paint — no sync setState in the effect body
    return () => { alive = false; clearTimeout(id); };
  }, [bankCode, accountNumber]);

  const canSubmit = configured && amount >= 500 && !overBalance && !!accountName && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const res = await requestWithdrawal(amount, bankCode, accountNumber);
    setSubmitting(false);
    if (res.ok) onDone(`Withdrawal to ${accountName} is on its way.`);
    else setError(res.error ?? "Couldn't process the withdrawal — please try again.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <div className="animate-rise relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
              <ArrowUpRight className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-[var(--color-navy)]">Withdraw funds</h3>
              <p className="text-[11px] text-[var(--color-faint)]">Available · {naira(balance)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="grid size-8 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {!configured && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-[var(--color-amber)]/10 p-3 text-[13px] text-[var(--color-ink-soft)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-amber)]" />
              Withdrawals aren&apos;t connected yet. An admin needs to finish the payout setup with Monnify.
            </div>
          )}

          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">Amount</label>
          <div className="mt-1.5 flex items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 focus-within:border-[var(--color-brand)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--color-brand)]/12">
            <span className="text-2xl font-extrabold text-[var(--color-faint)]">₦</span>
            <input
              autoFocus
              inputMode="numeric"
              value={amount ? amount.toLocaleString() : ""}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="0"
              disabled={!configured}
              className="w-full bg-transparent py-3.5 pl-2 text-2xl font-extrabold tabular-nums text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)] disabled:opacity-50"
            />
          </div>
          {overBalance && <p className="mt-1.5 text-xs font-medium text-[var(--color-danger)]">Amount exceeds your available balance.</p>}

          <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">Bank</label>
          <select
            value={bankCode}
            onChange={(e) => setBankCode(e.target.value)}
            disabled={!configured || banksLoading}
            className="mt-1.5 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--color-brand)] focus:bg-white disabled:opacity-50"
          >
            <option value="">{banksLoading ? "Loading banks…" : "Select your bank…"}</option>
            {banks.map((b) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">Account number</label>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            placeholder="0123456789"
            disabled={!configured}
            className="mt-1.5 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-3 text-sm tracking-wider outline-none transition focus:border-[var(--color-brand)] focus:bg-white disabled:opacity-50"
          />
          <div className="mt-2 min-h-[20px] text-xs">
            {resolving && <span className="flex items-center gap-1.5 text-[var(--color-muted)]"><Loader2 className="h-3 w-3 animate-spin" /> Verifying account…</span>}
            {!resolving && accountName && <span className="flex items-center gap-1.5 font-semibold text-[var(--color-green)]"><CheckCircle2 className="h-3.5 w-3.5" /> {accountName}</span>}
            {!resolving && resolveError && <span className="text-[var(--color-danger)]">{resolveError}</span>}
          </div>

          {error && <p className="mt-3 text-xs font-medium text-[var(--color-danger)]">{error}</p>}

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl gradient-brand py-3.5 text-sm font-bold text-white shadow-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <><Banknote className="h-4 w-4" /> Withdraw {amount ? naira(amount) : ""}</>}
          </button>
          <p className="mt-2.5 flex items-center justify-center gap-1 text-[11px] text-[var(--color-faint)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-green)]" /> Sent instantly via Monnify once confirmed
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Stat -------------------------------- */

function Stat({
  icon,
  value,
  label,
  good,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-4">
      <span
        className={`grid size-9 place-items-center rounded-xl ${
          good ? "bg-[var(--color-green)]/12 text-[var(--color-green)]" : "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"
        }`}
      >
        {icon}
      </span>
      <div className="mt-3 text-xl font-extrabold text-[var(--color-navy)]">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-faint)]">{label}</div>
    </div>
  );
}
