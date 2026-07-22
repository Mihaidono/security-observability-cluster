import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "border border-accent/20 bg-accent text-accentForeground shadow-[0_16px_36px_rgb(var(--color-accent)_/_0.28)] hover:-translate-y-0.5 hover:brightness-110",
  secondary:
    "border border-border/60 bg-card text-foreground shadow-[0_8px_18px_rgb(15_23_42_/_0.06)] hover:-translate-y-0.5 hover:bg-background",
  ghost:
    "border border-border/55 bg-transparent text-foreground/82 hover:-translate-y-0.5 hover:bg-card hover:text-foreground",
  danger:
    "border border-warning/35 bg-warning/12 text-foreground shadow-[0_8px_18px_rgb(15_23_42_/_0.05)] hover:-translate-y-0.5 hover:bg-warning/18",
};

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-65 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
