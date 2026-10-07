const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const { protect } = require('../middleware/auth');
const Pipeline = require('../models/Pipeline');
const Integration = require('../models/Integration');
const { embed, DIM: EMBED_DIM, provider: embedProvider } = require('../services/embeddingService');

const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

function decrypt(encryptedObject) {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(encryptedObject.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encryptedObject.authTag, 'hex'));
  let decrypted = decipher.update(encryptedObject.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

// In-memory progress tracking
const pipelineProgress = new Map();

// Available data types per source
const SOURCE_DATA_TYPES = {
  snow: [
    { key: 'incident', label: 'Incidents', table: 'incident' },
    { key: 'change_request', label: 'Change Requests', table: 'change_request' },
    { key: 'kb_knowledge', label: 'Knowledge Base', table: 'kb_knowledge' },
    { key: 'cmdb_ci', label: 'CMDB Configuration Items', table: 'cmdb_ci' },
    { key: 'problem', label: 'Problems', table: 'problem' },
    { key: 'sc_request', label: 'Service Requests', table: 'sc_request' }
  ],
  jira: [
    { key: 'issues', label: 'Issues', table: 'issues' },
    { key: 'comments', label: 'Comments', table: 'comments' },
    { key: 'changelogs', label: 'Change Logs', table: 'changelogs' }
  ],
  github: [
    { key: 'issues', label: 'Issues', table: 'issues' },
    { key: 'pull_requests', label: 'Pull Requests', table: 'pull_requests' },
    { key: 'discussions', label: 'Discussions', table: 'discussions' }
  ],
  email: [
    { key: 'inbox', label: 'Inbox', table: 'inbox' }
  ]
};

// GET /api/pipelines - List pipelines + source info
router.get('/', protect, async (req, res) => {
  try {
    const pipelines = await Pipeline.find({ userId: req.user.id }).sort({ createdAt: -1 });
    const integrations = await Integration.find({ userId: req.user.id });

    const configuredSources = {};
    integrations.forEach(i => {
      configuredSources[i.type] = { enabled: i.enabled, lastTested: i.lastTested };
    });

    res.json({ pipelines, sources: configuredSources, dataTypes: SOURCE_DATA_TYPES });
  } catch (error) {
    console.error('Error fetching pipelines:', error);
    res.status(500).json({ message: 'Failed to fetch pipelines' });
  }
});

// GET /api/pipelines/progress/:pipelineId - SSE for real-time progress
router.get('/progress/:pipelineId', protect, (req, res) => {
  const { pipelineId } = req.params;
  const key = `${req.user.id}:${pipelineId}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const interval = setInterval(() => {
    const progress = pipelineProgress.get(key);
    if (progress) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
      if (progress.status === 'completed' || progress.status === 'failed') {
        clearInterval(interval);
        pipelineProgress.delete(key);
        setTimeout(() => res.end(), 1000);
      }
    }
  }, 500);

  req.on('close', () => clearInterval(interval));
});

// POST /api/pipelines - Create pipeline
router.post('/', protect, async (req, res) => {
  try {
    const { name, sourceType, tableCollections } = req.body;

    if (!sourceType || !tableCollections || !tableCollections.length) {
      return res.status(400).json({ message: 'Source type and at least one data type with collection name are required' });
    }

    // Verify source integration exists
    const sourceIntegration = await Integration.findOne({ userId: req.user.id, type: sourceType, enabled: true });
    if (!sourceIntegration) {
      return res.status(400).json({ message: `${sourceType} integration not configured. Set it up in Integrations first.` });
    }

    // Verify milvus integration exists
    const milvusIntegration = await Integration.findOne({ userId: req.user.id, type: 'milvus', enabled: true });
    if (!milvusIntegration) {
      return res.status(400).json({ message: 'Milvus integration not configured. Set it up in Integrations first.' });
    }

    const sourceNames = { snow: 'ServiceNow', jira: 'Jira', github: 'GitHub', email: 'Email' };

    const pipeline = new Pipeline({
      userId: req.user.id,
      name: name || `${sourceNames[sourceType] || sourceType} → Milvus Pipeline`,
      sourceType,
      destinationType: 'milvus',
      tableCollections: tableCollections.map(tc => ({
        table: tc.table,
        collection: tc.collection,
        label: tc.label || tc.table
      }))
    });

    await pipeline.save();
    res.json(pipeline);
  } catch (error) {
    console.error('Error creating pipeline:', error);
    res.status(500).json({ message: 'Failed to create pipeline' });
  }
});

// POST /api/pipelines/:id/run - Execute pipeline
router.post('/:id/run', protect, async (req, res) => {
  try {
    const pipeline = await Pipeline.findOne({ _id: req.params.id, userId: req.user.id });
    if (!pipeline) return res.status(404).json({ message: 'Pipeline not found' });
    if (pipeline.status === 'running') return res.status(409).json({ message: 'Pipeline is already running' });

    const sourceIntegration = await Integration.findOne({ userId: req.user.id, type: pipeline.sourceType });
    const milvusIntegration = await Integration.findOne({ userId: req.user.id, type: 'milvus' });

    if (!sourceIntegration || !milvusIntegration) {
      return res.status(400).json({ message: 'Both source and Milvus integrations must be configured' });
    }

    const sourceConfig = decrypt(sourceIntegration.encryptedConfig);
    const milvusConfig = decrypt(milvusIntegration.encryptedConfig);

    const run = {
      status: 'running',
      startedAt: new Date(),
      totalRecords: 0,
      processedRecords: 0,
      tableDetails: pipeline.tableCollections.map(tc => ({
        table: tc.table,
        collection: tc.collection,
        recordCount: 0,
        status: 'pending'
      }))
    };

    pipeline.status = 'running';
    pipeline.lastRun = run;
    await pipeline.save();

    const progressKey = `${req.user.id}:${pipeline._id}`;
    pipelineProgress.set(progressKey, {
      status: 'running',
      phase: 'connecting',
      processedRecords: 0,
      totalRecords: 0,
      tables: run.tableDetails,
      message: 'Connecting...'
    });

    res.json({ message: 'Pipeline started', pipelineId: pipeline._id });

    executePipeline(pipeline, sourceConfig, milvusConfig, progressKey).catch(err => {
      console.error('Pipeline execution error:', err);
    });
  } catch (error) {
    console.error('Error running pipeline:', error);
    res.status(500).json({ message: 'Failed to start pipeline' });
  }
});

// DELETE /api/pipelines/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    await Pipeline.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'Pipeline deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete pipeline' });
  }
});

// ==========================================
// Pipeline Execution
// ==========================================

async function executePipeline(pipeline, sourceConfig, milvusConfig, progressKey) {
  const startTime = Date.now();
  const tableResults = {};
  let totalProcessed = 0;
  let totalRecords = 0;

  try {
    const milvusHost = milvusConfig.host.replace(/\/+$/, '').replace(/^https?:\/\//i, '');
    const milvusPort = milvusConfig.port || '19530';
    const milvusBaseUrl = `http://${milvusHost}:${milvusPort}/v2/vectordb`;

    for (let i = 0; i < pipeline.tableCollections.length; i++) {
      const tc = pipeline.tableCollections[i];
      const tableDetail = pipeline.lastRun.tableDetails[i];
      tableDetail.status = 'running';

      pipelineProgress.set(progressKey, {
        status: 'running',
        phase: 'fetching',
        currentTable: tc.table,
        currentTableLabel: tc.label,
        currentTableIndex: i,
        totalTables: pipeline.tableCollections.length,
        processedRecords: totalProcessed,
        totalRecords,
        tables: pipeline.lastRun.tableDetails,
        message: `Fetching ${tc.label || tc.table}...`,
        elapsedMs: Date.now() - startTime
      });

      // Fetch records based on source type
      let records = [];
      try {
        records = await fetchFromSource(pipeline.sourceType, sourceConfig, tc.table);
      } catch (fetchErr) {
        console.error(`Failed to fetch ${tc.table}:`, fetchErr.message);
        tableDetail.status = 'failed';
        continue;
      }

      tableDetail.recordCount = records.length;
      totalRecords += records.length;

      pipelineProgress.set(progressKey, {
        status: 'running',
        phase: 'preparing_milvus',
        currentTable: tc.table,
        currentTableLabel: tc.label,
        currentTableIndex: i,
        totalTables: pipeline.tableCollections.length,
        processedRecords: totalProcessed,
        totalRecords,
        tables: pipeline.lastRun.tableDetails,
        message: `Creating collection "${tc.collection}"...`,
        elapsedMs: Date.now() - startTime
      });

      // Ensure Milvus collection exists (dimension must match the embedder)
      try {
        await axios.post(`${milvusBaseUrl}/collections/create`, {
          collectionName: tc.collection,
          dimension: EMBED_DIM,
          metricType: 'COSINE',
          autoId: true,
          enableDynamicField: true
        }, { timeout: 10000 });
      } catch { /* collection may already exist */ }

      // Insert in batches
      const batchSize = 50;
      for (let j = 0; j < records.length; j += batchSize) {
        const batch = records.slice(j, j + batchSize);
        const rows = batch.map(r => ({
          text: r._text || '',
          source_table: tc.table,
          number: r.number || r.key || '',
          short_description: r.short_description || r.summary || r.title || '',
          state: r.state || r.status || '',
          priority: r.priority || '',
          category: r.category || '',
          sys_id: r.sys_id || r.id || '',
          sys_created_on: r.sys_created_on || r.created || '',
          sys_updated_on: r.sys_updated_on || r.updated || ''
        }));

        // Generate embeddings — without a `vector` field Milvus rejects the
        // insert, which is why earlier runs silently stored nothing.
        const vectors = await embed(rows.map(r => r.text));
        const data = rows.map((r, k) => ({ ...r, vector: vectors[k] }));

        try {
          await axios.post(`${milvusBaseUrl}/entities/insert`, {
            collectionName: tc.collection,
            data
          }, { timeout: 60000 });
        } catch (insertErr) {
          const detail = insertErr.response?.data ? JSON.stringify(insertErr.response.data).slice(0, 300) : insertErr.message;
          console.error(`Insert error for ${tc.collection}:`, detail);
          throw new Error(`Milvus insert failed for "${tc.collection}": ${detail}`);
        }

        totalProcessed += batch.length;

        const elapsed = Date.now() - startTime;
        const rate = totalProcessed / (elapsed / 1000);
        const remaining = totalRecords - totalProcessed;

        pipelineProgress.set(progressKey, {
          status: 'running',
          phase: 'inserting',
          currentTable: tc.table,
          currentTableLabel: tc.label,
          currentTableIndex: i,
          totalTables: pipeline.tableCollections.length,
          processedRecords: totalProcessed,
          totalRecords,
          tables: pipeline.lastRun.tableDetails,
          message: `Inserting ${tc.label} into "${tc.collection}"... ${Math.min(j + batchSize, records.length)}/${records.length}`,
          elapsedMs: elapsed,
          estimatedRemainingMs: rate > 0 ? Math.round((remaining / rate) * 1000) : 0,
          recordsPerSecond: Math.round(rate * 10) / 10
        });
      }

      tableDetail.status = 'completed';
    }

    // Done
    const durationMs = Date.now() - startTime;
    pipeline.status = 'completed';
    pipeline.lastRun.status = 'completed';
    pipeline.lastRun.completedAt = new Date();
    pipeline.lastRun.processedRecords = totalProcessed;
    pipeline.lastRun.totalRecords = totalRecords;
    pipeline.lastRun.durationMs = durationMs;
    pipeline.runs.push(pipeline.lastRun);
    await pipeline.save();

    pipelineProgress.set(progressKey, {
      status: 'completed',
      phase: 'done',
      processedRecords: totalProcessed,
      totalRecords,
      tables: pipeline.lastRun.tableDetails,
      message: `Pipeline complete! ${totalProcessed} records synced across ${pipeline.tableCollections.length} collections.`,
      elapsedMs: durationMs,
      durationMs
    });

  } catch (error) {
    const durationMs = Date.now() - startTime;
    pipeline.status = 'failed';
    pipeline.lastRun.status = 'failed';
    pipeline.lastRun.error = error.message;
    pipeline.lastRun.completedAt = new Date();
    pipeline.lastRun.durationMs = durationMs;
    pipeline.runs.push(pipeline.lastRun);
    await pipeline.save();

    pipelineProgress.set(progressKey, {
      status: 'failed',
      phase: 'error',
      processedRecords: totalProcessed,
      totalRecords,
      tables: pipeline.lastRun.tableDetails,
      message: `Pipeline failed: ${error.message}`,
      error: error.message,
      elapsedMs: durationMs
    });
  }
}

async function fetchFromSource(sourceType, config, table) {
  switch (sourceType) {
    case 'snow':
      return fetchSnowTable(config, table);
    case 'jira':
      return fetchJiraData(config, table);
    case 'github':
      return fetchGithubData(config, table);
    default:
      return [];
  }
}

async function fetchSnowTable(config, table) {
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  const baseUrl = config.instance_url.replace(/\/+$/, '');
  const records = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await axios.get(
      `${baseUrl}/api/now/table/${table}?sysparm_limit=${limit}&sysparm_offset=${offset}&sysparm_display_value=true`,
      {
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        timeout: 30000
      }
    );
    const batch = response.data.result || [];
    if (!batch.length) break;
    batch.forEach(r => { r._text = buildSnowText(r, table); });
    records.push(...batch);
    offset += limit;
    if (batch.length < limit) break;
  }
  return records;
}

