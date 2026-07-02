"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Field } from "./Field";

type Props = Omit<ComponentProps<"input">, "type"> & {
  label?: string;
  hint?: string;
  showStrength?: boolean;
};

function scorePassword(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const STRENGTH = [
  { label: "Too weak", color: "var(--color-danger)" },
  { label: "Weak", color: "var(--color-amber)" },
  { label: "Fair", color: "var(--color-amber)" },
  { label: "Good", color: "var(--color-green)" },
  { label: "Strong", color: "var(--color-accent)" },
];

export function PasswordField({
  label = "Password",
  hint,
  showStrength = false,
  value,
  ...props
}: Props) {
  const [visible, setVisible] = useState(false);
  const pw = typeof value === "string" ? value : "";
  const score = useMemo(() => scorePassword(pw), [pw]);

  return (
    <div>
      <Field
        label={label}
        hint={hint}
        type={visible ? "text" : "password"}
        icon={<Lock className="h-4 w-4" />}
        value={value}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
        {...props}
      />
      {showStrength && pw.length > 0 && (
        <div className="mt-2">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full transition-all duration-300"
                style={{
                  background: i < score ? STRENGTH[score].color : "var(--color-line)",
                }}
              />
            ))}
          </div>
          <p
            className="mt-1 text-xs font-medium"
            style={{ color: STRENGTH[score].color }}
          >
            {STRENGTH[score].label}
          </p>
        </div>
      )}
    </div>
  );
}
