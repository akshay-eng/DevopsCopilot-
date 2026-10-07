const { request, authHeaders, cleanHeaders, trimUrl } = require('./http');

const base = (cfg) => {
  const u = trimUrl(cfg.host || cfg.url);
  if (!u) throw new Error('AWX / Ansible Tower URL is not configured.');
  return u;
};

async function call(cfg, method, path, body) {
  const h = await authHeaders(cfg, {
    style: { tokenPrefix: 'Bearer' },
    manifestAuth: { tokenUrl: `${base(cfg)}/api/o/token/` },
  });
  return request(method, `${base(cfg)}${path}`, { headers: cleanHeaders(h), body, tls: cfg, label: 'awx' });
}

module.exports = {
  id: 'awx',
  name: 'Ansible AWX / Tower',

  async test(cfg) {
    const me = await call(cfg, 'GET', '/api/v2/me/');
    const user = me?.results?.[0]?.username || cfg.username;
    return { success: true, message: `Connected to AWX as ${user}` };
  },

  actions: {
    list_job_templates: {
      description: 'List AWX job templates that can be launched for remediation/automation.',
      params: { search: { type: 'string' }, limit: { type: 'number' } },
      async run(cfg, p) {
        const qs = new URLSearchParams({ page_size: String(p.limit || 25) });
        if (p.search) qs.set('search', p.search);
        const r = await call(cfg, 'GET', `/api/v2/job_templates/?${qs}`);
        return (r.results || []).map((t) => ({
          id: t.id, name: t.name, description: t.description, playbook: t.playbook,
          project: t.summary_fields?.project?.name, inventory: t.summary_fields?.inventory?.name,
          ask_variables_on_launch: t.ask_variables_on_launch,
        }));
      },
    },

    launch_job_template: {
      description: 'Launch an AWX job template (runs an Ansible playbook).',
      params: {
        id: { type: 'number', required: true, description: 'Job template ID from list_job_templates' },
        extra_vars: { type: 'object', description: 'Playbook variables' },
        limit: { type: 'string', description: 'Restrict to specific hosts' },
      },
      async run(cfg, p) {
        const body = {};
        if (p.extra_vars) body.extra_vars = p.extra_vars;
        if (p.limit) body.limit = p.limit;
        const r = await call(cfg, 'POST', `/api/v2/job_templates/${p.id}/launch/`, body);
        return { launched: true, job: r.id, status: r.status, url: `${base(cfg)}/#/jobs/playbook/${r.id}` };
      },
    },

    get_job_status: {
      description: 'Check the status/result of an AWX job.',
      params: { id: { type: 'number', required: true, description: 'Job ID' } },
      async run(cfg, p) {
        const r = await call(cfg, 'GET', `/api/v2/jobs/${p.id}/`);
        return {
          id: r.id, name: r.name, status: r.status, failed: r.failed,
          started: r.started, finished: r.finished, elapsed: r.elapsed,
        };
      },
    },

    get_job_output: {
      description: 'Fetch AWX job stdout (playbook output) for diagnosis.',
      params: { id: { type: 'number', required: true }, tailChars: { type: 'number' } },
      async run(cfg, p) {
        const h = await authHeaders(cfg, { style: { tokenPrefix: 'Bearer' } });
        const text = await request('GET', `${base(cfg)}/api/v2/jobs/${p.id}/stdout/?format=txt`, {
          headers: cleanHeaders(h), raw: true, tls: cfg, label: 'awx',
        });
        return { id: p.id, output: String(text).slice(-(p.tailChars || 5000)) };
      },
    },

    list_inventories: {
      description: 'List AWX inventories (target host groups).',
      params: { limit: { type: 'number' } },
      async run(cfg, p) {
        const r = await call(cfg, 'GET', `/api/v2/inventories/?page_size=${p.limit || 25}`);
        return (r.results || []).map((i) => ({ id: i.id, name: i.name, hosts: i.total_hosts, groups: i.total_groups }));
      },
    },
  },
};
