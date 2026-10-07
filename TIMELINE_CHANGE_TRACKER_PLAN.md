# Kubernetes Change Tracker & Unified Timeline - Implementation Plan

## Overview
This plan adds a Robusta-style Timeline with Change Tracking and Correlation to the existing DevOps Copilot platform. It builds on the existing alert enrichment system completed in the previous session.

## Architecture Summary

**New Components:**
1. **Change Tracker** (cluster-agent enhancement) - Watches K8s resources, detects meaningful changes with diffing
2. **K8sChange MongoDB Model** (authService) - Persists change events with TTL
3. **Correlation Engine** (authService/consumer.js) - Links alerts to probable causal changes
4. **Timeline API** (authService/api/timelineRoutes.js) - Unified endpoint merging alerts + changes
5. **Frontend Timeline** (Timeline.js enhancement) - Renders changes alongside alerts with correlation links

**Data Flow:**
```
K8s API (watch) → cluster-agent (diff) → Kafka 'changes' topic → authService consumer → MongoDB k8s_changes + correlation → Socket.IO → Frontend Timeline
```

## Phase 1: Cluster-Agent Change Tracker (Python)

**File:** `cluster-agent/app.py`

### Changes:

1. **Add constants** (after line 61):
   ```python
   TOPIC_CHANGES = 'changes'
   _resource_generations = {}  # Track metadata.generation for diffing
   ```

2. **Add diffing helper functions** (before line 192):
   - `_resource_key(resource_type, namespace, name)` - Build unique tracker key
   - `_extract_deployment_diff(old_snapshot, new_deployment)` - Detect image/replica/env changes
   - `_extract_configmap_diff(old_snapshot, new_configmap)` - Detect data key changes
   - `_extract_secret_diff(old_snapshot, new_secret)` - Detect metadata changes (NEVER inspect .data)
   - `_extract_statefulset_diff(old_snapshot, new_sts)` - Similar to deployment
   - `_extract_daemonset_diff(old_snapshot, new_ds)` - Similar to deployment
   - `_classify_severity(action, resource_type)` - Return 'info'/'warning'/'critical'
   - `_send_change_event(...)` - Build and send to TOPIC_CHANGES

   **Key logic:**
   - Use `metadata.generation` as gate - only diff if generation changed
   - Store lightweight snapshots: replicas, images[], env_hash, data_keys, labels
   - ADDED events → always emit 'created' change
   - DELETED events → always emit 'deleted' change
   - MODIFIED events → check generation, compute diff, emit only if non-empty

3. **Add new watchers** (follow pattern of existing `watch_deployments()` at line 238):
   - `watch_configmaps()` - Watch all ConfigMaps, skip kube-system
   - `watch_secrets()` - Watch Secrets (metadata only, never log .data)
   - `watch_statefulsets()` - Watch StatefulSets
   - `watch_daemonsets()` - Watch DaemonSets

4. **Enhance existing `watch_deployments()`**:
   - Keep existing TOPIC_RESOURCES send
   - Add generation tracking + diff logic
   - Send to TOPIC_CHANGES when meaningful change detected

5. **Register new watcher threads** (in `main()` at line 665):
   ```python
   Thread(target=watch_configmaps, name='ConfigMapWatcher', daemon=True),
   Thread(target=watch_secrets, name='SecretWatcher', daemon=True),
   Thread(target=watch_statefulsets, name='StatefulSetWatcher', daemon=True),
   Thread(target=watch_daemonsets, name='DaemonSetWatcher', daemon=True),
   ```

6. **Optional: Add namespace filtering**:
   - Env var `WATCH_NAMESPACES` (comma-separated, empty = all)
   - Skip events from unwanted namespaces

### Message Schema (Kafka 'changes' topic):
```json
{
  "userId": "...",
  "clusterId": "...",
  "type": "change",
  "timestamp": "ISO8601",
  "namespace": "default",
  "resourceType": "deployment|configmap|secret|statefulset|daemonset",
  "resourceName": "my-app",
  "action": "created|updated|deleted|scaled|image_updated|config_updated",
  "summary": "Deployment my-app updated: image changed from nginx:1.19 to nginx:1.20",
  "severity": "info|warning|critical",
  "diff": {
    "oldImage": "nginx:1.19",
    "newImage": "nginx:1.20",
    "oldReplicas": 2,
    "newReplicas": 3,
    "changedKeys": ["config.yaml"],
    "generation": { "old": 5, "new": 6 }
  },
  "labels": { ... }
}
```

