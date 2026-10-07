# Trivy Operator — Vulnerability Scanning for AIOps

The **Vulnerabilities** tab and the cluster-wide vulnerability report in AIOps are
powered by [Trivy Operator](https://github.com/aquasecurity/trivy-operator). It runs
inside the target cluster, continuously scans every workload's container images, and
writes the results as `VulnerabilityReport` (and `ConfigAuditReport`) custom
resources. The AIOps backend (`authService`) reads those CRDs directly through the
Kubernetes API — nothing is pushed to us, so no credentials leave the cluster.

## 1. Install

```bash
helm repo add aqua https://aquasecurity.github.io/helm-charts/
helm repo update
helm upgrade --install trivy-operator aqua/trivy-operator \
  --namespace trivy-system --create-namespace \
  --values k8s-configs/trivy-operator/values.yaml
```

Or, if you cannot use Helm, apply the upstream static manifests:

```bash
kubectl apply -f https://raw.githubusercontent.com/aquasecurity/trivy-operator/v0.22.0/deploy/static/trivy-operator.yaml
```

## 2. Verify it is scanning

```bash
kubectl get pods -n trivy-system
# Reports appear per-namespace within a minute or two:
kubectl get vulnerabilityreports -A
kubectl get configauditreports -A
```

## 3. Let the AIOps backend read the reports

`authService` already talks to Kubernetes with the mounted kubeconfig / in-cluster
service account. It needs **read** access to the Trivy CRDs. If you run AIOps with a
restricted service account, add this ClusterRole binding:

```bash
kubectl apply -f k8s-configs/trivy-operator/aiops-reader-rbac.yaml
```

For **agentic remediation** (the *Remediate* button) the backend also needs to
`patch` workloads (`deployments`, `statefulsets`, `daemonsets`) to roll images to a
fixed version. That permission is in the same RBAC file, commented — enable it only
if you want AIOps to apply fixes directly rather than just open a change request.

## 4. Freshness ("timely basis")

`operator.vulnerabilityScannerReportTTL` in `values.yaml` controls how often reports
are refreshed (default here: **6h**). The tab shows the `Last scanned` timestamp from
each report so users always know how current the data is. Lower the TTL for tighter
SLAs; raise it to reduce cluster load.
