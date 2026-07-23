import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import type { JsonObject, TerraformRun } from "../../lib/types";

function classNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

function prettyPrint(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/28 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="panel flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2.2rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">
              Workspace Context
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              {title}
            </h2>
          </div>
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function MetricTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={classNames(
        "relative overflow-hidden rounded-[1.55rem] border border-border/55 bg-card/82 px-4 py-4 shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.14)]",
        className,
      )}
    >
      <div className="absolute inset-x-4 top-0 h-px bg-card/60" />
      <p className="metric-label text-[11px] uppercase tracking-[0.24em]">
        {label}
      </p>
      <p className="metric-value mt-4 text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="metric-hint mt-2 text-sm leading-6">{hint}</p>
      ) : null}
    </div>
  );
}

export function BrandGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 6.5h14" />
      <path d="M5 12h14" />
      <path d="M5 17.5h9" />
      <circle cx="17.5" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SunIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2" />
      <path d="M12 19.3v2.2" />
      <path d="m4.9 4.9 1.6 1.6" />
      <path d="m17.5 17.5 1.6 1.6" />
      <path d="M2.5 12h2.2" />
      <path d="M19.3 12h2.2" />
      <path d="m4.9 19.1 1.6-1.6" />
      <path d="m17.5 6.5 1.6-1.6" />
    </svg>
  );
}

export function MoonIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 14.2A7.8 7.8 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z" />
    </svg>
  );
}

export function ClusterStatusIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="5" width="16" height="5" rx="1.5" />
      <rect x="4" y="14" width="16" height="5" rx="1.5" />
      <path d="M8 7.5h.01" />
      <path d="M8 16.5h.01" />
      <path d="M11 7.5h5" />
      <path d="M11 16.5h5" />
    </svg>
  );
}

export function AccountIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

export function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9.5 4h5" />
      <path d="M18 7l-1 12a2 2 0 0 1-2 1H9a2 2 0 0 1-2-1L6 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

export function FilterIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

export function IconActionButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={classNames(
        "inline-flex h-11 w-11 items-center justify-center rounded-full border transition duration-200",
        active
          ? "border-accent/45 bg-accent/16 text-accent shadow-[0_12px_28px_rgb(var(--color-accent)_/_0.22)]"
          : "border-border/50 bg-card/76 text-foreground/72 hover:bg-accent/10 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function ContextTag({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-soft shrink-0 flex items-center gap-2 rounded-full px-3 py-2">
      <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
        {label}
      </span>
      <span className="context-value text-sm font-medium">{value}</span>
    </div>
  );
}

