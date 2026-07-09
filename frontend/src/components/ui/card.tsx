import type { PropsWithChildren } from "react";

export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function CardHeader({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={`border-b border-border/80 px-5 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <h2 className={`text-lg font-semibold ${className}`}>{children}</h2>;
}

export function CardContent({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
