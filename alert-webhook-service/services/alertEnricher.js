/**
 * Alert Enricher Service
 *
 * Runs asynchronously after the basic alert is sent to Kafka.
 * Queries K8s API and Prometheus to gather contextual data:
 * - kubectl describe / get
 * - Pod logs (current + previous)
 * - K8s events
 * - ConfigMap/Secret/Deployment changes
 * - Prometheus rules
 * - CPU, memory, network, disk metrics
 */

const k8s = require('@kubernetes/client-node');

/**
 * client-node@0.21 returns { response, body }; newer majors return the object
 * directly. Accept either so a future upgrade does not silently empty every
 * enrichment field again.
 */
/**
 * Prometheus jobs that SCRAPE other things. When an alert comes from one of
 * these, its `pod`/`container` labels describe the exporter, not the subject.
 */
const EXPORTER_JOBS = /kube-state-metrics|node-exporter|kubelet|cadvisor|prometheus|blackbox|pushgateway/i;

const unwrap = (res) => (res && res.body !== undefined ? res.body : res) || {};
const axios = require('axios');

// Error/warning patterns for log analysis
const ERROR_PATTERN = /\b(error|exception|fatal|panic|failed|failure)\b/i;
const WARNING_PATTERN = /\b(warn|warning|deprecated)\b/i;

class AlertEnricher {
  constructor(kafkaProducer, prometheusUrl) {
    this.kafkaProducer = kafkaProducer;
    this.prometheusUrl = (prometheusUrl || 'http://prometheus-kube-prometheus-prometheus:9090').replace(/\/+$/, '');
    this.enrichmentTopic = process.env.KAFKA_ENRICHMENTS_TOPIC || 'alert-enrichments';

    // Concurrency control
    this.activeEnrichments = 0;
    this.maxConcurrent = 5;

    // Initialize K8s client
    const kc = new k8s.KubeConfig();
    try {
      kc.loadFromCluster();
    } catch {
      kc.loadFromDefault();
    }
    this.coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
    this.appsV1Api = kc.makeApiClient(k8s.AppsV1Api);

    console.log('✅ AlertEnricher initialized');
    console.log(`   Prometheus: ${this.prometheusUrl}`);
    console.log(`   Enrichment topic: ${this.enrichmentTopic}`);
  }