export function ReviewItems({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "error" | "warning" | "hint";
  items: string[];
}) {
  if (items.length === 0) return null;

  const toneClass =
    tone === "error"
      ? "border-warning/35 bg-warning/10 text-warning"
      : tone === "warning"
        ? "border-border/55 bg-border/14 text-foreground"
        : "border-accent/25 bg-accent/10 text-foreground";

  return (
    <div className={`rounded-[1.25rem] border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.22em]">{title}</p>
      <div className="mt-3 space-y-2 text-sm leading-6">
        {items.map((item, index) => (
          <p key={`${tone}-${index}`}>{item}</p>
        ))}
      </div>
    </div>
  );
}

export function ScenarioTile({
  title,
  description,
  tag,
  actionLabel = "Apply to selected application",
  compact = false,
  onApply,
}: {
  title: string;
  description: string;
  tag: string;
  actionLabel?: string;
  compact?: boolean;
  onApply: () => void;
}) {
  const compactDescription =
    compact && description.length > 82
      ? `${description.slice(0, 79).trimEnd()}...`
      : description;

  return (
    <div
      className={classNames(
        "flex shrink-0 snap-start flex-col justify-between rounded-[1.5rem] border border-border/80 bg-card/80 p-4",
        compact
          ? "min-h-[188px] min-w-[220px] max-w-[220px]"
          : "min-h-[232px] min-w-[280px] max-w-[280px]",
      )}
    >
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-2 inline-flex rounded-full border border-border/75 bg-muted/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          {tag}
        </p>
        <p
          className={classNames(
            "mt-3 text-neutral-500",
            compact ? "text-[13px] leading-5" : "text-sm leading-6",
          )}
        >
          {compact ? compactDescription : description}
        </p>
      </div>
      <Button
        className={classNames("self-start", compact ? "mt-4" : "mt-5")}
        variant="secondary"
        type="button"
        onClick={onApply}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

export function ScenarioPlaybookCard({
  title,
  tag,
  requirements,
  proofSurfaces,
  caution,
  appNames,
  commands,
  expectedSignals,
}: {
  title: string;
  tag: string;
  requirements: string;
  proofSurfaces: string[];
  caution?: string;
  appNames: string[];
  commands: string[];
  expectedSignals: string[];
}) {
  return (
    <div className="rounded-[1.5rem] border border-border/80 bg-card/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            {requirements}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{tag}</Badge>
          {proofSurfaces.map((surface) => (
            <Badge
              key={surface}
              className="border-border/70 bg-muted/60 text-foreground/75"
            >
              {surface}
            </Badge>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="rounded-[1rem] border border-border/70 bg-muted/45 p-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Provisioned apps
          </p>
          <p className="mt-2 text-sm text-foreground/80">
            {appNames.join(", ")}
          </p>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Run these
          </p>
          <div className="mt-3 grid gap-3">
            {commands.map((command) => (
              <pre
                key={command}
                className="themed-scrollbar overflow-auto rounded-[1rem] border border-border/70 bg-card/82 px-4 py-3 font-mono text-xs leading-6 text-foreground"
              >
                {command}
              </pre>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Capture this proof
          </p>
          <div className="mt-3 space-y-2 text-sm leading-6 text-foreground/80">
            {expectedSignals.map((signal, index) => (
              <p key={`${title}-signal-${index}`}>{signal}</p>
            ))}
          </div>
        </div>

        {caution ? (
          <div className="rounded-[1rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
            {caution}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EditorSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-border p-4">
      <button
        type="button"
        className="w-full rounded-[1.4rem] bg-muted/55 px-4 py-4 text-left transition hover:bg-muted/75"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-500">{summary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:justify-self-end">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-card/80 text-lg leading-none text-foreground/70">
              {isOpen ? "−" : "+"}
            </span>
          </div>
        </div>
      </button>
      {isOpen ? <div className="mt-5 grid gap-4">{children}</div> : null}
    </div>
  );
}

export function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-border/55 bg-card/76 px-4 py-3 shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.14)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium leading-6 text-foreground">
        {value}
      </p>
    </div>
  );
}

export function CommandBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-border/55 bg-card/76 px-4 py-4 shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.14)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">
        {label}
      </p>
      <pre className="themed-scrollbar mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-[1rem] border border-border/55 bg-background/58 px-3 py-3 font-mono text-xs leading-6 text-foreground/85">
        {value}
      </pre>
      {hint ? (
        <p className="mt-2 text-sm leading-6 text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function PolicyManifestEditor({
  value,
  onCommit,
}: {
  value: JsonObject;
  onCommit: (next: JsonObject) => void;
}) {
  const [draft, setDraft] = useState(prettyPrint(value));
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(prettyPrint(value));
    setError("");
  }, [value]);

  function commitDraft() {
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        setError("Manifest must be a JSON object.");
        return;
      }
      onCommit(parsed as JsonObject);
      setError("");
    } catch {
      setError("Manifest must be valid JSON before it can be saved.");
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Manifest JSON
        </p>
        <Button variant="secondary" type="button" onClick={commitDraft}>
          Update draft
        </Button>
      </div>
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-h-[24rem] font-mono text-xs leading-6"
      />
      {error ? (
        <p className="text-sm leading-6 text-warning">{error}</p>
      ) : (
        <p className="text-sm leading-6 text-neutral-500">
          Edit the full manifest when you need fields beyond the guided
          controls. This only updates the managed config draft.
        </p>
      )}
    </div>
  );
}

export function StageAction({
  disabledReason,
  children,
}: {
  disabledReason?: string;
  children: ReactNode;
}) {
  if (!disabledReason) {
    return <>{children}</>;
  }

  return (
    <div className="group relative inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-0 z-20 hidden w-56 rounded-[0.95rem] border border-border/45 bg-foreground px-3 py-2 text-left text-xs leading-5 text-background shadow-[0_16px_40px_rgb(15_23_42_/_0.28)] group-hover:block">
        {disabledReason}
      </div>
    </div>
  );
}

export function StageNotice({
  title,
  body,
  tone = "neutral",
}: {
  title: string;
  body: string;
  tone?: "neutral" | "warning";
}) {
  const toneClass =
    tone === "warning"
      ? "border-warning/35 bg-warning/10 text-warning"
      : "border-border/80 bg-card/85 text-foreground";

  return (
    <div
      className={`rounded-[1.4rem] border px-4 py-3.5 shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.12)] ${toneClass}`}
    >
      <p className="text-[11px] uppercase tracking-[0.22em]">{title}</p>
      <p className="mt-2 text-sm leading-6">{body}</p>
    </div>
  );
}

export function statusTone(
  status?: TerraformRun["status"],
): "primary" | "secondary" | "ghost" | "danger" {
  if (status === "planned" || status === "applied" || status === "destroyed") {
    return "primary";
  }
  if (status === "failed" || status === "canceled") return "danger";
  if (
    status === "running" ||
    status === "applying" ||
    status === "destroying" ||
    status === "canceling"
  ) {
    return "secondary";
  }
  return "ghost";
}

export function isTerminalRunStatus(status?: TerraformRun["status"]): boolean {
  return (
    status === "planned" ||
    status === "applied" ||
    status === "destroyed" ||
    status === "failed" ||
    status === "canceled"
  );
}
