"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Fingerprint,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  ShieldQuestion,
  User,
} from "lucide-react";
import { registerMember } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { Field } from "@/components/auth/Field";
import { PasswordField } from "@/components/auth/PasswordField";
import {
  CascadingLocation,
  type LocationValue,
} from "@/components/auth/CascadingLocation";

interface FormState {
  nin: string;
  fullName: string;
  email: string;
  phone: string;
  location: LocationValue;
  password: string;
  confirm: string;
}

const STEPS = [
  { id: 1, title: "Identity", subtitle: "Who you are" },
  { id: 2, title: "Origin", subtitle: "Where you're from" },
  { id: 3, title: "Security", subtitle: "Secure your account" },
];

const variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -40 : 40 }),
};

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    nin: "",
    fullName: "",
    email: "",
    phone: "",
    location: { state: "", lga: "", ward: "", pollingUnit: "" },
    password: "",
    confirm: "",
  });

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const stepValid = useMemo(() => {
    if (step === 0) {
      return (
        form.fullName.trim().length > 2 &&
        /^\S+@\S+\.\S+$/.test(form.email) &&
        form.phone.replace(/\D/g, "").length >= 10
      );
    }
    if (step === 1) {
      const l = form.location;
      return !!(l.state && l.lga && l.ward && l.pollingUnit);
    }
    if (step === 2) {
      return form.password.length >= 8 && form.password === form.confirm;
    }
    return false;
  }, [step, form]);

  async function next() {
    setError(null);
    if (step < STEPS.length - 1) {
      setDir(1);
      setStep((s) => s + 1);
      return;
    }
    // Final step → create the account + trigger email verification.
    setLoading(true);
    try {
      const result = await registerMember({
        nin: form.nin,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        state: form.location.state,
        lga: form.location.lga,
        ward: form.location.ward,
        pollingUnit: form.location.pollingUnit,
        password: form.password,
      });
      if (result.ok) {
        setSubmitted(true);
      } else {
        setError(result.error ?? "Something went wrong. Please try again.");
        if (result.fieldErrors?.email) {
          setDir(-1);
          setStep(0); // send them back to fix the email
        }
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function back() {
    setDir(-1);
    setStep((s) => Math.max(0, s - 1));
  }

  if (submitted) {
    return (
      <AuthShell>
        <SuccessScreen name={form.fullName} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-strong)]">
            Create your account
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[var(--color-navy)] sm:text-[2.1rem]">
            Join Valiant Movement
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Verified membership for every Nigerian — from your ward to the nation.
          </p>
        </div>

        {/* Stepper */}
        <Stepper current={step} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (stepValid && !loading) next();
          }}
          className="mt-7"
        >
          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/[0.06] px-4 py-3 text-sm text-[var(--color-danger)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={step}
                custom={dir}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {step === 0 && <IdentityStep form={form} update={update} />}
                {step === 1 && (
                  <CascadingLocation
                    value={form.location}
                    onChange={(location) => update({ location })}
                  />
                )}
                {step === 2 && <SecurityStep form={form} update={update} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Nav */}
          <div className="mt-8 flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-5 py-3.5 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
            <button
              type="submit"
              disabled={!stepValid || loading}
              className="group flex flex-1 items-center justify-center gap-2 rounded-xl gradient-navy py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--color-navy)]/20 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  {step === STEPS.length - 1 ? "Create account" : "Continue"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>
        </form>

        <p className="mt-7 text-center text-sm text-[var(--color-muted)]">
          Already a member?{" "}
          <Link href="/login" className="font-semibold text-[var(--color-navy)] hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </AuthShell>
  );
}

