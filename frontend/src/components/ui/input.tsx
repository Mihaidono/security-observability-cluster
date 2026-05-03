import type { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-border/80 bg-card/96 px-3 py-2 text-sm text-foreground outline-none ring-0 placeholder:text-neutral-500 focus:border-accent ${props.className ?? ""}`}
    />
  );
}
