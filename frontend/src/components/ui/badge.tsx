import type { PropsWithChildren } from "react";

export function Badge({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border/50 bg-card/72 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/78 shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.14)] backdrop-blur-xl ${className}`}
    >
      {children}
    </span>
  );
}
