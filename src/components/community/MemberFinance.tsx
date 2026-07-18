"use client";

import { useEffect, useMemo, useState } from "react";
import { ensureDuesNotifications, notifyFinanceEvent } from "@/app/actions/finance";
import {
  Wallet,
  HeartHandshake,
  CalendarCheck,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Clock,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Building2,
  Smartphone,
  X,
  Loader2,
  Banknote,
  Eye,
  EyeOff,
} from "lucide-react";
import { naira, campaigns } from "@/data/finance";

/* ----------------------------- member ledger ----------------------------- */

type TxType = "deposit" | "withdrawal" | "dues" | "donation" | "pledge";

interface Tx {
  id: string;
  label: string;
  detail: string;
  date: string;
  amount: number;
  type: TxType;
  status: "completed" | "pending";
  direction: "in" | "out";
}

const SEED_TX: Tx[] = [
  { id: "t1", label: "Withdrawal to GTBank", detail: "GTBank ••••1234", date: "18 Jun 2026", amount: 7_500, type: "withdrawal", status: "completed", direction: "out" },
  { id: "t2", label: "Wallet top-up", detail: "Bank transfer", date: "15 Jun 2026", amount: 50_000, type: "deposit", status: "completed", direction: "in" },
  { id: "t3", label: "Monthly dues", detail: "June 2026 · Card", date: "28 Jun 2026", amount: 5_000, type: "dues", status: "completed", direction: "out" },
  { id: "t4", label: "2026 Mobilization Drive", detail: "One-time donation", date: "20 Jun 2026", amount: 25_000, type: "donation", status: "completed", direction: "out" },
  { id: "t5", label: "Ward Town Halls Fund", detail: "Pledge · 3 of 6 paid", date: "12 Jun 2026", amount: 10_000, type: "pledge", status: "pending", direction: "out" },
  { id: "t6", label: "Youth Bootcamp", detail: "One-time donation", date: "30 Apr 2026", amount: 15_000, type: "donation", status: "completed", direction: "out" },
];

const TYPE_META: Record<TxType, { icon: typeof Wallet; color: string }> = {
  deposit: { icon: ArrowDownLeft, color: "var(--color-green)" },
  withdrawal: { icon: ArrowUpRight, color: "var(--color-danger)" },
  dues: { icon: CalendarCheck, color: "var(--color-brand-strong)" },
  donation: { icon: HeartHandshake, color: "#7c3aed" },
  pledge: { icon: Clock, color: "var(--color-amber)" },
};

const START_BALANCE = 42_500;

