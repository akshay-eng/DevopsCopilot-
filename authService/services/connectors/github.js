const { request, authHeaders, cleanHeaders, trimUrl } = require('./http');

// Supports github.com and GitHub Enterprise (api_base_url override).
const api = (cfg) => trimUrl(cfg.api_base_url) || 'https://api.github.com';

async function call(cfg, method, path, body) {
  const h = await authHeaders(cfg, {
    style: { tokenPrefix: 'Bearer' },
    manifestAuth: { tokenUrl: 'https://github.com/login/oauth/access_token' },
  });
  return request(method, `${api(cfg)}${path}`, {
    tls: cfg, label: 'github',
    headers: { ...cleanHeaders(h), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body,
  });
}

const ownerRepo = (cfg, repo) => {
  if (repo && repo.includes('/')) return repo;
  const owner = cfg.org_or_user;
  if (!owner || !repo) throw new Error('Provide repo as "owner/name", or set Organization/Username in the integration.');
  return `${owner}/${repo}`;
};

module.exports = {
  id: 'github',
  name: 'GitHub',

  async test(cfg) {
    const me = await call(cfg, 'GET', '/user');
    return { success: true, message: `Connected as ${me.login}` };
  },

  actions: {
    list_repos: {
      description: 'List repositories accessible to the configured account/org.',
      params: { limit: { type: 'number', description: 'Default 20' } },
      async run(cfg, p) {
        const path = cfg.org_or_user ? `/orgs/${cfg.org_or_user}/repos?per_page=${p.limit || 20}` : `/user/repos?per_page=${p.limit || 20}`;
        const r = await call(cfg, 'GET', path).catch(() => call(cfg, 'GET', `/user/repos?per_page=${p.limit || 20}`));
        return (r || []).map((x) => ({ full_name: x.full_name, private: x.private, default_branch: x.default_branch, url: x.html_url }));
      },
    },

    create_issue: {
      description: 'Open a GitHub issue (e.g. to track a remediation).',
      params: {
        repo: { type: 'string', required: true, description: '"owner/name" or just "name" if org is configured' },
        title: { type: 'string', required: true },
        body: { type: 'string' },
        labels: { type: 'array', items: 'string' },
      },
      async run(cfg, p) {
        const r = await call(cfg, 'POST', `/repos/${ownerRepo(cfg, p.repo)}/issues`, {
          title: p.title, body: p.body || '', labels: p.labels || undefined,
        });
        return { number: r.number, url: r.html_url, state: r.state };
      },
    },

    list_issues: {
      description: 'List open issues in a repository.',
      params: { repo: { type: 'string', required: true }, limit: { type: 'number' } },
      async run(cfg, p) {
        const r = await call(cfg, 'GET', `/repos/${ownerRepo(cfg, p.repo)}/issues?state=open&per_page=${p.limit || 20}`);
        return (r || []).map((i) => ({ number: i.number, title: i.title, url: i.html_url, labels: (i.labels || []).map((l) => l.name) }));
      },
    },

    get_file: {
      description: 'Read a file from a repository (useful for manifests, Dockerfiles).',
      params: { repo: { type: 'string', required: true }, path: { type: 'string', required: true }, ref: { type: 'string', description: 'branch/tag/sha' } },
      async run(cfg, p) {
        const r = await call(cfg, 'GET', `/repos/${ownerRepo(cfg, p.repo)}/contents/${p.path}${p.ref ? `?ref=${p.ref}` : ''}`);
        const content = r.content ? Buffer.from(r.content, 'base64').toString('utf8') : '';
        return { path: r.path, size: r.size, sha: r.sha, content: content.slice(0, 20000) };
      },
    },

    list_workflow_runs: {
      description: 'Recent GitHub Actions workflow runs for a repo (CI status).',
      params: { repo: { type: 'string', required: true }, limit: { type: 'number' } },
      async run(cfg, p) {
        const r = await call(cfg, 'GET', `/repos/${ownerRepo(cfg, p.repo)}/actions/runs?per_page=${p.limit || 10}`);
        return (r.workflow_runs || []).map((w) => ({
          name: w.name, status: w.status, conclusion: w.conclusion, branch: w.head_branch, url: w.html_url, created_at: w.created_at,
        }));
      },
    },

    trigger_workflow: {
      description: 'Dispatch a GitHub Actions workflow.',
      params: {
        repo: { type: 'string', required: true },
        workflow: { type: 'string', required: true, description: 'Workflow file name, e.g. deploy.yml' },
        ref: { type: 'string', description: 'Branch (default: main)' },
        inputs: { type: 'object' },
      },
      async run(cfg, p) {
        await call(cfg, 'POST', `/repos/${ownerRepo(cfg, p.repo)}/actions/workflows/${p.workflow}/dispatches`, {
          ref: p.ref || 'main', inputs: p.inputs || {},
        });
        return { dispatched: true, workflow: p.workflow, ref: p.ref || 'main' };
      },
    },
  },
};
