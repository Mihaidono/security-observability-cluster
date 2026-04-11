import type { TextareaHTMLAttributes } from "react";

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-[180px] w-full rounded-2xl border border-border bg-white px-3 py-2 font-mono text-xs outline-none placeholder:text-neutral-400 focus:border-accent ${props.className ?? ""}`}
    />
  );
}