async function fetchJiraData(config, table) {
  const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
  const baseUrl = config.jira_url.replace(/\/+$/, '');
  const records = [];

  if (table === 'issues') {
    let startAt = 0;
    while (true) {
      const resp = await axios.get(`${baseUrl}/rest/api/3/search?startAt=${startAt}&maxResults=50&fields=summary,status,priority,assignee,created,updated,description,issuetype,project`, {
        headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
        timeout: 30000
      });
      const issues = resp.data.issues || [];
      if (!issues.length) break;
      issues.forEach(i => {
        i._text = `${i.key} | ${i.fields?.summary || ''} | ${i.fields?.description?.content?.map(c => c.content?.map(t => t.text).join(' ')).join(' ') || ''} | Status: ${i.fields?.status?.name || ''} | Priority: ${i.fields?.priority?.name || ''} | Type: ${i.fields?.issuetype?.name || ''}`;
      });
      records.push(...issues);
      startAt += 50;
      if (issues.length < 50) break;
    }
  }
  return records;
}

async function fetchGithubData(config, table) {
  const token = config.personal_access_token;
  const records = [];

  if (table === 'issues' || table === 'pull_requests') {
    const endpoint = table === 'pull_requests' ? 'pulls' : 'issues';
    let page = 1;
    while (true) {
      const resp = await axios.get(`https://api.github.com/user/repos?per_page=5&page=1`, {
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
        timeout: 15000
      });
      const repos = resp.data || [];
      for (const repo of repos) {
        try {
          const itemResp = await axios.get(`https://api.github.com/repos/${repo.full_name}/${endpoint}?state=all&per_page=100`, {
            headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
            timeout: 15000
          });
          (itemResp.data || []).forEach(item => {
            item._text = `${item.title || ''} | ${item.body || ''} | State: ${item.state} | Repo: ${repo.full_name}`;
          });
          records.push(...(itemResp.data || []));
        } catch { /* skip repo */ }
      }
      break; // first page of repos only for now
    }
  }
  return records;
}

