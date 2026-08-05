# Platform Prerequisites Terraform Stage

This stage owns Kubernetes API extensions that must exist before Terraform can
plan the shared platform add-ons.

## Ownership

Currently this stage owns the pinned Gateway API standard CRDs. It must run
after `core` has created the EKS cluster and before `platform` is planned.

The stage intentionally contains no Helm releases, namespaces, workloads, or
custom resources.

## Direct Terraform Usage

```bash
terraform init -reconfigure -backend-config=backend.hcl
terraform plan \
  -var-file="../../variables/lab/platform-capabilities.tfvars.json"
terraform apply \
  -var-file="../../variables/lab/platform-capabilities.tfvars.json"
```

The repository workflow and `./tfstage platform apply` run this prerequisite
stage automatically. Operators should normally use the platform workflow
instead of applying this stage independently.

Existing installations that used the former in-platform CRD resource require
a one-time state migration. A clean cluster does not require this step.

## State migration for existing installations

The old implementation stored these resources in the `platform` state under
`module.addons.kubernetes_manifest.gateway_api_standard`. Before the first
deployment after this change, move those resource instances to this stage's
state. The instance keys are intentionally unchanged to make that move
possible without changing the Kubernetes object addresses.

Use a state backup and perform the move with the Terraform state migration
procedure appropriate for the configured backend. For each key shown by:

```bash
terraform -chdir=infrastructure/stages/platform state list \
  | rg 'module.addons.kubernetes_manifest.gateway_api_standard'
```

move:

```text
module.addons.kubernetes_manifest.gateway_api_standard["<key>"]
→ kubernetes_manifest.gateway_api_standard["<key>"]
```

Do not run the first platform plan until the old instances have been moved;
otherwise Terraform will plan to remove the CRDs from the platform state.

CRD deletion can delete all custom resources of that type; do not destroy the
old resources as part of migration.
