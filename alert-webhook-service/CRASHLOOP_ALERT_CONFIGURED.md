# KubePodCrashLooping Alert - Configured ✅

## What Was Changed

### 1. Custom Alert Rule Created
**File**: `k8s/custom-crashloop-alert.yaml`

- **Alert Name**: `KubePodCrashLooping`
- **Trigger Time**: 2 minutes (changed from 15 minutes)
- **Evaluation Interval**: Every 30 seconds
- **Cluster ID**: Automatically tagged with your cluster ID for webhook routing

**Alert Logic**:
```yaml
expr: |
  max_over_time(kube_pod_container_status_waiting_reason{
    reason="CrashLoopBackOff",
    job="kube-state-metrics",
    namespace=~".*"
  }[2m]) >= 1
for: 2m  # Fire after 2 minutes in CrashLoopBackOff
```

This means:
- Prometheus checks every 30 seconds if any pod is in CrashLoopBackOff
- If a pod has been in CrashLoopBackOff for 2 minutes continuously, the alert fires
- Alert includes your cluster_id label for proper routing to your user

### 2. AlertManager Repeat Interval Updated
**File**: `k8s/alertmanager-config.yaml`

Added specific route for KubePodCrashLooping:
```yaml
- matchers:
    - alertname = "KubePodCrashLooping"
  receiver: 'devopscopilot-webhook'
  group_wait: 10s
  repeat_interval: 2m  # Repeat every 2 minutes until resolved
```

This means:
- When the alert fires, it's sent to the webhook immediately (after 10s group_wait)
- If the pod is still in CrashLoopBackOff, the alert is resent every 2 minutes
- Alerts continue every 2 minutes until the pod recovers or is deleted

## Alert Flow

```
Pod enters CrashLoopBackOff
    ↓
Wait 2 minutes (for: 2m)
    ↓
Alert FIRES → AlertManager
    ↓
Wait 10s (group_wait)
    ↓
Send to Webhook → Kafka → AuthService → Frontend
    ↓
Still CrashLooping after 2 minutes?
    ↓ YES
Repeat alert → Webhook → Kafka → etc.
    ↓
Repeat every 2 minutes until resolved
```

## Testing

You already have a crashloop pod! Check if the alert fires:

```bash
# Check which pods are in crashloop
kubectl get pods --all-namespaces | grep -i crash

# Watch for the alert to fire in Prometheus
# The alert should fire after the crashloop-pod has been in CrashLoopBackOff for 2 minutes

# Watch webhook logs for the alert
kubectl logs -l app=alert-webhook-service -f

# You should see alerts coming in every 2 minutes while the pod is still crashing
```

## Verify Configuration

### 1. Check Alert Rule is Loaded
```bash
kubectl get prometheusrule -n monitoring devopscopilot-pod-alerts
```

### 2. Check AlertManager Config
```bash
kubectl get configmap -n monitoring alertmanager-config -o yaml | grep -A 5 "KubePodCrashLooping"
```

### 3. Check Prometheus Targets
Access Prometheus UI at http://192.168.1.244:9090 and go to:
- Status → Targets (verify kube-state-metrics is UP)
- Alerts (should show KubePodCrashLooping alert)

### 4. Test Alert Query
In Prometheus UI, run this query:
```promql
max_over_time(kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff", job="kube-state-metrics", namespace=~".*"}[2m])
```

Should return 1 for any pod in CrashLoopBackOff.

## What Happens Next

1. **After 2 minutes of CrashLoopBackOff**:
   - Prometheus fires the KubePodCrashLooping alert
   - AlertManager receives it and waits 10 seconds (group_wait)
   - AlertManager sends to webhook service

2. **Webhook Service**:
   - Receives alert from AlertManager
   - Queries MongoDB using cluster_id to find your user
   - Enriches alert with userId and clusterName
   - Attempts to send to Kafka (may have issues due to Kafka broker config)

3. **Every 2 Minutes After**:
   - If pod still in CrashLoopBackOff, AlertManager resends the alert
   - Process repeats until pod is fixed or deleted

4. **When Resolved**:
   - Pod exits CrashLoopBackOff state
   - AlertManager sends a "resolved" notification
   - No more repeat alerts for this incident

## Alert Payload Example

When the alert fires, the webhook receives:
```json
{
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "KubePodCrashLooping",
        "severity": "warning",
        "cluster_id": "69518b2339dcb1f682e1c991",
        "namespace": "default",
        "pod": "crashloop-pod",
        "container": "nginx"
      },
      "annotations": {
        "summary": "Pod is crash looping.",
        "description": "Pod default/crashloop-pod (nginx) is in waiting state (reason: \"CrashLoopBackOff\") on cluster ..."
      },
      "startsAt": "2025-12-28T20:30:00Z"
    }
  ]
}
```

## Notes

- The original kube-prometheus-stack rule still exists but will be overridden by this custom rule
- This custom rule takes precedence because it matches the same alert name
- The cluster_id label is automatically added to help route alerts to the correct user
- Repeat interval of 2 minutes is aggressive - adjust if too noisy

## Files Modified/Created

1. ✅ Created: `k8s/custom-crashloop-alert.yaml`
2. ✅ Updated: `k8s/alertmanager-config.yaml`
3. ✅ Applied to cluster
4. ✅ AlertManager restarted

## Current Status

✅ **Alert rule deployed** - Evaluating every 30 seconds
✅ **AlertManager configured** - Will send to webhook every 2 minutes
✅ **Webhook service ready** - Connected to MongoDB and (attempting) Kafka

⚠️ **Known Issue**: Kafka broker misconfiguration may prevent alerts from reaching Kafka topics, but the webhook logic is working correctly.

## Troubleshooting

### Alert Not Firing
```bash
# Check if rule is loaded in Prometheus
curl http://192.168.1.244:9090/api/v1/rules | jq '.data.groups[] | select(.name=="devopscopilot.pod-alerts")'

# Check if query returns results
curl 'http://192.168.1.244:9090/api/v1/query?query=max_over_time(kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"}[2m])'
```

### Alert Firing But Not Received
```bash
# Check AlertManager logs
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager | grep -i crash

# Check webhook logs
kubectl logs -l app=alert-webhook-service | grep -i crash
```

### Want to Change Timing?
Edit `k8s/custom-crashloop-alert.yaml`:
- Change `for: 2m` to desired trigger time
- Change `repeat_interval: 2m` in alertmanager-config.yaml to desired repeat time
- Reapply both files and restart AlertManager