  /**
   * Main entry point — fire-and-forget from server.js
   */
  async enrichAlert(rawAlert, enrichedAlertBase) {
    if (this.activeEnrichments >= this.maxConcurrent) {
      console.warn(`⚠️  Enrichment skipped (${this.activeEnrichments}/${this.maxConcurrent} active): ${enrichedAlertBase.alertname}`);
      return;
    }

    this.activeEnrichments++;
    const startTime = Date.now();

    try {
      const target = this.determineResourceTarget(rawAlert, enrichedAlertBase);

      console.log(`🔍 Enriching: ${enrichedAlertBase.alertname} | ${target.type}/${target.name} in ${target.namespace}`);

      const enrichment = {
        alertId: enrichedAlertBase.alertId,
        userId: enrichedAlertBase.userId,
        clusterId: enrichedAlertBase.clusterId,
        alertname: enrichedAlertBase.alertname,
        namespace: target.namespace,
        resourceType: target.type,
        resourceName: target.name,
        enrichedAt: new Date().toISOString(),
        enrichmentDurationMs: 0,
        data: {}
      };

      const tasks = [];

      if (target.type === 'pod' && target.name) {
        tasks.push(
          this.withTimeout(this.fetchResourceDescribe(target.namespace, 'pod', target.name), 10000)
            .then(r => { enrichment.data.describe = r; }),
          this.withTimeout(this.fetchResourceGet(target.namespace, 'pod', target.name), 10000)
            .then(r => { enrichment.data.resource = r; }),
          this.withTimeout(this.fetchCurrentLogs(target.namespace, target.name, 200), 15000)
            .then(r => { enrichment.data.currentLogs = r; }),
          this.withTimeout(this.fetchPreviousLogs(target.namespace, target.name), 15000)
            .then(r => { enrichment.data.previousLogs = r; }),
          this.withTimeout(this.fetchEvents(target.namespace, `involvedObject.name=${target.name}`), 10000)
            .then(r => { enrichment.data.events = r; }),
          this.withTimeout(this.fetchCpuMetrics(target.namespace, target.name), 10000)
            .then(r => { enrichment.data.cpuMetrics = r; }),
          this.withTimeout(this.fetchMemoryMetrics(target.namespace, target.name), 10000)
            .then(r => { enrichment.data.memoryMetrics = r; }),
          this.withTimeout(this.fetchNetworkMetrics(target.namespace, target.name), 10000)
            .then(r => { enrichment.data.networkMetrics = r; }),
          this.withTimeout(this.fetchDiskMetrics(target.namespace, target.name), 10000)
            .then(r => { enrichment.data.diskMetrics = r; })
        );
      } else if (target.type === 'node' && target.name) {
        tasks.push(
          this.withTimeout(this.fetchResourceDescribe(null, 'node', target.name), 10000)
            .then(r => { enrichment.data.describe = r; }),
          this.withTimeout(this.fetchEvents(null, `involvedObject.name=${target.name}`), 10000)
            .then(r => { enrichment.data.events = r; }),
          this.withTimeout(this.fetchNodeCpuMetrics(target.name), 10000)
            .then(r => { enrichment.data.cpuMetrics = r; }),
          this.withTimeout(this.fetchNodeMemoryMetrics(target.name), 10000)
            .then(r => { enrichment.data.memoryMetrics = r; }),
          this.withTimeout(this.fetchNodeDiskMetrics(target.name), 10000)
            .then(r => { enrichment.data.diskMetrics = r; })
        );
      } else if (target.type === 'pvc' && target.name) {
        tasks.push(
          this.withTimeout(this.fetchResourceDescribe(target.namespace, 'pvc', target.name), 10000)
            .then(r => { enrichment.data.describe = r; }),
          this.withTimeout(this.fetchEvents(target.namespace, `involvedObject.name=${target.name}`), 10000)
            .then(r => { enrichment.data.events = r; })
        );
      }

      // Always run these regardless of resource type
      if (target.namespace) {
        tasks.push(
          this.withTimeout(this.fetchConfigurationChanges(target.namespace), 10000)
            .then(r => { enrichment.data.configChanges = r; })
        );
      }
      tasks.push(
        this.withTimeout(this.fetchPrometheusRules(), 10000)
          .then(r => { enrichment.data.prometheusRules = r; })
      );

      await Promise.allSettled(tasks);

      // oomRisk needs the container's *configured* memory limit, not just the
      // current/max ratio from the sample window (which is ~always near 1 for
      // a pod with flat memory usage, making the naive check false-positive
      // on virtually every alert). Recompute it here now that describe data
      // (which carries container.resources.limits) is available too.
      if (enrichment.data.memoryMetrics && !enrichment.data.memoryMetrics.error) {
        const limitBytes = this.getContainerMemoryLimitBytes(enrichment.data.describe, target.name);
        enrichment.data.memoryMetrics.limitBytes = limitBytes;
        enrichment.data.memoryMetrics.oomRisk = limitBytes != null
          ? enrichment.data.memoryMetrics.current > 0.9 * limitBytes
          : false;
      }

      enrichment.enrichmentDurationMs = Date.now() - startTime;

      await this.sendEnrichmentToKafka(enrichment);

      console.log(`✅ Enrichment complete: ${enrichedAlertBase.alertname} in ${enrichment.enrichmentDurationMs}ms`);
    } catch (error) {
      console.error(`❌ Enrichment failed for ${enrichedAlertBase.alertname}:`, error.message);
    } finally {
      this.activeEnrichments--;
    }
  }

  // ===========================
  // Resource Target Detection
  // ===========================