---

## Phase 2: K8sChange MongoDB Model

**New File:** `authService/models/K8sChange.js`

**Schema:**
```javascript
{
  userId: String (required, indexed),
  clusterId: String (required, indexed),
  namespace: String (default: 'default', indexed),
  resourceType: enum[deployment, configmap, secret, statefulset, daemonset] (required),
  resourceName: String (required),
  action: enum[created, updated, deleted, scaled, image_updated, config_updated] (required),
  summary: String (required),
  diff: Mixed (default: {}),
  severity: enum[info, warning, critical] (default: 'info'),
  labels: Map<String, String>,
  timestamp: String (ISO, required, indexed),
  correlatedAlertIds: [String],
  createdAt: Date (TTL: 30 days)
}
```

**Indexes:**
- `{ userId: 1, timestamp: -1 }`
- `{ userId: 1, clusterId: 1, timestamp: -1 }`
- `{ userId: 1, namespace: 1, timestamp: -1 }`
- `{ createdAt: 1 }` (TTL: 30 days)

**Static Methods:**
- `getRecent(userId, options)` - Query changes with filters
- `findCorrelated(userId, clusterId, namespace, sinceISO)` - Find changes for correlation

---

## Phase 3: Changes Consumer & Correlation Engine

**File:** `authService/kafka/consumer.js`

### Changes:

1. **Add in-memory cache** (after imports):
   ```javascript
   const K8sChange = require('../models/K8sChange');
   const recentChanges = new Map(); // { userId -> change[] }
   const MAX_CHANGES_PER_USER = 200;
   ```

2. **Add `handleK8sChangeMessage(data)` function**:
   - Extract userId, clusterId, namespace, resourceType, resourceName, action, summary, diff, severity, labels, timestamp
   - Save to MongoDB (K8sChange.create)
   - Cache in memory (recentChanges Map)
   - Emit Socket.IO event: `io.to(\`user-${userId}\`).emit('k8s-change', change)`
   - Run correlation: `await correlateChangeWithAlerts(userId, clusterId, namespace, change)`

3. **Add 'changes' to TOPICS array** (line 76):
   ```javascript
   const TOPICS = ['logs', 'alerts', 'k8s-events', 'resources', 'metrics', 'heartbeats', 'changes'];
   ```

4. **Add routing** (in `eachMessage` handler at line 614):
   ```javascript
   } else if (topic === 'changes') {
     handleK8sChangeMessage(data);
   }
   ```

5. **Implement `correlateChangeWithAlerts(userId, clusterId, namespace, change)` function**:
   - Query Alert model for alerts in same namespace within last 15 minutes
   - Update K8sChange with `correlatedAlertIds`
   - Update Alert with `enrichment.possibleCause`:
     ```javascript
     {
       changeType: change.action,
       resource: `${change.resourceType}/${change.resourceName}`,
       summary: change.summary,
       changeTimestamp: change.timestamp
     }
     ```
   - Emit `alert-correlation` Socket.IO event to frontend

6. **Add reverse correlation in `handleAlertMessage()`** (after Alert.create):
   - Query K8sChange for changes in same namespace within last 15 minutes
   - If found, emit `alert-correlation` event with possibleCause

7. **Export helper** (in module.exports):
   ```javascript
   getRecentChangesForUser: (userId) => recentChanges.get(userId) || [],
   ```

---

## Phase 4: Timeline API Routes

**New File:** `authService/api/timelineRoutes.js`

**Endpoints:**

1. **GET /api/timeline/events**
   - Query params: hours (default: 48), limit (default: 100), skip, clusterId, namespace
   - Query Alert.find() with timeFilter
   - Query K8sChange.find() with timeFilter
   - Merge arrays, add `type: 'alert'` or `type: 'change'`
   - Sort by timestamp descending
   - Paginate
   - Return: `{ success: true, events: [], pagination: {...} }`

2. **GET /api/timeline/changes**
   - Changes only with filtering
   - Same query logic as K8sChange.getRecent()

3. **GET /api/timeline/correlations/:alertId**
   - Look up alert by ID
   - Find changes in same namespace within +/- 15 minutes
   - Return correlated changes

**Registration:** Add to `authService/server.js`:
```javascript
const timelineRoutes = require('./api/timelineRoutes');
app.use('/api/timeline', timelineRoutes);
```

