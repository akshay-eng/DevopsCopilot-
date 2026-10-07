/**
 * Integration Registry — the single source of truth for integrations.
 *
 * Each entry declares:
 *   fields        — base (non-auth) config, e.g. the server URL
 *   authMethods[] — the ways you may authenticate. A saved config picks one via
 *                   `auth_method` and fills that method's fields.
 *
 * Adding an integration is a DATA change here: the config form, validation,
 * secret masking and storage all derive from this file. Pair it with a
 * connector in services/connectors/ to give it real actions (and agent tools).
 *
 * Field shape: { name, label, type, placeholder?, required?, secret?, help? }
 *   type: text | password | email | number | url | checkbox | select(+options)
 *   secret: true -> masked in responses, never returned in plaintext
 *
 * Auth method ids understood by services/connectors/http.js:
 *   basic | token | api_key | oauth2 | webhook | smtp | aws_keys
 */

const OAUTH_FIELDS = (extra = []) => ([
  { name: 'client_id', label: 'Client ID', type: 'text', required: true },
  { name: 'client_secret', label: 'Client Secret', type: 'password', required: true, secret: true },
  ...extra,
]);

/**
 * TLS fields for any self-hosted endpoint. Connectors apply these via
 * services/connectors/http.js — pasting the CA keeps verification ON, which is
 * the right answer for a private CA or self-signed AWX / Argo CD / Harbor.
 * `insecure_tls` is the explicit, logged opt-out.
 */
const TLS_FIELDS = () => ([
  {
    name: 'ca_cert', label: 'CA Certificate (PEM)', type: 'textarea',
    placeholder: '-----BEGIN CERTIFICATE----- ...',
    help: 'Paste the private CA or self-signed certificate. Verification stays enabled.',
  },
  {
    name: 'insecure_tls', label: 'Skip TLS verification', type: 'checkbox',
    help: 'Last resort — disables certificate checks for this integration and is logged. Prefer the CA certificate above.',
  },
]);

