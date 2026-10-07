const { request, authHeaders, cleanHeaders, trimUrl } = require('./http');

const base = (cfg) => {
  const u = trimUrl(cfg.instance_url);
  if (!u) throw new Error('ServiceNow instance URL is not configured.');
  return u;
};

async function call(cfg, method, path, body) {
  const h = await authHeaders(cfg, { manifestAuth: { tokenUrl: `${base(cfg)}/oauth_token.do` } });
  return request(method, `${base(cfg)}${path}`, { headers: cleanHeaders(h), body, tls: cfg, label: 'servicenow' });
}

const table = (cfg, name, qs = '') => call(cfg, 'GET', `/api/now/table/${name}${qs ? `?${qs}` : ''}`);

module.exports = {
  id: 'snow',
  name: 'ServiceNow',

  async test(cfg) {
    const r = await table(cfg, 'sys_user', 'sysparm_limit=1');
    return { success: true, message: `Connected to ${new URL(base(cfg)).host} (${r?.result?.length ?? 0} record read)` };
  },

  actions: {
    create_incident: {
      description: 'Create a ServiceNow incident.',
      params: {
        short_description: { type: 'string', required: true, description: 'One-line summary' },
        description: { type: 'string', description: 'Full details' },
        urgency: { type: 'string', description: '1=High, 2=Medium, 3=Low' },
        assignment_group: { type: 'string' },
      },
      async run(cfg, p) {
        const body = {
          short_description: p.short_description,
          description: p.description || '',
          urgency: p.urgency || '2',
          assignment_group: p.assignment_group || cfg.assignment_group || undefined,
        };
        const r = await call(cfg, 'POST', '/api/now/table/incident', body);
        const rec = r?.result || {};
        return { number: rec.number, sys_id: rec.sys_id, url: `${base(cfg)}/nav_to.do?uri=incident.do?sys_id=${rec.sys_id}` };
      },
    },

    create_change_request: {
      description: 'Open a ServiceNow change request (use before applying a fix).',
      params: {
        short_description: { type: 'string', required: true },
        description: { type: 'string' },
        type: { type: 'string', description: 'normal | standard | emergency' },
        risk: { type: 'string', description: '1=High 2=Moderate 3=Low' },
      },
      async run(cfg, p) {
        const body = {
          short_description: p.short_description,
          description: p.description || '',
          type: p.type || 'normal',
          risk: p.risk || '3',
          assignment_group: cfg.assignment_group || undefined,
        };
        const r = await call(cfg, 'POST', '/api/now/table/change_request', body);
        const rec = r?.result || {};
        return { number: rec.number, sys_id: rec.sys_id, url: `${base(cfg)}/nav_to.do?uri=change_request.do?sys_id=${rec.sys_id}` };
      },
    },

    update_ticket: {
      description: 'Update an existing incident or change request by sys_id.',
      params: {
        table: { type: 'string', required: true, description: 'incident | change_request' },
        sys_id: { type: 'string', required: true },
        fields: { type: 'object', required: true, description: 'Fields to set, e.g. {"state":"6","close_notes":"..."}' },
      },
      async run(cfg, p) {
        const r = await call(cfg, 'PATCH', `/api/now/table/${p.table}/${p.sys_id}`, p.fields);
        return { updated: true, number: r?.result?.number };
      },
    },

    search_records: {
      description: 'Query any ServiceNow table with an encoded query.',
      params: {
        table: { type: 'string', required: true, description: 'e.g. incident, change_request, cmdb_ci' },
        query: { type: 'string', description: 'Encoded query, e.g. active=true^priority=1' },
        limit: { type: 'number', description: 'Default 10' },
      },
      async run(cfg, p) {
        const qs = new URLSearchParams();
        if (p.query) qs.set('sysparm_query', p.query);
        qs.set('sysparm_limit', String(p.limit || 10));
        const r = await table(cfg, p.table, qs.toString());
        return { count: (r?.result || []).length, records: r?.result || [] };
      },
    },
  },
};
