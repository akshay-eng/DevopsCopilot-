/**
 * Kubernetes Service
 *
 * Handles direct communication with Kubernetes clusters to fetch resource data
 */

const k8s = require('@kubernetes/client-node');

/**
 * Get Kubernetes client for local cluster
 * Uses the same kubeconfig as the cluster agent
 */
function getK8sClient() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  return {
    coreApi: kc.makeApiClient(k8s.CoreV1Api),
    appsApi: kc.makeApiClient(k8s.AppsV1Api),
    batchApi: kc.makeApiClient(k8s.BatchV1Api),
  };
}

/**
 * Get all namespaces
 */
async function getNamespaces() {
  try {
    const { coreApi } = getK8sClient();
    const response = await coreApi.listNamespace();

    // The response is the object directly, not wrapped in { body: ... }
    const items = (response.body || response).items || [];

    return items.map(ns => ({
      name: ns.metadata.name,
      status: ns.status.phase,
      createdAt: ns.metadata.creationTimestamp,
      labels: ns.metadata.labels || {}
    }));
  } catch (error) {
    console.error('Error fetching namespaces from Kubernetes:', error.message);
    throw error;
  }
}

/**
 * Get all nodes
 */
async function getNodes() {
  try {
    const { coreApi } = getK8sClient();
    const response = await coreApi.listNode();

    // Get pod list to count pods per node
    let podList = [];
    try {
      const podResponse = await coreApi.listPodForAllNamespaces();
      podList = (podResponse.body || podResponse).items || [];
    } catch (err) {
      console.error('Error fetching pods for node pod count:', err.message);
    }

    const items = (response.body || response).items || [];
    return items.map(node => {
      // Extract IP addresses
      const internalIP = node.status.addresses?.find(addr => addr.type === 'InternalIP')?.address;
      const externalIP = node.status.addresses?.find(addr => addr.type === 'ExternalIP')?.address;

      // Count pods on this node
      const podsOnNode = podList.filter(pod => pod.spec.nodeName === node.metadata.name);
      const pod_count = podsOnNode.length;

      // Extract roles
      const roles = Object.keys(node.metadata.labels || {})
        .filter(label => label.startsWith('node-role.kubernetes.io/'))
        .map(label => label.replace('node-role.kubernetes.io/', ''));

      return {
        name: node.metadata.name,
        status: node.status.conditions?.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
        roles: roles.length > 0 ? roles : ['<none>'],
        age: node.metadata.creationTimestamp,
        internal_ip: internalIP,
        external_ip: externalIP,
        pod_count: pod_count,
        taints: node.spec.taints || [],
        capacity: {
          cpu: node.status.capacity?.cpu,
          memory: node.status.capacity?.memory,
          pods: node.status.capacity?.pods
        },
        allocatable: {
          cpu: node.status.allocatable?.cpu,
          memory: node.status.allocatable?.memory,
          pods: node.status.allocatable?.pods
        },
        node_info: {
          os_image: node.status.nodeInfo?.osImage,
          kernel_version: node.status.nodeInfo?.kernelVersion,
          kubelet_version: node.status.nodeInfo?.kubeletVersion,
          container_runtime_version: node.status.nodeInfo?.containerRuntimeVersion,
          architecture: node.status.nodeInfo?.architecture,
          operating_system: node.status.nodeInfo?.operatingSystem
        }
      };
    });
  } catch (error) {
    console.error('Error fetching nodes from Kubernetes:', error.message);
    throw error;
  }
}

/**
 * Get resources by type and namespace
 */
