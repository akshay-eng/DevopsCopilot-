import subprocess
from langchain_core.tools import tool


def _run_kubectl(args: list[str], timeout: int = 30, stdin_input: str = None) -> str:
    """Run a kubectl command and return stdout."""
    cmd = ["kubectl"] + args
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            input=stdin_input,
        )
        output = result.stdout.strip()
        if result.returncode != 0:
            stderr = result.stderr.strip()
            if output:
                return f"{output}\nSTDERR: {stderr}"
            return f"ERROR: {stderr}"
        if len(output) > 10000:
            output = output[:10000] + "\n... (output truncated — use more specific queries)"
        return output or "(no output)"
    except subprocess.TimeoutExpired:
        return f"ERROR: Command timed out after {timeout}s"
    except FileNotFoundError:
        return "ERROR: kubectl not found. Ensure kubectl is installed and in PATH."


@tool
def kubectl_get(resource: str, namespace: str = "", name: str = "", output_format: str = "wide", label_selector: str = "") -> str:
    """Get Kubernetes resources.

    Args:
        resource: Resource type (pods, deployments, services, nodes, namespaces, configmaps, secrets, ingress, pvc, etc.)
        namespace: Kubernetes namespace. Leave empty for all namespaces.
        name: Specific resource name. Leave empty to list all.
        output_format: Output format — 'wide', 'yaml', 'json', 'name'. Default 'wide'.
        label_selector: Label selector filter, e.g. 'app=nginx,tier=frontend'
    """
    args = ["get", resource]
    if namespace:
        args += ["-n", namespace]
    elif resource not in ("nodes", "namespaces", "clusterroles", "clusterrolebindings", "storageclasses", "persistentvolumes"):
        args += ["--all-namespaces"]
    if name:
        args.append(name)
    args += ["-o", output_format]
    if label_selector:
        args += ["-l", label_selector]
    return _run_kubectl(args)


@tool
def kubectl_describe(resource: str, name: str, namespace: str = "default") -> str:
    """Describe a Kubernetes resource in detail. Shows events, conditions, and full spec.

    Args:
        resource: Resource type (pod, deployment, service, node, etc.)
        name: Name of the resource
        namespace: Kubernetes namespace (default: 'default')
    """
    args = ["describe", resource, name, "-n", namespace]
    return _run_kubectl(args, timeout=15)


@tool
def kubectl_logs(pod: str, namespace: str = "default", container: str = "", tail: int = 100, since: str = "", previous: bool = False) -> str:
    """Get logs from a pod.

    Args:
        pod: Pod name
        namespace: Kubernetes namespace
        container: Specific container name (for multi-container pods)
        tail: Number of lines from the end (default 100)
        since: Time duration to look back, e.g. '1h', '30m', '5s'
        previous: If True, get logs from the previous terminated container
    """
    args = ["logs", pod, "-n", namespace, f"--tail={tail}"]
    if container:
        args += ["-c", container]
    if since:
        args += [f"--since={since}"]
    if previous:
        args.append("--previous")
    return _run_kubectl(args, timeout=15)


@tool
def kubectl_top(resource: str, namespace: str = "", name: str = "") -> str:
    """Show resource usage (CPU/memory) for pods or nodes.

    Args:
        resource: 'pods' or 'nodes'
        namespace: Kubernetes namespace (for pods). Leave empty for all namespaces.
        name: Specific resource name to filter
    """
    args = ["top", resource]
    if namespace:
        args += ["-n", namespace]
    elif resource == "pods":
        args += ["--all-namespaces"]
    if name:
        args.append(name)
    return _run_kubectl(args, timeout=15)


@tool
def kubectl_apply(yaml_content: str) -> str:
    """Apply a YAML manifest to the cluster. Pass the full YAML content as a string.

    Args:
        yaml_content: The YAML manifest content to apply
    """
    result = subprocess.run(
        ["kubectl", "apply", "-f", "-"],
        input=yaml_content,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        return f"ERROR: {result.stderr.strip()}"
    return result.stdout.strip()


@tool
def kubectl_delete(resource: str, name: str, namespace: str = "default", force: bool = False) -> str:
    """Delete a Kubernetes resource.

    Args:
        resource: Resource type (pod, deployment, service, etc.)
        name: Name of the resource
        namespace: Kubernetes namespace
        force: If True, force delete (grace period 0)
    """
    PROTECTED_NAMESPACES = ["kube-system", "kube-public", "kube-node-lease"]
    if resource == "namespace" and name in PROTECTED_NAMESPACES:
        return f"BLOCKED: Cannot delete protected namespace '{name}'"

    args = ["delete", resource, name, "-n", namespace]
    if force:
        args += ["--grace-period=0", "--force"]
    return _run_kubectl(args, timeout=60)


@tool
def kubectl_exec(pod: str, namespace: str, command: str, container: str = "") -> str:
    """Execute a command inside a running pod.

    Args:
        pod: Pod name
        namespace: Kubernetes namespace
        command: Shell command to run inside the pod
        container: Specific container name (for multi-container pods)
    """
    BLOCKED = ["rm -rf /", "rm -rf ~", "shutdown", "reboot", "mkfs", "dd if="]
    for pattern in BLOCKED:
        if pattern in command:
            return f"BLOCKED: Command contains dangerous pattern '{pattern}'"

    args = ["exec", pod, "-n", namespace]
    if container:
        args += ["-c", container]
    args += ["--", "sh", "-c", command]
    return _run_kubectl(args, timeout=30)


@tool
def kubectl_scale(resource: str, name: str, replicas: int, namespace: str = "default") -> str:
    """Scale a deployment or statefulset to a specific number of replicas.

    Args:
        resource: 'deployment' or 'statefulset'
        name: Name of the resource
        replicas: Desired number of replicas
        namespace: Kubernetes namespace
    """
    args = ["scale", f"{resource}/{name}", f"--replicas={replicas}", "-n", namespace]
    return _run_kubectl(args)


@tool
def kubectl_rollout(action: str, resource: str, name: str, namespace: str = "default") -> str:
    """Manage rollouts for deployments and statefulsets.

    Args:
        action: 'status', 'restart', 'undo', or 'history'
        resource: 'deployment' or 'statefulset'
        name: Name of the resource
        namespace: Kubernetes namespace
    """
    if action not in ("status", "restart", "undo", "history"):
        return f"ERROR: Invalid action '{action}'. Use: status, restart, undo, history"
    args = ["rollout", action, f"{resource}/{name}", "-n", namespace]
    return _run_kubectl(args)