  /**
   * Which object is this alert actually ABOUT?
   *
   * ⚠ The `pod` label is frequently the EXPORTER that scraped the metric, not
   * the thing that is broken. A KubePVCStuckPending alert carries
   * `persistentvolumeclaim=data-redis-0` (the subject) alongside
   * `pod=prometheus-kube-state-metrics-...` and `job=kube-state-metrics` (the
   * scrape target). Checking `pod` first therefore enriched the exporter —
   * usually in a different namespace, so every lookup 404'd and the alert
   * detail tabs came back empty.
   *
   * So: the most specific subject label wins, and a `pod` label is only trusted
   * when it did not come from a known exporter job.
   */
  determineResourceTarget(rawAlert, enrichedBase) {
    const labels = { ...(enrichedBase.labels || {}), ...(rawAlert.labels || {}) };
    const namespace = labels.namespace || 'default';

    const pvc = labels.persistentvolumeclaim;
    const deployment = labels.deployment;
    const statefulset = labels.statefulset;
    const daemonset = labels.daemonset;
    const node = labels.node || labels.instance_node;
    const pod = labels.pod;

    // Specific subject labels first — these name the failing object directly.
    if (pvc) return { type: 'pvc', name: pvc, namespace };
    if (deployment) return { type: 'deployment', name: deployment, namespace };
    if (statefulset) return { type: 'statefulset', name: statefulset, namespace };
    if (daemonset) return { type: 'daemonset', name: daemonset, namespace };

    // A `pod` label is the SUBJECT for pod-level alerts (KubePodNotReady carries
    // pod=redis-0 even though the job is kube-state-metrics), but it is the
    // SCRAPER when the alert is about something else. The reliable test is not
    // the job name — it is whether the pod is itself that job's exporter, i.e.
    // its name contains the job/service name.
    const isScraper = pod && EXPORTER_JOBS.test(pod)
      && [labels.job, labels.service].some((v) => v && pod.includes(v));

    if (pod && !isScraper) return { type: 'pod', name: pod, namespace };
    if (node) return { type: 'node', name: node, namespace: null };

    // An exporter-sourced alert with nothing but a pod label still tells us the
    // namespace, which is enough for events and configuration history.
    return { type: 'unknown', name: null, namespace };
  }

  // ===========================
  // K8s Resource Fetch
  // ===========================

  async fetchResourceDescribe(namespace, resourceType, name) {
    try {
      let resource;
      if (resourceType === 'pod') {
        const resp = unwrap(await this.coreV1Api.readNamespacedPod(name, namespace));
        resource = resp;
      } else if (resourceType === 'node') {
        const resp = unwrap(await this.coreV1Api.readNode(name));
        resource = resp;
      } else if (resourceType === 'pvc') {
        const resp = unwrap(await this.coreV1Api.readNamespacedPersistentVolumeClaim(name, namespace));
        resource = resp;
      } else {
        return { error: `Unsupported resource type: ${resourceType}` };
      }

      // Extract describe-style info
      if (resourceType === 'pod') {
        return this.extractPodDescribe(resource);
      } else if (resourceType === 'node') {
        return this.extractNodeDescribe(resource);
      } else if (resourceType === 'pvc') {
        return this.extractPvcDescribe(resource);
      }
    } catch (error) {
      return { error: error.body?.message || error.message };
    }
  }