function today() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function MemberFinance({ name }: { name: string }) {
  const firstName = name.split(/\s+/)[0];
  const [balance, setBalance] = useState(START_BALANCE);
  const [txs, setTxs] = useState<Tx[]>(SEED_TX);
  const [modal, setModal] = useState<"deposit" | "withdrawal" | null>(null);
  const [showBalance, setShowBalance] = useState(true);

  const { deposited, withdrawn, given } = useMemo(() => {
    let deposited = 0, withdrawn = 0, given = 0;
    for (const t of txs) {
      if (t.type === "deposit") deposited += t.amount;
      else if (t.type === "withdrawal") withdrawn += t.amount;
      else if (t.status === "completed") given += t.amount;
    }
    return { deposited, withdrawn, given };
  }, [txs]);

  // Run the monthly-dues clock (reminders 5→1 days out, then deduction or an
  // insufficient-funds notice). Deduped server-side to one alert per day.
  useEffect(() => {
    ensureDuesNotifications(balance).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirm(mode: "deposit" | "withdrawal", amount: number, detail: string) {
    notifyFinanceEvent(mode, amount, detail).catch(() => {}); // bell confirmation
    setBalance((b) => b + (mode === "deposit" ? amount : -amount));
    setTxs((prev) => [
      {
        id: "tx-" + Date.now(),
        label: mode === "deposit" ? "Wallet top-up" : "Withdrawal",
        detail,
        date: today(),
        amount,
        type: mode,
        status: "completed",
        direction: mode === "deposit" ? "in" : "out",
      },
      ...prev,
    ]);
  }

  return (
    <div className="h-full overflow-y-auto">
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
              <span className="rounded-full bg-white/15 px-3 py-1 font-mono text-[11px] tracking-widest text-white/90 ring-1 ring-white/25">
                •••• 4817
              </span>
            </div>

            <div className="mt-4 flex items-end gap-3">
              <div className="text-4xl font-extrabold tracking-tight tabular-nums">
                {showBalance ? naira(balance) : "₦ • • • • •"}
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
              Available balance · {firstName}, you&apos;ve given {naira(given, true)} to the movement 🦅
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => setModal("deposit")}
                className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[var(--color-brand-strong)] shadow-sm transition hover:bg-white/90"
              >
                <ArrowDownLeft className="h-4 w-4" /> Deposit
              </button>
              <button
                onClick={() => setModal("withdrawal")}
                className="flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-bold text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/25"
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
          <Stat icon={<HeartHandshake className="h-5 w-5" />} value={naira(given, true)} label="Given" />
          <Stat icon={<CheckCircle2 className="h-5 w-5" />} value="Paid" label="Dues — June" good />
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
            <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--color-green)]/8 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-green)]">
                <CheckCircle2 className="h-4 w-4" /> June paid
              </span>
              <span className="text-sm font-bold text-[var(--color-ink)]">{naira(5_000)}</span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-[var(--color-muted)]">
              <div className="flex justify-between">
                <span>Next due</span>
                <span className="font-semibold text-[var(--color-ink-soft)]">28 Jul 2026</span>
              </div>
              <div className="flex justify-between">
                <span>Plan</span>
                <span className="font-semibold text-[var(--color-ink-soft)]">₦5,000 / month</span>
              </div>
            </div>
            <button className="mt-4 w-full rounded-xl border border-[var(--color-line)] py-2.5 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
              Manage auto-pay
            </button>
          </div>

          {/* ------------------ Campaigns to support ----------------- */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
                  <HeartHandshake className="h-5 w-5" />
                </span>
                <h3 className="font-bold text-[var(--color-navy)]">Causes you can back</h3>
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
                      <button className="shrink-0 rounded-full bg-[var(--color-navy)] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90">
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
            <button className="flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-strong)]">
              Statement <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="divide-y divide-[var(--color-line-soft)]">
            {txs.map((t) => {
              const meta = TYPE_META[t.type];
              const Icon = meta.icon;
              const isIn = t.direction === "in";
              return (
                <div key={t.id} className="flex items-center gap-3 p-4 transition hover:bg-[var(--color-surface-2)]">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{t.label}</div>
                    <div className="truncate text-xs text-[var(--color-faint)]">{t.detail} · {t.date}</div>
                  </div>
                  {t.status === "pending" && (
                    <span className="hidden rounded-full bg-[var(--color-amber)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-amber)] sm:inline">
                      Pending
                    </span>
                  )}
                  <span className={`shrink-0 text-sm font-bold tabular-nums ${isIn ? "text-[var(--color-green)]" : "text-[var(--color-ink)]"}`}>
                    {isIn ? "+" : "−"} {naira(t.amount)}
                  </span>
                </div>
              );
            })}
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
              Every deposit, withdrawal and contribution is recorded and auditable.
            </p>
          </div>
          <button className="rounded-full bg-[var(--color-navy)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90">
            View ledger
          </button>
        </div>
      </div>

      {modal && (
        <WalletModal
          mode={modal}
          balance={balance}
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

/* ============================= Wallet modal ============================= */

const QUICK = [5_000, 10_000, 25_000, 50_000];

const METHODS = [
  { id: "card", label: "Debit card", sub: "Visa •••• 4242", icon: CreditCard },
  { id: "transfer", label: "Bank transfer", sub: "Virtual account", icon: Building2 },
  { id: "ussd", label: "USSD", sub: "*737# & others", icon: Smartphone },
];

const BANKS = [
  { id: "gt", label: "GTBank", sub: "••••1234", icon: Building2 },
  { id: "access", label: "Access Bank", sub: "••••8890", icon: Building2 },
];

function WalletModal({
  mode,
  balance,
  onClose,
  onConfirm,
}: {
  mode: "deposit" | "withdrawal";
  balance: number;
  onClose: () => void;
  onConfirm: (mode: "deposit" | "withdrawal", amount: number, detail: string) => void;
}) {
  const isDeposit = mode === "deposit";
  const options = isDeposit ? METHODS : BANKS;
  const [raw, setRaw] = useState("");
  const [choice, setChoice] = useState(options[0].id);
  const [phase, setPhase] = useState<"form" | "processing" | "done">("form");

  const amount = Number(raw.replace(/\D/g, "")) || 0;
  const overBalance = !isDeposit && amount > balance;
  const canSubmit = amount >= 100 && !overBalance && phase === "form";
  const chosen = options.find((o) => o.id === choice)!;

  function submit() {
    if (!canSubmit) return;
    setPhase("processing");
    setTimeout(() => {
      onConfirm(mode, amount, isDeposit ? chosen.label : `${chosen.label} ${chosen.sub}`);
      setPhase("done");
    }, 850);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={phase === "processing" ? undefined : onClose} />

      <div className="animate-rise relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
          <div className="flex items-center gap-2.5">
            <span
              className={`grid size-9 place-items-center rounded-xl ${
                isDeposit ? "bg-[var(--color-green)]/12 text-[var(--color-green)]" : "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"
              }`}
            >
              {isDeposit ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </span>
            <div>
              <h3 className="font-bold text-[var(--color-navy)]">{isDeposit ? "Deposit to wallet" : "Withdraw funds"}</h3>
              <p className="text-[11px] text-[var(--color-faint)]">
                {isDeposit ? "Top up your Valiant Wallet" : `Available · ${naira(balance)}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={phase === "processing"}
            className="grid size-8 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === "done" ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--color-green)]/12 text-[var(--color-green)]">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h4 className="mt-4 text-xl font-extrabold text-[var(--color-navy)]">
              {isDeposit ? "Deposit successful" : "Withdrawal queued"}
            </h4>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {naira(amount)} {isDeposit ? "added to your wallet" : `sent to ${chosen.label} ${chosen.sub}`}.
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-xl gradient-brand py-3 text-sm font-bold text-white transition hover:opacity-95"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-5">
            {/* Amount */}
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
            {overBalance && (
              <p className="mt-1.5 text-xs font-medium text-[var(--color-danger)]">
                Amount exceeds your available balance.
              </p>
            )}

            {/* Quick amounts */}
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => setRaw(String(q))}
                  disabled={!isDeposit && q > balance}
                  className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {naira(q, true)}
                </button>
              ))}
            </div>

            {/* Method / destination */}
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
              {isDeposit ? "Pay with" : "Withdraw to"}
            </label>
            <div className="mt-1.5 space-y-2">
              {options.map((o) => {
                const Icon = o.icon;
                const active = choice === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => setChoice(o.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)]"
                        : "border-[var(--color-line)] hover:bg-[var(--color-surface-2)]"
                    }`}
                  >
                    <span className="grid size-9 place-items-center rounded-lg bg-white text-[var(--color-brand-strong)] ring-1 ring-[var(--color-line)]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[var(--color-ink)]">{o.label}</div>
                      <div className="text-xs text-[var(--color-faint)]">{o.sub}</div>
                    </div>
                    <span className={`grid size-5 place-items-center rounded-full border ${active ? "border-[var(--color-brand)] bg-[var(--color-brand)]" : "border-[var(--color-line)]"}`}>
                      {active && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Confirm */}
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl gradient-brand py-3.5 text-sm font-bold text-white shadow-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {phase === "processing" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              ) : (
                <><Banknote className="h-4 w-4" /> {isDeposit ? "Deposit" : "Withdraw"} {amount ? naira(amount) : ""}</>
              )}
            </button>
            <p className="mt-2.5 flex items-center justify-center gap-1 text-[11px] text-[var(--color-faint)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-green)]" /> Secured & encrypted · Valiant Movement
            </p>
          </div>
        )}
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
