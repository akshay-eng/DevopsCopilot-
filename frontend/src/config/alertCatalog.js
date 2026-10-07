/**
 * Alert Catalog - Predefined Prometheus Alert Templates
 */

export const alertCatalog = [
  {
    id: 'pod-high-cpu',
    name: 'Pod High CPU Usage',
    description: 'Alert when a pod is using high CPU resources',
    category: 'Resource',
    severity: 'warning',
    variables: [
      { name: 'threshold', label: 'CPU Threshold (%)', type: 'number', default: 80, min: 0, max: 100 },
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      const namespaceFilter = namespace === 'all' ? '' : `,namespace="${namespace}"`;
      return `(sum(rate(container_cpu_usage_seconds_total{container!="POD",container!=""${namespaceFilter}}[5m])) by (namespace,pod) * 100) > ${vars.threshold}`;
    },
    annotations: (vars) => ({
      summary: 'Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} has high CPU usage',
      description: 'Pod {{ $labels.pod }} is using {{ $value }}% CPU, which is above the threshold of ' + vars.threshold + '%'
    })
  },
  {
    id: 'pod-high-memory',
    name: 'Pod High Memory Usage',
    description: 'Alert when a pod is using high memory resources',
    category: 'Resource',
    severity: 'warning',
    variables: [
      { name: 'threshold', label: 'Memory Threshold (MB)', type: 'number', default: 1024, min: 100, max: 10000 },
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      const namespaceFilter = namespace === 'all' ? '' : `,namespace="${namespace}"`;
      return `(sum(container_memory_working_set_bytes{container!="POD",container!=""${namespaceFilter}}) by (namespace,pod) / 1024 / 1024) > ${vars.threshold}`;
    },
    annotations: (vars) => ({
      summary: 'Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} has high memory usage',
      description: 'Pod {{ $labels.pod }} is using {{ $value }}MB memory, which is above the threshold of ' + vars.threshold + 'MB'
    })
  },
  {
    id: 'pod-restart-high',
    name: 'Pod Restart Count High',
    description: 'Alert when a pod has restarted multiple times',
    category: 'Availability',
    severity: 'critical',
    variables: [
      { name: 'threshold', label: 'Restart Count Threshold', type: 'number', default: 5, min: 1, max: 50 },
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 10, min: 5, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      const namespaceFilter = namespace === 'all' ? '' : `,namespace="${namespace}"`;
      return `(sum(kube_pod_container_status_restarts_total{container!=""${namespaceFilter}}) by (namespace,pod)) > ${vars.threshold}`;
    },
    annotations: (vars) => ({
      summary: 'Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} has restarted multiple times',
      description: 'Pod {{ $labels.pod }} has restarted {{ $value }} times in the last ' + vars.duration + ' minutes, which is above the threshold of ' + vars.threshold
    })
  },
  {
    id: 'pod-not-ready',
    name: 'Pod Not Ready',
    description: 'Alert when a pod is not in Ready state',
    category: 'Availability',
    severity: 'critical',
    variables: [
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      const namespaceFilter = namespace === 'all' ? '' : `,namespace="${namespace}"`;
      return `sum(kube_pod_status_phase{phase!="Running"${namespaceFilter}}) by (namespace,pod,phase) > 0`;
    },
    annotations: (vars) => ({
      summary: 'Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is not ready',
      description: 'Pod {{ $labels.pod }} is in {{ $labels.phase }} phase for more than ' + vars.duration + ' minutes'
    })
  },
  {
    id: 'deployment-replica-mismatch',
    name: 'Deployment Replica Mismatch',
    description: 'Alert when deployment desired and available replicas do not match',
    category: 'Availability',
    severity: 'warning',
    variables: [
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 10, min: 5, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      const namespaceFilter = namespace === 'all' ? '' : `,namespace="${namespace}"`;
      return `(kube_deployment_spec_replicas${namespaceFilter} != kube_deployment_status_replicas_available${namespaceFilter}) > 0`;
    },
    annotations: (vars) => ({
      summary: 'Deployment {{ $labels.deployment }} in namespace {{ $labels.namespace }} has replica mismatch',
      description: 'Deployment {{ $labels.deployment }} desired replicas do not match available replicas for more than ' + vars.duration + ' minutes'
    })
  },
  {
    id: 'node-high-cpu',
    name: 'Node High CPU Usage',
    description: 'Alert when a node is using high CPU resources',
    category: 'Resource',
    severity: 'warning',
    variables: [
      { name: 'threshold', label: 'CPU Threshold (%)', type: 'number', default: 80, min: 0, max: 100 },
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      return `(100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)) > ${vars.threshold}`;
    },
    annotations: (vars) => ({
      summary: 'Node {{ $labels.instance }} has high CPU usage',
      description: 'Node {{ $labels.instance }} is using {{ $value }}% CPU, which is above the threshold of ' + vars.threshold + '%'
    })
  },
  {
    id: 'node-high-memory',
    name: 'Node High Memory Usage',
    description: 'Alert when a node is using high memory resources',
    category: 'Resource',
    severity: 'warning',
    variables: [
      { name: 'threshold', label: 'Memory Threshold (%)', type: 'number', default: 85, min: 0, max: 100 },
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      return `(100 * (1 - ((node_memory_MemAvailable_bytes or (node_memory_Buffers_bytes + node_memory_Cached_bytes + node_memory_MemFree_bytes)) / node_memory_MemTotal_bytes))) > ${vars.threshold}`;
    },
    annotations: (vars) => ({
      summary: 'Node {{ $labels.instance }} has high memory usage',
      description: 'Node {{ $labels.instance }} is using {{ $value }}% memory, which is above the threshold of ' + vars.threshold + '%'
    })
  },
  {
    id: 'node-disk-space-low',
    name: 'Node Disk Space Low',
    description: 'Alert when node disk space is running low',
    category: 'Resource',
    severity: 'critical',
    variables: [
      { name: 'threshold', label: 'Disk Usage Threshold (%)', type: 'number', default: 85, min: 0, max: 100 },
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      return `(100 - ((node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"}) * 100)) > ${vars.threshold}`;
    },
    annotations: (vars) => ({
      summary: 'Node {{ $labels.instance }} has low disk space',
      description: 'Node {{ $labels.instance }} disk usage is {{ $value }}%, which is above the threshold of ' + vars.threshold + '%'
    })
  },
  {
    id: 'container-oom-killed',
    name: 'Container OOM Killed',
    description: 'Alert when a container is killed due to out of memory',
    category: 'Availability',
    severity: 'critical',
    variables: [
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 1, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      const namespaceFilter = namespace === 'all' ? '' : `,namespace="${namespace}"`;
      return `(kube_pod_container_status_last_terminated_reason{reason="OOMKilled"${namespaceFilter}}) > 0`;
    },
    annotations: (vars) => ({
      summary: 'Container in pod {{ $labels.pod }} was OOM killed',
      description: 'Container {{ $labels.container }} in pod {{ $labels.pod }} (namespace {{ $labels.namespace }}) was killed due to out of memory'
    })
  },
  {
    id: 'persistent-volume-claim-pending',
    name: 'PersistentVolumeClaim Pending',
    description: 'Alert when a PVC is in pending state',
    category: 'Storage',
    severity: 'warning',
    variables: [
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      const namespaceFilter = namespace === 'all' ? '' : `,namespace="${namespace}"`;
      return `(kube_persistentvolumeclaim_status_phase{phase="Pending"${namespaceFilter}}) > 0`;
    },
    annotations: (vars) => ({
      summary: 'PersistentVolumeClaim {{ $labels.persistentvolumeclaim }} is pending',
      description: 'PVC {{ $labels.persistentvolumeclaim }} in namespace {{ $labels.namespace }} has been pending for more than ' + vars.duration + ' minutes'
    })
  },
  {
    id: 'service-endpoint-not-ready',
    name: 'Service Endpoint Not Ready',
    description: 'Alert when service has no ready endpoints',
    category: 'Availability',
    severity: 'critical',
    variables: [
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      const namespaceFilter = namespace === 'all' ? '' : `,namespace="${namespace}"`;
      return `(kube_endpoint_address_available${namespaceFilter} == 0)`;
    },
    annotations: (vars) => ({
      summary: 'Service {{ $labels.endpoint }} has no ready endpoints',
      description: 'Service {{ $labels.endpoint }} in namespace {{ $labels.namespace }} has no ready endpoints for more than ' + vars.duration + ' minutes'
    })
  },
  {
    id: 'high-network-receive',
    name: 'High Network Receive Rate',
    description: 'Alert when pod network receive rate is high',
    category: 'Network',
    severity: 'warning',
    variables: [
      { name: 'threshold', label: 'Receive Rate Threshold (MB/s)', type: 'number', default: 100, min: 1, max: 1000 },
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      const namespaceFilter = namespace === 'all' ? '' : `,namespace="${namespace}"`;
      return `(sum(rate(container_network_receive_bytes_total${namespaceFilter}[5m])) by (namespace,pod) / 1024 / 1024) > ${vars.threshold}`;
    },
    annotations: (vars) => ({
      summary: 'Pod {{ $labels.pod }} has high network receive rate',
      description: 'Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is receiving {{ $value }}MB/s, which is above the threshold of ' + vars.threshold + 'MB/s'
    })
  },
  {
    id: 'high-network-transmit',
    name: 'High Network Transmit Rate',
    description: 'Alert when pod network transmit rate is high',
    category: 'Network',
    severity: 'warning',
    variables: [
      { name: 'threshold', label: 'Transmit Rate Threshold (MB/s)', type: 'number', default: 100, min: 1, max: 1000 },
      { name: 'duration', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 }
    ],
    promql: (vars, cluster, namespace) => {
      const namespaceFilter = namespace === 'all' ? '' : `,namespace="${namespace}"`;
      return `(sum(rate(container_network_transmit_bytes_total${namespaceFilter}[5m])) by (namespace,pod) / 1024 / 1024) > ${vars.threshold}`;
    },
    annotations: (vars) => ({
      summary: 'Pod {{ $labels.pod }} has high network transmit rate',
      description: 'Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is transmitting {{ $value }}MB/s, which is above the threshold of ' + vars.threshold + 'MB/s'
    })
  }
];

export const alertCategories = [
  { id: 'all', name: 'All Categories', icon: '🔔' },
  { id: 'Resource', name: 'Resource', icon: '⚡' },
  { id: 'Availability', name: 'Availability', icon: '✓' },
  { id: 'Network', name: 'Network', icon: '🌐' },
  { id: 'Storage', name: 'Storage', icon: '💾' }
];

export const severityLevels = [
  { id: 'critical', name: 'Critical', color: 'red' },
  { id: 'warning', name: 'Warning', color: 'yellow' },
  { id: 'info', name: 'Info', color: 'blue' }
];
