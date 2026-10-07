const { request, authHeaders, cleanHeaders, trimUrl } = require('./http');

const base = (cfg) => {
  const u = trimUrl(cfg.jenkins_url || cfg.url);
  if (!u) throw new Error('Jenkins URL is not configured.');
  return u;
};

// Jenkins wants the API token as the password half of Basic auth.
async function headersFor(cfg) {
  const h = await authHeaders(cfg, { style: { tokenAsBasic: true } });
  return cleanHeaders(h);
}

async function call(cfg, method, path, { body, form } = {}) {
  const headers = await headersFor(cfg);
  if (form) {
    return request(method, `${base(cfg)}${path}`, {
      tls: cfg, label: 'jenkins',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      raw: true,
    });
  }
  return request(method, `${base(cfg)}${path}`, { headers, body, tls: cfg, label: 'jenkins' });
}

module.exports = {
  id: 'jenkins',
  name: 'Jenkins',

  async test(cfg) {
    const r = await call(cfg, 'GET', '/api/json');
    return { success: true, message: `Connected to Jenkins${r?.nodeName ? ` (node ${r.nodeName})` : ''}` };
  },

  actions: {
    list_jobs: {
      description: 'List Jenkins jobs with their last build status.',
      params: { limit: { type: 'number' } },
      async run(cfg, p) {
        const r = await call(cfg, 'GET', '/api/json?tree=jobs[name,url,color,lastBuild[number,result,timestamp]]');
        return (r.jobs || []).slice(0, p.limit || 25).map((j) => ({
          name: j.name, url: j.url, status: j.color,
          lastBuild: j.lastBuild ? { number: j.lastBuild.number, result: j.lastBuild.result } : null,
        }));
      },
    },

    trigger_job: {
      description: 'Trigger a Jenkins job, optionally with build parameters.',
      params: {
        job: { type: 'string', required: true, description: 'Job name' },
        parameters: { type: 'object', description: 'Build parameters as key/value' },
      },
      async run(cfg, p) {
        const hasParams = p.parameters && Object.keys(p.parameters).length > 0;
        const path = `/job/${encodeURIComponent(p.job)}/${hasParams ? 'buildWithParameters' : 'build'}`;
        await call(cfg, 'POST', path, hasParams ? { form: p.parameters } : { form: {} });
        return { triggered: true, job: p.job, note: 'Queued — use get_build_status to follow it.' };
      },
    },

    get_build_status: {
      description: 'Get the status of a job build (defaults to the latest).',
      params: { job: { type: 'string', required: true }, build: { type: 'string', description: 'Build number or "lastBuild"' } },
      async run(cfg, p) {
        const b = p.build || 'lastBuild';
        const r = await call(cfg, 'GET', `/job/${encodeURIComponent(p.job)}/${b}/api/json`);
        return {
          number: r.number, result: r.result, building: r.building,
          durationMs: r.duration, url: r.url, startedAt: r.timestamp ? new Date(r.timestamp).toISOString() : null,
        };
      },
    },

    get_build_log: {
      description: 'Fetch console output for a build (tail) — useful for diagnosing CI failures.',
      params: { job: { type: 'string', required: true }, build: { type: 'string' }, tailChars: { type: 'number' } },
      async run(cfg, p) {
        const b = p.build || 'lastBuild';
        const headers = await headersFor(cfg);
        const text = await request('GET', `${base(cfg)}/job/${encodeURIComponent(p.job)}/${b}/consoleText`, { headers, raw: true, tls: cfg, label: 'jenkins' });
        const n = p.tailChars || 5000;
        return { job: p.job, build: b, log: String(text).slice(-n) };
      },
    },
  },
};
