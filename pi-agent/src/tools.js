/**
 * Agent tools.
 *
 * Each tool is a thin, authenticated call into the existing AIOps platform API
 * (authService), so the Pi agent reuses all the working backend logic — cluster
 * reads, metrics, vulnerability scans and agentic remediation.
 *
 * Tools are built per-request so the caller's JWT + selected cluster are bound
 * into each execution (pi AgentTool.execute has no context argument).
 */

import { Type } from '@mariozechner/pi-ai';

function text(t) { return { content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] }; }

/** Map a connector param descriptor onto a TypeBox schema. */
function paramSchema(p) {
  const opts = p.description ? { description: p.description } : {};
  switch (p.type) {
    case 'number': return Type.Number(opts);
    case 'boolean': return Type.Boolean(opts);
    case 'object': return Type.Record(Type.String(), Type.Any(), opts);
    case 'array': return Type.Array(p.items === 'number' ? Type.Number() : Type.String(), opts);
    default: return Type.String(opts);
  }
}

/**
 * Turn every configured integration's actions into first-class agent tools, so
 * the model can actually operate ServiceNow / GitHub / Jenkins / Argo CD / AWX.
 * Tools are named `<integration>_<action>` (e.g. snow_create_incident).
 */
export async function buildIntegrationTools({ platformUrl, authToken }) {
  let catalog = [];
  try {
    const res = await fetch(`${platformUrl}/api/integrations/catalog`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    if (!res.ok) return [];
    const data = await res.json();
    catalog = data?.integrations || [];
  } catch {
    return [];
  }

  const tools = [];
  for (const integ of catalog) {
    // Only expose integrations the user has actually connected.
    if (!integ.configured || integ.enabled === false) continue;

    for (const action of integ.actions || []) {
      const props = {};
      for (const p of action.params || []) {
        const s = paramSchema(p);
        props[p.name] = p.required ? s : Type.Optional(s);
      }

      tools.push({
        name: `${integ.id}_${action.name}`,
        description: `[${integ.displayName || integ.name}] ${action.description}`,
        parameters: Type.Object(props),
        async execute(_id, params) {
          const res = await fetch(`${platformUrl}/api/integrations/${integ.id}/actions/${action.name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
            body: JSON.stringify({ params }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || body.success === false) {
            return text(`Error from ${integ.id}.${action.name}: ${body.error || `HTTP ${res.status}`}`);
          }
          return text(body.result);
        },
      });
    }
  }
  return tools;
}

export function buildTools({ platformUrl, authToken, clusterId }) {
  const call = async (method, pathAndQuery, body) => {
    const res = await fetch(`${platformUrl}${pathAndQuery}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const txt = await res.text();
    let json; try { json = JSON.parse(txt); } catch { json = txt; }
    if (!res.ok) throw new Error(`platform ${method} ${pathAndQuery} -> ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
    return json;
  };

  const requireCluster = () => {
    if (!clusterId) throw new Error('No cluster selected for this request.');
    return clusterId;
  };

  return [
    {
      name: 'list_clusters',
      description: 'List the Kubernetes clusters connected to AIOps.',
      parameters: Type.Object({}),
      execute: async () => text(await call('GET', '/api/clusters')),
    },
    {
      name: 'list_resources',
      description: 'List Kubernetes resources of a given type in a namespace.',
      parameters: Type.Object({
        resourceType: Type.String({ description: "pods | deployments | services | statefulsets | daemonsets" }),
        namespace: Type.String({ description: 'Namespace name', default: 'default' }),
      }),
      execute: async (_id, p) =>
        text(await call('GET', `/api/clusters/${requireCluster()}/resources/${p.resourceType}?namespace=${encodeURIComponent(p.namespace || 'default')}`)),
    },
    {
      name: 'get_pod_logs',
      description: 'Fetch recent logs for a pod.',
      parameters: Type.Object({
        namespace: Type.String(),
        name: Type.String({ description: 'Pod name' }),
        tailLines: Type.Optional(Type.Number({ default: 200 })),
      }),
      execute: async (_id, p) =>
        text(await call('GET', `/api/clusters/${requireCluster()}/pods/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}/logs?tailLines=${p.tailLines || 200}`)),
    },
    {
      name: 'get_pod_metrics',
      description: 'Get CPU/memory metrics for a pod.',
      parameters: Type.Object({
        namespace: Type.String(),
        name: Type.String({ description: 'Pod name' }),
        range: Type.Optional(Type.String({ default: '1h' })),
      }),
      execute: async (_id, p) =>
        text(await call('GET', `/api/clusters/${requireCluster()}/pods/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}/metrics?range=${p.range || '1h'}`)),
    },
    {
      name: 'get_resource_vulnerabilities',
      description: 'Get Trivy vulnerability scan results (CVEs) for a workload.',
      parameters: Type.Object({
        namespace: Type.String(),
        kind: Type.String({ description: 'pod | deployment | statefulset | daemonset' }),
        name: Type.String(),
      }),
      execute: async (_id, p) =>
        text(await call('GET', `/api/vulnerabilities/resource?namespace=${encodeURIComponent(p.namespace)}&kind=${encodeURIComponent(p.kind)}&name=${encodeURIComponent(p.name)}`)),
    },
    {
      name: 'remediate_vulnerability',
      description: 'Remediate vulnerabilities on a workload: opens a ServiceNow change request and (if apply=true) rolls the container image to the fixed version.',
      parameters: Type.Object({
        namespace: Type.String(),
        kind: Type.String(),
        name: Type.String(),
        container: Type.String({ description: 'Container to patch' }),
        currentImage: Type.Optional(Type.String()),
        targetImage: Type.String({ description: 'Fixed image tag to roll to' }),
        apply: Type.Optional(Type.Boolean({ description: 'Actually patch the workload', default: false })),
        cveIds: Type.Optional(Type.Array(Type.String())),
      }),
      execute: async (_id, p) =>
        text(await call('POST', '/api/vulnerabilities/remediate', {
          resource: { namespace: p.namespace, kind: p.kind, name: p.name },
          vulnerabilities: (p.cveIds || []).map((id) => ({ id, fixable: true })),
          container: p.container,
          currentImage: p.currentImage,
          targetImage: p.targetImage,
          apply: !!p.apply,
        })),
    },
    {
      name: 'get_cluster_vulnerability_summary',
      description: 'Cluster-wide vulnerability report: severity totals, worst namespaces and images.',
      parameters: Type.Object({}),
      execute: async () => text(await call('GET', '/api/vulnerabilities/summary')),
    },
    // ── Cluster compliance ────────────────────────────────────────────────
    {
      name: 'check_cluster_compliance',
      description: 'Evaluate a cluster against its compliance baseline (control-plane count, minimum node CPU/memory, required namespaces, platform agent health, workload placement). Returns a score plus every failing check with evidence. Use this when asked whether a cluster is compliant, or before proposing onboarding fixes.',
      parameters: Type.Object({
        clusterId: Type.String({ description: 'Cluster ID from list_clusters' }),
      }),
      execute: async (_id, p) => text(await call('POST', `/api/compliance/evaluate/${p.clusterId}`)),
    },
    {
      name: 'get_compliance_policy',
      description: 'Show the compliance baseline in force for a cluster — which rules are checked, their parameters and severity, and whether it is the cluster-specific, account-default or built-in policy.',
      parameters: Type.Object({
        clusterId: Type.Optional(Type.String({ description: 'Omit for the account-wide default' })),
      }),
      execute: async (_id, p) =>
        text(await call('GET', `/api/compliance/policy${p.clusterId ? `?clusterId=${p.clusterId}` : ''}`)),
    },
    {
      name: 'remediate_cluster_compliance',
      description: 'Apply the automatable compliance fixes for a cluster (currently: creating required namespaces) and return what still needs a human. Physical or destructive changes — adding nodes, resizing hardware, moving control-plane pods — are never performed here and come back as manual guidance you should relay.',
      parameters: Type.Object({
        clusterId: Type.String({ description: 'Cluster ID from list_clusters' }),
        ruleIds: Type.Optional(Type.Array(Type.String(), { description: 'Limit to these rule ids; omit for all remediable ones' })),
      }),
      execute: async (_id, p) =>
        text(await call('POST', `/api/compliance/remediate/${p.clusterId}`, { ruleIds: p.ruleIds })),
    },

    {
      name: 'get_alerts',
      description: 'Get recent alerts / firing incidents.',
      parameters: Type.Object({ hours: Type.Optional(Type.Number({ default: 24 })) }),
      execute: async (_id, p) => text(await call('GET', `/api/alerts/trends?hours=${p.hours || 24}`)),
    },

    // ── Knowledge base (vectorised tickets + past incidents) ──────────────
    {
      name: 'search_similar_tickets',
      description: 'Search past ServiceNow tickets (incidents & change requests) ingested into the knowledge base. Use this BEFORE proposing a fix, to see how similar problems were resolved before, and cite the ticket numbers.',
      parameters: Type.Object({
        query: Type.String({ description: 'Symptoms/error text, e.g. "kube-proxy CrashLoopBackOff on worker node"' }),
        topK: Type.Optional(Type.Number({ description: 'Default 5' })),
      }),
      execute: async (_id, p) =>
        text(await call('GET', `/api/vectors/search/tickets?q=${encodeURIComponent(p.query)}&topK=${p.topK || 5}`)),
    },
    {
      name: 'search_similar_incidents',
      description: 'Search previously correlated incidents (root cause, evidence, remediation) from this platform. Use to check whether this problem has been seen and fixed before.',
      parameters: Type.Object({
        query: Type.String(),
        topK: Type.Optional(Type.Number()),
      }),
      execute: async (_id, p) =>
        text(await call('GET', `/api/vectors/search/incidents?q=${encodeURIComponent(p.query)}&topK=${p.topK || 5}`)),
    },
    {
      name: 'analyze_alert',
      description: 'Triage an alert: decide whether it is an INFRASTRUCTURE or APPLICATION (or configuration/capacity/dependency) problem, with root cause, evidence, ordered resolution steps and preventive measures. Use this before answering "why did this fire" or "how do I fix it".',
      parameters: Type.Object({
        alertId: Type.Optional(Type.String({ description: 'Alert document id — preferred, uses stored enrichment (metrics/logs/events)' })),
        alertname: Type.Optional(Type.String()),
        namespace: Type.Optional(Type.String()),
        pod: Type.Optional(Type.String()),
        severity: Type.Optional(Type.String()),
        message: Type.Optional(Type.String()),
      }),
      execute: async (_id, p) => {
        if (p.alertId) return text(await call('POST', `/api/alerts/analyze/${p.alertId}`, {}));
        return text(await call('POST', '/api/alerts/analyze', {
          alert: { alertname: p.alertname, namespace: p.namespace, pod: p.pod, severity: p.severity, message: p.message },
        }));
      },
    },
    {
      name: 'explain_vulnerability',
      description: 'Get a structured explanation of a CVE — root cause, impact, concrete fix and how to verify it.',
      parameters: Type.Object({
        id: Type.String({ description: 'CVE id' }),
        package: Type.Optional(Type.String()),
        installedVersion: Type.Optional(Type.String()),
        fixedVersion: Type.Optional(Type.String()),
        severity: Type.Optional(Type.String()),
        title: Type.Optional(Type.String()),
      }),
      execute: async (_id, p) => text(await call('POST', '/api/vulnerabilities/explain', { vulnerability: p })),
    },

    // ── Alert correlation → ITSM ──────────────────────────────────────────
    {
      name: 'get_correlated_incidents',
      description: 'List correlated alert groups (clusters of related alerts with a root cause). Each has an id you can act on.',
      parameters: Type.Object({
        status: Type.Optional(Type.String({ description: 'active | acknowledged | resolved' })),
        limit: Type.Optional(Type.Number()),
      }),
      execute: async (_id, p) => {
        const qs = new URLSearchParams();
        if (p.status) qs.set('status', p.status);
        qs.set('limit', String(p.limit || 20));
        const r = await call('GET', `/api/correlation/incidents?${qs}`);
        const slim = (r.incidents || []).map((i) => ({
          id: i._id,
          rootCause: i.rootCause?.pod,
          namespace: i.rootCause?.namespace,
          alertCount: i.alertCount,
          alertNames: i.alertNames,
          pods: i.pods,
          severities: i.severities,
          occurrences: i.occurrences,
          snowIncident: i.snowIncident?.number || null,
          changeRequest: i.changeRequest?.number || null,
        }));
        return text({ count: slim.length, incidents: slim });
      },
    },
    {
      name: 'assess_correlation_remediation',
      description: 'Check whether remediating a correlated incident would change production (and therefore needs a change request).',
      parameters: Type.Object({ correlationId: Type.String() }),
      execute: async (_id, p) => text(await call('GET', `/api/correlation/incidents/${p.correlationId}/assessment`)),
    },
    {
      name: 'create_incident_for_correlation',
      description: 'Raise a ServiceNow INCIDENT for a correlated alert group (idempotent — returns the existing one if already raised).',
      parameters: Type.Object({
        correlationId: Type.String({ description: 'id from get_correlated_incidents' }),
        force: Type.Optional(Type.Boolean({ description: 'Create a second incident even if one exists' })),
      }),
      execute: async (_id, p) => text(await call('POST', `/api/correlation/incidents/${p.correlationId}/snow`, { force: !!p.force })),
    },
    {
      name: 'raise_change_request_for_correlation',
      description: 'Raise a ServiceNow CHANGE REQUEST for remediating a correlated incident. Use when the fix modifies production (restart/scale/patch/rollback/node work).',
      parameters: Type.Object({
        correlationId: Type.String(),
        plan: Type.Optional(Type.String({ description: 'The remediation you intend to perform' })),
        reason: Type.Optional(Type.String({ description: 'Why a production change is required' })),
        riskLevel: Type.Optional(Type.String({ description: '1=High 2=Moderate 3=Low' })),
      }),
      execute: async (_id, p) => text(await call('POST', `/api/correlation/incidents/${p.correlationId}/change-request`, {
        plan: p.plan, reason: p.reason, riskLevel: p.riskLevel,
      })),
    },
    {
      name: 'process_correlation',
      description: 'One shot: raise the ServiceNow incident for a correlated alert group and, if remediation mutates production, raise the change request too.',
      parameters: Type.Object({
        correlationId: Type.String(),
        raiseChange: Type.Optional(Type.Boolean({ description: 'Default true' })),
      }),
      execute: async (_id, p) => text(await call('POST', `/api/correlation/incidents/${p.correlationId}/process`, {
        raiseChange: p.raiseChange !== false,
      })),
    },
  ];
}
