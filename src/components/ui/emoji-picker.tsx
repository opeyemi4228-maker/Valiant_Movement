"use client";

import { cn } from "@/lib/utils";

/** A compact, dependency-free emoji set covering the common reactions plus a
 *  few movement-flavoured ones (🦅 🇳🇬). Shared across the feed and chat. */
export const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😎","🤔","😅","😉","🙂","🙃","😇","🥹","🥳",
  "😢","😭","😡","😴","🤯","🤗","🤩","😏","😜","🫡","🙏","👍","👎","👏","🙌","💪",
  "🤝","👋","✌️","🤞","🔥","✨","💯","✅","❌","⚡","⭐","🏆","🎯","💡","💬","📢",
  "❤️","🧡","💛","💚","💙","💜","🖤","🦅","🌍","🇳🇬","🗳️","⏰","📌","📎","📷","📄",
];

/**
 * Emoji picker popover. Render inside a `relative` parent; it positions itself
 * (default: above, left-aligned) and closes on outside click.
 */
export function EmojiPicker({
  onPick,
  onClose,
  className,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        className={cn(
          "absolute bottom-full left-0 z-20 mb-2 grid max-h-52 w-[288px] grid-cols-8 gap-0.5 overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-white p-2 shadow-xl",
          className,
        )}
      >
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="grid size-8 place-items-center rounded-lg text-xl leading-none transition hover:bg-[var(--color-surface-2)]"
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}