---

## Phase 5: Frontend Changes

### 5.1 New Redux Slice

**New File:** `frontend/src/redux/slices/changesSlice.js`

**State:**
```javascript
{
  changes: {},       // { [clusterId]: change[] }
  recentChanges: [], // Flat list, newest first
  maxPerCluster: 200
}
```

**Actions:**
- `addChange(change)` - Add to recentChanges, cache by clusterId
- `clearChanges()` - Clear all
- `setChanges(changes)` - Bulk load from API

**Registration:** Add to `frontend/src/redux/store.js`:
```javascript
import changesReducer from './slices/changesSlice';
// ...
changes: changesReducer,
```

### 5.2 New Hook

**New File:** `frontend/src/hooks/useTimelineChanges.js`

- Load changes from API on mount
- Listen for Socket.IO `k8s-change` events
- Dispatch `addChange()` on new change
- Return: `{ loading, changesState, refresh }`

### 5.3 Update socketService.js

Add methods:
```javascript
onK8sChange(callback) { this.on('k8s-change', callback); }
offK8sChange(callback) { this.off('k8s-change', callback); }
onAlertCorrelation(callback) { this.on('alert-correlation', callback); }
offAlertCorrelation(callback) { this.off('alert-correlation', callback); }
```

### 5.4 Update Timeline.js

**Major Changes:**

1. **Import useTimelineChanges** alongside useTimelineAlerts

2. **Create unified timeline events**:
   ```javascript
   const allTimelineEvents = useMemo(() => {
     const merged = [
       ...allAlerts.map(a => ({ type: 'alert', ...a, _sortTime: new Date(a.receivedAt).getTime() })),
       ...recentChanges.map(c => ({ type: 'change', ...c, _sortTime: new Date(c.timestamp).getTime() }))
     ];
     return merged.sort((a, b) => b._sortTime - a._sortTime);
   }, [allAlerts, recentChanges]);
   ```

3. **Event Stream rendering**:
   - Check `event.type === 'change'`
   - Change events: blue/teal dot, different icon (gear/arrow/file), action badge
   - Summary: "Deployment nginx updated: image changed from v1 to v2"
   - Click handler: show Change Detail Panel

4. **Change Detail Panel** (new right panel):
   - Resource type, name, namespace, timestamp
   - Diff details (side-by-side old vs new)
   - Action badge
   - Correlated alerts section: "Alerts that fired within 15 minutes"

5. **Alert Detail Panel enhancement**:
   - In Event tab, if `alert.enrichment?.possibleCause` exists, show "Possible Cause" banner:
     ```jsx
     <div className="p-3 rounded-lg border bg-blue-900/20 border-blue-800">
       <div className="text-xs font-semibold mb-1 text-blue-400">Possible Cause Detected</div>
       <div className="text-sm text-blue-300">{possibleCause.summary}</div>
       <div className="text-xs mt-1 text-blue-500">
         {possibleCause.resource} - {new Date(possibleCause.changeTimestamp).toLocaleString()}
       </div>
     </div>
     ```

6. **Update legend** (line 361-367):
   - Change "Changes" dot from slate to blue
   - Make it functional (click to filter by changes)

7. **Listen for alert-correlation events**:
   - Update alert enrichment in real-time when correlation is detected
   - Show toast notification: "Alert correlated with deployment change"

---

## Phase 6: Deployment & Verification

### 6.1 Cluster-Agent Deployment

1. **Update ConfigMap** if needed (namespace filtering):
   ```bash
   kubectl edit configmap cluster-agent-config
   # Add: WATCH_NAMESPACES: "default,production"
   ```

2. **Rebuild and deploy**:
   ```bash
   cd cluster-agent
   docker buildx build --platform linux/amd64 -t <username>/cluster-agent:change-tracker --push .
   kubectl set image deployment/cluster-agent cluster-agent=<username>/cluster-agent:change-tracker
   kubectl rollout status deployment/cluster-agent
   ```

3. **Check logs**:
   ```bash
   kubectl logs -f deployment/cluster-agent | grep -E '(ConfigMapWatcher|SecretWatcher|CHANGE)'
   ```

### 6.2 AuthService Restart

```bash
# Kill existing authService
lsof -ti:5001 | xargs kill
# Start with logs
cd authService
node server.js
# Watch for: "[CHANGE]", "[CORRELATION]" logs
```

