/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

export function BrandLogo({
  className = "",
  imgClass = "h-9",
}: {
  className?: string;
  imgClass?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="Valiant Movement home"
      className={`inline-flex bg-white p-1.5 shadow-md ring-1 ring-black/5 ${className}`}
    >
      <img
        src="/valiant-logo.png"
        alt="Valiant Movement — Courage to Lead"
        className={`${imgClass} w-auto`}
      />
    </Link>
  );
}
