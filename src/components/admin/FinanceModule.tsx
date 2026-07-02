"use client";

import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  TrendingUp,
  TrendingDown,
  Download,
  Search,
  Filter,
  CheckCircle2,
  Banknote,
  Target,
  PieChart,
  Plus,
} from "lucide-react";
import { useState } from "react";
import {
  naira,
  cashflow,
  treasury,
  transactions,
  campaigns,
  budgets,
  payouts,
  statements,
  chapterFunds,
  type Transaction,
} from "@/data/finance";

const TABS = ["Overview", "Income", "Expenses", "Budgets", "Payouts", "Statements"] as const;
type Tab = (typeof TABS)[number];

export function FinanceModule({
  view,
  onViewChange,
}: {
  view: string;
  onViewChange: (v: string) => void;
}) {
  const activeTab: Tab = (TABS as readonly string[]).includes(view) ? (view as Tab) : "Overview";

  return (
    <div>
      {/* Tabs synced with the sidebar */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--color-line)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => onViewChange(t)}
            className={`relative shrink-0 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === t ? "text-[var(--color-brand-strong)]" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {t}
            {activeTab === t && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[var(--color-brand)]" />
            )}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          highlight
          icon={<Wallet className="h-5 w-5" />}
          label="Treasury balance"
          value={naira(treasury.balance, true)}
          change={treasury.balanceChange}
        />
        <Kpi
          icon={<ArrowDownLeft className="h-5 w-5" />}
          label="Income (June)"
          value={naira(treasury.monthIncome, true)}
          change={treasury.incomeChange}
        />
        <Kpi
          icon={<ArrowUpRight className="h-5 w-5" />}
          label="Expenses (June)"
          value={naira(treasury.monthExpense, true)}
          change={treasury.expenseChange}
          invert
        />
        <Kpi
          icon={<Clock className="h-5 w-5" />}
          label="Pending payouts"
          value={naira(treasury.pendingPayouts, true)}
          sub="3 awaiting approval"
        />
      </div>

      <div className="mt-5">
        {activeTab === "Overview" && <Overview onNavigate={onViewChange} />}
        {activeTab === "Income" && <Income />}
        {activeTab === "Expenses" && <Expenses />}
        {activeTab === "Budgets" && <Budgets />}
        {activeTab === "Payouts" && <Payouts />}
        {activeTab === "Statements" && <Statements />}
      </div>
    </div>
  );
}

/* -------------------------------- Overview ------------------------------- */

function Overview({ onNavigate }: { onNavigate: (v: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <CashflowChart />
        <ChapterFunds />
      </div>
      <RecentTransactions
        title="Recent transactions"
        rows={transactions.slice(0, 6)}
        onViewAll={() => onNavigate("Income")}
      />
    </div>
  );
}

function CashflowChart() {
  const max = Math.max(...cashflow.map((m) => Math.max(m.income, m.expense)));
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-[var(--color-navy)]">Cashflow</h3>
          <p className="text-xs text-[var(--color-muted)]">Income vs expenses · last 12 months</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-[var(--color-ink-soft)]">
            <span className="size-2.5 rounded-full bg-[var(--color-brand)]" /> Income
          </span>
          <span className="flex items-center gap-1.5 text-[var(--color-ink-soft)]">
            <span className="size-2.5 rounded-full bg-[var(--color-line)]" /> Expense
          </span>
        </div>
      </div>
      <div className="flex h-52 items-end gap-2">
        {cashflow.map((m) => (
          <div key={m.month} className="group flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              <div
                className="w-1/2 rounded-t bg-[var(--color-brand)] transition-all duration-300 group-hover:opacity-100"
                style={{ height: `${(m.income / max) * 100}%` }}
                title={`Income ${naira(m.income, true)}`}
              />
              <div
                className="w-1/2 rounded-t bg-[var(--color-line)] transition-all duration-300"
                style={{ height: `${(m.expense / max) * 100}%` }}
                title={`Expense ${naira(m.expense, true)}`}
              />
            </div>
            <span className="text-[10px] font-medium text-[var(--color-faint)]">{m.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChapterFunds() {
  const total = chapterFunds.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <PieChart className="h-4 w-4 text-[var(--color-brand-strong)]" />
        <h3 className="font-bold text-[var(--color-navy)]">Funds by chapter</h3>
      </div>
      {/* Stacked bar */}
      <div className="mb-4 flex h-3 overflow-hidden rounded-full">
        {chapterFunds.map((c) => (
          <div key={c.chapter} style={{ width: `${(c.amount / total) * 100}%`, backgroundColor: c.color }} />
        ))}
      </div>
      <div className="space-y-2.5">
        {chapterFunds.map((c) => (
          <div key={c.chapter} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
            <span className="flex-1 text-[var(--color-ink-soft)]">{c.chapter}</span>
            <span className="font-semibold text-[var(--color-ink)]">{naira(c.amount, true)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- Income -------------------------------- */

function Income() {
  const income = transactions.filter((t) => t.type === "income");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <RecentTransactions title="Income" rows={income} />
      </div>
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-[var(--color-navy)]">Campaigns</h3>
          <button className="flex items-center gap-1 rounded-lg bg-[var(--color-brand-tint)] px-2.5 py-1 text-xs font-bold text-[var(--color-brand-strong)]">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
        <div className="space-y-4">
          {campaigns.map((c) => {
            const pct = Math.min(100, Math.round((c.raised / c.goal) * 100));
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-[var(--color-ink)]">{c.name}</span>
                  <span className="shrink-0 text-xs font-bold text-[var(--color-brand-strong)]">{pct}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--color-line)]">
                  <div
                    className={`h-full rounded-full ${c.status === "completed" ? "bg-[var(--color-green)]" : "gradient-brand"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-[var(--color-faint)]">
                  <span>{naira(c.raised, true)} of {naira(c.goal, true)}</span>
                  <span>{c.donors.toLocaleString()} donors</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Expenses ------------------------------- */

function Expenses() {
  const expense = transactions.filter((t) => t.type === "expense");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <RecentTransactions title="Expenses" rows={expense} />
      </div>
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
        <h3 className="mb-4 font-bold text-[var(--color-navy)]">Spend by category</h3>
        <div className="space-y-3.5">
          {budgets.map((b) => {
            const pct = Math.round((b.spent / b.allocated) * 100);
            const over = pct > 95;
            return (
              <div key={b.category}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate text-[var(--color-ink-soft)]">{b.category}</span>
                  <span className={`shrink-0 font-semibold ${over ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}`}>
                    {naira(b.spent, true)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--color-line)]">
                  <div
                    className={`h-full rounded-full ${over ? "bg-[var(--color-danger)]" : "bg-[var(--color-brand)]"}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Budgets -------------------------------- */

function Budgets() {
  const totalAlloc = budgets.reduce((s, b) => s + b.allocated, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] p-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-[var(--color-brand-strong)]" />
          <h3 className="font-bold text-[var(--color-navy)]">Budget utilization</h3>
        </div>
        <span className="text-sm text-[var(--color-muted)]">
          <strong className="text-[var(--color-ink)]">{naira(totalSpent, true)}</strong> of {naira(totalAlloc, true)} used
        </span>
      </div>
      <div className="divide-y divide-[var(--color-line-soft)]">
        {budgets.map((b) => {
          const pct = Math.round((b.spent / b.allocated) * 100);
          const remaining = b.allocated - b.spent;
          const over = pct > 95;
          return (
            <div key={b.category} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[var(--color-ink)]">{b.category}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${over ? "bg-[var(--color-danger)]/12 text-[var(--color-danger)]" : "bg-[var(--color-green)]/12 text-[var(--color-green)]"}`}>
                  {pct}% used
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--color-line)]">
                <div
                  className={`h-full rounded-full ${over ? "bg-[var(--color-danger)]" : "gradient-brand"}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-[var(--color-muted)]">
                <span>Allocated {naira(b.allocated)}</span>
                <span className={remaining < 0 ? "text-[var(--color-danger)]" : ""}>
                  {remaining < 0 ? "Over by " : "Remaining "}{naira(Math.abs(remaining))}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- Payouts -------------------------------- */

function Payouts() {
  const [rows, setRows] = useState(payouts);
  const styles: Record<string, string> = {
    scheduled: "bg-[#0ea5e9]/12 text-[#0ea5e9]",
    pending: "bg-[var(--color-amber)]/15 text-[var(--color-amber)]",
    paid: "bg-[var(--color-green)]/12 text-[var(--color-green)]",
  };

  function approve(id: string) {
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, status: "paid" } : p)));
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-[var(--color-brand-strong)]" />
          <h3 className="font-bold text-[var(--color-navy)]">Payouts</h3>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg gradient-brand px-3 py-1.5 text-xs font-bold text-white">
          <Plus className="h-3.5 w-3.5" /> New payout
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
              <th className="px-4 py-3 font-semibold">Payee</th>
              <th className="px-4 py-3 font-semibold">Chapter</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-[var(--color-line-soft)] transition hover:bg-[var(--color-surface-2)]">
                <td className="px-4 py-3">
                  <div className="font-semibold text-[var(--color-ink)]">{p.payee}</div>
                  <div className="text-xs text-[var(--color-faint)]">{p.purpose} · {p.date}</div>
                </td>
                <td className="px-4 py-3 text-[var(--color-ink-soft)]">{p.chapter}</td>
                <td className="px-4 py-3 font-bold text-[var(--color-ink)]">{naira(p.amount)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${styles[p.status]}`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {p.status === "paid" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-green)]">
                      <CheckCircle2 className="h-4 w-4" /> Done
                    </span>
                  ) : (
                    <button
                      onClick={() => approve(p.id)}
                      className="rounded-lg bg-[var(--color-navy)] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
                    >
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- Statements ------------------------------ */

function Statements() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
        <h3 className="font-bold text-[var(--color-navy)]">Monthly statements</h3>
        <button className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
          <Download className="h-3.5 w-3.5" /> Export all
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
              <th className="px-4 py-3 font-semibold">Period</th>
              <th className="px-4 py-3 font-semibold">Opening</th>
              <th className="px-4 py-3 font-semibold">Inflow</th>
              <th className="px-4 py-3 font-semibold">Outflow</th>
              <th className="px-4 py-3 font-semibold">Closing</th>
              <th className="px-4 py-3 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {statements.map((s) => (
              <tr key={s.period} className="border-b border-[var(--color-line-soft)] transition hover:bg-[var(--color-surface-2)]">
                <td className="px-4 py-3 font-semibold text-[var(--color-ink)]">{s.period}</td>
                <td className="px-4 py-3 text-[var(--color-ink-soft)]">{naira(s.opening, true)}</td>
                <td className="px-4 py-3 font-medium text-[var(--color-green)]">+{naira(s.inflow, true)}</td>
                <td className="px-4 py-3 font-medium text-[var(--color-danger)]">−{naira(s.outflow, true)}</td>
                <td className="px-4 py-3 font-bold text-[var(--color-ink)]">{naira(s.closing, true)}</td>
                <td className="px-4 py-3 text-right">
                  <button className="grid size-8 place-items-center rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]">
                    <Download className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- Shared bits ----------------------------- */

function Kpi({
  icon,
  label,
  value,
  change,
  sub,
  highlight,
  invert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  change?: number;
  sub?: string;
  highlight?: boolean;
  invert?: boolean;
}) {
  // For expenses, a rise is "bad" (invert the colour semantics).
  const up = (change ?? 0) >= 0;
  const positive = invert ? !up : up;
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-transparent gradient-brand text-white" : "border-[var(--color-line)] bg-white"}`}>
      <div className="flex items-center justify-between">
        <span className={`grid size-9 place-items-center rounded-xl ${highlight ? "bg-white/20 text-white" : "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"}`}>
          {icon}
        </span>
        {change !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-bold ${highlight ? "text-white/90" : positive ? "text-[var(--color-green)]" : "text-[var(--color-danger)]"}`}>
            {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <div className={`mt-3 text-2xl font-extrabold ${highlight ? "text-white" : "text-[var(--color-navy)]"}`}>{value}</div>
      <div className={`text-sm font-semibold ${highlight ? "text-white/90" : "text-[var(--color-ink-soft)]"}`}>{label}</div>
      {sub && <div className={`mt-0.5 text-[11px] ${highlight ? "text-white/70" : "text-[var(--color-faint)]"}`}>{sub}</div>}
    </div>
  );
}

function RecentTransactions({
  title,
  rows,
  onViewAll,
}: {
  title: string;
  rows: Transaction[];
  onViewAll?: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((t) =>
    `${t.party} ${t.category} ${t.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  const statusStyles: Record<string, string> = {
    completed: "bg-[var(--color-green)]/12 text-[var(--color-green)]",
    pending: "bg-[var(--color-amber)]/15 text-[var(--color-amber)]",
    failed: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] p-4">
        <h3 className="font-bold text-[var(--color-navy)]">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-9 w-44 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--color-brand)] focus:bg-white focus:ring-4 focus:ring-[var(--color-brand)]/12"
            />
          </div>
          {onViewAll ? (
            <button onClick={onViewAll} className="flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-strong)]">
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button className="grid size-9 place-items-center rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]">
              <Filter className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-[var(--color-line-soft)]">
        {filtered.map((t) => {
          const isIncome = t.type === "income";
          return (
            <div key={t.id} className="flex items-center gap-3 p-3.5 transition hover:bg-[var(--color-surface-2)]">
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${isIncome ? "bg-[var(--color-green)]/12 text-[var(--color-green)]" : "bg-[var(--color-danger)]/12 text-[var(--color-danger)]"}`}>
                {isIncome ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{t.party}</div>
                <div className="truncate text-xs text-[var(--color-faint)]">{t.category} · {t.method} · {t.date}</div>
              </div>
              <span className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize sm:inline ${statusStyles[t.status]}`}>
                {t.status}
              </span>
              <span className={`shrink-0 text-sm font-bold ${isIncome ? "text-[var(--color-green)]" : "text-[var(--color-ink)]"}`}>
                {isIncome ? "+" : "−"}{naira(t.amount)}
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-[var(--color-muted)]">No transactions match.</div>
        )}
      </div>
    </div>
  );
}