const REGISTRY = [
  {
    id: 'snow', name: 'ServiceNow', category: 'ITSM', icon: 'servicenow',
    description: 'Create incidents & change requests, query the CMDB, and drive agentic remediation.',
    docsUrl: 'https://docs.servicenow.com/', testable: true,
    fields: [
      { name: 'instance_url', label: 'Instance URL', type: 'url', placeholder: 'https://instance.service-now.com', required: true },
      { name: 'assignment_group', label: 'Default Assignment Group', type: 'text', placeholder: 'DevOps' },
    ],
    authMethods: [
      {
        id: 'basic', label: 'Username & Password', default: true,
        fields: [
          { name: 'username', label: 'Username', type: 'text', required: true },
          { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
        ],
      },
      {
        id: 'oauth2', label: 'OAuth 2.0', flow: 'client_credentials',
        tokenUrlTemplate: '{instance_url}/oauth_token.do',
        fields: OAUTH_FIELDS(),
      },
    ],
  },

  {
    id: 'github', name: 'GitHub', category: 'Source & CI', icon: 'github',
    description: 'Read repos and manifests, open remediation issues/PRs, and drive GitHub Actions.',
    docsUrl: 'https://docs.github.com/rest', testable: true,
    fields: [
      { name: 'org_or_user', label: 'Organization / Username', type: 'text', placeholder: 'myorg' },
      { name: 'api_base_url', label: 'API Base URL', type: 'url', placeholder: 'https://api.github.com (GHE: https://ghe.corp/api/v3)' },
    ],
    authMethods: [
      {
        id: 'token', label: 'Personal Access Token', default: true,
        fields: [{ name: 'personal_access_token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_… / github_pat_…', required: true, secret: true }],
      },
      {
        id: 'oauth2', label: 'OAuth App', flow: 'authorization_code',
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: ['repo', 'workflow', 'read:org'],
        fields: OAUTH_FIELDS(),
      },
    ],
  },

  {
    id: 'jenkins', name: 'Jenkins', category: 'Source & CI', icon: 'jenkins',
    description: 'List and trigger jobs, read build status and console logs.',
    docsUrl: 'https://www.jenkins.io/doc/book/using/remote-access-api/', testable: true,
    fields: [
      { name: 'jenkins_url', label: 'Jenkins URL', type: 'url', placeholder: 'https://jenkins.example.com', required: true },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      {
        id: 'token', label: 'User + API Token', default: true,
        fields: [
          { name: 'username', label: 'Username', type: 'text', required: true },
          { name: 'api_token', label: 'API Token', type: 'password', required: true, secret: true },
        ],
      },
      {
        id: 'basic', label: 'Username & Password',
        fields: [
          { name: 'username', label: 'Username', type: 'text', required: true },
          { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
        ],
      },
    ],
  },

  {
    id: 'argocd', name: 'Argo CD', category: 'GitOps', icon: 'argocd',
    description: 'Inspect application sync/health, trigger syncs and roll back deployments.',
    docsUrl: 'https://argo-cd.readthedocs.io/', testable: true,
    fields: [
      { name: 'server_url', label: 'Server URL', type: 'url', placeholder: 'https://argocd.example.com', required: true },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      {
        id: 'token', label: 'API Token', default: true,
        fields: [{ name: 'auth_token', label: 'Auth Token', type: 'password', required: true, secret: true }],
      },
      {
        id: 'basic', label: 'Username & Password',
        fields: [
          { name: 'username', label: 'Username', type: 'text', required: true },
          { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
        ],
      },
    ],
  },

  {
    id: 'awx', name: 'Ansible AWX / Tower', category: 'Automation', icon: 'awx',
    description: 'Launch job templates (playbooks) for automated remediation and read their output.',
    docsUrl: 'https://ansible.readthedocs.io/projects/awx/', testable: true,
    fields: [
      { name: 'host', label: 'AWX / Tower URL', type: 'url', placeholder: 'https://awx.example.com', required: true },
      ...TLS_FIELDS(),
    ],
    authMethods: [
      {
        id: 'basic', label: 'Username & Password', default: true,
        fields: [
          { name: 'username', label: 'Username', type: 'text', required: true },
          { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
        ],
      },
      {
        id: 'token', label: 'OAuth2 Application Token',
        fields: [{ name: 'token', label: 'Token', type: 'password', required: true, secret: true }],
      },
    ],
  },

  {
    id: 'jira', name: 'Jira', category: 'ITSM', icon: 'jira',
    description: 'Create and search issues, add comments for remediation follow-up.',
    docsUrl: 'https://developer.atlassian.com/cloud/jira/', testable: true,
    fields: [
      { name: 'jira_url', label: 'Jira URL', type: 'url', placeholder: 'https://org.atlassian.net', required: true },
      { name: 'project_key', label: 'Default Project Key', type: 'text', placeholder: 'OPS' },
    ],
    authMethods: [
      {
        id: 'token', label: 'Email + API Token', default: true,
        fields: [
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'api_token', label: 'API Token', type: 'password', required: true, secret: true },
        ],
      },
      {
        id: 'oauth2', label: 'OAuth 2.0 (3LO)', flow: 'authorization_code',
        authorizeUrl: 'https://auth.atlassian.com/authorize',
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        scopes: ['read:jira-work', 'write:jira-work'],
        fields: OAUTH_FIELDS(),
      },
    ],
  },

  {
    id: 'slack', name: 'Slack', category: 'Notifications', icon: 'slack',
    description: 'Send alert & remediation notifications to Slack.',
    docsUrl: 'https://api.slack.com/messaging/webhooks', testable: true,
    fields: [
      { name: 'channel', label: 'Default Channel', type: 'text', placeholder: '#alerts' },
      { name: 'username', label: 'Bot Username', type: 'text', placeholder: 'AIOps Bot' },
    ],
    authMethods: [
      {
        id: 'webhook', label: 'Incoming Webhook', default: true,
        fields: [{ name: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://hooks.slack.com/services/...', required: true, secret: true }],
      },
      {
        id: 'token', label: 'Bot Token',
        fields: [{ name: 'token', label: 'Bot Token', type: 'password', placeholder: 'xoxb-…', required: true, secret: true }],
      },
    ],
  },

  {
    id: 'teams', name: 'Microsoft Teams', category: 'Notifications', icon: 'teams',
    description: 'Post notifications to a Teams channel.',
    docsUrl: 'https://learn.microsoft.com/microsoftteams/', testable: true,
    fields: [],
    authMethods: [
      {
        id: 'webhook', label: 'Incoming Webhook', default: true,
        fields: [{ name: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://outlook.office.com/webhook/...', required: true, secret: true }],
      },
    ],
  },

  {
    id: 'email', name: 'Email (SMTP)', category: 'Notifications', icon: 'email',
    description: 'Send alerts over SMTP.', docsUrl: '', testable: true,
    fields: [
      { name: 'smtp_host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.gmail.com', required: true },
      { name: 'smtp_port', label: 'SMTP Port', type: 'number', placeholder: '587', required: true },
      { name: 'from_email', label: 'From Email', type: 'email', placeholder: 'alerts@example.com', required: true },
      { name: 'use_tls', label: 'Use TLS', type: 'checkbox' },
    ],
    authMethods: [
      {
        id: 'basic', label: 'SMTP Credentials', default: true,
        fields: [
          { name: 'smtp_user', label: 'Username', type: 'email', required: true },
          { name: 'smtp_password', label: 'Password', type: 'password', required: true, secret: true },
        ],
      },
      { id: 'none', label: 'No Authentication (open relay)', fields: [] },
    ],
  },

  {
    id: 'aws', name: 'AWS', category: 'Cloud', icon: 'aws',
    description: 'Publish to SNS and read AWS resource state.',
    docsUrl: 'https://docs.aws.amazon.com/', testable: true,
    fields: [
      { name: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1', required: true },
      { name: 'sns_topic_arn', label: 'SNS Topic ARN', type: 'text', placeholder: 'arn:aws:sns:…' },
    ],
    authMethods: [
      {
        id: 'aws_keys', label: 'Access Key', default: true,
        fields: [
          { name: 'access_key_id', label: 'Access Key ID', type: 'password', required: true, secret: true },
          { name: 'secret_access_key', label: 'Secret Access Key', type: 'password', required: true, secret: true },
        ],
      },
      { id: 'none', label: 'Instance Role / Default Chain', fields: [] },
    ],
  },

  {
    id: 'milvus', name: 'Milvus', category: 'Vector DB', icon: 'milvus',
    description: 'Vector store for RCA/knowledge retrieval.',
    docsUrl: 'https://milvus.io/docs', testable: true,
    fields: [
      { name: 'host', label: 'Host', type: 'text', placeholder: 'milvus.example.com', required: true },
      { name: 'port', label: 'Port', type: 'number', placeholder: '19530', required: true },
    ],
    authMethods: [
      { id: 'none', label: 'No Authentication', default: true, fields: [] },
      {
        id: 'basic', label: 'Username & Password',
        fields: [
          { name: 'username', label: 'Username', type: 'text', required: true },
          { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
        ],
      },
    ],
  },
];

// The broader catalog lives in its own file so this one stays about schema and
// validation. Core entries win on id collision.
const CATALOG = require('./integrationCatalog')({ TLS_FIELDS, OAUTH_FIELDS });
const coreIds = new Set(REGISTRY.map((r) => r.id));
REGISTRY.push(...CATALOG.filter((c) => !coreIds.has(c.id)));

/** Display order for category groups; anything unlisted sorts to the end. */
const CATEGORY_ORDER = [
  'ITSM', 'On-call', 'Observability', 'Cost', 'Source & CI', 'GitOps',
  'Automation', 'Registry & Security', 'Cloud', 'Notifications', 'Vector DB',
];
const categoryRank = (c) => {
  const i = CATEGORY_ORDER.indexOf(c);
  return i === -1 ? CATEGORY_ORDER.length : i;
};

/** Categories with their integration ids, in display order. */
function categories() {
  const m = new Map();
  for (const r of REGISTRY) {
    const c = r.category || 'Other';
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(r.id);
  }
  return [...m.entries()]
    .map(([name, ids]) => ({ name, ids, count: ids.length }))
    .sort((a, b) => categoryRank(a.name) - categoryRank(b.name) || a.name.localeCompare(b.name));
}

const byId = Object.fromEntries(REGISTRY.map((r) => [r.id, r]));
const INTEGRATION_IDS = REGISTRY.map((r) => r.id);

const defaultAuthMethod = (m) => (m.authMethods || []).find((a) => a.default) || (m.authMethods || [])[0] || null;
const authMethodFor = (m, id) => (m.authMethods || []).find((a) => a.id === id) || defaultAuthMethod(m);

/** Every field an integration could hold, across base + all auth methods. */
function allFields(manifest) {
  return [...(manifest.fields || []), ...(manifest.authMethods || []).flatMap((a) => a.fields || [])];
}

/** Public manifest (safe to send to the frontend — definitions only). */
function publicRegistry() {
  return REGISTRY.map((r) => ({
    id: r.id, name: r.name, category: r.category || 'Other', description: r.description,
    icon: r.icon, docsUrl: r.docsUrl, testable: r.testable !== false && (r.testable === true || !!r.probe),
    fields: (r.fields || []).map(pubField),
    authMethods: (r.authMethods || []).map((a) => ({
      id: a.id, label: a.label, default: !!a.default, flow: a.flow,
      scopes: a.scopes, oauth: a.flow === 'authorization_code',
      fields: (a.fields || []).map(pubField),
    })),
  }));
}
const pubField = ({ name, label, type, placeholder, required, secret, help, options }) => ({
  name, label, type, placeholder, required: !!required, secret: !!secret, help, options,
});

/** Validation derived from the manifest + the selected auth method. */
function validateConfig(type, config = {}) {
  const manifest = byId[type];
  if (!manifest) return [`Unknown integration type: ${type}`];

  const errors = [];
  const urlPattern = /^https?:\/\/.+/i;
  const check = (f) => {
    const val = config[f.name];
    if (f.required && (val === undefined || val === null || val === '')) {
      errors.push(`${f.label} is required`);
      return;
    }
    if (val && f.type === 'url' && !urlPattern.test(val)) {
      errors.push(`${f.label} must start with http:// or https://`);
    }
  };

  (manifest.fields || []).forEach(check);

  const method = authMethodFor(manifest, config.auth_method);
  if (manifest.authMethods?.length && !method) {
    errors.push('A valid authentication method must be selected');
  } else if (method) {
    (method.fields || []).forEach(check);
  }
  return errors;
}

/** Masked template derived from the manifest (all possible fields). */
function maskConfig(type) {
  const manifest = byId[type];
  if (!manifest) return {};
  const out = {};
  for (const f of allFields(manifest)) {
    if (f.type === 'checkbox') out[f.name] = false;
    else out[f.name] = f.secret ? '••••••••' : '';
  }
  const def = defaultAuthMethod(manifest);
  if (def) out.auth_method = def.id;
  return out;
}

module.exports = {
  REGISTRY, byId, TLS_FIELDS, categories, CATEGORY_ORDER, INTEGRATION_IDS, publicRegistry, validateConfig, maskConfig,
  allFields, defaultAuthMethod, authMethodFor,
};