### 6.3 Frontend Rebuild

```bash
cd frontend
npm run build
# Or if dev mode: npm start
```

### 6.4 Test Cases

**Test 1: Deployment Image Change**
```bash
kubectl set image deployment/crashloop-test busybox=busybox:1.36
```
Expected:
- Kafka `changes` topic receives message with `action: "image_updated"`
- MongoDB `k8s_changes` collection has new document
- authService logs `[CHANGE] ... image_updated deployment ...`
- Frontend Timeline shows blue change event: "Deployment crashloop-test updated: image changed"

**Test 2: ConfigMap Update**
```bash
kubectl create configmap test-config --from-literal=key1=value1
sleep 2
kubectl patch configmap test-config --type merge -p '{"data":{"key2":"value2"}}'
```
Expected:
- Change event with `action: "config_updated"`, diff showing added key2

**Test 3: Correlation**
```bash
# Create deployment
kubectl create deployment test-app --image=nginx:1.19 --replicas=1
# Update image (causes change event)
kubectl set image deployment/test-app nginx=nginx:broken-tag
# Wait for ImagePullBackOff alert (if configured)
# Expected: Alert shows "Possible Cause: Deployment test-app updated..."
```

**Test 4: Timeline API**
```bash
curl -H "Authorization: Bearer <token>" http://localhost:5001/api/timeline/events?hours=1
```
Expected: JSON with both alerts and changes, `type` field distinguishing them

**Test 5: Frontend Timeline**
- Open Timeline page
- Event Stream shows mixed alerts (red/yellow dots) and changes (blue dots)
- Click change → shows diff details
- Click alert with correlation → shows "Possible Cause" banner
- Legend filters work (click "Changes" to show only changes)

### 6.5 Kafka Verification

```bash
# Check changes topic
kafkacat -C -b 192.168.1.5:30092 -t changes -o end
# Make a change: kubectl scale deployment/crashloop-test --replicas=2
# Should see JSON message in kafkacat output
```

### 6.6 MongoDB Verification

```javascript
// Connect to MongoDB
use devops_copilot;
db.k8s_changes.find({}).sort({timestamp:-1}).limit(5).pretty();
// Should see recent changes with diff data

db.alert_history.findOne({ 'enrichment.possibleCause': { $exists: true } });
// Should see alert with possibleCause if correlation occurred
```

---

## Rollback Plan

If issues occur:

1. **Cluster-agent rollback**:
   ```bash
   kubectl rollout undo deployment/cluster-agent
   ```

2. **AuthService rollback**:
   - Revert `consumer.js` (comment out `'changes'` from TOPICS array)
   - Restart authService

3. **Frontend rollback**:
   - Revert Timeline.js changes
   - Remove changesSlice from store

4. **Kafka topic cleanup** (optional):
   ```bash
   kafka-topics --delete --topic changes --bootstrap-server 192.168.1.5:30092
   ```

---

## Success Criteria

✅ Cluster-agent watchers running for ConfigMaps, Secrets, StatefulSets, DaemonSets
✅ Deployment changes produce diff messages on Kafka `changes` topic
✅ MongoDB `k8s_changes` collection populated with TTL
✅ AuthService consumer logs show `[CHANGE]` and `[CORRELATION]` entries
✅ Timeline API returns merged alerts + changes sorted by timestamp
✅ Frontend Timeline renders change events with blue dots
✅ Clicking change shows diff details (old image → new image)
✅ Alerts with correlations show "Possible Cause" banner
✅ Real-time updates via Socket.IO work for both alerts and changes

---

## Estimated Effort

- Phase 1 (Cluster-agent): 2-3 hours
- Phase 2 (Model): 30 minutes
- Phase 3 (Consumer): 1-2 hours
- Phase 4 (API): 1 hour
- Phase 5 (Frontend): 2-3 hours
- Phase 6 (Testing): 1-2 hours

**Total: ~8-12 hours**

---

## Notes

- This builds on the existing alert enrichment system completed in the previous session
- No breaking changes to existing functionality
- All new features are additive
- Uses existing patterns (Kafka multi-consumer, Socket.IO rooms, MongoDB TTL, Redux slices)
- Follows the "Robusta Timeline" reference architecture but adapted to our Node.js + Python stack
- The correlation engine is simple (namespace + 15-min window) - can be enhanced later with ML/heuristics
