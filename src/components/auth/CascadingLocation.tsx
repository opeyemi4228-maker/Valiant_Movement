"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { type ReactNode } from "react";
import { STATE_NAMES, getLgas, getWards, getPollingUnits } from "@/data/nigeria";

export interface LocationValue {
  state: string;
  lga: string;
  ward: string;
  pollingUnit: string;
}

interface Props {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
}

const reveal = {
  initial: { opacity: 0, height: 0, marginTop: 0 },
  animate: { opacity: 1, height: "auto", marginTop: 16 },
  exit: { opacity: 0, height: 0, marginTop: 0 },
  transition: { duration: 0.3, ease: "easeOut" as const },
};

function Select({
  label,
  step,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  step: number;
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-[var(--color-ink-soft)]">
        <span
          className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold"
          style={{
            background: value ? "var(--color-brand)" : "var(--color-line)",
            color: value ? "#fff" : "var(--color-faint)",
          }}
        >
          {value ? <Check className="h-3 w-3" /> : step}
        </span>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2 items-center text-[var(--color-faint)]">
          <MapPin className="h-4 w-4" />
        </span>
        <select
          className="field pl-11 pr-10"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
      </div>
    </div>
  );
}

function Step({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div {...reveal} className="overflow-hidden">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function CascadingLocation({ value, onChange }: Props) {
  const lgas = value.state ? getLgas(value.state) : [];
  const wards = value.state && value.lga ? getWards(value.state, value.lga) : [];
  const units =
    value.state && value.lga && value.ward
      ? getPollingUnits(value.state, value.lga, value.ward)
      : [];

  return (
    <div>
      <Select
        label="State of Origin"
        step={1}
        value={value.state}
        options={STATE_NAMES}
        placeholder="Select your state"
        onChange={(state) =>
          onChange({ state, lga: "", ward: "", pollingUnit: "" })
        }
      />

      <Step show={!!value.state}>
        <Select
          label="Local Government Area"
          step={2}
          value={value.lga}
          options={lgas}
          placeholder="Select your LGA"
          onChange={(lga) => onChange({ ...value, lga, ward: "", pollingUnit: "" })}
        />
      </Step>

      <Step show={!!value.lga}>
        <Select
          label="Ward"
          step={3}
          value={value.ward}
          options={wards}
          placeholder="Select your ward"
          onChange={(ward) => onChange({ ...value, ward, pollingUnit: "" })}
        />
      </Step>

      <Step show={!!value.ward}>
        <Select
          label="Polling Unit"
          step={4}
          value={value.pollingUnit}
          options={units}
          placeholder="Select your polling unit"
          onChange={(pollingUnit) => onChange({ ...value, pollingUnit })}
        />
      </Step>
    </div>
  );
}