  extractPodDescribe(pod) {
    const containerStatuses = (pod.status?.containerStatuses || []).map(cs => {
      const stateInfo = {};
      if (cs.state?.running) {
        stateInfo.state = 'running';
        stateInfo.startedAt = cs.state.running.startedAt;
      } else if (cs.state?.waiting) {
        stateInfo.state = 'waiting';
        stateInfo.reason = cs.state.waiting.reason;
        stateInfo.message = cs.state.waiting.message;
      } else if (cs.state?.terminated) {
        stateInfo.state = 'terminated';
        stateInfo.reason = cs.state.terminated.reason;
        stateInfo.exitCode = cs.state.terminated.exitCode;
        stateInfo.message = cs.state.terminated.message;
      }

      const lastStateInfo = {};
      if (cs.lastState?.terminated) {
        lastStateInfo.terminated = {
          reason: cs.lastState.terminated.reason,
          exitCode: cs.lastState.terminated.exitCode,
          message: cs.lastState.terminated.message,
          startedAt: cs.lastState.terminated.startedAt,
          finishedAt: cs.lastState.terminated.finishedAt
        };
      }

      return {
        name: cs.name,
        image: cs.image,
        ready: cs.ready,
        restartCount: cs.restartCount,
        ...stateInfo,
        lastState: Object.keys(lastStateInfo).length > 0 ? lastStateInfo : null
      };
    });

    const containers = (pod.spec?.containers || []).map(c => ({
      name: c.name,
      image: c.image,
      ports: (c.ports || []).map(p => ({ containerPort: p.containerPort, protocol: p.protocol })),
      resources: c.resources || {},
      env: (c.env || []).filter(e => !e.valueFrom?.secretKeyRef).map(e => ({ name: e.name, value: e.value || '(from ref)' }))
    }));

    return {
      metadata: {
        name: pod.metadata?.name,
        namespace: pod.metadata?.namespace,
        labels: pod.metadata?.labels,
        creationTimestamp: pod.metadata?.creationTimestamp
      },
      spec: {
        nodeName: pod.spec?.nodeName,
        serviceAccountName: pod.spec?.serviceAccountName,
        containers,
        volumes: (pod.spec?.volumes || []).map(v => ({ name: v.name, type: Object.keys(v).filter(k => k !== 'name')[0] }))
      },
      status: {
        phase: pod.status?.phase,
        conditions: (pod.status?.conditions || []).map(c => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message,
          lastTransitionTime: c.lastTransitionTime
        })),
        containerStatuses
      }
    };
  }

  extractNodeDescribe(node) {
    return {
      metadata: {
        name: node.metadata?.name,
        labels: node.metadata?.labels,
        creationTimestamp: node.metadata?.creationTimestamp
      },
      status: {
        conditions: (node.status?.conditions || []).map(c => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message
        })),
        capacity: node.status?.capacity,
        allocatable: node.status?.allocatable,
        nodeInfo: node.status?.nodeInfo ? {
          kubeletVersion: node.status.nodeInfo.kubeletVersion,
          osImage: node.status.nodeInfo.osImage,
          containerRuntimeVersion: node.status.nodeInfo.containerRuntimeVersion,
          architecture: node.status.nodeInfo.architecture
        } : null
      }
    };
  }

  extractPvcDescribe(pvc) {
    return {
      metadata: {
        name: pvc.metadata?.name,
        namespace: pvc.metadata?.namespace,
        creationTimestamp: pvc.metadata?.creationTimestamp
      },
      spec: {
        accessModes: pvc.spec?.accessModes,
        resources: pvc.spec?.resources,
        storageClassName: pvc.spec?.storageClassName,
        volumeName: pvc.spec?.volumeName
      },
      status: {
        phase: pvc.status?.phase,
        capacity: pvc.status?.capacity,
        accessModes: pvc.status?.accessModes
      }
    };
  }

  async fetchResourceGet(namespace, resourceType, name) {
    try {
      if (resourceType === 'pod') {
        const resp = unwrap(await this.coreV1Api.readNamespacedPod(name, namespace));
        return { kind: 'Pod', metadata: resp.metadata, spec: resp.spec, status: resp.status };
      } else if (resourceType === 'node') {
        const resp = unwrap(await this.coreV1Api.readNode(name));
        return { kind: 'Node', metadata: resp.metadata, spec: resp.spec, status: resp.status };
      } else if (resourceType === 'pvc') {
        const resp = unwrap(await this.coreV1Api.readNamespacedPersistentVolumeClaim(name, namespace));
        return { kind: 'PersistentVolumeClaim', metadata: resp.metadata, spec: resp.spec, status: resp.status };
      }
      return { error: `Unsupported resource type: ${resourceType}` };
    } catch (error) {
      return { error: error.body?.message || error.message };
    }
  }

  // ===========================
  // Logs
  // ===========================

  async fetchCurrentLogs(namespace, podName, tailLines = 200) {
    try {
      // First get the pod to enumerate containers
      const pod = unwrap(await this.coreV1Api.readNamespacedPod(podName, namespace));
      const containerNames = (pod.spec?.containers || []).map(c => c.name);

      const containers = [];
      for (const containerName of containerNames) {
        try {
          const logs = await this.coreV1Api.readNamespacedPodLog(
            podName, namespace, containerName,
            undefined, undefined, undefined, undefined, undefined, undefined,
            tailLines, true);

          const logText = typeof logs === 'string' ? logs : (logs?.body || '');
          const lines = logText.split('\n').filter(l => l.length > 0);
          const errors = lines.filter(l => ERROR_PATTERN.test(l));
          const warnings = lines.filter(l => WARNING_PATTERN.test(l));

          containers.push({
            name: containerName,
            logs: logText,
            lineCount: lines.length,
            errors: errors.slice(-20),
            errorCount: errors.length,
            warnings: warnings.slice(-20),
            warningCount: warnings.length
          });
        } catch (logErr) {
          containers.push({
            name: containerName,
            error: logErr.body?.message || logErr.message,
            lineCount: 0
          });
        }
      }

      return { containers };
    } catch (error) {
      return { error: error.body?.message || error.message };
    }
  }

  async fetchPreviousLogs(namespace, podName) {
    try {
      const pod = unwrap(await this.coreV1Api.readNamespacedPod(podName, namespace));
      const containerNames = (pod.spec?.containers || []).map(c => c.name);

      const containers = [];
      for (const containerName of containerNames) {
        try {
          const logs = await this.coreV1Api.readNamespacedPodLog(
            podName, namespace, containerName,
            undefined, undefined, undefined, undefined, true, undefined,
            200, true);

          const logText = typeof logs === 'string' ? logs : (logs?.body || '');
          const lines = logText.split('\n').filter(l => l.length > 0);
          const errors = lines.filter(l => ERROR_PATTERN.test(l));

          containers.push({
            name: containerName,
            logs: logText,
            lineCount: lines.length,
            errors: errors.slice(-20),
            errorCount: errors.length
          });
        } catch (logErr) {
          // Previous logs may not exist — not an error
          containers.push({
            name: containerName,
            logs: null,
            lineCount: 0,
            note: 'No previous container logs available'
          });
        }
      }

      return { containers };
    } catch (error) {
      return { error: error.body?.message || error.message };
    }
  }

  // ===========================
  // Events
  // ===========================

  async fetchEvents(namespace, fieldSelector) {
    try {
      let eventList;
      if (namespace) {
        eventList = unwrap(await this.coreV1Api.listNamespacedEvent(namespace, undefined, undefined, undefined, fieldSelector));
      } else {
        eventList = unwrap(await this.coreV1Api.listEventForAllNamespaces(undefined, undefined, fieldSelector));
      }

      const cutoff = new Date(Date.now() - 30 * 60 * 1000);
      const events = (eventList.items || [])
        .filter(e => {
          const ts = e.lastTimestamp || e.eventTime;
          return ts && new Date(ts) > cutoff;
        })
        .map(e => ({
          type: e.type,
          reason: e.reason,
          message: e.message,
          count: e.count || 1,
          firstTimestamp: e.firstTimestamp,
          lastTimestamp: e.lastTimestamp || e.eventTime
        }))
        .sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));

      return { events, total: events.length, lookbackMinutes: 30 };
    } catch (error) {
      return { error: error.body?.message || error.message };
    }
  }

  // ===========================
  // Configuration Changes
  // ===========================

  async fetchConfigurationChanges(namespace, lookbackMinutes = 30) {
    const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000);

    const result = { configMaps: [], secrets: [], recentDeployments: [] };

    try {
      // ConfigMaps
      const cmList = unwrap(await this.coreV1Api.listNamespacedConfigMap(namespace));
      for (const cm of (cmList.items || [])) {
        const managed = cm.metadata?.managedFields || [];
        const lastUpdate = managed.reduce((latest, mf) => {
          const t = mf.time ? new Date(mf.time) : null;
          return t && t > latest ? t : latest;
        }, new Date(0));

        if (lastUpdate > cutoff) {
          result.configMaps.push({
            name: cm.metadata.name,
            lastModified: lastUpdate.toISOString()
          });
        }
      }
    } catch (err) {
      result.configMaps = [{ error: err.body?.message || err.message }];
    }

    try {
      // Secrets — metadata only, NEVER include .data
      const secretList = unwrap(await this.coreV1Api.listNamespacedSecret(namespace));
      for (const s of (secretList.items || [])) {
        const managed = s.metadata?.managedFields || [];
        const lastUpdate = managed.reduce((latest, mf) => {
          const t = mf.time ? new Date(mf.time) : null;
          return t && t > latest ? t : latest;
        }, new Date(0));

        if (lastUpdate > cutoff) {
          result.secrets.push({
            name: s.metadata.name,
            type: s.type,
            lastModified: lastUpdate.toISOString()
          });
        }
      }
    } catch (err) {
      result.secrets = [{ error: err.body?.message || err.message }];
    }

    try {
      // Recent ReplicaSets (indicates deployments)
      const rsList = unwrap(await this.appsV1Api.listNamespacedReplicaSet(namespace));
      for (const rs of (rsList.items || [])) {
        const created = rs.metadata?.creationTimestamp ? new Date(rs.metadata.creationTimestamp) : null;
        if (created && created > cutoff) {
          result.recentDeployments.push({
            name: rs.metadata.name,
            createdAt: created.toISOString(),
            replicas: rs.status?.replicas || 0,
            readyReplicas: rs.status?.readyReplicas || 0
          });
        }
      }
    } catch (err) {
      result.recentDeployments = [{ error: err.body?.message || err.message }];
    }

    return result;
  }

  // ===========================
  // Prometheus Rules
  // ===========================

  async fetchPrometheusRules() {
    try {
      const resp = await axios.get(`${this.prometheusUrl}/api/v1/rules`, {
        params: { type: 'alert' },
        timeout: 8000
      });

      if (resp.data?.status !== 'success') {
        return { error: 'Prometheus rules query failed' };
      }

      const groups = (resp.data.data?.groups || []).map(g => ({
        name: g.name,
        rules: (g.rules || [])
          .filter(r => r.state === 'firing' || r.state === 'pending')
          .map(r => ({
            name: r.name,
            state: r.state,
            query: r.query,
            duration: r.duration,
            labels: r.labels,
            annotations: r.annotations,
            activeCount: (r.alerts || []).length
          }))
      })).filter(g => g.rules.length > 0);

      return { groups, totalFiring: groups.reduce((sum, g) => sum + g.rules.length, 0) };
    } catch (error) {
      return { error: error.message };
    }
  }

  // ===========================
  // Pod Metrics (Prometheus)
  // ===========================

  async fetchCpuMetrics(namespace, podName, lookbackMinutes = 10) {
    const query = `rate(container_cpu_usage_seconds_total{pod="${podName}",namespace="${namespace}",container!=""}[1m])`;
    return this.fetchMetricTimeline(query, lookbackMinutes, 'cpu');
  }

  async fetchMemoryMetrics(namespace, podName, lookbackMinutes = 10) {
    const query = `container_memory_working_set_bytes{pod="${podName}",namespace="${namespace}",container!=""}`;
    return this.fetchMetricTimeline(query, lookbackMinutes, 'memory');
  }

  async fetchNetworkMetrics(namespace, podName, lookbackMinutes = 10) {
    const rxQuery = `rate(container_network_receive_bytes_total{pod="${podName}",namespace="${namespace}"}[1m])`;
    const txQuery = `rate(container_network_transmit_bytes_total{pod="${podName}",namespace="${namespace}"}[1m])`;

    const [rxData, txData] = await Promise.all([
      this.queryPrometheusRange(rxQuery, lookbackMinutes),
      this.queryPrometheusRange(txQuery, lookbackMinutes)
    ]);

    const rxValues = rxData.map(v => ({ timestamp: v[0], value: parseFloat(v[1]) }));
    const txValues = txData.map(v => ({ timestamp: v[0], value: parseFloat(v[1]) }));

    return {
      receiveBytesSec: rxValues.length > 0 ? rxValues[rxValues.length - 1].value : 0,
      transmitBytesSec: txValues.length > 0 ? txValues[txValues.length - 1].value : 0,
      maxReceive: rxValues.length > 0 ? Math.max(...rxValues.map(v => v.value)) : 0,
      maxTransmit: txValues.length > 0 ? Math.max(...txValues.map(v => v.value)) : 0,
      rxTimeline: rxValues.slice(-20),
      txTimeline: txValues.slice(-20)
    };
  }

  async fetchDiskMetrics(namespace, podName, lookbackMinutes = 10) {
    const readQuery = `rate(container_fs_reads_bytes_total{pod="${podName}",namespace="${namespace}",container!=""}[1m])`;
    const writeQuery = `rate(container_fs_writes_bytes_total{pod="${podName}",namespace="${namespace}",container!=""}[1m])`;

    const [readData, writeData] = await Promise.all([
      this.queryPrometheusRange(readQuery, lookbackMinutes),
      this.queryPrometheusRange(writeQuery, lookbackMinutes)
    ]);

    const readValues = readData.map(v => ({ timestamp: v[0], value: parseFloat(v[1]) }));
    const writeValues = writeData.map(v => ({ timestamp: v[0], value: parseFloat(v[1]) }));

    return {
      readBytesSec: readValues.length > 0 ? readValues[readValues.length - 1].value : 0,
      writeBytesSec: writeValues.length > 0 ? writeValues[writeValues.length - 1].value : 0,
      readTimeline: readValues.slice(-20),
      writeTimeline: writeValues.slice(-20)
    };
  }

  // ===========================
  // Node Metrics (Prometheus)
  // ===========================

  async fetchNodeCpuMetrics(nodeName, lookbackMinutes = 10) {
    const query = `1 - avg(rate(node_cpu_seconds_total{mode="idle",instance=~"${nodeName}.*"}[1m]))`;
    return this.fetchMetricTimeline(query, lookbackMinutes, 'cpu');
  }

  async fetchNodeMemoryMetrics(nodeName, lookbackMinutes = 10) {
    const query = `node_memory_MemTotal_bytes{instance=~"${nodeName}.*"} - node_memory_MemAvailable_bytes{instance=~"${nodeName}.*"}`;
    return this.fetchMetricTimeline(query, lookbackMinutes, 'memory');
  }

  async fetchNodeDiskMetrics(nodeName, lookbackMinutes = 10) {
    const query = `1 - (node_filesystem_avail_bytes{instance=~"${nodeName}.*",mountpoint="/"} / node_filesystem_size_bytes{instance=~"${nodeName}.*",mountpoint="/"})`;
    return this.fetchMetricTimeline(query, lookbackMinutes, 'diskUsage');
  }

  // ===========================
  // Prometheus Helpers
  // ===========================

  async fetchMetricTimeline(query, lookbackMinutes, metricType) {
    const data = await this.queryPrometheusRange(query, lookbackMinutes);

    if (!data || data.length === 0) {
      return { error: 'No data', timeline: [] };
    }

    const values = data.map(v => ({ timestamp: v[0], value: parseFloat(v[1]) }));
    const numericValues = values.map(v => v.value);

    const current = numericValues[numericValues.length - 1] || 0;
    const max = Math.max(...numericValues);
    const avg = numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length;

    const result = {
      current,
      max,
      avg,
      timeline: values.slice(-20)
    };

    if (metricType === 'cpu') {
      result.spikeDetected = max > 0.8;
    } else if (metricType === 'memory') {
      result.currentBytes = current;
      result.maxBytes = max;
      result.avgBytes = avg;
      result.oomRisk = current > 0.9 * max && max > 0;
    }

    return result;
  }

  async queryPrometheusRange(query, lookbackMinutes = 10) {
    try {
      const end = Math.floor(Date.now() / 1000);
      const start = end - lookbackMinutes * 60;

      const resp = await axios.get(`${this.prometheusUrl}/api/v1/query_range`, {
        params: { query, start, end, step: '30s' },
        timeout: 8000
      });

      if (resp.data?.status === 'success' && resp.data.data?.result?.length > 0) {
        return resp.data.data.result[0].values || [];
      }
      return [];
    } catch (error) {
      console.warn(`⚠️  Prometheus query failed: ${error.message}`);
      return [];
    }
  }

  // ===========================
  // Kafka
  // ===========================

  async sendEnrichmentToKafka(enrichment) {
    try {
      await this.kafkaProducer.send({
        topic: this.enrichmentTopic,
        messages: [{
          key: enrichment.userId,
          value: JSON.stringify(enrichment),
          headers: {
            'alert-id': enrichment.alertId || '',
            'user-id': enrichment.userId,
            'cluster-id': enrichment.clusterId,
            'alert-name': enrichment.alertname
          }
        }]
      });

      console.log(`📤 Enrichment sent to Kafka: ${enrichment.alertname} (${enrichment.enrichmentDurationMs}ms)`);
    } catch (error) {
      console.error(`❌ Failed to send enrichment to Kafka: ${error.message}`);
    }
  }

  // ===========================
  // Utilities
  // ===========================

  /**
   * Resolve the configured memory limit (bytes) for a pod's first container —
   * matches fetchMemoryMetrics, which queries an aggregate across all containers
   * rather than a specific one. Returns null when no limit is set (can't judge
   * OOM risk without one).
   */
  getContainerMemoryLimitBytes(describe, podName) {
    const containers = describe?.spec?.containers;
    if (!containers?.length) return null;
    const limit = containers[0]?.resources?.limits?.memory;
    if (!limit) return null;
    return this.parseK8sQuantity(limit);
  }

  /**
   * Parse a Kubernetes resource quantity string (e.g. "256Mi", "1Gi", "512000000")
   * into bytes. Returns null if unparseable.
   */
  parseK8sQuantity(qty) {
    if (typeof qty === 'number') return qty;
    if (typeof qty !== 'string') return null;
    const match = qty.match(/^(\d+(?:\.\d+)?)([EPTGMK]i?)?$/);
    if (!match) return null;
    const value = parseFloat(match[1]);
    const unit = match[2];
    const multipliers = {
      Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6,
      K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18,
    };
    return unit ? value * (multipliers[unit] || 1) : value;
  }

  withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
    ]).catch(err => ({ error: err.message }));
  }
}

module.exports = AlertEnricher;
