# Runbook: KubePVCStuckPending

> Maintained automatically by the AIOps agent from real resolutions.
> Each entry below is something that was actually run against the cluster.

## 2026-10-08 07:18 UTC — investigated

**Namespace:** robot-shop

>
**What was wrong:** PVC data-redis-0 in robot-shop claims non-existent StorageClass "non-existent-broken-sc-simulation" (should be "standard"). Pod redis-0 is unschedulable due to unbound PVC.

**What I did:** Identified root cause via Events; raised Incident INC1857519 and Change Request CHG0036806. Cannot execute PVC deletion due to tool limitations.

**Whether it is fixed:** Pending. Remediation requires manual execution: `kubectl delete pvc data-redis-0 -n robot-shop`.

**What to watch:** After deletion, monitor PVC provision → Bind → Pod redis-0 pod phase (Pending→Scheduled→Running). Alert clearance expected once pod Ready.
</RESOLUTION SUMMARY>

**Actions applied:** none — the alert was resolved without changing the cluster.