function buildSnowText(record, table) {
  const parts = [];
  if (table === 'incident') {
    parts.push(`Incident ${record.number || ''}`, record.short_description || '', record.description || '',
      `Priority: ${record.priority || 'N/A'}`, `State: ${record.state || 'N/A'}`, `Category: ${record.category || 'N/A'}`,
      `Assignment Group: ${record.assignment_group || 'N/A'}`, `Resolution: ${record.close_notes || ''}`);
  } else if (table === 'change_request') {
    parts.push(`Change ${record.number || ''}`, record.short_description || '', record.description || '',
      `Type: ${record.type || 'N/A'}`, `Risk: ${record.risk || 'N/A'}`, `State: ${record.state || 'N/A'}`);
  } else if (table === 'kb_knowledge') {
    parts.push(`KB ${record.number || ''}`, record.short_description || '', record.text || record.article_body || '',
      `Category: ${record.kb_category || 'N/A'}`);
  } else if (table === 'cmdb_ci') {
    parts.push(`CI ${record.name || ''}`, record.short_description || '', `Class: ${record.sys_class_name || 'N/A'}`,
      `Category: ${record.category || 'N/A'}`, `Environment: ${record.environment || 'N/A'}`);
  } else {
    parts.push(record.number || '', record.short_description || '', record.description || '');
  }
  return parts.filter(Boolean).join(' | ');
}

module.exports = router;
