import type { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm outline-none ring-0 placeholder:text-neutral-400 focus:border-accent ${props.className ?? ""}`}
    />
  );
}
