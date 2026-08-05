#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: infrastructure/scripts/terraform-stage.sh <stage> <terraform-subcommand> [terraform args...]

Examples:
  infrastructure/scripts/terraform-stage.sh bootstrap plan
  infrastructure/scripts/terraform-stage.sh core plan
  infrastructure/scripts/terraform-stage.sh platform-prerequisites plan
  infrastructure/scripts/terraform-stage.sh platform destroy
  infrastructure/scripts/terraform-stage.sh policies apply
  infrastructure/scripts/terraform-stage.sh applications apply backend/state/runs/<run-id>/planned.tfplan
EOF
}

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

stage="$1"
shift
subcommand="$1"
shift

case "$stage" in
  bootstrap|core|platform|policies|applications)
    ;;
  platform-prerequisites)
    ;;
  *)
    echo "Unsupported stage: $stage" >&2
    usage
    exit 1
    ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
variable_set="${ISOLENS_TERRAFORM_VARIABLE_SET:-lab}"
stage_dir="$repo_root/infrastructure/stages/$stage"
if [[ "$stage" == "platform-prerequisites" ]]; then
  baseline_tfvars="$repo_root/infrastructure/variables/$variable_set/platform-capabilities.tfvars.json"
else
  baseline_tfvars="$repo_root/infrastructure/variables/$variable_set/$stage.tfvars.json"
fi
cluster_admin_override="$repo_root/infrastructure/variables/$variable_set/cluster-admins.override.tfvars.json"
generated_overlay="$repo_root/backend/state/tfvars/$stage.tfvars.json"

if [[ ! -f "$baseline_tfvars" ]]; then
  echo "Missing baseline tfvars: $baseline_tfvars" >&2
  exit 1
fi

var_args=("-var-file=$baseline_tfvars")

if [[ "$stage" == "platform" ]]; then
  var_args+=("-var-file=$repo_root/infrastructure/variables/$variable_set/platform-capabilities.tfvars.json")
fi

if [[ -f "$cluster_admin_override" ]]; then
  var_args+=("-var-file=$cluster_admin_override")
fi

if [[ "$stage" == "policies" || "$stage" == "applications" ]]; then
  if [[ -f "$generated_overlay" ]]; then
    var_args+=("-var-file=$generated_overlay")
  elif [[ "$subcommand" != "init" && "$subcommand" != "validate" ]]; then
    echo "Missing generated overlay for $stage: $generated_overlay" >&2
    exit 1
  fi
fi

if [[ "$stage" == "platform" && "$subcommand" == "apply" && "${1:-}" != *.tfplan ]]; then
  "$0" platform-prerequisites apply "$@"
fi

terraform_args=()
if [[ "$subcommand" == "apply" && "${1:-}" == *.tfplan ]]; then
  terraform_args=("$@")
else
  terraform_args=("$@" "${var_args[@]}")
fi

cd "$stage_dir"
exec terraform "$subcommand" "${terraform_args[@]}"