async function getResources(type, namespace = null) {
  try {
    const { coreApi, appsApi, batchApi } = getK8sClient();
    let response;

    switch (type.toLowerCase()) {
      case 'pods':
        response = (namespace && namespace !== 'all')
          ? await coreApi.listNamespacedPod(namespace)
          : await coreApi.listPodForAllNamespaces();
        return ((response.body || response).items || []).map(pod => ({
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          status: pod.status.phase,
          ready: pod.status.containerStatuses?.filter(c => c.ready).length + '/' + pod.status.containerStatuses?.length || '0/0',
          restarts: pod.status.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) || 0,
          age: pod.metadata.creationTimestamp,
          podIP: pod.status.podIP,
          nodeName: pod.spec.nodeName,
          containers: pod.spec.containers?.map(c => ({
            name: c.name,
            image: c.image,
            ready: pod.status.containerStatuses?.find(cs => cs.name === c.name)?.ready || false
          })) || []
        }));

      case 'deployments':
        response = (namespace && namespace !== 'all')
          ? await appsApi.listNamespacedDeployment(namespace)
          : await appsApi.listDeploymentForAllNamespaces();
        return ((response.body || response).items || []).map(deploy => ({
          name: deploy.metadata.name,
          namespace: deploy.metadata.namespace,
          replicas: `${deploy.status.readyReplicas || 0}/${deploy.spec.replicas || 0}`,
          status: deploy.status.readyReplicas === deploy.spec.replicas ? 'Running' : 'Pending',
          ready: deploy.status.readyReplicas || 0,
          upToDate: deploy.status.updatedReplicas || 0,
          available: deploy.status.availableReplicas || 0,
          age: deploy.metadata.creationTimestamp,
          selector: deploy.spec.selector?.matchLabels || {}
        }));

      case 'services':
        response = (namespace && namespace !== 'all')
          ? await coreApi.listNamespacedService(namespace)
          : await coreApi.listServiceForAllNamespaces();
        return ((response.body || response).items || []).map(svc => ({
          name: svc.metadata.name,
          namespace: svc.metadata.namespace,
          type: svc.spec.type,
          clusterIP: svc.spec.clusterIP,
          externalIP: svc.status.loadBalancer?.ingress?.[0]?.ip || svc.spec.externalIPs?.[0] || '-',
          ports: svc.spec.ports?.map(p => `${p.port}${p.protocol !== 'TCP' ? '/' + p.protocol : ''}`) || [],
          age: svc.metadata.creationTimestamp,
          selector: svc.spec.selector || {}
        }));

      case 'statefulsets':
        response = (namespace && namespace !== 'all')
          ? await appsApi.listNamespacedStatefulSet(namespace)
          : await appsApi.listStatefulSetForAllNamespaces();
        return ((response.body || response).items || []).map(sts => ({
          name: sts.metadata.name,
          namespace: sts.metadata.namespace,
          replicas: `${sts.status.readyReplicas || 0}/${sts.spec.replicas || 0}`,
          status: sts.status.readyReplicas === sts.spec.replicas ? 'Running' : 'Pending',
          ready: sts.status.readyReplicas || 0,
          age: sts.metadata.creationTimestamp
        }));

      case 'daemonsets':
        response = (namespace && namespace !== 'all')
          ? await appsApi.listNamespacedDaemonSet(namespace)
          : await appsApi.listDaemonSetForAllNamespaces();
        return ((response.body || response).items || []).map(ds => ({
          name: ds.metadata.name,
          namespace: ds.metadata.namespace,
          desired: ds.status.desiredNumberScheduled || 0,
          current: ds.status.currentNumberScheduled || 0,
          ready: ds.status.numberReady || 0,
          upToDate: ds.status.updatedNumberScheduled || 0,
          available: ds.status.numberAvailable || 0,
          age: ds.metadata.creationTimestamp
        }));

      case 'jobs':
        response = (namespace && namespace !== 'all')
          ? await batchApi.listNamespacedJob(namespace)
          : await batchApi.listJobForAllNamespaces();
        return ((response.body || response).items || []).map(job => ({
          name: job.metadata.name,
          namespace: job.metadata.namespace,
          completions: job.spec.completions || 1,
          succeeded: job.status.succeeded || 0,
          active: job.status.active || 0,
          failed: job.status.failed || 0,
          age: job.metadata.creationTimestamp
        }));

      case 'cronjobs':
        response = (namespace && namespace !== 'all')
          ? await batchApi.listNamespacedCronJob(namespace)
          : await batchApi.listCronJobForAllNamespaces();
        return ((response.body || response).items || []).map(cj => ({
          name: cj.metadata.name,
          namespace: cj.metadata.namespace,
          schedule: cj.spec.schedule,
          suspend: cj.spec.suspend || false,
          active: cj.status.active?.length || 0,
          lastSchedule: cj.status.lastScheduleTime,
          age: cj.metadata.creationTimestamp
        }));

      default:
        throw new Error(`Unsupported resource type: ${type}`);
    }
  } catch (error) {
    console.error(`Error fetching ${type} from Kubernetes:`, error.message);
    throw error;
  }
}

