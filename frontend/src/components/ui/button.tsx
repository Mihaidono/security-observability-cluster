import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary: "border border-accent/80 bg-accent text-accentForeground hover:brightness-105",
  secondary: "border border-border/80 bg-muted/72 text-foreground hover:bg-muted",
  ghost: "border border-border/75 bg-card/90 text-foreground hover:bg-background/80",
  danger: "border border-warning/50 bg-warning/18 text-foreground hover:bg-warning/26",
};

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
