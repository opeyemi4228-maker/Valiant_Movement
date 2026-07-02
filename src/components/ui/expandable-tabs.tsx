"use client";

/**
 * ExpandableTabs — a row of icon buttons where the active tab expands to reveal
 * its label. Adapted for the Valiant Movement design system.
 *
 * Changes from the upstream shadcn snippet (all backward-compatible):
 *  - `bg-muted`/`hover:bg-muted` → `bg-secondary`/`hover:bg-secondary`, because
 *    this project's `--color-muted` is a *foreground* gray; `secondary` is the
 *    brand-tint surface used for active states elsewhere in the app.
 *  - Optional controlled `selected` prop so it can act as a persistent nav
 *    (the active tab stays expanded instead of collapsing on outside click).
 *  - Optional `badge` on a tab for unread counts.
 */

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOnClickOutside } from "usehooks-ts";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface Tab {
  title: string;
  icon: LucideIcon;
  badge?: number;
  type?: never;
}

interface Separator {
  type: "separator";
  title?: never;
  icon?: never;
}

type TabItem = Tab | Separator;

interface ExpandableTabsProps {
  tabs: TabItem[];
  className?: string;
  activeColor?: string;
  /** Controlled active index. When provided, the component no longer clears the
   *  selection on outside click — ideal for using it as a navigation bar. */
  selected?: number | null;
  onChange?: (index: number | null) => void;
}

const buttonVariants = {
  initial: {
    gap: 0,
    paddingLeft: ".5rem",
    paddingRight: ".5rem",
  },
  animate: (isSelected: boolean) => ({
    gap: isSelected ? ".5rem" : 0,
    paddingLeft: isSelected ? "1rem" : ".5rem",
    paddingRight: isSelected ? "1rem" : ".5rem",
  }),
};

const spanVariants = {
  initial: { width: 0, opacity: 0 },
  animate: { width: "auto", opacity: 1 },
  exit: { width: 0, opacity: 0 },
};

const transition = {
  delay: 0.1,
  type: "spring",
  bounce: 0,
  duration: 0.6,
} as const;

export function ExpandableTabs({
  tabs,
  className,
  activeColor = "text-primary",
  selected: controlledSelected,
  onChange,
}: ExpandableTabsProps) {
  const isControlled = controlledSelected !== undefined;
  const [internalSelected, setInternalSelected] = React.useState<number | null>(
    null
  );
  const selected = isControlled ? controlledSelected : internalSelected;
  const outsideClickRef = React.useRef<HTMLDivElement>(null);

  useOnClickOutside(outsideClickRef as React.RefObject<HTMLElement>, () => {
    // A controlled nav keeps its active tab; an uncontrolled toolbar collapses.
    if (isControlled) return;
    setInternalSelected(null);
    onChange?.(null);
  });

  const handleSelect = (index: number) => {
    if (!isControlled) setInternalSelected(index);
    onChange?.(index);
  };

  const Separator = () => (
    <div className="mx-1 h-[24px] w-[1.2px] bg-border" aria-hidden="true" />
  );

  return (
    <div
      ref={outsideClickRef}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-2xl border bg-background p-1 shadow-sm",
        className
      )}
    >
      {tabs.map((tab, index) => {
        if (tab.type === "separator") {
          return <Separator key={`separator-${index}`} />;
        }

        const Icon = tab.icon;
        return (
          <motion.button
            key={tab.title}
            variants={buttonVariants}
            initial={false}
            animate="animate"
            custom={selected === index}
            onClick={() => handleSelect(index)}
            transition={transition}
            aria-pressed={selected === index}
            aria-label={tab.title}
            className={cn(
              "relative flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-300",
              selected === index
                ? cn("bg-secondary", activeColor)
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <span className="relative">
              <Icon size={20} />
              {tab.badge ? (
                <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[9px] font-bold leading-none text-white">
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              ) : null}
            </span>
            <AnimatePresence initial={false}>
              {selected === index && (
                <motion.span
                  variants={spanVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {tab.title}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