/**
 * Get single resource details
 */
async function getResourceDetails(type, namespace, name) {
  try {
    const { coreApi, appsApi, batchApi } = getK8sClient();
    let response;

    switch (type.toLowerCase()) {
      case 'pod':
      case 'pods':
        response = await coreApi.readNamespacedPod(name, namespace);
        break;
      case 'deployment':
      case 'deployments':
        response = await appsApi.readNamespacedDeployment(name, namespace);
        break;
      case 'service':
      case 'services':
        response = await coreApi.readNamespacedService(name, namespace);
        break;
      case 'statefulset':
      case 'statefulsets':
        response = await appsApi.readNamespacedStatefulSet(name, namespace);
        break;
      case 'daemonset':
      case 'daemonsets':
        response = await appsApi.readNamespacedDaemonSet(name, namespace);
        break;
      case 'job':
      case 'jobs':
        response = await batchApi.readNamespacedJob(name, namespace);
        break;
      case 'cronjob':
      case 'cronjobs':
        response = await batchApi.readNamespacedCronJob(name, namespace);
        break;
      default:
        throw new Error(`Unsupported resource type: ${type}`);
    }

    // v0.21.0 wraps response in { response, body } — unwrap to get the resource object
    return response.body || response;
  } catch (error) {
    console.error(`Error fetching ${type}/${namespace}/${name} from Kubernetes:`, error.message);
    throw error;
  }
}

/**
 * Get resource YAML representation
 */
async function getResourceYAML(type, namespace, name) {
  try {
    const yaml = require('js-yaml');
    const resource = await getResourceDetails(type, namespace, name);

    // Convert to YAML
    const yamlString = yaml.dump(resource, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });

    return yamlString;
  } catch (error) {
    console.error(`Error fetching YAML for ${type}/${namespace}/${name}:`, error.message);
    throw error;
  }
}

/**
 * Get pod logs
 */
async function getPodLogs(namespace, name, options = {}) {
  try {
    const { coreApi } = getK8sClient();
    const { container, tailLines = 200, follow = false } = options;

    // v0.21.0: readNamespacedPodLog(name, namespace, container, follow,
    //   insecureSkipTLSVerifyBackend, limitBytes, pretty, previous, sinceSeconds, tailLines)
    const response = await coreApi.readNamespacedPodLog(
      name,
      namespace,
      container || undefined,
      follow || undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tailLines || undefined
    );
    return response.body || response;
  } catch (error) {
    console.error(`Error fetching logs for pod ${namespace}/${name}:`, error.message);
    throw error;
  }
}

/**
 * Create a namespace. The one mutating call compliance remediation makes —
 * it is additive and reversible, which is why it is automated while node and
 * control-plane changes are left to a human.
 */
async function createNamespace(name) {
  const { coreApi } = getK8sClient();
  try {
    await coreApi.createNamespace({ metadata: { name } });
    return { created: true, name };
  } catch (e) {
    const status = e?.statusCode || e?.response?.statusCode || e?.code;
    if (status === 409) return { created: false, name, reason: 'already exists' };
    throw new Error(`Could not create namespace ${name}: ${e?.body?.message || e.message}`);
  }
}

module.exports = {
  createNamespace,
  getNamespaces,
  getNodes,
  getResources,
  getResourceDetails,
  getResourceYAML,
  getPodLogs
};
