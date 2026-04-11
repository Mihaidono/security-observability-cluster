import type { TextareaHTMLAttributes } from "react";

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-[180px] w-full rounded-2xl border border-border bg-card px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-neutral-500 focus:border-accent ${props.className ?? ""}`}
    />
  );
}
