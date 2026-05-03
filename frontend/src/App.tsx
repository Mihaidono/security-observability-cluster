import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { api, buildObservabilityLaunchUrl, buildRunEventsUrl, getApiToken } from "./lib/api";
import type {
  AnalysisSubject,
  ContainerConfig,
  IngressConfig,
  ObservabilityLinksResponse,
  NetworkPolicyPeer,
  NetworkPolicyPort,
  NetworkPolicyRule,
  ProbeConfig,
  RunStage,
  TerraformConfig,
  TerraformRun,
  VolumeConfig,
  VolumeMountConfig,
  WardApplication,
} from "./lib/types";

type Direction = "ingress" | "egress";
type AppTab = "overview" | "assets" | "activity" | "settings";

function emptySubject(): AnalysisSubject {
  return {
    tier: "template",
    description: "",
    labels: {},
    resource_quota: {
      pods: "10",
      requests_cpu: "2",
      requests_memory: "4Gi",
      limits_cpu: "4",
      limits_memory: "8Gi",
    },
  };
}

function emptyProbe(): ProbeConfig {
  return {
    enabled: false,
    path: "/",
    port: 8080,
    initial_delay_seconds: 5,
    period_seconds: 10,
  };
}

function emptyContainer(): ContainerConfig {
  return {
    name: "app",
    image: "nginxinc/nginx-unprivileged:1.27-alpine",
    port: 8080,
    command: [],
    args: [],
    env: {},
    env_from_secret_names: [],
    probes: {
      readiness: emptyProbe(),
      liveness: emptyProbe(),
      startup: emptyProbe(),
    },
    resources: {
      requests_cpu: "100m",
      requests_memory: "128Mi",
      limits_cpu: "500m",
      limits_memory: "256Mi",
    },
    volume_mounts: [],
  };
}

function emptyVolume(): VolumeConfig {
  return {
    name: "shared-data",
    empty_dir: true,
  };
}

function emptyPolicyPort(): NetworkPolicyPort {
  return {
    port: 8080,
    protocol: "TCP",
  };
}

function emptyPolicyPeer(): NetworkPolicyPeer {
  return {
    pod_selector: {},
    namespace_selector: {},
  };
}

function emptyPolicyRule(direction: Direction): NetworkPolicyRule {
  return {
    ports: [emptyPolicyPort()],
    [direction === "ingress" ? "from" : "to"]: [emptyPolicyPeer()],
  };
}

function emptyAppTemplate(namespace: string): WardApplication {
  return {
    name: "new-template-app",
    namespace,
    replicas: 1,
    pod_labels: {
      app_role: "api",
    },
    service: {
      enabled: true,
      type: "ClusterIP",
      port: 8080,
      target_port: 8080,
      annotations: {},
    },
    ingress: {
      enabled: false,
      class_name: "nginx",
      host: "",
      path: "/",
      annotations: {},
    },
    config_map: {
      enabled: false,
      mount_path: "/usr/share/nginx/html",
      data: {},
    },
    containers: [emptyContainer()],
    volumes: [],
    network_policy: {
      ingress: [],
      egress: [],
    },
  };
}

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function prettyPrint(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

type ParsedLogLine = {
  kind: "plain" | "structured";
  message: string;
  detail?: string;
  level?: string;
  timestamp?: string;
  source?: string;
  address?: string;
};

function parseLogLine(line: string): ParsedLogLine {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (!parsed || Array.isArray(parsed)) {
      return { kind: "plain", message: line };
    }

    const diagnostic = typeof parsed.diagnostic === "object" && parsed.diagnostic ? (parsed.diagnostic as Record<string, unknown>) : null;
    const snippet = typeof diagnostic?.snippet === "object" && diagnostic.snippet ? (diagnostic.snippet as Record<string, unknown>) : null;
    const message =
      (typeof diagnostic?.summary === "string" && diagnostic.summary) ||
      (typeof parsed["@message"] === "string" && parsed["@message"]) ||
      (typeof parsed.message === "string" && parsed.message) ||
      (typeof parsed.summary === "string" && parsed.summary) ||
      (typeof parsed.type === "string" && parsed.type) ||
      line;

    const detail =
      (typeof diagnostic?.detail === "string" && diagnostic.detail) ||
      (typeof parsed.detail === "string" && parsed.detail) ||
      undefined;

    const level =
      (typeof parsed["@level"] === "string" && parsed["@level"]) ||
      (typeof parsed.level === "string" && parsed.level) ||
      undefined;

    const timestamp =
      (typeof parsed["@timestamp"] === "string" && parsed["@timestamp"]) ||
      (typeof parsed.timestamp === "string" && parsed.timestamp) ||
      (typeof parsed.time === "string" && parsed.time) ||
      undefined;

    const source =
      (typeof snippet?.context === "string" && snippet.context) ||
      (typeof parsed.type === "string" && parsed.type) ||
      (typeof parsed.hook === "string" && parsed.hook) ||
      undefined;

    const address =
      (typeof diagnostic?.address === "string" && diagnostic.address) ||
      undefined;

    return {
      kind: "structured",
      message,
      detail,
      level,
      timestamp,
      source,
      address,
    };
  } catch {
    return { kind: "plain", message: line };
  }
}

function logLevelTone(level?: string): string {
  const normalized = level?.toLowerCase();
  if (normalized === "error" || normalized === "fatal") return "border-warning/40 bg-warning/16 text-foreground";
  if (normalized === "warn" || normalized === "warning") return "border-[#ab9f9d]/60 bg-[#ab9f9d]/20 text-foreground";
  if (normalized === "debug" || normalized === "trace") return "border-border/70 bg-card/70 text-foreground/80";
  return "border-accent/30 bg-accent/12 text-accent";
}

