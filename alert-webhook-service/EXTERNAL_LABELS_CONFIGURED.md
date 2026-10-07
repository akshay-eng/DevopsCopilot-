# Prometheus External Labels - Configured ✅

## What Was Done

Configured Prometheus to automatically add `cluster_id` label to **ALL alerts** using external labels. This is a global configuration that applies to every alert without needing to modify individual alert rules.

## Configuration Applied

### 1. Prometheus External Labels
**Command used**:
```bash
kubectl patch prometheus -n monitoring prometheus-kube-prometheus-prometheus --type=merge -p='
{
  "spec": {
    "externalLabels": {
      "cluster_id": "69518b2339dcb1f682e1c991"
    }
  }
}'
```

**Result**: Prometheus now adds the following external labels to all alerts:
```yaml
external_labels:
  cluster_id: 69518b2339dcb1f682e1c991
  prometheus: monitoring/prometheus-kube-prometheus-prometheus
  prometheus_replica: prometheus-prometheus-kube-prometheus-prometheus-0
```

### 2. Removed Manual cluster_id from KubePodCrashLooping Rule
Since external labels now provide cluster_id automatically, removed the manual label from the KubePodCrashLooping alert rule to avoid duplication.

## How External Labels Work

1. **Global Application**: External labels are added to ALL alerts fired by this Prometheus instance
2. **No Rule Modification**: You don't need to add cluster_id to individual alert rules
3. **Applies to**:
   - All existing alert rules (KubePodCrashLooping, KubePodNotReady, etc.)
   - Any new alert rules you create in the future
   - Custom alerts and default kube-prometheus-stack alerts

## Verification

### Check Prometheus Configuration
```bash
kubectl get prometheus -n monitoring prometheus-kube-prometheus-prometheus -o yaml | grep -A 5 "externalLabels"
```

**Expected output**:
```yaml
externalLabels:
  cluster_id: 69518b2339dcb1f682e1c991
```

### Check Runtime Configuration
```bash
kubectl exec -n monitoring prometheus-prometheus-kube-prometheus-prometheus-0 -c prometheus -- \
  cat /etc/prometheus/config_out/prometheus.env.yaml | grep -A 5 "external_labels"
```

### Verify Alerts Have cluster_id
```bash
curl -s 'http://192.168.1.244:9090/api/v1/alerts' | python3 -m json.tool | grep cluster_id
```

All active alerts should now include:
```json
"cluster_id": "69518b2339dcb1f682e1c991"
```

## Alert Flow - End to End

```
Pod enters CrashLoopBackOff
    ↓
Prometheus evaluates alert rule (every 30s)
    ↓
Alert fired with external labels automatically added:
    - cluster_id: 69518b2339dcb1f682e1c991
    - alertname: KubePodCrashLooping
    - namespace: default
    - pod: test-crashloop-devopscopilot
    - severity: warning
    ↓
AlertManager receives alert
    ↓
AlertManager sends to Webhook Service
    ↓
Webhook Service:
    1. Receives alert
    2. Extracts cluster_id from labels
    3. Queries MongoDB: db.clusters.findOne({ _id: ObjectId("69518b2339dcb1f682e1c991") })
    4. Enriches alert with:
       - userId: 69518aec39dcb1f682e1c984
       - clusterName: k3sprod
    5. Sends to Kafka topic 'alerts'
    ↓
AuthService consumes from Kafka
    ↓
Socket.IO sends to Frontend
    ↓
User sees real-time alert notification! 🎉
```

## Test Results

✅ **KubePodCrashLooping Alert**:
```
🔔 Processing alert: KubePodCrashLooping (firing)
✅ Found 1 cluster(s) for alert KubePodCrashLooping
📤 Sending to Kafka topic 'alerts':
   Alert: KubePodCrashLooping
   Status: firing
   User: 69518aec39dcb1f682e1c984
   Cluster: k3sprod
✅ Alert sent to Kafka: KubePodCrashLooping (firing) for user 69518aec39dcb1f682e1c984
```

## Benefits of External Labels

1. **No Manual Work**: Don't need to add cluster_id to each alert rule individually
2. **Future-Proof**: New alerts automatically get cluster_id
3. **Consistent**: All alerts from this cluster have the same cluster_id
4. **Clean**: Alert rules remain clean and focused on alert logic
5. **Scalable**: Easy to manage multiple clusters - each has its own external label

## Multi-Cluster Setup

For multiple clusters, each cluster would have its own Prometheus instance with different external labels:

**Cluster 1 (k3sprod)**:
```yaml
externalLabels:
  cluster_id: 69518b2339dcb1f682e1c991
  cluster_name: k3sprod
```

**Cluster 2 (production)**:
```yaml
externalLabels:
  cluster_id: 67710a1b2e3d4f5e6a7b8c9d
  cluster_name: production
```

All alerts are automatically tagged with the correct cluster, and the webhook service routes them to the right users!

## Files Modified

1. ✅ Prometheus CRD patched with externalLabels
2. ✅ Prometheus pod restarted to apply changes
3. ✅ Removed manual cluster_id from prometheus-kube-prometheus-kubernetes-apps PrometheusRule

## Current Status

✅ **External labels configured** - All alerts now include cluster_id
✅ **Webhook service working** - Successfully matching alerts to MongoDB clusters
✅ **Alert enrichment working** - Adding userId and clusterName
✅ **Kafka integration working** - Sending enriched alerts to Kafka topics

## Notes

- External labels are added at the Prometheus level, not in individual alert rules
- The cluster_id label is now automatically included in all alerts sent to AlertManager
- The webhook service uses this cluster_id to query MongoDB and find the associated user
- This configuration survives Prometheus restarts but may be overwritten by Helm upgrades
- For production, consider adding external labels in the Helm values.yaml file

## Troubleshooting

### External labels not showing in alerts
```bash
# Restart Prometheus
kubectl rollout restart statefulset -n monitoring prometheus-prometheus-kube-prometheus-prometheus

# Wait for pod to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=prometheus -n monitoring --timeout=120s

# Check configuration was applied
kubectl exec -n monitoring prometheus-prometheus-kube-prometheus-prometheus-0 -c prometheus -- \
  cat /etc/prometheus/config_out/prometheus.env.yaml | grep -A 5 "external_labels"
```

### Webhook not finding cluster
```bash
# Check webhook logs
kubectl logs -l app=alert-webhook-service --tail=50

# Verify cluster exists in MongoDB
mongosh "mongodb://adminuser:password123@192.168.1.251:27017/admin" \
  --eval "db.clusters.findOne({_id: ObjectId('69518b2339dcb1f682e1c991')})"
```

### Alerts not reaching Kafka
Check the Kafka broker configuration (known issue with advertised.listeners).

## Summary

All alerts from this Prometheus instance now automatically include `cluster_id: 69518b2339dcb1f682e1c991`, enabling:
- Multi-tenant alerting
- Automatic user identification
- Cluster-specific alert routing
- No manual configuration per alert rule

🎉 **Configuration complete and working!**
