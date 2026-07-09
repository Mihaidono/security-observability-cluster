import type { PropsWithChildren } from "react";

export function Badge({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={`inline-flex rounded-full border border-border/75 bg-background/88 px-2.5 py-1 text-xs font-medium text-foreground ${className}`}
    >
      {children}
    </span>
  );
}
