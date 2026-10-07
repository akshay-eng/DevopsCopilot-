const { request, authHeaders, cleanHeaders, trimUrl } = require('./http');

const base = (cfg) => {
  const u = trimUrl(cfg.server_url);
  if (!u) throw new Error('Argo CD server URL is not configured.');
  return u;
};

async function call(cfg, method, path, body) {
  // Argo CD accepts a bearer token; with basic creds we first exchange for one.
  let headers;
  if (cfg.auth_method === 'basic' || (!cfg.auth_token && !cfg.token && cfg.username && cfg.password)) {
    const session = await request('POST', `${base(cfg)}/api/v1/session`, {
      tls: cfg, label: 'argocd',
      body: { username: cfg.username, password: cfg.password },
    });
    headers = { Authorization: `Bearer ${session.token}` };
  } else {
    headers = cleanHeaders(await authHeaders(cfg, { style: { tokenPrefix: 'Bearer' } }));
  }
  return request(method, `${base(cfg)}${path}`, { headers, body, tls: cfg, label: 'argocd' });
}

const appSummary = (a) => ({
  name: a.metadata?.name,
  namespace: a.spec?.destination?.namespace,
  project: a.spec?.project,
  repo: a.spec?.source?.repoURL,
  path: a.spec?.source?.path,
  targetRevision: a.spec?.source?.targetRevision,
  syncStatus: a.status?.sync?.status,
  healthStatus: a.status?.health?.status,
  revision: a.status?.sync?.revision?.slice(0, 8),
});

module.exports = {
  id: 'argocd',
  name: 'Argo CD',

  async test(cfg) {
    const v = await call(cfg, 'GET', '/api/version');
    return { success: true, message: `Connected to Argo CD ${v.Version || ''}`.trim() };
  },

  actions: {
    list_applications: {
      description: 'List Argo CD applications with sync and health status.',
      params: { project: { type: 'string' } },
      async run(cfg, p) {
        const r = await call(cfg, 'GET', `/api/v1/applications${p.project ? `?project=${encodeURIComponent(p.project)}` : ''}`);
        return (r.items || []).map(appSummary);
      },
    },

    get_application: {
      description: 'Get one Argo CD application in detail (sync state, health, resources).',
      params: { name: { type: 'string', required: true } },
      async run(cfg, p) {
        const a = await call(cfg, 'GET', `/api/v1/applications/${encodeURIComponent(p.name)}`);
        return {
          ...appSummary(a),
          conditions: a.status?.conditions || [],
          resources: (a.status?.resources || []).slice(0, 40).map((r) => ({
            kind: r.kind, name: r.name, namespace: r.namespace, status: r.status, health: r.health?.status,
          })),
        };
      },
    },

    sync_application: {
      description: 'Trigger a sync (deploy) of an Argo CD application.',
      params: {
        name: { type: 'string', required: true },
        prune: { type: 'boolean', description: 'Delete resources removed from git' },
        dryRun: { type: 'boolean' },
      },
      async run(cfg, p) {
        const r = await call(cfg, 'POST', `/api/v1/applications/${encodeURIComponent(p.name)}/sync`, {
          prune: !!p.prune, dryRun: !!p.dryRun,
        });
        return { synced: true, name: p.name, phase: r.status?.operationState?.phase || 'Running', dryRun: !!p.dryRun };
      },
    },

    rollback_application: {
      description: 'Roll an Argo CD application back to a previous deployed revision.',
      params: { name: { type: 'string', required: true }, id: { type: 'number', required: true, description: 'History ID from the app history' } },
      async run(cfg, p) {
        const r = await call(cfg, 'POST', `/api/v1/applications/${encodeURIComponent(p.name)}/rollback`, { id: p.id });
        return { rolledBack: true, name: p.name, phase: r.status?.operationState?.phase || 'Running' };
      },
    },
  },
};
