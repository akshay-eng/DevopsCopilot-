const { request, authHeaders, cleanHeaders, trimUrl } = require('./http');

const base = (cfg) => {
  const u = trimUrl(cfg.jira_url);
  if (!u) throw new Error('Jira URL is not configured.');
  return u;
};

async function call(cfg, method, path, body) {
  // Jira Cloud uses email + API token as Basic auth.
  const h = await authHeaders(cfg, { style: { tokenAsBasic: true } });
  return request(method, `${base(cfg)}${path}`, { headers: cleanHeaders(h), body, tls: cfg, label: 'jira' });
}

// Jira Cloud wants Atlassian Document Format for description fields.
const adf = (text) => ({
  type: 'doc', version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: String(text || '') }] }],
});

module.exports = {
  id: 'jira',
  name: 'Jira',

  async test(cfg) {
    const me = await call(cfg, 'GET', '/rest/api/3/myself');
    return { success: true, message: `Connected as ${me.displayName || me.emailAddress}` };
  },

  actions: {
    create_issue: {
      description: 'Create a Jira issue (bug/task) for a remediation or incident follow-up.',
      params: {
        summary: { type: 'string', required: true },
        description: { type: 'string' },
        project_key: { type: 'string', description: 'Defaults to the configured project' },
        issue_type: { type: 'string', description: 'Task | Bug | Story (default Task)' },
      },
      async run(cfg, p) {
        const key = p.project_key || cfg.project_key;
        if (!key) throw new Error('No Jira project key provided or configured.');
        const r = await call(cfg, 'POST', '/rest/api/3/issue', {
          fields: {
            project: { key },
            summary: p.summary,
            description: adf(p.description),
            issuetype: { name: p.issue_type || 'Task' },
          },
        });
        return { key: r.key, id: r.id, url: `${base(cfg)}/browse/${r.key}` };
      },
    },

    search_issues: {
      description: 'Search Jira issues with JQL.',
      params: { jql: { type: 'string', required: true, description: 'e.g. project=OPS AND status!=Done' }, limit: { type: 'number' } },
      async run(cfg, p) {
        const r = await call(cfg, 'POST', '/rest/api/3/search', { jql: p.jql, maxResults: p.limit || 20, fields: ['summary', 'status', 'assignee', 'priority'] });
        return (r.issues || []).map((i) => ({
          key: i.key, summary: i.fields?.summary, status: i.fields?.status?.name,
          assignee: i.fields?.assignee?.displayName, url: `${base(cfg)}/browse/${i.key}`,
        }));
      },
    },

    add_comment: {
      description: 'Add a comment to a Jira issue.',
      params: { issue_key: { type: 'string', required: true }, comment: { type: 'string', required: true } },
      async run(cfg, p) {
        await call(cfg, 'POST', `/rest/api/3/issue/${p.issue_key}/comment`, { body: adf(p.comment) });
        return { commented: true, issue: p.issue_key };
      },
    },
  },
};