/* ----------------------------- Stepper ----------------------------- */

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2.5">
              <div
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors"
                style={{
                  background:
                    done || active ? "var(--color-navy)" : "var(--color-line)",
                  color: done || active ? "#fff" : "var(--color-faint)",
                }}
              >
                {done ? <Check className="h-4 w-4" /> : s.id}
              </div>
              <div className="hidden sm:block">
                <p
                  className="text-sm font-semibold leading-none"
                  style={{ color: active ? "var(--color-navy)" : "var(--color-muted)" }}
                >
                  {s.title}
                </p>
                <p className="mt-1 text-xs text-[var(--color-faint)]">{s.subtitle}</p>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className="mx-3 h-0.5 flex-1 rounded-full bg-[var(--color-line)]">
                <div
                  className="h-full rounded-full bg-[var(--color-navy)] transition-all duration-500"
                  style={{ width: done ? "100%" : "0%" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------- Step 1: Identity --------------------------- */

function IdentityStep({
  form,
  update,
}: {
  form: FormState;
  update: (p: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-5">
      {/* NIN — verification not yet wired */}
      <div className="rounded-2xl border border-dashed border-[var(--color-brand)]/40 bg-[var(--color-brand)]/[0.04] p-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-semibold text-[var(--color-navy)]">
            <Fingerprint className="h-4 w-4 text-[var(--color-brand)]" />
            National Identity Number (NIN)
          </label>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-amber)]/15 px-2.5 py-1 text-[11px] font-semibold text-[#a96a00]">
            <ShieldQuestion className="h-3 w-3" />
            Coming soon
          </span>
        </div>
        <input
          inputMode="numeric"
          maxLength={11}
          disabled
          placeholder="Enter your 11-digit NIN"
          className="field px-4 tracking-[0.3em]"
          value={form.nin}
          onChange={(e) => update({ nin: e.target.value.replace(/\D/g, "") })}
        />
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--color-muted)]">
          <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
          Once live, your NIN is checked against the NIMC database and your verified
          details are synced automatically to your profile. The NIMC API is being
          provisioned — for now, fill the fields below manually.
        </p>
      </div>

      <Field
        label="Full Name"
        name="fullName"
        required
        placeholder="As it appears on your NIN"
        icon={<User className="h-4 w-4" />}
        value={form.fullName}
        onChange={(e) => update({ fullName: e.target.value })}
      />
      <Field
        label="Email Address"
        name="email"
        type="email"
        required
        placeholder="you@example.com"
        hint="We'll send a verification link"
        icon={<Mail className="h-4 w-4" />}
        value={form.email}
        onChange={(e) => update({ email: e.target.value })}
      />
      <Field
        label="Phone Number"
        name="phone"
        type="tel"
        required
        placeholder="0800 000 0000"
        icon={<Phone className="h-4 w-4" />}
        value={form.phone}
        onChange={(e) => update({ phone: e.target.value })}
      />
    </div>
  );
}

/* --------------------------- Step 3: Security --------------------------- */

function SecurityStep({
  form,
  update,
}: {
  form: FormState;
  update: (p: Partial<FormState>) => void;
}) {
  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl bg-[var(--color-surface-2)] p-4">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand)]" />
        <p className="text-xs leading-relaxed text-[var(--color-muted)]">
          <span className="font-semibold text-[var(--color-ink-soft)]">
            {form.location.state}
          </span>{" "}
          · {form.location.lga} · {form.location.ward.split("—")[0].trim()}
        </p>
      </div>

      <PasswordField
        name="password"
        required
        showStrength
        placeholder="Create a strong password"
        hint="Min. 8 characters"
        value={form.password}
        onChange={(e) => update({ password: e.target.value })}
      />
      <PasswordField
        label="Confirm Password"
        name="confirm"
        required
        placeholder="Re-enter your password"
        value={form.confirm}
        onChange={(e) => update({ confirm: e.target.value })}
      />
      {mismatch && (
        <p className="text-xs font-medium text-[var(--color-danger)]">
          Passwords don&apos;t match yet.
        </p>
      )}
      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-[var(--color-muted)]">
        <input
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 rounded border-[var(--color-line)] accent-[var(--color-brand)]"
        />
        I agree to the{" "}
        <Link href="/terms" className="font-semibold text-[var(--color-navy)] underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-semibold text-[var(--color-navy)] underline">
          Privacy Policy
        </Link>
        .
      </label>
    </div>
  );
}

/* --------------------------- Success screen --------------------------- */

function SuccessScreen({ name }: { name: string }) {
  const router = useRouter();
  const firstName = (name || "Valiant").split(/\s+/)[0];

  // The member is already signed in — take them into the movement.
  useEffect(() => {
    const t = setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 14 }}
        className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[var(--color-green)]/12"
      >
        <ShieldCheck className="h-9 w-9 text-[var(--color-green)]" />
      </motion.div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-[var(--color-navy)]">
        Welcome, {firstName}! 🦅
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--color-muted)]">
        Your membership is active and you&apos;re signed in. Taking you into the
        movement now…
      </p>

      <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
          You can now
        </p>
        <ul className="mt-3 space-y-2.5 text-sm text-[var(--color-ink-soft)]">
          {[
            "Post on the national feed and your ward community",
            "Message and call other verified members",
            "Fund your wallet and back movement causes",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-green)]" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2 rounded-xl gradient-navy py-3.5 text-sm font-semibold text-white transition hover:opacity-95"
        >
          Enter the movement
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </motion.div>
  );
}
