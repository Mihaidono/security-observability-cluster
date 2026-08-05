# IAM Policies

This document describes the AWS IAM policies used by the GitHub Actions workflows in this repository.

## Scope

Two separate permission sets are used:

- infrastructure deployment permissions for Terraform
- ECR image publish permissions for backend and frontend images

Keep them separate. The image publish workflow should not be able to provision infrastructure, and the infrastructure workflow should not need broad image-push permissions beyond project needs.

## GitHub Variables

The workflows consume these GitHub repository variables:

- `AWS_REGION`
- `AWS_ROLE_TO_ASSUME`
- `BACKEND_ECR_REPOSITORY`
- `FRONTEND_ECR_REPOSITORY`
- `CLUSTER_ADMIN_USER_ARNS_JSON`

`AWS_ROLE_TO_ASSUME` should point at the infrastructure deployment role:

```text
arn:aws:iam::401262697743:role/GitHubActionsObservabilityCluster
```

`CLUSTER_ADMIN_USER_ARNS_JSON` should contain valid IAM principal ARNs for EKS access entries. For this repository, that typically includes:

- the GitHub deployment role
- the AWS IAM Identity Center administrator role with its full path

Example:

```json
[
  "arn:aws:iam::401262697743:role/GitHubActionsObservabilityCluster",
  "arn:aws:iam::401262697743:role/aws-reserved/sso.amazonaws.com/eu-central-1/AWSReservedSSO_AdministratorAccess_ed0064f77475eaad"
]
```

## Infrastructure Deployment Policy

The infrastructure deployment policy is not committed as a canonical repo artifact. Keep the applied AWS policy in IAM as the source of truth, and use this document as the tracked reference for required permissions and scope.

This policy is attached to:

```text
arn:aws:iam::401262697743:role/GitHubActionsObservabilityCluster
```

It is used by the `deploy-infrastructure` GitHub Actions workflow to run Terraform against:

- `infrastructure/stages/bootstrap`
- `infrastructure/stages/core`
- `infrastructure/stages/platform-prerequisites`
- `infrastructure/stages/platform`

### What it needs to do

- read and write Terraform state in S3
- create and update EKS, VPC, load balancer, autoscaling, and RDS resources
- create and manage IAM roles and IAM policies created by the EKS module
- create and discover the EKS OIDC provider for IRSA
- create and tag KMS keys used by EKS
- create EKS access entries for cluster administrators
- read AWS service-linked roles used by EKS, node groups, ELB, autoscaling, and spot

### Notes on current scope

- The policy is intentionally broad in service coverage because the Terraform stages provision real AWS infrastructure.
- IAM resources are still scoped by account and naming prefix where possible.
- Some list operations use `Resource: "*"` because AWS does not support resource-level scoping for them.

### Validation

After updating the policy:

1. rerun the `deploy-infrastructure` workflow
2. confirm `bootstrap`, `core`, `platform-prerequisites`, and `platform` complete
3. if AWS returns `AccessDenied`, add only the missing action shown in the error

Useful checks:

```bash
gh variable list
aws sts get-caller-identity
aws iam get-role --role-name GitHubActionsObservabilityCluster
```

## ECR Publish Policy

The image publish role can be much narrower than the infrastructure role.

Use this policy for the workflows that build and push backend and frontend images:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeRepositories",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:eu-north-1:401262697743:repository/isolens-*"
    }
  ]
}
```

### Why this split exists

- `ecr:GetAuthorizationToken` must remain `Resource: "*"`
- image push actions are scoped to repositories matching `isolens-*`
- this policy does not allow Terraform, EKS, IAM, or database changes

### Validation

After attaching the policy to the image-publish role:

```bash
aws ecr describe-repositories --repository-names isolens-backend isolens-frontend --region eu-north-1
```

Then rerun the backend or frontend image publish workflow and confirm the push completes.

## Security Notes

- Do not hardcode IAM principal ARNs into Terraform when they are environment-specific. Pass them through GitHub repository variables and generate tfvars in CI.
- Keep image publish and infrastructure deploy roles separate.
- Rotate trust relationships and permissions if a role ARN was exposed outside controlled documentation or AWS configuration history.
- Prefer scoped `iam:PassRole` permissions with `iam:PassedToService` conditions.

## Related Files

- [repository-overview.md](repository-overview.md)
- [infrastructure/stages/core/main.tf](../infrastructure/stages/core/main.tf)
- [infrastructure/stages/platform/main.tf](../infrastructure/stages/platform/main.tf)
- [\.github/workflows/deploy-infrastructure.yml](../.github/workflows/deploy-infrastructure.yml)
