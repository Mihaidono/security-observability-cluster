resource "aws_iam_policy" "cilium_operator" {
  name        = "${var.project_name}-${var.environment}-cilium-operator"
  description = "Least-privilege EC2 permissions for the Cilium operator in ENI mode."
  policy      = data.aws_iam_policy_document.cilium_operator.json
}

resource "aws_iam_role" "cilium_operator" {
  name               = "${var.project_name}-${var.environment}-cilium-operator"
  assume_role_policy = data.aws_iam_policy_document.cilium_operator_assume_role.json
  description        = "IRSA role for the Cilium operator running in kube-system."
}

resource "aws_iam_role_policy_attachment" "cilium_operator" {
  role       = aws_iam_role.cilium_operator.name
  policy_arn = aws_iam_policy.cilium_operator.arn
}
