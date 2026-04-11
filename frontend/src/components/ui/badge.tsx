import type { PropsWithChildren } from "react";

export function Badge({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <span className={`inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>;
}
