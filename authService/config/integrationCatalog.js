/**
 * Integration catalog — the manifests, grouped by category.
 *
 * Kept separate from integrationRegistry.js so the registry stays readable: the
 * registry owns the schema, helpers and validation, this file owns the data.
 *
 * A manifest with a `probe` block needs no bespoke connector — services/
 * connectors/generic.js turns the probe into a real `test()` plus an
 * `http_get` action, so an integration is verifiable the moment it is declared.
 * Manifests WITHOUT a probe are config-only: they store credentials for other
 * parts of the platform and are marked `testable: false` rather than offering a
 * Test button that cannot mean anything.
 *
 * @param {{TLS_FIELDS: Function, OAUTH_FIELDS: Function}} h shared field builders
 */
module.exports = ({ TLS_FIELDS, OAUTH_FIELDS }) => ([

  // ───────────────────────────── Observability ─────────────────────────────
  {
    id: 'prometheus', name: 'Prometheus', category: 'Observability',
    description: 'Query metrics for alert enrichment, capacity and cost analysis.',
    docsUrl: 'https://prometheus.io/docs/prometheus/latest/querying/api/', testable: true,
    fields: [
      { name: 'url', label: 'Prometheus URL', type: 'url', placeholder: 'http://prometheus:9090', required: true },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'none', label: 'No Authentication', default: true, fields: [] },
      { id: 'basic', label: 'Username & Password', fields: [
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
      ] },
      { id: 'token', label: 'Bearer Token', fields: [
        { name: 'token', label: 'Token', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: {
      path: '/api/v1/query?query=up', authOptional: true, okText: 'Prometheus is responding',
      pick: (b) => `${(b?.data?.result || []).length} targets reporting "up"`,
    },
  },

  {
    id: 'grafana', name: 'Grafana', category: 'Observability',
    description: 'Read dashboards and datasources; link an alert to the right panel.',
    docsUrl: 'https://grafana.com/docs/grafana/latest/developers/http_api/', testable: true,
    fields: [
      { name: 'url', label: 'Grafana URL', type: 'url', placeholder: 'https://grafana.example.com', required: true },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'token', label: 'Service Account Token', default: true, fields: [
        { name: 'token', label: 'Token', type: 'password', placeholder: 'glsa_...', required: true, secret: true },
      ] },
      { id: 'basic', label: 'Username & Password', fields: [
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: { path: '/api/org', okText: 'Connected to Grafana', pick: (b) => `org "${b?.name || '?'}"` },
  },

  {
    id: 'loki', name: 'Grafana Loki', category: 'Observability',
    description: 'Query logs for alert enrichment and root-cause analysis.',
    docsUrl: 'https://grafana.com/docs/loki/latest/reference/loki-http-api/', testable: true,
    fields: [
      { name: 'url', label: 'Loki URL', type: 'url', placeholder: 'http://loki:3100', required: true },
      { name: 'tenant_id', label: 'Tenant ID (X-Scope-OrgID)', type: 'text', placeholder: 'optional' },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'none', label: 'No Authentication', default: true, fields: [] },
      { id: 'basic', label: 'Username & Password', fields: [
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: {
      path: '/loki/api/v1/labels', authOptional: true, okText: 'Loki is responding',
      pick: (b) => `${(b?.data || []).length} label(s) available`,
    },
  },

  {
    id: 'elasticsearch', name: 'Elasticsearch', category: 'Observability',
    description: 'Search application logs and indices during incident triage.',
    docsUrl: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/rest-apis.html', testable: true,
    fields: [
      { name: 'url', label: 'Elasticsearch URL', type: 'url', placeholder: 'https://es.example.com:9200', required: true },
      { name: 'default_index', label: 'Default Index Pattern', type: 'text', placeholder: 'logs-*' },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'basic', label: 'Username & Password', default: true, fields: [
        { name: 'username', label: 'Username', type: 'text', placeholder: 'elastic', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
      ] },
      { id: 'api_key', label: 'API Key', fields: [
        { name: 'api_key', label: 'API Key (base64 id:key)', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: {
      path: '/', okText: 'Connected to Elasticsearch',
      pick: (b) => `cluster "${b?.cluster_name || '?'}" v${b?.version?.number || '?'}`,
    },
  },

  {
    id: 'datadog', name: 'Datadog', category: 'Observability',
    description: 'Read monitors and metrics; correlate them with cluster alerts.',
    docsUrl: 'https://docs.datadoghq.com/api/latest/', testable: true,
    fields: [
      { name: 'url', label: 'API Site', type: 'url', placeholder: 'https://api.datadoghq.com', required: true,
        help: 'Use https://api.datadoghq.eu for the EU site.' },
    ],
    authMethods: [
      { id: 'api_key', label: 'API + Application Key', default: true, fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true, secret: true },
        { name: 'app_key', label: 'Application Key', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: { path: '/api/v1/validate', style: { apiKeyHeader: 'DD-API-KEY' }, okText: 'Datadog API key is valid' },
  },

  {
    id: 'newrelic', name: 'New Relic', category: 'Observability',
    description: 'Query APM and infrastructure data.',
    docsUrl: 'https://docs.newrelic.com/docs/apis/nerdgraph/', testable: true,
    fields: [
      { name: 'url', label: 'API URL', type: 'url', placeholder: 'https://api.newrelic.com', required: true },
      { name: 'account_id', label: 'Account ID', type: 'text', required: true },
    ],
    authMethods: [
      { id: 'api_key', label: 'User API Key', default: true, fields: [
        { name: 'api_key', label: 'API Key', type: 'password', placeholder: 'NRAK-...', required: true, secret: true },
      ] },
    ],
    probe: { path: '/v2/applications.json', style: { apiKeyHeader: 'X-Api-Key' }, okText: 'Connected to New Relic' },
  },

  {
    id: 'splunk', name: 'Splunk', category: 'Observability',
    description: 'Run saved searches and read server state.',
    docsUrl: 'https://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTprolog', testable: true,
    fields: [
      { name: 'url', label: 'Management URL', type: 'url', placeholder: 'https://splunk.example.com:8089', required: true },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'token', label: 'Bearer Token', default: true, fields: [
        { name: 'token', label: 'Token', type: 'password', required: true, secret: true },
      ] },
      { id: 'basic', label: 'Username & Password', fields: [
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: { path: '/services/server/info?output_mode=json', okText: 'Connected to Splunk' },
  },

  // ───────────────────────────── Source & CI ─────────────────────────────
  {
    id: 'gitlab', name: 'GitLab', category: 'Source & CI',
    description: 'Read repos and manifests, open merge requests, trigger CI pipelines.',
    docsUrl: 'https://docs.gitlab.com/ee/api/', testable: true,
    fields: [
      { name: 'url', label: 'GitLab URL', type: 'url', placeholder: 'https://gitlab.com', required: true },
      { name: 'default_project', label: 'Default Project (path or ID)', type: 'text', placeholder: 'group/repo' },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'token', label: 'Personal / Project Access Token', default: true, fields: [
        { name: 'token', label: 'Access Token', type: 'password', placeholder: 'glpat-...', required: true, secret: true },
      ] },
      { id: 'oauth2', label: 'OAuth 2.0', flow: 'authorization_code',
        authorizeUrlTemplate: '{url}/oauth/authorize', tokenUrlTemplate: '{url}/oauth/token',
        scopes: ['api', 'read_repository'], fields: OAUTH_FIELDS() },
    ],
    probe: { path: '/api/v4/user', okText: 'Connected to GitLab', pick: (b) => `as ${b?.username || '?'}` },
  },

  {
    id: 'bitbucket', name: 'Bitbucket', category: 'Source & CI',
    description: 'Read repositories and open pull requests for remediation.',
    docsUrl: 'https://developer.atlassian.com/cloud/bitbucket/rest/', testable: true,
    fields: [
      { name: 'url', label: 'API URL', type: 'url', placeholder: 'https://api.bitbucket.org', required: true },
      { name: 'workspace', label: 'Workspace', type: 'text', placeholder: 'myteam' },
    ],
    authMethods: [
      { id: 'token', label: 'Username + App Password', default: true, fields: [
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'api_token', label: 'App Password', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: {
      path: '/2.0/user', style: { tokenAsBasic: true }, okText: 'Connected to Bitbucket',
      pick: (b) => `as ${b?.username || b?.display_name || '?'}`,
    },
  },

  {
    id: 'azuredevops', name: 'Azure DevOps', category: 'Source & CI',
    description: 'Read repos and run pipelines in Azure DevOps.',
    docsUrl: 'https://learn.microsoft.com/rest/api/azure/devops/', testable: true,
    fields: [
      { name: 'url', label: 'Organization URL', type: 'url', placeholder: 'https://dev.azure.com/myorg', required: true },
      { name: 'project', label: 'Default Project', type: 'text', placeholder: 'MyProject' },
    ],
    authMethods: [
      { id: 'token', label: 'Personal Access Token', default: true, fields: [
        { name: 'api_token', label: 'PAT', type: 'password', required: true, secret: true },
        { name: 'username', label: 'Username', type: 'text', placeholder: 'pat',
          help: 'Azure DevOps sends the PAT as the Basic-auth password; any username works.' },
      ] },
    ],
    probe: {
      path: '/_apis/projects?api-version=7.0', style: { tokenAsBasic: true },
      okText: 'Connected to Azure DevOps', pick: (b) => `${b?.count ?? 0} project(s)`,
    },
  },

  {
    id: 'circleci', name: 'CircleCI', category: 'Source & CI',
    description: 'Read pipeline status and trigger builds.',
    docsUrl: 'https://circleci.com/docs/api/v2/', testable: true,
    fields: [
      { name: 'url', label: 'API URL', type: 'url', placeholder: 'https://circleci.com', required: true },
    ],
    authMethods: [
      { id: 'api_key', label: 'Personal API Token', default: true, fields: [
        { name: 'api_key', label: 'API Token', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: { path: '/api/v2/me', style: { apiKeyHeader: 'Circle-Token' }, okText: 'Connected to CircleCI', pick: (b) => `as ${b?.login || '?'}` },
  },

  // ─────────────────────────── Registry & Security ───────────────────────────
  {
    id: 'harbor', name: 'Harbor', category: 'Registry & Security',
    description: 'Inspect image repositories, tags and vulnerability scan results.',
    docsUrl: 'https://goharbor.io/docs/', testable: true,
    fields: [
      { name: 'url', label: 'Harbor URL', type: 'url', placeholder: 'https://harbor.example.com', required: true },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'basic', label: 'Username & Password', default: true, fields: [
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password / CLI Secret', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: { path: '/api/v2.0/projects?page_size=1', okText: 'Connected to Harbor' },
  },

  {
    id: 'sonarqube', name: 'SonarQube', category: 'Registry & Security',
    description: 'Read code quality gates and vulnerability findings.',
    docsUrl: 'https://docs.sonarsource.com/sonarqube/latest/extension-guide/web-api/', testable: true,
    fields: [
      { name: 'url', label: 'SonarQube URL', type: 'url', placeholder: 'https://sonar.example.com', required: true },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'token', label: 'User Token', default: true, fields: [
        { name: 'api_token', label: 'Token', type: 'password', required: true, secret: true },
        { name: 'username', label: 'Username', type: 'text', placeholder: 'leave blank',
          help: 'SonarQube sends the token as the Basic-auth username with an empty password.' },
      ] },
    ],
    probe: {
      path: '/api/system/status', style: { tokenAsBasic: true },
      okText: 'Connected to SonarQube', pick: (b) => `status ${b?.status || '?'}`,
    },
  },

  {
    id: 'vault', name: 'HashiCorp Vault', category: 'Registry & Security',
    description: 'Read secrets for remediation playbooks without storing them here.',
    docsUrl: 'https://developer.hashicorp.com/vault/api-docs', testable: true,
    fields: [
      { name: 'url', label: 'Vault Address', type: 'url', placeholder: 'https://vault.example.com:8200', required: true },
      { name: 'namespace', label: 'Namespace (Enterprise)', type: 'text', placeholder: 'admin' },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'token', label: 'Vault Token', default: true, fields: [
        { name: 'token', label: 'Token', type: 'password', placeholder: 'hvs....', required: true, secret: true },
      ] },
    ],
    probe: {
      path: '/v1/sys/health', style: { tokenHeader: 'X-Vault-Token' }, okText: 'Connected to Vault',
      pick: (b) => (b?.sealed ? 'WARNING: this vault is sealed' : 'unsealed and initialized'),
    },
  },

  {
    id: 'snyk', name: 'Snyk', category: 'Registry & Security',
    description: 'Read dependency and container vulnerability findings.',
    docsUrl: 'https://docs.snyk.io/snyk-api', testable: true,
    fields: [
      { name: 'url', label: 'API URL', type: 'url', placeholder: 'https://api.snyk.io', required: true },
      { name: 'org_id', label: 'Organization ID', type: 'text' },
    ],
    authMethods: [
      { id: 'token', label: 'API Token', default: true, fields: [
        { name: 'token', label: 'Token', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: { path: '/rest/self?version=2024-10-15', okText: 'Connected to Snyk' },
  },

  // ───────────────────────────── GitOps ─────────────────────────────
  {
    id: 'flux', name: 'Flux CD', category: 'GitOps',
    description: 'Track Kustomizations and HelmReleases for drift and failed reconciles.',
    docsUrl: 'https://fluxcd.io/flux/', testable: false,
    fields: [
      { name: 'namespace', label: 'Flux Namespace', type: 'text', placeholder: 'flux-system', required: true,
        help: 'Flux is read through the cluster agent, so no separate credentials are needed.' },
    ],
    authMethods: [{ id: 'none', label: 'Via Cluster Agent', default: true, fields: [] }],
  },

  // ───────────────────────────── Automation ─────────────────────────────
  {
    id: 'rundeck', name: 'Rundeck', category: 'Automation',
    description: 'Run operational jobs for automated remediation.',
    docsUrl: 'https://docs.rundeck.com/docs/api/', testable: true,
    fields: [
      { name: 'url', label: 'Rundeck URL', type: 'url', placeholder: 'https://rundeck.example.com', required: true },
      { name: 'project', label: 'Default Project', type: 'text' },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'api_key', label: 'API Token', default: true, fields: [
        { name: 'api_key', label: 'API Token', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: { path: '/api/41/system/info', style: { apiKeyHeader: 'X-Rundeck-Auth-Token' }, okText: 'Connected to Rundeck' },
  },

  {
    id: 'terraform', name: 'Terraform Cloud', category: 'Automation',
    description: 'Read workspaces and queue runs for infrastructure changes.',
    docsUrl: 'https://developer.hashicorp.com/terraform/cloud-docs/api-docs', testable: true,
    fields: [
      { name: 'url', label: 'API URL', type: 'url', placeholder: 'https://app.terraform.io', required: true },
      { name: 'organization', label: 'Organization', type: 'text', required: true },
    ],
    authMethods: [
      { id: 'token', label: 'API Token', default: true, fields: [
        { name: 'token', label: 'Token', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: {
      path: '/api/v2/account/details', okText: 'Connected to Terraform Cloud',
      pick: (b) => `as ${b?.data?.attributes?.username || '?'}`,
    },
  },

  // ───────────────────────────── On-call ─────────────────────────────
  {
    id: 'pagerduty', name: 'PagerDuty', category: 'On-call',
    description: 'Raise and resolve incidents, and read who is on call.',
    docsUrl: 'https://developer.pagerduty.com/api-reference/', testable: true,
    fields: [
      { name: 'url', label: 'API URL', type: 'url', placeholder: 'https://api.pagerduty.com', required: true },
      { name: 'service_id', label: 'Default Service ID', type: 'text', placeholder: 'PXXXXXX' },
      { name: 'from_email', label: 'From Email', type: 'email',
        help: 'PagerDuty requires a valid user email on write operations.' },
    ],
    authMethods: [
      { id: 'token', label: 'REST API Token', default: true, fields: [
        { name: 'token', label: 'API Token', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: { path: '/users?limit=1', style: { tokenPrefix: 'Token token=' }, okText: 'Connected to PagerDuty' },
  },

  {
    id: 'opsgenie', name: 'Opsgenie', category: 'On-call',
    description: 'Create alerts and read on-call schedules.',
    docsUrl: 'https://docs.opsgenie.com/docs/api-overview', testable: true,
    fields: [
      { name: 'url', label: 'API URL', type: 'url', placeholder: 'https://api.opsgenie.com', required: true,
        help: 'Use https://api.eu.opsgenie.com for EU accounts.' },
      { name: 'team', label: 'Default Team', type: 'text' },
    ],
    authMethods: [
      { id: 'api_key', label: 'API Key', default: true, fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true, secret: true },
      ] },
    ],
    // Opsgenie wants `Authorization: GenieKey <key>`, which the api_key style
    // cannot express, so it is sent as a prefixed token instead.
    probe: { path: '/v2/account', style: { tokenPrefix: 'GenieKey' }, okText: 'Connected to Opsgenie' },
  },

  // ───────────────────────────── Cost ─────────────────────────────
  {
    id: 'opencost', name: 'OpenCost', category: 'Cost',
    description: 'CNCF cost monitoring — per-namespace and per-workload Kubernetes spend.',
    docsUrl: 'https://www.opencost.io/docs/integrations/api', testable: true,
    fields: [
      { name: 'url', label: 'OpenCost URL', type: 'url', placeholder: 'http://opencost.opencost.svc:9003', required: true },
      { name: 'currency', label: 'Currency', type: 'text', placeholder: 'USD' },
      { name: 'cluster_id', label: 'Registered cluster ID', type: 'text',
        help: 'Optional. Which registered cluster this instance reports for, when its CLUSTER_ID does not match the cluster name here.' },
      ...TLS_FIELDS(),
    ],
    authMethods: [{ id: 'none', label: 'No Authentication', default: true, fields: [] }],
    probe: {
      path: '/allocation/compute?window=1h&aggregate=namespace', authOptional: true,
      okText: 'OpenCost is responding',
      pick: (b) => {
        const set = Array.isArray(b?.data) ? b.data[0] : b?.data;
        return `${set ? Object.keys(set).length : 0} namespace allocation(s) in the last hour`;
      },
    },
  },

  {
    id: 'kubecost', name: 'Kubecost', category: 'Cost',
    description: 'Kubecost cost allocation and savings recommendations.',
    docsUrl: 'https://docs.kubecost.com/apis', testable: true,
    fields: [
      { name: 'url', label: 'Kubecost URL', type: 'url', placeholder: 'http://kubecost-cost-analyzer:9090', required: true },
      { name: 'cluster_id', label: 'Registered cluster ID', type: 'text',
        help: 'Optional. Which registered cluster this instance reports for.' },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'none', label: 'No Authentication', default: true, fields: [] },
      { id: 'token', label: 'Bearer Token', fields: [
        { name: 'token', label: 'Token', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: { path: '/model/allocation?window=1h&aggregate=namespace', authOptional: true, okText: 'Kubecost is responding' },
  },

  // ───────────────────────────── Cloud ─────────────────────────────
  {
    id: 'azure', name: 'Azure', category: 'Cloud',
    description: 'Read Azure resource state and AKS details.',
    docsUrl: 'https://learn.microsoft.com/rest/api/azure/', testable: false,
    fields: [
      { name: 'subscription_id', label: 'Subscription ID', type: 'text', required: true },
      { name: 'tenant_id', label: 'Tenant ID', type: 'text', required: true },
    ],
    authMethods: [
      { id: 'oauth2', label: 'Service Principal', default: true, flow: 'client_credentials',
        tokenUrlTemplate: 'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token',
        scopes: ['https://management.azure.com/.default'], fields: OAUTH_FIELDS() },
    ],
  },

  {
    id: 'gcp', name: 'Google Cloud', category: 'Cloud',
    description: 'Read GCP resource state and GKE details.',
    docsUrl: 'https://cloud.google.com/apis/docs/overview', testable: false,
    fields: [
      { name: 'project_id', label: 'Project ID', type: 'text', required: true },
    ],
    authMethods: [
      { id: 'api_key', label: 'Service Account JSON', default: true, fields: [
        { name: 'api_key', label: 'Service Account Key (JSON)', type: 'textarea', required: true, secret: true,
          placeholder: '{ "type": "service_account", ... }' },
      ] },
    ],
  },

  // ───────────────────────────── Notifications ─────────────────────────────
  {
    id: 'discord', name: 'Discord', category: 'Notifications',
    description: 'Post alert notifications to a Discord channel.',
    docsUrl: 'https://discord.com/developers/docs/resources/webhook', testable: true,
    fields: [],
    authMethods: [
      { id: 'webhook', label: 'Incoming Webhook', default: true, fields: [
        { name: 'webhook_url', label: 'Webhook URL', type: 'url',
          placeholder: 'https://discord.com/api/webhooks/...', required: true, secret: true },
      ] },
    ],
  },

  {
    id: 'mattermost', name: 'Mattermost', category: 'Notifications',
    description: 'Post alert notifications to a Mattermost channel.',
    docsUrl: 'https://developers.mattermost.com/integrate/webhooks/incoming/', testable: true,
    fields: [
      { name: 'channel', label: 'Default Channel', type: 'text', placeholder: 'ops-alerts' },
    ],
    authMethods: [
      { id: 'webhook', label: 'Incoming Webhook', default: true, fields: [
        { name: 'webhook_url', label: 'Webhook URL', type: 'url', required: true, secret: true },
      ] },
    ],
  },

  {
    id: 'webhook', name: 'Generic Webhook', category: 'Notifications',
    description: 'POST alert and remediation events as JSON to any HTTP endpoint.',
    docsUrl: '', testable: true,
    fields: [
      { name: 'method', label: 'HTTP Method', type: 'select', options: ['POST', 'PUT'] },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'webhook', label: 'URL only', default: true, fields: [
        { name: 'webhook_url', label: 'Endpoint URL', type: 'url',
          placeholder: 'https://example.com/hooks/aiops', required: true, secret: true },
      ] },
      { id: 'token', label: 'URL + Bearer Token', fields: [
        { name: 'webhook_url', label: 'Endpoint URL', type: 'url', required: true, secret: true },
        { name: 'token', label: 'Bearer Token', type: 'password', required: true, secret: true },
      ] },
      { id: 'api_key', label: 'URL + API Key Header', fields: [
        { name: 'webhook_url', label: 'Endpoint URL', type: 'url', required: true, secret: true },
        { name: 'api_key_header', label: 'Header Name', type: 'text', placeholder: 'X-API-Key', required: true },
        { name: 'api_key', label: 'API Key', type: 'password', required: true, secret: true },
      ] },
    ],
  },

  // ───────────────────────────── Vector DB ─────────────────────────────
  {
    id: 'qdrant', name: 'Qdrant', category: 'Vector DB',
    description: 'Vector store for RCA and runbook retrieval.',
    docsUrl: 'https://qdrant.tech/documentation/', testable: true,
    fields: [
      { name: 'url', label: 'Qdrant URL', type: 'url', placeholder: 'http://qdrant:6333', required: true },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'none', label: 'No Authentication', default: true, fields: [] },
      { id: 'api_key', label: 'API Key', fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: {
      path: '/collections', style: { apiKeyHeader: 'api-key' }, authOptional: true,
      okText: 'Connected to Qdrant', pick: (b) => `${(b?.result?.collections || []).length} collection(s)`,
    },
  },

  {
    id: 'weaviate', name: 'Weaviate', category: 'Vector DB',
    description: 'Vector store for semantic knowledge retrieval.',
    docsUrl: 'https://weaviate.io/developers/weaviate/api/rest', testable: true,
    fields: [
      { name: 'url', label: 'Weaviate URL', type: 'url', placeholder: 'http://weaviate:8080', required: true },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      { id: 'none', label: 'No Authentication', default: true, fields: [] },
      { id: 'token', label: 'API Key', fields: [
        { name: 'token', label: 'API Key', type: 'password', required: true, secret: true },
      ] },
    ],
    probe: { path: '/v1/meta', authOptional: true, okText: 'Connected to Weaviate', pick: (b) => `v${b?.version || '?'}` },
  },
]);
