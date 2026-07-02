/* eslint-disable @next/next/no-img-element */
import type { Person } from "@/data/community";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** Initials/photo avatar used across the feed, communities and chat. */
export function Avatar({
  person,
  name,
  color,
  photo,
  size = 40,
  ring = false,
  online,
}: {
  person?: Person;
  name?: string;
  color?: string;
  photo?: string;
  size?: number;
  ring?: boolean;
  online?: boolean;
}) {
  const label = person?.name ?? name ?? "?";
  const bg = person?.color ?? color ?? "#7a7068";
  const img = person?.photo ?? photo;

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {img ? (
        <img
          src={img}
          alt={label}
          className={`size-full rounded-full object-cover ${ring ? "ring-2 ring-white" : ""}`}
        />
      ) : (
        <span
          className={`grid size-full place-items-center rounded-full font-bold text-white ${ring ? "ring-2 ring-white" : ""}`}
          style={{ backgroundColor: bg, fontSize: size * 0.38 }}
        >
          {initials(label)}
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full ring-2 ring-white ${online ? "bg-[var(--color-green)]" : "bg-[var(--color-faint)]"}`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </span>
  );
}

export { initials };
