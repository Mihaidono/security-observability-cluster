import type { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-[1.35rem] border border-border/55 bg-background/68 px-3.5 py-2.5 text-sm text-foreground shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.14)] outline-none ring-0 placeholder:text-neutral-500 focus:border-accent/45 focus:bg-card/92 ${props.className ?? ""}`}
    />
  );
}