function sortRuns(runs: TerraformRun[]): TerraformRun[] {
  return [...runs].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function uniqueName(base: string, existing: string[]): string {
  let index = 1;
  let candidate = base;
  while (existing.includes(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function compactRecord(value?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([key, entryValue]) => key.trim() !== "" || String(entryValue).trim() !== ""),
  );
}

function KeyValueEditor({
  label,
  value,
  onChange,
  addLabel = "Add row",
}: {
  label: string;
  value?: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  addLabel?: string;
}) {
  const entries = Object.entries(value ?? {});

  function updateRow(index: number, nextKey: string, nextValue: string) {
    const rows = entries.map(([key, currentValue], rowIndex) =>
      rowIndex === index ? [nextKey, nextValue] : [key, currentValue],
    );
    onChange(Object.fromEntries(rows.filter(([key, currentValue]) => key.trim() !== "" || currentValue.trim() !== "")));
  }

  function addRow() {
    const nextKey = uniqueName("key", entries.map(([key]) => key));
    onChange({
      ...(value ?? {}),
      [nextKey]: "",
    });
  }

  function removeRow(index: number) {
    const rows = entries.filter((_, rowIndex) => rowIndex !== index);
    onChange(Object.fromEntries(rows));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
        <Button variant="ghost" type="button" className="px-3 py-1.5 text-xs" onClick={addRow}>
          {addLabel}
        </Button>
      </div>
      {entries.length === 0 ? <p className="text-sm text-neutral-500">No entries.</p> : null}
      <div className="grid gap-2">
        {entries.map(([entryKey, entryValue], index) => (
          <div key={`${entryKey}-${index}`} className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input value={entryKey} onChange={(event) => updateRow(index, event.target.value, entryValue)} placeholder="Key" />
            <Input value={entryValue} onChange={(event) => updateRow(index, entryKey, event.target.value)} placeholder="Value" />
            <Button variant="danger" type="button" onClick={() => removeRow(index)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StringListEditor({
  label,
  value,
  onChange,
  addLabel = "Add item",
}: {
  label: string;
  value?: string[];
  onChange: (next: string[]) => void;
  addLabel?: string;
}) {
  const items = value ?? [];

  function updateItem(index: number, nextValue: string) {
    const next = items.map((item, itemIndex) => (itemIndex === index ? nextValue : item));
    onChange(next.filter((item) => item.trim() !== ""));
  }

  function addItem() {
    onChange([...items, ""]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
        <Button variant="ghost" type="button" className="px-3 py-1.5 text-xs" onClick={addItem}>
          {addLabel}
        </Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-neutral-500">No entries.</p> : null}
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
            <Input value={item} onChange={(event) => updateItem(index, event.target.value)} />
            <Button variant="danger" type="button" onClick={() => removeItem(index)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProbeEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: ProbeConfig;
  onChange: (next: ProbeConfig) => void;
}) {
  const probe = value ?? emptyProbe();

  return (
    <div className="rounded-2xl border border-border bg-muted/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">{label}</p>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={probe.enabled ?? false}
            onChange={(event) => onChange({ ...probe, enabled: event.target.checked })}
          />
          Enabled
        </label>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>Path</span>
          <Input value={probe.path ?? ""} onChange={(event) => onChange({ ...probe, path: event.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Port</span>
          <Input
            type="number"
            value={String(probe.port ?? 8080)}
            onChange={(event) => onChange({ ...probe, port: Number(event.target.value) })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Initial delay</span>
          <Input
            type="number"
            value={String(probe.initial_delay_seconds ?? 5)}
            onChange={(event) => onChange({ ...probe, initial_delay_seconds: Number(event.target.value) })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Period</span>
          <Input
            type="number"
            value={String(probe.period_seconds ?? 10)}
            onChange={(event) => onChange({ ...probe, period_seconds: Number(event.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}

function VolumeMountEditor({
  value,
  onChange,
}: {
  value?: VolumeMountConfig[];
  onChange: (next: VolumeMountConfig[]) => void;
}) {
  const mounts = value ?? [];

  function updateMount(index: number, next: VolumeMountConfig) {
    onChange(mounts.map((mount, mountIndex) => (mountIndex === index ? next : mount)));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Volume mounts</p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() => onChange([...mounts, { name: "shared-data", mount_path: "/data" }])}
        >
          Add mount
        </Button>
      </div>
      {mounts.length === 0 ? <p className="text-sm text-neutral-500">No mounts.</p> : null}
      <div className="grid gap-2">
        {mounts.map((mount, index) => (
          <div key={`${mount.name}-${index}`} className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input value={mount.name} onChange={(event) => updateMount(index, { ...mount, name: event.target.value })} placeholder="Volume name" />
            <Input
              value={mount.mount_path}
              onChange={(event) => updateMount(index, { ...mount, mount_path: event.target.value })}
              placeholder="/mount/path"
            />
            <Button variant="danger" type="button" onClick={() => onChange(mounts.filter((_, mountIndex) => mountIndex !== index))}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetworkPortsEditor({
  value,
  onChange,
}: {
  value?: NetworkPolicyPort[];
  onChange: (next: NetworkPolicyPort[]) => void;
}) {
  const ports = value ?? [];

  function updatePort(index: number, next: NetworkPolicyPort) {
    onChange(ports.map((port, portIndex) => (portIndex === index ? next : port)));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Ports</p>
        <Button variant="ghost" type="button" className="px-3 py-1.5 text-xs" onClick={() => onChange([...ports, emptyPolicyPort()])}>
          Add port
        </Button>
      </div>
      {ports.length === 0 ? <p className="text-sm text-neutral-500">No ports.</p> : null}
      <div className="grid gap-2">
        {ports.map((port, index) => (
          <div key={`${port.port}-${index}`} className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_160px_auto]">
            <Input
              type="number"
              value={String(port.port)}
              onChange={(event) => updatePort(index, { ...port, port: Number(event.target.value) })}
            />
            <Input value={port.protocol ?? "TCP"} onChange={(event) => updatePort(index, { ...port, protocol: event.target.value })} />
            <Button variant="danger" type="button" onClick={() => onChange(ports.filter((_, portIndex) => portIndex !== index))}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetworkPeersEditor({
  direction,
  value,
  onChange,
}: {
  direction: Direction;
  value?: NetworkPolicyPeer[];
  onChange: (next: NetworkPolicyPeer[]) => void;
}) {
  const peers = value ?? [];

  function updatePeer(index: number, next: NetworkPolicyPeer) {
    onChange(peers.map((peer, peerIndex) => (peerIndex === index ? next : peer)));
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {direction === "ingress" ? "Sources" : "Destinations"}
        </p>
        <Button variant="ghost" type="button" className="px-3 py-1.5 text-xs" onClick={() => onChange([...peers, emptyPolicyPeer()])}>
          Add peer
        </Button>
      </div>
      {peers.length === 0 ? <p className="text-sm text-neutral-500">No peers.</p> : null}
      <div className="grid gap-3">
        {peers.map((peer, index) => (
          <div key={index} className="rounded-2xl border border-border bg-muted/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">Peer {index + 1}</p>
              <Button variant="danger" type="button" onClick={() => onChange(peers.filter((_, peerIndex) => peerIndex !== index))}>
                Remove
              </Button>
            </div>
            <div className="grid gap-4">
              <KeyValueEditor
                label="Pod selector"
                value={peer.pod_selector ?? {}}
                onChange={(next) => updatePeer(index, { ...peer, pod_selector: compactRecord(next) })}
                addLabel="Add label"
              />
              <KeyValueEditor
                label="Namespace selector"
                value={peer.namespace_selector ?? {}}
                onChange={(next) => updatePeer(index, { ...peer, namespace_selector: compactRecord(next) })}
                addLabel="Add label"
              />
              <label className="grid gap-1 text-sm">
                <span>IP block CIDR</span>
                <Input
                  value={peer.ip_block?.cidr ?? ""}
                  placeholder="0.0.0.0/0"
                  onChange={(event) =>
                    updatePeer(index, {
                      ...peer,
                      ip_block: event.target.value.trim() === "" ? undefined : { cidr: event.target.value },
                    })
                  }
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetworkRulesEditor({
  direction,
  value,
  onChange,
}: {
  direction: Direction;
  value?: NetworkPolicyRule[];
  onChange: (next: NetworkPolicyRule[]) => void;
}) {
  const rules = value ?? [];

  function updateRule(index: number, next: NetworkPolicyRule) {
    onChange(rules.map((rule, ruleIndex) => (ruleIndex === index ? next : rule)));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">{direction === "ingress" ? "Ingress rules" : "Egress rules"}</p>
        <Button variant="ghost" type="button" className="px-3 py-1.5 text-xs" onClick={() => onChange([...rules, emptyPolicyRule(direction)])}>
          Add rule
        </Button>
      </div>
      {rules.length === 0 ? <p className="text-sm text-neutral-500">No rules.</p> : null}
      <div className="grid gap-4">
        {rules.map((rule, index) => (
          <div key={index} className="rounded-2xl border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">Rule {index + 1}</p>
              <Button variant="danger" type="button" onClick={() => onChange(rules.filter((_, ruleIndex) => ruleIndex !== index))}>
                Remove
              </Button>
            </div>
            <div className="grid gap-4">
              <NetworkPortsEditor
                value={rule.ports}
                onChange={(ports) => updateRule(index, { ...rule, ports })}
              />
              <NetworkPeersEditor
                direction={direction}
                value={direction === "ingress" ? rule.from : rule.to}
                onChange={(peers) =>
                  updateRule(index, {
                    ...rule,
                    [direction === "ingress" ? "from" : "to"]: peers,
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContainerEditor({
  container,
  onChange,
  onRemove,
  index,
}: {
  container: ContainerConfig;
  onChange: (next: ContainerConfig) => void;
  onRemove: () => void;
  index: number;
}) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Container {index + 1}</p>
          <p className="text-sm text-neutral-500">{container.name}</p>
        </div>
        <Button variant="danger" type="button" onClick={onRemove}>
          Remove
        </Button>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-3 xl:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span>Name</span>
            <Input value={container.name} onChange={(event) => onChange({ ...container, name: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm xl:col-span-2">
            <span>Image</span>
            <Input value={container.image} onChange={(event) => onChange({ ...container, image: event.target.value })} />
          </label>
        </div>

        <div className="grid gap-3 2xl:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span>Port</span>
            <Input
              type="number"
              value={String(container.port ?? 8080)}
              onChange={(event) => onChange({ ...container, port: Number(event.target.value) })}
            />
          </label>
          <StringListEditor label="Command" value={container.command} onChange={(command) => onChange({ ...container, command })} addLabel="Add command" />
          <StringListEditor label="Args" value={container.args} onChange={(args) => onChange({ ...container, args })} addLabel="Add arg" />
        </div>

        <KeyValueEditor
          label="Environment variables"
          value={container.env ?? {}}
          onChange={(env) => onChange({ ...container, env: compactRecord(env) })}
          addLabel="Add env"
        />

        <StringListEditor
          label="Secret env sources"
          value={container.env_from_secret_names}
          onChange={(env_from_secret_names) => onChange({ ...container, env_from_secret_names })}
          addLabel="Add secret"
        />

        <div className="grid gap-4 2xl:grid-cols-3">
          <ProbeEditor
            label="Readiness probe"
            value={container.probes?.readiness}
            onChange={(readiness) =>
              onChange({
                ...container,
                probes: { ...container.probes, readiness },
              })
            }
          />
          <ProbeEditor
            label="Liveness probe"
            value={container.probes?.liveness}
            onChange={(liveness) =>
              onChange({
                ...container,
                probes: { ...container.probes, liveness },
              })
            }
          />
          <ProbeEditor
            label="Startup probe"
            value={container.probes?.startup}
            onChange={(startup) =>
              onChange({
                ...container,
                probes: { ...container.probes, startup },
              })
            }
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          <label className="grid gap-1 text-sm">
            <span>CPU request</span>
            <Input
              value={container.resources?.requests_cpu ?? ""}
              onChange={(event) =>
                onChange({
                  ...container,
                  resources: { ...container.resources, requests_cpu: event.target.value },
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Memory request</span>
            <Input
              value={container.resources?.requests_memory ?? ""}
              onChange={(event) =>
                onChange({
                  ...container,
                  resources: { ...container.resources, requests_memory: event.target.value },
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CPU limit</span>
            <Input
              value={container.resources?.limits_cpu ?? ""}
              onChange={(event) =>
                onChange({
                  ...container,
                  resources: { ...container.resources, limits_cpu: event.target.value },
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Memory limit</span>
            <Input
              value={container.resources?.limits_memory ?? ""}
              onChange={(event) =>
                onChange({
                  ...container,
                  resources: { ...container.resources, limits_memory: event.target.value },
                })
              }
            />
          </label>
        </div>

        <VolumeMountEditor
          value={container.volume_mounts}
          onChange={(volume_mounts) => onChange({ ...container, volume_mounts })}
        />
      </div>
    </div>
  );
}

function Modal({
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#383f51]/48 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="panel flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function statusTone(status?: TerraformRun["status"]): "primary" | "secondary" | "ghost" | "danger" {
  if (status === "planned" || status === "applied" || status === "destroyed") return "primary";
  if (status === "failed" || status === "canceled") return "danger";
  if (status === "running" || status === "applying" || status === "destroying" || status === "canceling") return "secondary";
  return "ghost";
}

function stageLabel(stage: RunStage): string {
  return stage === "core" ? "Core" : "Policies";
}

function isTerminalRunStatus(status?: TerraformRun["status"]): boolean {
  return status === "planned" || status === "applied" || status === "destroyed" || status === "failed" || status === "canceled";
}

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
      <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-2 text-sm text-neutral-500">{hint}</p> : null}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
      <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">{label}</p>
      <p className="mt-3 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function StageAction({
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
      <div className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-0 z-20 hidden w-56 rounded-[0.95rem] border border-[#ab9f9d]/40 bg-[#383f51] px-3 py-2 text-left text-xs leading-5 text-[#f6f4fb] shadow-[0_16px_40px_rgba(56,63,81,0.22)] group-hover:block">
        {disabledReason}
      </div>
    </div>
  );
}

function formatRunTimestamp(value: string | null | undefined) {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}

export default function App() {
  const [config, setConfig] = useState<TerraformConfig | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("overview");
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [runs, setRuns] = useState<TerraformRun[]>([]);
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>("");
  const [selectedAppIndex, setSelectedAppIndex] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [selectedRun, setSelectedRun] = useState<TerraformRun | null>(null);
  const [selectedRunLogs, setSelectedRunLogs] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<Record<string, unknown> | null>(null);
  const [observabilityLinks, setObservabilityLinks] = useState<ObservabilityLinksResponse | null>(null);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [armedDestroyStage, setArmedDestroyStage] = useState<RunStage | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const selectedRunStatusRef = useRef<TerraformRun["status"] | undefined>(undefined);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const logsViewportRef = useRef<HTMLDivElement | null>(null);

  const subjectKeys = useMemo(() => Object.keys(config?.analysis_subjects ?? {}), [config?.analysis_subjects]);
  const selectedSubject = useMemo(() => {
    if (!config || !selectedSubjectKey) return null;
    return config.analysis_subjects[selectedSubjectKey] ?? null;
  }, [config, selectedSubjectKey]);
  const selectedApp = useMemo(() => config?.ward_applications[selectedAppIndex] ?? null, [config, selectedAppIndex]);
  const appsForSelectedSubject = useMemo(
    () =>
      (config?.ward_applications ?? [])
        .map((application, index) => ({ application, index }))
        .filter(({ application }) => application.namespace === selectedSubjectKey),
    [config?.ward_applications, selectedSubjectKey],
  );
  const latestCoreRun = useMemo(() => runs.find((run) => run.stage === "core") ?? null, [runs]);
  const latestPoliciesRun = useMemo(() => runs.find((run) => run.stage === "policies") ?? null, [runs]);
  const hasAppliedCoreRun = useMemo(
    () => runs.some((run) => run.stage === "core" && run.kind === "apply" && run.status === "applied"),
    [runs],
  );
  const hasAdminAccess = useMemo(
    () => (config?.cluster_admin_principal_arns ?? []).some((arn) => arn.trim() !== ""),
    [config?.cluster_admin_principal_arns],
  );
  const sourcePlanRun = useMemo(() => {
    if (!selectedRun?.source_run_id) return null;
    return runs.find((run) => run.id === selectedRun.source_run_id) ?? null;
  }, [runs, selectedRun?.source_run_id]);
  const displayedPlanSummary = useMemo(() => {
    if (!selectedRun) return null;
    if (selectedRun.kind === "destroy") {
      return null;
    }
    if (selectedRun.kind === "plan") {
      return selectedRun.plan_summary ?? null;
    }
    return sourcePlanRun?.plan_summary ?? null;
  }, [selectedRun, sourcePlanRun]);
  const planSummaryLabel = selectedRun?.kind === "apply" ? "Plan behind this apply" : "Planned changes";
  const apiTokenValue = getApiToken();
  const totalAppsWithIngress = useMemo(
    () => config?.ward_applications.filter((application) => application.ingress?.enabled).length ?? 0,
    [config?.ward_applications],
  );
  const totalAppsWithService = useMemo(
    () => config?.ward_applications.filter((application) => application.service?.enabled !== false).length ?? 0,
    [config?.ward_applications],
  );
  const totalContainers = useMemo(
    () => config?.ward_applications.reduce((count, application) => count + (application.containers?.length ?? 0), 0) ?? 0,
    [config?.ward_applications],
  );
  const adminAccessDisabledReason = !hasAdminAccess
    ? "Add at least one IAM principal ARN in Settings -> Admin Access before running this action."
    : undefined;

  useEffect(() => {
    selectedRunStatusRef.current = selectedRun?.status;
  }, [selectedRun?.status]);

  useEffect(() => {
    if (!armedDestroyStage) return;

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-destroy-arm]")) {
        return;
      }
      setArmedDestroyStage(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setArmedDestroyStage(null);
      }
    }

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [armedDestroyStage]);

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;

    let isClosed = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    async function hydrateSelectedRun() {
      try {
        const [runResponse, logsResponse] = await Promise.all([api.getRun(selectedRunId), api.getRunLogs(selectedRunId)]);
        if (isClosed) return;
        setRunInState(runResponse);
        setSelectedRun(runResponse);
        setSelectedRunLogs(logsResponse.logs);
        if (runResponse.outputs) {
          setOutputs(runResponse.outputs as Record<string, unknown>);
        }
      } catch {
        if (!isClosed) {
          setErrorMessage("Unable to refresh run details.");
        }
      }
    }

    function connectToRunStream() {
      if (isClosed) return;

      socket = new WebSocket(buildRunEventsUrl(selectedRunId));
      socket.onopen = () => {
        if (!isClosed) {
          setStatusMessage("Live run stream connected.");
          setErrorMessage("");
        }
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as
          | { type: "run.snapshot"; run: TerraformRun; logs: string[] }
          | { type: "run.updated"; run: TerraformRun }
          | { type: "run.logs"; lines: string[] };

        if (payload.type === "run.snapshot") {
          setRunInState(payload.run);
          setSelectedRun(payload.run);
          setSelectedRunLogs(payload.logs);
          if (payload.run.outputs) {
            setOutputs(payload.run.outputs as Record<string, unknown>);
          }
        }

        if (payload.type === "run.updated") {
          setRunInState(payload.run);
          setSelectedRun(payload.run);
          if (payload.run.outputs) {
            setOutputs(payload.run.outputs as Record<string, unknown>);
          }
        }

        if (payload.type === "run.logs") {
          setSelectedRunLogs((current) => [...current, ...payload.lines]);
        }
      };

      socket.onerror = () => {
        if (!isClosed) {
          setStatusMessage("Live run stream interrupted.");
        }
      };

      socket.onclose = () => {
        if (isClosed) return;
        if (isTerminalRunStatus(selectedRunStatusRef.current)) return;
        setStatusMessage("Reconnecting to live run stream...");
        reconnectTimer = window.setTimeout(() => {
          void hydrateSelectedRun();
          connectToRunStream();
        }, 1500);
      };
    }

    void hydrateSelectedRun();
    connectToRunStream();

    return () => {
      isClosed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [selectedRunId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSubjectModalOpen(false);
        setIsAppModalOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const hasOpenModal = isSubjectModalOpen || isAppModalOpen;
    if (!hasOpenModal) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSubjectModalOpen, isAppModalOpen]);

  useEffect(() => {
    workspaceScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  useEffect(() => {
    if (!autoScrollLogs) return;
    const viewport = logsViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [selectedRunLogs, autoScrollLogs]);

  async function loadInitial() {
    try {
      const [loadedConfig, runResponse, health, links] = await Promise.all([
        api.getConfig(),
        api.listRuns(),
        api.getHealth(),
        api.getObservabilityLinks(),
      ]);
      setConfig(loadedConfig);
      setRuns(sortRuns(runResponse.items));
      setObservabilityLinks(links);
      setSelectedSubjectKey(Object.keys(loadedConfig.analysis_subjects)[0] ?? "");
      setSelectedAppIndex(0);
      setStatusMessage(`Ready. Queue depth ${health.queue_depth}.`);

      if (runResponse.items[0]) {
        setSelectedRunId(runResponse.items[0].id);
        setSelectedRun(runResponse.items[0]);
      } else {
        await refreshOutputs();
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  function openHubbleUi() {
    window.open(buildObservabilityLaunchUrl("hubble-ui"), "_blank", "noopener,noreferrer");
  }

  async function refreshOutputs() {
    try {
      const response = await api.getOutputs();
      setOutputs(response.outputs);
    } catch {
      setOutputs(null);
    }
  }

  function setRunInState(run: TerraformRun) {
    setRuns((current) => {
      const withoutCurrent = current.filter((item) => item.id !== run.id);
      return sortRuns([run, ...withoutCurrent]);
    });
  }

  function updateConfig(mutator: (current: TerraformConfig) => TerraformConfig) {
    setConfig((current) => (current ? mutator(current) : current));
  }

  function updateSelectedSubject(mutator: (current: AnalysisSubject) => AnalysisSubject) {
    if (!selectedSubjectKey) return;
    updateConfig((current) => ({
      ...current,
      analysis_subjects: {
        ...current.analysis_subjects,
        [selectedSubjectKey]: mutator(current.analysis_subjects[selectedSubjectKey] ?? emptySubject()),
      },
    }));
  }

  function updateSelectedApp(mutator: (current: WardApplication) => WardApplication) {
    updateConfig((current) => {
      const next = structuredClone(current);
      next.ward_applications[selectedAppIndex] = mutator(next.ward_applications[selectedAppIndex] ?? emptyAppTemplate(selectedSubjectKey || "ward-template-app"));
      return next;
    });
  }

  function renameSubject(currentKey: string, nextKey: string) {
    const trimmed = nextKey.trim();
    if (!config || trimmed === "" || trimmed === currentKey || config.analysis_subjects[trimmed]) {
      return;
    }

    updateConfig((current) => {
      const next = structuredClone(current);
      const subject = next.analysis_subjects[currentKey];
      delete next.analysis_subjects[currentKey];
      next.analysis_subjects[trimmed] = subject;
      next.ward_applications = next.ward_applications.map((application) =>
        application.namespace === currentKey ? { ...application, namespace: trimmed } : application,
      );
      return next;
    });
    setSelectedSubjectKey(trimmed);
  }

  function addSubject() {
    if (!config) return;
    const nextKey = uniqueName("ward-new-subject", subjectKeys);
    updateConfig((current) => ({
      ...current,
      analysis_subjects: {
        ...current.analysis_subjects,
        [nextKey]: emptySubject(),
      },
    }));
    setSelectedSubjectKey(nextKey);
  }

  function removeSelectedSubject() {
    if (!config || subjectKeys.length <= 1 || !selectedSubjectKey) return;
    updateConfig((current) => {
      const next = structuredClone(current);
      delete next.analysis_subjects[selectedSubjectKey];
      next.ward_applications = next.ward_applications.filter((application) => application.namespace !== selectedSubjectKey);
      if (next.ward_applications.length === 0) {
        next.ward_applications.push(emptyAppTemplate(Object.keys(next.analysis_subjects)[0] ?? "ward-template-app"));
      }
      return next;
    });
    const remainingKeys = subjectKeys.filter((key) => key !== selectedSubjectKey);
    setSelectedSubjectKey(remainingKeys[0] ?? "");
    setSelectedAppIndex(0);
  }

  function selectSubject(subjectKey: string) {
    setSelectedSubjectKey(subjectKey);
    const firstAppIndex = config?.ward_applications.findIndex((application) => application.namespace === subjectKey) ?? -1;
    if (firstAppIndex >= 0) {
      setSelectedAppIndex(firstAppIndex);
    }
  }

  function addApp() {
    if (!config) return;
    const namespace = selectedSubjectKey || subjectKeys[0] || "ward-template-app";
    updateConfig((current) => ({
      ...current,
      ward_applications: [...current.ward_applications, emptyAppTemplate(namespace)],
    }));
    setSelectedAppIndex(config.ward_applications.length);
  }

  function removeSelectedApp() {
    if (!config || config.ward_applications.length <= 1) return;
    updateConfig((current) => {
      const next = structuredClone(current);
      next.ward_applications.splice(selectedAppIndex, 1);
      return next;
    });
    setSelectedAppIndex((currentIndex) => Math.max(0, currentIndex - 1));
  }

  function addClusterAdminArn() {
    updateConfig((current) => ({
      ...current,
      cluster_admin_principal_arns: [...current.cluster_admin_principal_arns, ""],
    }));
  }

  function updateClusterAdminArn(index: number, value: string) {
    updateConfig((current) => ({
      ...current,
      cluster_admin_principal_arns: current.cluster_admin_principal_arns.map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    }));
  }

  function removeClusterAdminArn(index: number) {
    updateConfig((current) => ({
      ...current,
      cluster_admin_principal_arns: current.cluster_admin_principal_arns.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function saveManagedConfig() {
    if (!config) return false;
    setIsBusy(true);
    try {
      const normalized: TerraformConfig = {
        ...config,
        analysis_subjects: Object.fromEntries(
          Object.entries(config.analysis_subjects).map(([key, subject]) => [
            key,
            {
              ...subject,
              labels: compactRecord(subject.labels),
            },
          ]),
        ),
        ward_applications: config.ward_applications.map((application) => ({
          ...application,
          pod_labels: compactRecord(application.pod_labels),
          service: application.service
            ? {
                ...application.service,
                annotations: compactRecord(application.service.annotations),
              }
            : undefined,
          ingress: application.ingress
            ? {
                ...application.ingress,
                annotations: compactRecord(application.ingress.annotations),
              }
            : undefined,
          config_map: application.config_map
            ? {
                ...application.config_map,
                data: compactRecord(application.config_map.data),
              }
            : undefined,
          containers: (application.containers ?? []).map((container) => ({
            ...container,
            env: compactRecord(container.env),
            volume_mounts: container.volume_mounts?.filter((mount) => mount.name.trim() && mount.mount_path.trim()) ?? [],
          })),
          volumes: (application.volumes ?? []).filter((volume) => volume.name.trim() !== ""),
          network_policy: {
            ingress: application.network_policy?.ingress ?? [],
            egress: application.network_policy?.egress ?? [],
          },
        })),
      };

      const saved = await api.saveConfig(normalized);
      setConfig(saved);
      setStatusMessage("Managed config saved.");
      setErrorMessage("");
      return true;
    } catch (error) {
      setErrorMessage((error as Error).message);
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function resetConfig() {
    setIsBusy(true);
    try {
      const reset = await api.resetConfig();
      setConfig(reset);
      setSelectedSubjectKey(Object.keys(reset.analysis_subjects)[0] ?? "");
      setSelectedAppIndex(0);
      setStatusMessage("Managed config reset.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  function latestPlannedRun(stage: RunStage): TerraformRun | null {
    return runs.find((run) => run.stage === stage && run.kind === "plan" && run.status === "planned") ?? null;
  }

  async function startPlan(stage: RunStage) {
    const didSave = await saveManagedConfig();
    if (!didSave) return;

    setIsBusy(true);
    try {
      const run = await api.startPlan(stage);
      setRunInState(run);
      setSelectedRun(run);
      setSelectedRunId(run.id);
      setSelectedRunLogs([]);
      setStatusMessage(`${stageLabel(stage)} plan queued.`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function startApply(stage: RunStage) {
    const plannedRun = latestPlannedRun(stage);
    if (!plannedRun) {
      setErrorMessage(`Queue or select a completed ${stageLabel(stage).toLowerCase()} plan before apply.`);
      return;
    }

    setIsBusy(true);
    try {
      const run = await api.startApply(plannedRun.id);
      setRunInState(run);
      setSelectedRun(run);
      setSelectedRunId(run.id);
      setSelectedRunLogs([]);
      setStatusMessage(`${stageLabel(stage)} apply queued.`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function startDestroy(stage: RunStage) {
    if (armedDestroyStage !== stage) {
      setArmedDestroyStage(stage);
      setErrorMessage("");
      return;
    }

    const didSave = await saveManagedConfig();
    if (!didSave) {
      setArmedDestroyStage(null);
      return;
    }

    setIsBusy(true);
    try {
      const run = await api.startDestroy(stage);
      setRunInState(run);
      setSelectedRun(run);
      setSelectedRunId(run.id);
      setSelectedRunLogs([]);
      setStatusMessage(`${stageLabel(stage)} destroy queued.`);
      setErrorMessage("");
      setArmedDestroyStage(null);
      if (stage === "core") {
        setOutputs(null);
      }
    } catch (error) {
      setStatusMessage(`${stageLabel(stage)} destroy was not queued.`);
      setErrorMessage((error as Error).message);
      setArmedDestroyStage(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function cancelSelectedRun() {
    if (!selectedRun) return;
    setIsBusy(true);
    try {
      const run = await api.cancelRun(selectedRun.id);
      setRunInState(run);
      setSelectedRun(run);
      setStatusMessage("Cancel requested.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  if (!config) {
    return (
      <div className="app-shell">
        <div className="mx-auto max-w-7xl">
          <Card>
            <CardContent className="py-10 text-sm text-neutral-600">Loading control plane state...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: AppTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "assets", label: "Assets" },
    { id: "activity", label: "Activity" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="app-shell">
      <div className="mx-auto max-w-[1560px] space-y-6">
        <Card className="overflow-hidden">
          <CardContent className="space-y-6 px-6 py-6">
            <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.34em] text-neutral-500">Cluster Flow</p>
                  <h2 className="text-3xl font-semibold tracking-tight">Keep the important context visible while you work.</h2>
                </div>
                <p className="max-w-3xl text-sm leading-7 text-neutral-400">
                  Shape workloads, stage Terraform safely, and hand off to native observability tools without losing the current cluster context.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile label="Status" value={statusMessage || "Ready"} />
                <MetricTile
                  label="Queue"
                  value={selectedRun?.queue_position ? `#${selectedRun.queue_position}` : "Idle"}
                  hint={selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}` : "No active run"}
                />
                <MetricTile label="Applications" value={config.ward_applications.length} />
                <MetricTile label="Containers" value={totalContainers} />
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-[1.4rem] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                {errorMessage}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-[1.6rem] border border-border/80 bg-muted/45 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <ReadOnlyField label="Selected Subject" value={selectedSubjectKey || "None"} />
                  <ReadOnlyField label="Selected App" value={selectedApp?.name ?? "None"} />
                  <ReadOnlyField label="API Token" value={apiTokenValue || "Not set"} />
                </div>
              </div>
              <div className="rounded-[1.6rem] border border-border/80 bg-muted/45 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Current Run</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">
                      {selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}` : "No selected run"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {selectedRun ? `Status: ${selectedRun.status}` : "Move to Activity to inspect queued and completed work."}
                    </p>
                  </div>
                  {selectedRun ? <Badge>{selectedRun.status}</Badge> : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="px-0 py-0">
            <div className="sticky top-0 z-20 border-b border-border/80 bg-card/96 px-5 py-4 backdrop-blur-2xl">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.34em] text-neutral-500">Operator Console</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight">Isolens</h1>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{selectedSubjectKey || "No subject"}</Badge>
                    <Badge>{selectedApp?.name ?? "No app"}</Badge>
                    <Badge>{selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.status}` : "No active run"}</Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void saveManagedConfig()} disabled={isBusy}>
                    Save config
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => void cancelSelectedRun()}
                    disabled={isBusy || !selectedRun || ["running", "applying", "queued", "canceling"].includes(selectedRun.status) === false}
                  >
                    Cancel run
                  </Button>
                  <Button variant="ghost" onClick={() => void resetConfig()} disabled={isBusy}>
                    Reset config
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={classNames(
                      "rounded-full border px-4 py-2.5 text-sm font-medium transition",
                      activeTab === tab.id
                        ? "border-accent/70 bg-accent text-accentForeground"
                        : "border-border/80 bg-card/70 text-foreground/80 hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={workspaceScrollRef} className="themed-scrollbar h-[calc(100vh-12.5rem)] overflow-y-auto px-5 py-5">
        <div className="grid h-full gap-6">
            {activeTab === "overview" ? (
              <>
                <Card className="overflow-hidden">
                  <CardContent className="grid gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <p className="text-xs uppercase tracking-[0.34em] text-neutral-500">Overview</p>
                        <h2 className="text-4xl font-semibold tracking-tight">Operate the cluster in the order it actually wants to be used.</h2>
                        <p className="max-w-3xl text-sm leading-7 text-neutral-400">
                          Start with core, layer policies second, and keep observability one click away. This tab should answer what to do next before
                          you drill into assets or logs.
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <MetricTile label="Subjects" value={subjectKeys.length} />
                        <MetricTile label="Applications" value={config.ward_applications.length} />
                        <MetricTile label="Service-backed" value={totalAppsWithService} />
                        <MetricTile label="Ingress-enabled" value={totalAppsWithIngress} />
                      </div>
                    </div>

                    <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-neutral-500">Current Focus</p>
                      <p className="mt-4 text-xl font-semibold">{selectedApp?.name ?? "No selected app"}</p>
                      <p className="mt-2 text-sm text-neutral-400">
                        {selectedApp
                          ? `${selectedApp.namespace} • ${selectedApp.containers?.length ?? 0} containers • ${selectedApp.replicas ?? 1} replicas`
                          : "Move to Assets to choose a subject and workload before editing."}
                      </p>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <MetricTile label="Current Run" value={selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}` : "Idle"} />
                        <MetricTile label="Run Status" value={selectedRun?.status ?? "Ready"} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <Card className="overflow-visible">
                    <CardHeader>
                      <CardTitle>Deployment Stages</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold">Core</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-400">
                              VPC, EKS, add-ons, ward namespaces, workloads, and the main operator outputs.
                            </p>
                          </div>
                          <Badge>{latestCoreRun ? latestCoreRun.status : "idle"}</Badge>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <MetricTile label="Subjects" value={subjectKeys.length} />
                          <MetricTile label="Apps" value={config.ward_applications.length} />
                          <MetricTile label="Services" value={totalAppsWithService} />
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <StageAction disabledReason={adminAccessDisabledReason}>
                            <Button onClick={() => void startPlan("core")} disabled={isBusy || !hasAdminAccess}>Plan core</Button>
                          </StageAction>
                          <StageAction disabledReason={adminAccessDisabledReason}>
                            <Button variant="secondary" onClick={() => void startApply("core")} disabled={isBusy || !hasAdminAccess || !latestPlannedRun("core")}>
                              Apply core
                            </Button>
                          </StageAction>
                          <div data-destroy-arm>
                            <StageAction disabledReason={adminAccessDisabledReason}>
                              <Button
                                variant={armedDestroyStage === "core" ? "danger" : "ghost"}
                                className={armedDestroyStage === "core" ? "border-[#b24c63]/80 bg-[#b24c63] text-white hover:bg-[#9f4157]" : ""}
                                onClick={() => void startDestroy("core")}
                                disabled={isBusy || !hasAdminAccess}
                              >
                                Destroy core
                              </Button>
                            </StageAction>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold">Policies</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-400">
                              Kyverno and Tetragon custom resources applied only after the core platform is ready.
                            </p>
                          </div>
                          <Badge>{latestPoliciesRun ? latestPoliciesRun.status : "idle"}</Badge>
                        </div>
                        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-neutral-500">
                          {hasAppliedCoreRun ? "Core applied, policy stage unlocked" : "Apply core first to unlock this stage"}
                        </p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <MetricTile label="Selected Run" value={selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}` : "None"} />
                          <MetricTile label="Queue Depth" value={selectedRun?.queue_position ?? 0} />
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <StageAction disabledReason={adminAccessDisabledReason}>
                            <Button onClick={() => void startPlan("policies")} disabled={isBusy || !hasAdminAccess || !hasAppliedCoreRun}>Plan policies</Button>
                          </StageAction>
                          <StageAction disabledReason={adminAccessDisabledReason}>
                            <Button
                              variant="secondary"
                              onClick={() => void startApply("policies")}
                              disabled={isBusy || !hasAdminAccess || !hasAppliedCoreRun || !latestPlannedRun("policies")}
                            >
                              Apply policies
                            </Button>
                          </StageAction>
                          <div data-destroy-arm>
                            <StageAction disabledReason={adminAccessDisabledReason}>
                              <Button
                                variant={armedDestroyStage === "policies" ? "danger" : "ghost"}
                                className={armedDestroyStage === "policies" ? "border-[#b24c63]/80 bg-[#b24c63] text-white hover:bg-[#9f4157]" : ""}
                                onClick={() => void startDestroy("policies")}
                                disabled={isBusy || !hasAdminAccess || !hasAppliedCoreRun}
                              >
                                Destroy policies
                              </Button>
                            </StageAction>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Observability Handoff</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold">Hubble UI</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-400">
                              Keep flow analysis in the native UI instead of flattening it into this dashboard.
                            </p>
                          </div>
                          <Badge>{observabilityLinks?.hubble_available ? "Ready" : "Needs URL"}</Badge>
                        </div>

                        <div className="mt-4 rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Target</p>
                          <p className="mt-3 break-all text-sm font-medium">
                            {observabilityLinks?.hubble_ui_url ?? "Set ISOLENS_HUBBLE_UI_URL in backend/.env"}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button onClick={openHubbleUi} disabled={!observabilityLinks?.hubble_available}>Open Hubble UI</Button>
                          <Button variant="ghost" onClick={() => void loadInitial()} disabled={isBusy}>Refresh status</Button>
                        </div>
                        <p className="mt-3 text-xs text-neutral-500">
                          Local path: `kubectl -n kube-system port-forward svc/hubble-ui 12000:80`
                        </p>
                      </div>

                    </CardContent>
                  </Card>
                </div>
              </>
            ) : null}

            {activeTab === "assets" ? (
              <div className="grid gap-6 2xl:h-full 2xl:grid-cols-[320px_minmax(0,1fr)] 2xl:items-stretch">
                <Card className="flex h-full min-h-[24rem] flex-col overflow-hidden">
                  <CardHeader>
                    <CardTitle>Subjects</CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
                    <div className="themed-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {subjectKeys.map((subjectKey) => (
                        <button
                          key={subjectKey}
                          className={classNames(
                            "w-full rounded-[1.4rem] border px-4 py-4 text-left transition",
                            subjectKey === selectedSubjectKey
                              ? "border-accent/70 bg-accent/10"
                              : "border-border/80 bg-card/75 hover:bg-muted/70",
                          )}
                          onClick={() => selectSubject(subjectKey)}
                        >
                          <p className="font-medium">{subjectKey}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
                            {config.analysis_subjects[subjectKey]?.tier ?? "ward"}
                          </p>
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-2 pt-1">
                      <Button variant="secondary" onClick={addSubject}>Add subject</Button>
                      <Button variant="danger" onClick={removeSelectedSubject} disabled={subjectKeys.length <= 1}>Remove subject</Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6 2xl:min-h-0 2xl:grid-rows-[auto_minmax(0,1fr)]">
                  <Card>
                    <CardHeader>
                      <CardTitle>Selected Subject</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                          <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Namespace</p>
                          <p className="mt-3 text-2xl font-semibold">{selectedSubjectKey || "None"}</p>
                          <p className="mt-3 text-sm leading-6 text-neutral-400">
                            {selectedSubject?.description || "Choose a subject to inspect quota, labels, and ward metadata."}
                          </p>
                          {selectedSubject ? <Button className="mt-5" onClick={() => setIsSubjectModalOpen(true)}>Edit subject</Button> : null}
                        </div>
                        <div className="grid gap-3">
                          <MetricTile label="Tier" value={selectedSubject?.tier ?? "-"} />
                          <MetricTile label="Labels" value={Object.keys(selectedSubject?.labels ?? {}).length} />
                          <MetricTile label="Apps In Ward" value={appsForSelectedSubject.length} />
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <MetricTile label="Pods quota" value={selectedSubject?.resource_quota?.pods ?? "-"} />
                        <MetricTile label="CPU request" value={selectedSubject?.resource_quota?.requests_cpu ?? "-"} />
                        <MetricTile label="CPU limit" value={selectedSubject?.resource_quota?.limits_cpu ?? "-"} />
                        <MetricTile label="Memory limit" value={selectedSubject?.resource_quota?.limits_memory ?? "-"} />
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-6 2xl:min-h-0 2xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] 2xl:items-stretch">
                    <Card className="flex h-full min-h-[24rem] flex-col overflow-hidden">
                      <CardHeader>
                        <CardTitle>Applications In This Subject</CardTitle>
                      </CardHeader>
                      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
                        <div className="themed-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                          {appsForSelectedSubject.length === 0 ? (
                            <div className="rounded-[1.4rem] border border-border/80 bg-card/75 px-4 py-4 text-sm text-neutral-400">
                              No applications are currently assigned to this subject.
                            </div>
                          ) : null}
                          {appsForSelectedSubject.map(({ application, index }) => (
                            <button
                              key={`${application.name}-${index}`}
                              className={classNames(
                                "w-full rounded-[1.4rem] border px-4 py-4 text-left transition",
                                index === selectedAppIndex
                                  ? "border-accent/70 bg-accent/10"
                                  : "border-border/80 bg-card/75 hover:bg-muted/70",
                              )}
                              onClick={() => setSelectedAppIndex(index)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium">{application.name}</p>
                                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
                                    {application.containers?.length ?? 0} containers • {application.replicas ?? 1} replicas
                                  </p>
                                </div>
                                <Badge>{application.ingress?.enabled ? "Ingress" : "Internal"}</Badge>
                              </div>
                            </button>
                          ))}
                        </div>
                        <div className="grid gap-2 pt-1 sm:grid-cols-2">
                          <Button variant="secondary" onClick={addApp}>Add app</Button>
                          <Button variant="danger" onClick={removeSelectedApp} disabled={config.ward_applications.length <= 1}>Remove app</Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="h-full">
                      <CardHeader>
                        <CardTitle>Selected Application</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Workload</p>
                              <p className="mt-3 text-2xl font-semibold">{selectedApp?.name || "None"}</p>
                              <p className="mt-3 text-sm leading-6 text-neutral-400">
                                {selectedApp
                                  ? `${selectedApp.namespace} • ${selectedApp.containers?.length ?? 0} containers • ${selectedApp.replicas ?? 1} replicas`
                                  : "Choose an application to inspect service, ingress, and runtime shape."}
                              </p>
                            </div>
                            {selectedApp ? <Button onClick={() => setIsAppModalOpen(true)}>Edit app</Button> : null}
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-4">
                          <MetricTile label="Replicas" value={selectedApp?.replicas ?? 0} />
                          <MetricTile label="Service" value={selectedApp?.service?.enabled === false ? "Off" : "On"} />
                          <MetricTile label="Ingress" value={selectedApp?.ingress?.enabled ? "On" : "Off"} />
                          <MetricTile label="Volumes" value={selectedApp?.volumes?.length ?? 0} />
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Container Images</p>
                            <div className="mt-3 space-y-2 text-sm text-foreground/80">
                              {(selectedApp?.containers ?? []).length === 0 ? <p>No containers.</p> : null}
                              {(selectedApp?.containers ?? []).map((container) => (
                                <p key={container.name}>
                                  {container.name}: {container.image}
                                </p>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Exposure</p>
                            <div className="mt-3 space-y-2 text-sm text-foreground/80">
                              <p>Service type: {selectedApp?.service?.type ?? "ClusterIP"}</p>
                              <p>Port: {selectedApp?.service?.port ?? "-"}</p>
                              <p>Ingress host: {selectedApp?.ingress?.host || "Not configured"}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "activity" ? (
              <div className="grid gap-6 2xl:grid-cols-[340px_minmax(0,1fr)] 2xl:items-stretch">
                <Card className="flex h-full min-h-[24rem] flex-col overflow-hidden">
                  <CardHeader>
                    <CardTitle>Runs</CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="themed-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {runs.length === 0 ? <p className="text-sm text-neutral-500">No runs.</p> : null}
                      {runs.map((run) => (
                        <button
                          key={run.id}
                          className={classNames(
                            "w-full rounded-[1.4rem] border px-4 py-4 text-left transition",
                            selectedRunId === run.id ? "border-accent/70 bg-accent/10" : "border-border/80 bg-card/75 hover:bg-muted/70",
                          )}
                          onClick={() => {
                            setSelectedRunId(run.id);
                            setSelectedRun(run);
                            setSelectedRunLogs([]);
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{stageLabel(run.stage)} {run.kind}</p>
                              <p className="mt-1 text-xs text-neutral-500">{run.id}</p>
                            </div>
                            <Badge className={statusTone(run.status) === "danger" ? "border-warning/30 bg-warning/10 text-warning" : ""}>
                              {run.status}
                              {run.queue_position ? ` #${run.queue_position}` : ""}
                            </Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid min-w-0 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Run Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="grid min-w-0 gap-4">
                      {selectedRun ? (
                        <>
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                            <div className="min-w-0 rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                              <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Selected run</p>
                              <p className="mt-3 break-words text-2xl font-semibold">{stageLabel(selectedRun.stage)} {selectedRun.kind}</p>
                              <div className="mt-4 grid gap-3">
                                <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                  <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Status</span>
                                  <span className="break-words text-sm font-medium text-foreground">
                                    {selectedRun.status}
                                    {selectedRun.queue_position ? ` • Queue #${selectedRun.queue_position}` : ""}
                                  </span>
                                </div>
                                <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                  <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Run ID</span>
                                  <span className="break-all text-sm text-foreground/80">{selectedRun.id}</span>
                                </div>
                                {selectedRun.started_at || selectedRun.completed_at ? (
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {selectedRun.started_at ? (
                                      <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                        <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Started</span>
                                        <span className="break-words text-sm text-foreground/80">{formatRunTimestamp(selectedRun.started_at)}</span>
                                      </div>
                                    ) : null}
                                    {selectedRun.completed_at ? (
                                      <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                        <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Completed</span>
                                        <span className="break-words text-sm text-foreground/80">{formatRunTimestamp(selectedRun.completed_at)}</span>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              {selectedRun.error ? (
                                <div className="mt-4 rounded-[1.2rem] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                                  <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-warning/75">Details</div>
                                  <div className="themed-scrollbar max-h-40 overflow-auto break-words whitespace-pre-wrap pr-2">
                                    {selectedRun.error}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            <div className="grid min-w-0 gap-3">
                              {selectedRun.kind === "destroy" ? (
                                <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                                  <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Destroy run</p>
                                  <p className="mt-3 text-sm leading-6 text-foreground/75">
                                    This run removes the resources managed by the {stageLabel(selectedRun.stage).toLowerCase()} stage directly from Terraform state and the target platform.
                                  </p>
                                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                                    <MetricTile label="Stage" value={stageLabel(selectedRun.stage)} />
                                    <MetricTile label="Mode" value="Destroy" />
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">{planSummaryLabel}</p>
                                      {selectedRun.kind === "apply" ? (
                                        <p className="mt-2 max-w-xl text-sm text-foreground/70">
                                          These counts come from the saved plan that this apply executed. They are not a record of what finished successfully.
                                        </p>
                                      ) : null}
                                    </div>
                                    {selectedRun.kind === "apply" && sourcePlanRun ? (
                                      <Badge className="whitespace-nowrap border-border/80 bg-card/80 text-foreground/75">
                                        Source plan {sourcePlanRun.id}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <MetricTile label="Create" value={displayedPlanSummary?.create ?? 0} />
                                    <MetricTile label="Update" value={displayedPlanSummary?.update ?? 0} />
                                    <MetricTile label="Delete" value={displayedPlanSummary?.delete ?? 0} />
                                    <MetricTile label="Replace" value={displayedPlanSummary?.replace ?? 0} />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {selectedRun.kind !== "destroy" ? (
                            <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                              <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                                {selectedRun.kind === "apply" ? "Resources in saved plan" : "Changed resources"}
                              </p>
                              <div className="themed-scrollbar mt-4 max-h-56 overflow-auto rounded-[1.2rem] border border-border/80 bg-card/85 p-4 text-sm text-foreground/80">
                                {(displayedPlanSummary?.addresses ?? []).length === 0 ? (
                                  <p>No structured plan summary yet.</p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {(displayedPlanSummary?.addresses ?? []).map((address) => (
                                      <li key={address} className="break-all">{address}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-sm text-neutral-500">Select a run.</p>
                      )}
                    </CardContent>
                  </Card>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <Card>
                      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle>Run Logs</CardTitle>
                        <Button variant={autoScrollLogs ? "secondary" : "ghost"} className="px-3 py-1.5 text-xs" onClick={() => setAutoScrollLogs((current) => !current)}>
                          Auto-scroll {autoScrollLogs ? "On" : "Off"}
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-hidden rounded-[1.2rem] border border-[#ab9f9d]/45 bg-[#f5f1fb] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                          <div className="flex items-center justify-between gap-3 border-b border-[#ab9f9d]/35 bg-[#dddbf1]/72 px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-[#383f51]/78">
                            <span>{selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}` : "No run selected"}</span>
                            <span>{selectedRunLogs.length} lines</span>
                          </div>
                          <div ref={logsViewportRef} className="themed-scrollbar max-h-[32rem] overflow-auto p-4 font-mono text-xs text-[#383f51]">
                            {selectedRunLogs.length > 0 ? (
                              <div className="space-y-2.5">
                                {selectedRunLogs.map((line, index) => (
                                  (() => {
                                    const entry = parseLogLine(line);
                                    return (
                                      <div key={`${index}-${line}`} className="rounded-[1rem] border border-[#ab9f9d]/32 bg-white/78 px-3 py-2.5 shadow-[0_10px_24px_rgba(56,63,81,0.06)]">
                                          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em]">
                                            <span className="rounded-full border border-[#3c4f76]/18 bg-[#3c4f76]/10 px-2 py-1 text-[#3c4f76]">
                                              {index + 1}
                                            </span>
                                            {entry.level ? (
                                              <span className={`rounded-full border px-2 py-1 ${logLevelTone(entry.level)}`}>{entry.level}</span>
                                            ) : null}
                                            {entry.source ? <span className="text-[#3c4f76]/82">{entry.source}</span> : null}
                                            {entry.address ? <span className="break-all text-[#383f51]/62">{entry.address}</span> : null}
                                            {entry.timestamp ? <span className="text-[#383f51]/58">{entry.timestamp}</span> : null}
                                          </div>
                                          <p className="mt-2 break-words whitespace-pre-wrap font-sans text-sm leading-6 text-[#383f51]">
                                            {entry.message}
                                          </p>
                                          {entry.detail ? (
                                            <p className="mt-2 break-words whitespace-pre-wrap font-sans text-xs leading-5 text-[#3c4f76]/82">
                                              {entry.detail}
                                            </p>
                                          ) : null}
                                      </div>
                                    );
                                  })()
                                ))}
                              </div>
                            ) : (
                              <p className="text-[#383f51]/62">No logs yet.</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Terraform Outputs</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="themed-scrollbar max-h-[32rem] overflow-auto rounded-[1.2rem] border border-border/80 bg-card/85 p-4 font-mono text-xs text-foreground/80">
                          {outputs ? prettyPrint(outputs) : "No outputs available."}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "settings" ? (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Cluster Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-6 text-neutral-400">
                      Read-only cluster identity and environment metadata from the shared Terraform configuration.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <ReadOnlyField label="Project" value={config.project_name} />
                      <ReadOnlyField label="Environment" value={config.environment} />
                      <ReadOnlyField label="Cluster name" value={config.cluster_name} />
                      <ReadOnlyField label="Kubernetes version" value={config.kubernetes_version} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="flex h-[22rem] flex-col overflow-hidden">
                  <CardHeader>
                    <CardTitle>Admin Access</CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">ARNs ({config.cluster_admin_principal_arns.length})</p>
                      <Button
                        variant="ghost"
                        type="button"
                        className="h-9 w-9 rounded-full px-0 text-xl leading-none"
                        onClick={addClusterAdminArn}
                      >
                        +
                      </Button>
                    </div>
                    <div className="themed-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
                      <div className="grid gap-2">
                        {config.cluster_admin_principal_arns.map((arn, index) => (
                          <div key={`${arn}-${index}`} className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
                            <Input
                              value={arn}
                              onChange={(event) => updateClusterAdminArn(index, event.target.value)}
                              placeholder="arn:aws:iam::123456789012:role/example"
                            />
                            <Button variant="danger" type="button" onClick={() => removeClusterAdminArn(index)}>
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
        </div>
            </div>
          </CardContent>
        </Card>

        <Modal title="Edit Subject" open={isSubjectModalOpen && Boolean(selectedSubject)} onClose={() => setIsSubjectModalOpen(false)}>
          {selectedSubject ? (
            <div className="grid gap-4">
              <div className="grid gap-3 xl:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>Namespace</span>
                  <Input value={selectedSubjectKey} onChange={(event) => renameSubject(selectedSubjectKey, event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Tier</span>
                  <Input
                    value={selectedSubject.tier ?? ""}
                    onChange={(event) => updateSelectedSubject((current) => ({ ...current, tier: event.target.value }))}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span>Description</span>
                <Input
                  value={selectedSubject.description ?? ""}
                  onChange={(event) => updateSelectedSubject((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <KeyValueEditor
                label="Labels"
                value={selectedSubject.labels}
                onChange={(labels) => updateSelectedSubject((current) => ({ ...current, labels }))}
                addLabel="Add label"
              />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                <label className="grid gap-1 text-sm">
                  <span>Pods</span>
                  <Input
                    value={selectedSubject.resource_quota?.pods ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: { ...current.resource_quota, pods: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>CPU request</span>
                  <Input
                    value={selectedSubject.resource_quota?.requests_cpu ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: { ...current.resource_quota, requests_cpu: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Memory request</span>
                  <Input
                    value={selectedSubject.resource_quota?.requests_memory ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: { ...current.resource_quota, requests_memory: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>CPU limit</span>
                  <Input
                    value={selectedSubject.resource_quota?.limits_cpu ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: { ...current.resource_quota, limits_cpu: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Memory limit</span>
                  <Input
                    value={selectedSubject.resource_quota?.limits_memory ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: { ...current.resource_quota, limits_memory: event.target.value },
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal title="Edit App" open={isAppModalOpen && Boolean(selectedApp)} onClose={() => setIsAppModalOpen(false)}>
          {selectedApp ? (
            <div className="grid gap-6">
              <div className="grid gap-3 xl:grid-cols-3">
                <label className="grid gap-1 text-sm">
                  <span>Name</span>
                  <Input value={selectedApp.name} onChange={(event) => updateSelectedApp((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Namespace</span>
                  <select
                    className="w-full rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                    value={selectedApp.namespace}
                    onChange={(event) => updateSelectedApp((current) => ({ ...current, namespace: event.target.value }))}
                  >
                    {subjectKeys.map((subjectKey) => (
                      <option key={subjectKey} value={subjectKey}>
                        {subjectKey}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Replicas</span>
                  <Input
                    type="number"
                    min={1}
                    value={String(selectedApp.replicas ?? 1)}
                    onChange={(event) => updateSelectedApp((current) => ({ ...current, replicas: Number(event.target.value) }))}
                  />
                </label>
              </div>

              <KeyValueEditor
                label="Pod labels"
                value={selectedApp.pod_labels}
                onChange={(pod_labels) => updateSelectedApp((current) => ({ ...current, pod_labels }))}
                addLabel="Add label"
              />

              <div className="rounded-2xl border border-border p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">Service</p>
                  <label className="flex items-center gap-2 text-sm text-neutral-600">
                    <input
                      type="checkbox"
                      checked={selectedApp.service?.enabled ?? true}
                      onChange={(event) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          service: { ...current.service, enabled: event.target.checked },
                        }))
                      }
                    />
                    Enabled
                  </label>
                </div>
                <div className="grid gap-3 xl:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    <span>Type</span>
                    <Input
                      value={selectedApp.service?.type ?? "ClusterIP"}
                      onChange={(event) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          service: { ...current.service, type: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Port</span>
                    <Input
                      type="number"
                      value={String(selectedApp.service?.port ?? 8080)}
                      onChange={(event) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          service: { ...current.service, port: Number(event.target.value) },
                        }))
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Target port</span>
                    <Input
                      type="number"
                      value={String(selectedApp.service?.target_port ?? selectedApp.service?.port ?? 8080)}
                      onChange={(event) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          service: { ...current.service, target_port: Number(event.target.value) },
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="mt-4">
                  <KeyValueEditor
                    label="Service annotations"
                    value={selectedApp.service?.annotations}
                    onChange={(annotations) =>
                      updateSelectedApp((current) => ({
                        ...current,
                        service: { ...current.service, annotations },
                      }))
                    }
                    addLabel="Add annotation"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">Ingress</p>
                  <label className="flex items-center gap-2 text-sm text-neutral-600">
                    <input
                      type="checkbox"
                      checked={selectedApp.ingress?.enabled ?? false}
                      onChange={(event) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          ingress: { ...current.ingress, enabled: event.target.checked } as IngressConfig,
                        }))
                      }
                    />
                    Enabled
                  </label>
                </div>
                <div className="grid gap-3 xl:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    <span>Class</span>
                    <Input
                      value={selectedApp.ingress?.class_name ?? "nginx"}
                      onChange={(event) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          ingress: { ...current.ingress, class_name: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Host</span>
                    <Input
                      value={selectedApp.ingress?.host ?? ""}
                      onChange={(event) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          ingress: { ...current.ingress, host: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Path</span>
                    <Input
                      value={selectedApp.ingress?.path ?? "/"}
                      onChange={(event) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          ingress: { ...current.ingress, path: event.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="mt-4">
                  <KeyValueEditor
                    label="Ingress annotations"
                    value={selectedApp.ingress?.annotations}
                    onChange={(annotations) =>
                      updateSelectedApp((current) => ({
                        ...current,
                        ingress: { ...current.ingress, annotations },
                      }))
                    }
                    addLabel="Add annotation"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">ConfigMap</p>
                  <label className="flex items-center gap-2 text-sm text-neutral-600">
                    <input
                      type="checkbox"
                      checked={selectedApp.config_map?.enabled ?? false}
                      onChange={(event) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          config_map: { ...current.config_map, enabled: event.target.checked },
                        }))
                      }
                    />
                    Enabled
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  <span>Mount path</span>
                  <Input
                    value={selectedApp.config_map?.mount_path ?? "/usr/share/nginx/html"}
                    onChange={(event) =>
                      updateSelectedApp((current) => ({
                        ...current,
                        config_map: { ...current.config_map, mount_path: event.target.value },
                      }))
                    }
                  />
                </label>
                <div className="mt-4">
                  <KeyValueEditor
                    label="ConfigMap data"
                    value={selectedApp.config_map?.data}
                    onChange={(data) =>
                      updateSelectedApp((current) => ({
                        ...current,
                        config_map: { ...current.config_map, data },
                      }))
                    }
                    addLabel="Add file"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">Containers</p>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() =>
                      updateSelectedApp((current) => ({
                        ...current,
                        containers: [...(current.containers ?? []), emptyContainer()],
                      }))
                    }
                  >
                    Add container
                  </Button>
                </div>
                <div className="grid gap-4">
                  {(selectedApp.containers ?? []).map((container, index) => (
                    <ContainerEditor
                      key={`${container.name}-${index}`}
                      index={index}
                      container={container}
                      onChange={(nextContainer) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          containers: (current.containers ?? []).map((item, itemIndex) => (itemIndex === index ? nextContainer : item)),
                        }))
                      }
                      onRemove={() =>
                        updateSelectedApp((current) => ({
                          ...current,
                          containers: (current.containers ?? []).filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">Volumes</p>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() =>
                      updateSelectedApp((current) => ({
                        ...current,
                        volumes: [...(current.volumes ?? []), emptyVolume()],
                      }))
                    }
                  >
                    Add volume
                  </Button>
                </div>
                <div className="grid gap-3">
                  {(selectedApp.volumes ?? []).length === 0 ? <p className="text-sm text-neutral-500">No volumes.</p> : null}
                  {(selectedApp.volumes ?? []).map((volume, index) => {
                    const volumeType = volume.empty_dir ? "empty_dir" : volume.secret_name ? "secret" : volume.config_map_name ? "config_map" : "empty_dir";
                    return (
                      <div key={`${volume.name}-${index}`} className="grid gap-3 rounded-2xl border border-border bg-muted/60 p-4 2xl:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_auto]">
                        <Input
                          value={volume.name}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              volumes: (current.volumes ?? []).map((item, itemIndex) =>
                                itemIndex === index ? { ...item, name: event.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="Volume name"
                        />
                        <select
                          className="w-full rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                          value={volumeType}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              volumes: (current.volumes ?? []).map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      name: item.name,
                                      empty_dir: event.target.value === "empty_dir" ? true : undefined,
                                      secret_name: event.target.value === "secret" ? item.secret_name ?? "app-secret" : undefined,
                                      config_map_name: event.target.value === "config_map" ? item.config_map_name ?? "app-config" : undefined,
                                    }
                                  : item,
                              ),
                            }))
                          }
                        >
                          <option value="empty_dir">emptyDir</option>
                          <option value="secret">Secret</option>
                          <option value="config_map">ConfigMap</option>
                        </select>
                        <Input
                          value={volume.secret_name ?? volume.config_map_name ?? ""}
                          placeholder={volumeType === "secret" ? "Secret name" : volumeType === "config_map" ? "ConfigMap name" : "No extra value"}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              volumes: (current.volumes ?? []).map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      empty_dir: volumeType === "empty_dir" ? true : undefined,
                                      secret_name: volumeType === "secret" ? event.target.value : undefined,
                                      config_map_name: volumeType === "config_map" ? event.target.value : undefined,
                                    }
                                  : item,
                              ),
                            }))
                          }
                          disabled={volumeType === "empty_dir"}
                        />
                        <Button
                          variant="danger"
                          type="button"
                          onClick={() =>
                            updateSelectedApp((current) => ({
                              ...current,
                              volumes: (current.volumes ?? []).filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">Network policy</p>
                  <Badge>{selectedApp.namespace}</Badge>
                </div>
                <div className="grid gap-6">
                  <NetworkRulesEditor
                    direction="ingress"
                    value={selectedApp.network_policy?.ingress}
                    onChange={(ingress) =>
                      updateSelectedApp((current) => ({
                        ...current,
                        network_policy: { ...current.network_policy, ingress },
                      }))
                    }
                  />
                  <NetworkRulesEditor
                    direction="egress"
                    value={selectedApp.network_policy?.egress}
                    onChange={(egress) =>
                      updateSelectedApp((current) => ({
                        ...current,
                        network_policy: { ...current.network_policy, egress },
                      }))
                    }
                  />
                </div>
              </div>

            </div>
          ) : null}
        </Modal>

      </div>
    </div>
  );
}
