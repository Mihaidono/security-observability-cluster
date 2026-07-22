import type { PropsWithChildren } from "react";

export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <section className={`panel isolate ${className}`}>{children}</section>;
}

export function CardHeader({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <div className={`px-6 pt-6 ${className}`}>{children}</div>;
}

export function CardTitle({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <h2 className={`text-lg font-semibold tracking-tight ${className}`}>
      {children}
    </h2>
  );
}

export function CardContent({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}
