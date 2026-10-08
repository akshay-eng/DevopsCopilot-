# Runbook: KubePodNotReady

> Maintained automatically by the AIOps agent from real resolutions.
> Each entry below is something that was actually run against the cluster.

## 2026-10-08 06:08 UTC — awaiting-human

**Namespace:** robot-shop

What was wrong:** Pod redis-0 in production-cluster/robot-shop pending (no node assignment). Root cause unknown — likely missing node affinity, unfulfilled volume claim, or insufficient resources.

**What I did:** Attempted to force reschedule via `delete_pod`, but the action requires operator approval.

**Whether it is fixed:** Not resolved; pending manual rescheduling.

**What to watch:** Pending volume claims, cluster resource capacity, and node affinity rules in the redis Deployment.

**Recommendations:**
1. **Manual:** An operator should run `kubectl describe pod redis-0 -n robot-shop --show-events` to find the blocking event (e.g., `Pending node affinity`, `Insufficient cpu`, `Volume binding`), then `kubectl delete pod redis-0 -n robot-shop --force` followed by verifying the successor pod reaches Running state. If the redis Deployment has podStableRevision (RollingUpdate), a `kubectl rollout restart deployment -n robot-shop redis` is preferred.
2. **Capacity:** Check if node/cpu/memory pressure is the issue across the cluster; if so, scale worker nodes.
3. **Configuration:** Verify the redis Deployment pod spec for Affinity/NodeSelector/Tolerations — these often block placement on multi-tenant clusters.

**Actions applied:** none — the alert was resolved without changing the cluster.
