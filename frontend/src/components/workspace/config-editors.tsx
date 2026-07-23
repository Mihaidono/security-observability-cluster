import { Input } from "../ui/input";
import { Button } from "../ui/button";
import type {
  ContainerConfig,
  NetworkPolicyPeer,
  NetworkPolicyPort,
  NetworkPolicyRule,
  ProbeConfig,
  VolumeMountConfig,
} from "../../lib/types";

type Direction = "ingress" | "egress";

function classNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
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
    Object.entries(value ?? {}).filter(
      ([key, entryValue]) =>
        key.trim() !== "" || String(entryValue).trim() !== "",
    ),
  );
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

export function KeyValueEditor({
  label,
  value,
  onChange,
  addLabel = "Add row",
  rowsClassName,
}: {
  label: string;
  value?: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  addLabel?: string;
  rowsClassName?: string;
}) {
  const entries = Object.entries(value ?? {});

  function updateRow(index: number, nextKey: string, nextValue: string) {
    const rows = entries.map(([key, currentValue], rowIndex) =>
      rowIndex === index ? [nextKey, nextValue] : [key, currentValue],
    );
    onChange(
      Object.fromEntries(
        rows.filter(
          ([key, currentValue]) =>
            key.trim() !== "" || currentValue.trim() !== "",
        ),
      ),
    );
  }

  function addRow() {
    const nextKey = uniqueName(
      "key",
      entries.map(([key]) => key),
    );
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {label}
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={addRow}
        >
          {addLabel}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">No entries.</p>
      ) : null}
      <div className={classNames("grid gap-2", rowsClassName)}>
        {entries.map(([entryKey, entryValue], index) => (
          <div
            key={`kv-row-${index}`}
            className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <Input
              value={entryKey}
              onChange={(event) =>
                updateRow(index, event.target.value, entryValue)
              }
              placeholder="Key"
            />
            <Input
              value={entryValue}
              onChange={(event) =>
                updateRow(index, entryKey, event.target.value)
              }
              placeholder="Value"
            />
            <Button
              variant="danger"
              type="button"
              onClick={() => removeRow(index)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StringListEditor({
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
    const next = items.map((item, itemIndex) =>
      itemIndex === index ? nextValue : item,
    );
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {label}
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={addItem}
        >
          {addLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">No entries.</p>
      ) : null}
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div
            key={`string-row-${index}`}
            className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto]"
          >
            <Input
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
            />
            <Button
              variant="danger"
              type="button"
              onClick={() => removeItem(index)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProbeEditor({
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
            onChange={(event) =>
              onChange({ ...probe, enabled: event.target.checked })
            }
          />
          Enabled
        </label>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>Path</span>
          <Input
            value={probe.path ?? ""}
            onChange={(event) =>
              onChange({ ...probe, path: event.target.value })
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Port</span>
          <Input
            type="number"
            value={String(probe.port ?? 8080)}
            onChange={(event) =>
              onChange({ ...probe, port: Number(event.target.value) })
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Initial delay</span>
          <Input
            type="number"
            value={String(probe.initial_delay_seconds ?? 5)}
            onChange={(event) =>
              onChange({
                ...probe,
                initial_delay_seconds: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Period</span>
          <Input
            type="number"
            value={String(probe.period_seconds ?? 10)}
            onChange={(event) =>
              onChange({ ...probe, period_seconds: Number(event.target.value) })
            }
          />
        </label>
      </div>
    </div>
  );
}

export function VolumeMountEditor({
  value,
  onChange,
}: {
  value?: VolumeMountConfig[];
  onChange: (next: VolumeMountConfig[]) => void;
}) {
  const mounts = value ?? [];

  function updateMount(index: number, next: VolumeMountConfig) {
    onChange(
      mounts.map((mount, mountIndex) => (mountIndex === index ? next : mount)),
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Volume mounts
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() =>
            onChange([...mounts, { name: "shared-data", mount_path: "/data" }])
          }
        >
          Add mount
        </Button>
      </div>
      {mounts.length === 0 ? (
        <p className="text-sm text-neutral-500">No mounts.</p>
      ) : null}
      <div className="grid gap-2">
        {mounts.map((mount, index) => (
          <div
            key={`mount-row-${index}`}
            className="grid gap-2 rounded-2xl border border-border bg-muted/60 p-3"
          >
            <div className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_160px_auto]">
              <Input
                value={mount.name}
                onChange={(event) =>
                  updateMount(index, { ...mount, name: event.target.value })
                }
                placeholder="Volume name"
              />
              <Input
                value={mount.mount_path}
                onChange={(event) =>
                  updateMount(index, {
                    ...mount,
                    mount_path: event.target.value,
                  })
                }
                placeholder="/mount/path"
              />
              <Input
                value={mount.sub_path ?? ""}
                onChange={(event) =>
                  updateMount(index, {
                    ...mount,
                    sub_path: event.target.value || undefined,
                  })
                }
                placeholder="subPath (optional)"
              />
              <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={mount.read_only ?? true}
                  onChange={(event) =>
                    updateMount(index, {
                      ...mount,
                      read_only: event.target.checked,
                    })
                  }
                />
                Read only
              </label>
              <Button
                variant="danger"
                type="button"
                onClick={() =>
                  onChange(
                    mounts.filter((_, mountIndex) => mountIndex !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NetworkPortsEditor({
  value,
  onChange,
}: {
  value?: NetworkPolicyPort[];
  onChange: (next: NetworkPolicyPort[]) => void;
}) {
  const ports = value ?? [];

  function updatePort(index: number, next: NetworkPolicyPort) {
    onChange(
      ports.map((port, portIndex) => (portIndex === index ? next : port)),
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Ports
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() => onChange([...ports, emptyPolicyPort()])}
        >
          Add port
        </Button>
      </div>
      {ports.length === 0 ? (
        <p className="text-sm text-neutral-500">No ports.</p>
      ) : null}
      <div className="grid gap-2">
        {ports.map((port, index) => (
          <div
            key={`port-row-${index}`}
            className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_160px_auto]"
          >
            <Input
              type="number"
              value={String(port.port)}
              onChange={(event) =>
                updatePort(index, { ...port, port: Number(event.target.value) })
              }
            />
            <Input
              value={port.protocol ?? "TCP"}
              onChange={(event) =>
                updatePort(index, { ...port, protocol: event.target.value })
              }
            />
            <Button
              variant="danger"
              type="button"
              onClick={() =>
                onChange(ports.filter((_, portIndex) => portIndex !== index))
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NetworkPeersEditor({
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
    onChange(
      peers.map((peer, peerIndex) => (peerIndex === index ? next : peer)),
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {direction === "ingress" ? "Sources" : "Destinations"}
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() => onChange([...peers, emptyPolicyPeer()])}
        >
          Add peer
        </Button>
      </div>
      {peers.length === 0 ? (
        <p className="text-sm text-neutral-500">No peers.</p>
      ) : null}
      <div className="grid gap-3">
        {peers.map((peer, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border bg-muted/60 p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">Peer {index + 1}</p>
              <Button
                variant="danger"
                type="button"
                onClick={() =>
                  onChange(peers.filter((_, peerIndex) => peerIndex !== index))
                }
              >
                Remove
              </Button>
            </div>
            <div className="grid gap-4">
              <KeyValueEditor
                label="Pod selector"
                value={peer.pod_selector ?? {}}
                onChange={(next) =>
                  updatePeer(index, {
                    ...peer,
                    pod_selector: compactRecord(next),
                  })
                }
                addLabel="Add label"
              />
              <KeyValueEditor
                label="Namespace selector"
                value={peer.namespace_selector ?? {}}
                onChange={(next) =>
                  updatePeer(index, {
                    ...peer,
                    namespace_selector: compactRecord(next),
                  })
                }
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
                      ip_block:
                        event.target.value.trim() === ""
                          ? undefined
                          : { cidr: event.target.value },
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

export function NetworkRulesEditor({
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
    onChange(
      rules.map((rule, ruleIndex) => (ruleIndex === index ? next : rule)),
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {direction === "ingress" ? "Ingress rules" : "Egress rules"}
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() => onChange([...rules, emptyPolicyRule(direction)])}
        >
          Add rule
        </Button>
      </div>
      {rules.length === 0 ? (
        <p className="text-sm text-neutral-500">No rules.</p>
      ) : null}
      <div className="grid gap-4">
        {rules.map((rule, index) => (
          <div key={index} className="rounded-2xl border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">Rule {index + 1}</p>
              <Button
                variant="danger"
                type="button"
                onClick={() =>
                  onChange(rules.filter((_, ruleIndex) => ruleIndex !== index))
                }
              >
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

export function ContainerEditor({
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
            <Input
              value={container.name}
              onChange={(event) =>
                onChange({ ...container, name: event.target.value })
              }
            />
          </label>
          <label className="grid gap-1 text-sm xl:col-span-2">
            <span>Image</span>
            <Input
              value={container.image}
              onChange={(event) =>
                onChange({ ...container, image: event.target.value })
              }
            />
          </label>
        </div>

        <div className="grid gap-3 2xl:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span>Port</span>
            <Input
              type="number"
              value={String(container.port ?? 8080)}
              onChange={(event) =>
                onChange({ ...container, port: Number(event.target.value) })
              }
            />
          </label>
          <StringListEditor
            label="Command"
            value={container.command}
            onChange={(command) => onChange({ ...container, command })}
            addLabel="Add command"
          />
          <StringListEditor
            label="Args"
            value={container.args}
            onChange={(args) => onChange({ ...container, args })}
            addLabel="Add arg"
          />
        </div>

        <KeyValueEditor
          label="Environment variables"
          value={container.env ?? {}}
          onChange={(env) =>
            onChange({ ...container, env: compactRecord(env) })
          }
          addLabel="Add env"
        />

        <StringListEditor
          label="Secret env sources"
          value={container.env_from_secret_names}
          onChange={(env_from_secret_names) =>
            onChange({ ...container, env_from_secret_names })
          }
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
            <span>Image pull policy</span>
            <Input
              value={container.image_pull_policy ?? "IfNotPresent"}
              onChange={(event) =>
                onChange({
                  ...container,
                  image_pull_policy: event.target.value,
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CPU request</span>
            <Input
              value={container.resources?.requests_cpu ?? ""}
              onChange={(event) =>
                onChange({
                  ...container,
                  resources: {
                    ...container.resources,
                    requests_cpu: event.target.value,
                  },
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
                  resources: {
                    ...container.resources,
                    requests_memory: event.target.value,
                  },
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
                  resources: {
                    ...container.resources,
                    limits_cpu: event.target.value,
                  },
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
                  resources: {
                    ...container.resources,
                    limits_memory: event.target.value,
                  },
                })
              }
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span>Run as user</span>
            <Input
              type="number"
              value={String(container.security_context?.run_as_user ?? 101)}
              onChange={(event) =>
                onChange({
                  ...container,
                  security_context: {
                    ...container.security_context,
                    run_as_user: Number(event.target.value),
                  },
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Run as group</span>
            <Input
              type="number"
              value={String(container.security_context?.run_as_group ?? 101)}
              onChange={(event) =>
                onChange({
                  ...container,
                  security_context: {
                    ...container.security_context,
                    run_as_group: Number(event.target.value),
                  },
                })
              }
            />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={
                container.security_context?.read_only_root_filesystem ?? false
              }
              onChange={(event) =>
                onChange({
                  ...container,
                  security_context: {
                    ...container.security_context,
                    read_only_root_filesystem: event.target.checked,
                  },
                })
              }
            />
            Read-only root filesystem
          </label>
        </div>

        <VolumeMountEditor
          value={container.volume_mounts}
          onChange={(volume_mounts) =>
            onChange({ ...container, volume_mounts })
          }
        />
      </div>
    </div>
  );
}
