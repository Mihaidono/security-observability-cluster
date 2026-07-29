# Terraform Variable Sets

Committed stage inputs live under `infrastructure/variables/<environment>/`.

Current layout:

- `bootstrap.tfvars.json`
- `core.tfvars.json`
- `platform.tfvars.json`
- `policies.tfvars.json`
- `applications.tfvars.json`
- `cluster-admins.override.tfvars.json.example`

Usage model:

- committed baseline configuration comes from this directory
- backend-generated runtime overlays live under `backend/state/tfvars/`
- CI writes temporary override files and passes them explicitly with `-var-file`
- local cluster-admin ARNs should go into an untracked `cluster-admins.override.tfvars.json` file based on the example template

Terraform is intentionally no longer expected to auto-load stage-local `*.auto.tfvars.json` files.

## Why Some Variables Repeat

Some values repeat across multiple stage files on purpose:

- `cluster_admin_principal_arns` appears in every stage that needs the same access context or readiness fingerprint
- `analysis_subjects` appears in `policies` and `applications` because both stages validate or render namespace-scoped resources
- `project_name`, `environment`, `region`, and `cluster_name` repeat because each Terraform root is standalone
- `project_name`, `environment`, and `region` also appear in `bootstrap` because that root is standalone too

This is not a Terraform requirement for all projects. It is a consequence of keeping each stage independently runnable.

## Cluster Admin Override

`cluster-admins.override.tfvars.json.example` is a local template, not a committed source of truth.

Use it when you run Terraform locally and need to inject your own cluster-admin IAM principals without editing the committed baseline:

```json
{
  "cluster_admin_principal_arns": [
    "arn:aws:iam::401262697743:role/aws-reserved/sso.amazonaws.com/eu-central-1/AWSReservedSSO_AdministratorAccess_ed0064f77475eaad",
    "arn:aws:iam::401262697743:role/GitHubActionsObservabilityCluster"
  ]
}
```

This does not replace GitHub variables.

- local Terraform uses the untracked override file
- GitHub Actions injects the same value through CI-generated temporary tfvars files
- both paths feed the same Terraform variable, but in different execution environments

## Local Command Helper

Use `./tfstage` from the repository root to avoid typing the `-var-file` paths manually:

```bash
./tfstage bootstrap plan
./tfstage core plan
./tfstage platform destroy
./tfstage policies plan
./tfstage applications destroy
```
