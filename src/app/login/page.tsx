"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Mail, KeyRound, ChevronDown } from "lucide-react";
import { loginMember } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { Field } from "@/components/auth/Field";
import { PasswordField } from "@/components/auth/PasswordField";
import { ADMIN_ROLE_LIST } from "@/data/admin-roles";

const DEMO_ACCOUNTS: { label: string; scope: string; email: string; password: string }[] = [
  ...ADMIN_ROLE_LIST.map((r) => ({ label: r.title, scope: r.jurisdiction, email: r.email, password: r.password })),
  { label: "Member", scope: "Chidi Okafor", email: "member@valiantmovement.com", password: "Valiant2026" },
  { label: "Member", scope: "Amara Eze", email: "amara@valiantmovement.com", password: "Valiant2026" },
];

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  // Surface the result of clicking an email-verification link (?verify=...).
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("verify");
    if (status === "success") setVerifyNotice("Email verified — you can sign in now.");
    else if (status === "invalid")
      setError("That verification link is invalid or has expired.");
    else if (status === "error") setError("We couldn't verify your email. Please try again.");
  }, []);

  async function doLogin(email: string, password: string) {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await loginMember({ email, password });
      if (result.ok) {
        router.push(result.role === "superadmin" ? "/admin" : "/dashboard");
        router.refresh();
      } else {
        setError(result.error ?? "Incorrect email or password.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doLogin(form.email, form.password);
  }

  function signInAs(email: string, password: string) {
    setForm({ email, password });
    doLogin(email, password);
  }

  return (
    <AuthShell>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="mb-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-strong)]">
            Welcome back
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[var(--color-navy)] sm:text-[2.1rem]">
            Sign in to the movement
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Enter your details to continue where you left off.
          </p>
        </div>

        {verifyNotice && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-[var(--color-green)]/30 bg-[var(--color-green)]/[0.08] px-4 py-3 text-sm text-[var(--color-green)]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{verifyNotice}</span>
          </div>
        )}
        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/[0.06] px-4 py-3 text-sm text-[var(--color-danger)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field
            label="Email Address"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            icon={<Mail className="h-4 w-4" />}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <PasswordField
            name="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-ink-soft)]">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-line)] accent-[var(--color-brand)]"
              />
              Remember me
            </label>
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-[var(--color-brand)] hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group flex w-full items-center justify-center gap-2 rounded-xl gradient-navy py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--color-navy)]/20 transition hover:opacity-95 disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                Login
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-[var(--color-muted)]">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-[var(--color-navy)] hover:underline">
            Register now
          </Link>
        </p>

        {/* Demo access — mock logins until real accounts exist */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)]">
          <button
            type="button"
            onClick={() => setShowDemo((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-soft)]">
              <KeyRound className="h-4 w-4 text-[var(--color-brand-strong)]" /> Demo access · one-click sign in
            </span>
            <ChevronDown className={`h-4 w-4 text-[var(--color-faint)] transition ${showDemo ? "rotate-180" : ""}`} />
          </button>
          {showDemo && (
            <div className="space-y-1.5 border-t border-[var(--color-line)] p-2">
              {DEMO_ACCOUNTS.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  disabled={loading}
                  onClick={() => signInAs(d.email, d.password)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-[var(--color-line)] transition hover:ring-[var(--color-brand)] disabled:opacity-60"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-brand-tint)] text-xs font-bold text-[var(--color-brand-strong)]">
                    {d.label.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-sm font-semibold text-[var(--color-ink)]">{d.label}</span>
                    <span className="block truncate text-[11px] text-[var(--color-faint)]">{d.email} · {d.password}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-muted)]">{d.scope}</span>
                </button>
              ))}
              <p className="px-2 pt-1 text-[11px] text-[var(--color-faint)]">
                Mock accounts for review — each opens its own scoped dashboard.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </AuthShell>
  );
}
