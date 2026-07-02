"use client";

import { type ComponentProps, type ReactNode } from "react";

interface FieldProps extends ComponentProps<"input"> {
  label: string;
  hint?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
}

export function Field({ label, hint, icon, trailing, id, className = "", ...props }: FieldProps) {
  const inputId = id ?? props.name;
  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 flex items-center justify-between text-sm font-medium text-[var(--color-ink-soft)]"
      >
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-[var(--color-faint)]">{hint}</span>}
      </label>
      <div className="relative flex items-center">
        {icon && (
          <span className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2 items-center text-[var(--color-faint)]">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={`field ${icon ? "pl-11" : "pl-4"} ${trailing ? "pr-12" : "pr-4"} ${className}`}
          {...props}
        />
        {trailing && (
          <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">{trailing}</span>
        )}
      </div>
    </div>
  );
}
