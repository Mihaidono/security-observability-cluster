locals {
  suspicious_network_binaries = [
    "/usr/bin/curl",
    "/bin/curl",
    "/usr/bin/wget",
    "/bin/wget",
    "/usr/bin/nc",
    "/bin/nc",
    "/usr/bin/busybox",
    "/bin/busybox",
  ]

  suspicious_shell_binaries = [
    "/usr/bin/bash",
    "/bin/bash",
    "/usr/bin/sh",
    "/bin/sh",
    "/usr/bin/ash",
    "/bin/ash",
    "/usr/bin/busybox",
    "/bin/busybox",
  ]
}
