import type { TextareaHTMLAttributes } from "react";

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-[180px] w-full rounded-[1.45rem] border border-border/55 bg-background/68 px-3.5 py-3 font-mono text-xs text-foreground shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.14)] outline-none placeholder:text-muted/90 focus:border-accent/45 focus:bg-card/92 ${props.className ?? ""}`}
    />
  );
}
