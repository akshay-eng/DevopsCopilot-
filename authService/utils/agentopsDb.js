const { createClient } = require('@clickhouse/client');
const { Pool } = require('pg');

// ClickHouse connection for trace/span data
const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || 'password',
  database: process.env.CLICKHOUSE_DATABASE || 'otel_2',
  request_timeout: 30000,
});

// AgentOps PostgreSQL connection for project metadata
const agentopsPool = new Pool({
  host: process.env.AGENTOPS_DB_HOST || 'localhost',
  port: process.env.AGENTOPS_DB_PORT || 5433,
  database: process.env.AGENTOPS_DB_NAME || 'agentops',
  user: process.env.AGENTOPS_DB_USER || 'agentops',
  password: process.env.AGENTOPS_DB_PASSWORD || 'agentops_secret',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

agentopsPool.on('error', (err) => {
  console.error('[AgentOps DB] Postgres pool error', err);
});

/**
 * Get sessions (traces) from ClickHouse
 */
async function getSessions(options = {}) {
  const {
    limit = 50,
    offset = 0,
    startDate,
    endDate,
    projectId,
    search
  } = options;

  try {
    let whereClause = '1=1';
    const params = {};

    if (projectId) {
      whereClause += ` AND ResourceAttributes['agentops.project.id'] = {projectId:String}`;
      params.projectId = projectId;
    }

    if (startDate) {
      whereClause += ` AND Timestamp >= parseDateTimeBestEffort({startDate:String})`;
      params.startDate = startDate;
    }

    if (endDate) {
      whereClause += ` AND Timestamp <= parseDateTimeBestEffort({endDate:String})`;
      params.endDate = endDate;
    }

    if (search) {
      whereClause += ` AND (
        TraceId ILIKE {search:String}
        OR SpanAttributes['agentops.tags'] ILIKE {search:String}
        OR SpanName ILIKE {search:String}
      )`;
      params.search = `%${search}%`;
    }

    const query = `
      SELECT
        TraceId,
        min(Timestamp) as init_timestamp,
        max(Timestamp) as end_timestamp,
        count() as span_count,
        any(ResourceAttributes['agentops.project.id']) as project_id,
        anyIf(SpanAttributes['agentops.session.end_state'], SpanName = 'default.session') as end_state,
        anyIf(SpanAttributes['agentops.tags'], SpanName = 'default.session') as tags_json,
        countIf(SpanName = 'openai.chat.completion') as llm_calls,
        countIf(startsWith(SpanName, 'tool_call.')) as tool_calls,
        sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.prompt_tokens']),
              SpanAttributes['gen_ai.usage.prompt_tokens'] != '') as prompt_tokens,
        sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.completion_tokens']),
              SpanAttributes['gen_ai.usage.completion_tokens'] != '') as completion_tokens,
        sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.prompt_cost']),
              SpanAttributes['gen_ai.usage.prompt_cost'] != '')
        + sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.completion_cost']),
                SpanAttributes['gen_ai.usage.completion_cost'] != '') as total_cost,
        countIf(StatusCode = 'Error') as errors
      FROM otel_traces
      WHERE ${whereClause}
      GROUP BY TraceId
      ORDER BY init_timestamp DESC
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `;

    params.limit = limit;
    params.offset = offset;

    const result = await clickhouse.query({
      query,
      query_params: params,
      format: 'JSONEachRow'
    });

    const rows = await result.json();

    return rows.map(row => {
      let tags = [];
      try {
        if (row.tags_json) tags = JSON.parse(row.tags_json);
      } catch (e) { /* ignore parse errors */ }

      return {
        id: row.TraceId,
        project_id: row.project_id || '',
        init_timestamp: row.init_timestamp,
        end_timestamp: row.end_timestamp,
        end_state: row.end_state || null,
        end_state_reason: null,
        tags,
        video: null,
        host_env: null,
        cost: row.total_cost || 0,
        llm_calls: row.llm_calls || 0,
        tool_calls: row.tool_calls || 0,
        errors: row.errors || 0,
        span_count: row.span_count || 0,
        prompt_tokens: row.prompt_tokens || 0,
        completion_tokens: row.completion_tokens || 0,
        project_name: null // enriched later if needed
      };
    });
  } catch (error) {
    console.error('[AgentOps DB] Error fetching sessions from ClickHouse:', error);
    throw error;
  }
}

/**
 * Get session count from ClickHouse
 */
async function getSessionCount(options = {}) {
  const { startDate, endDate, projectId, search } = options;

  try {
    let whereClause = '1=1';
    const params = {};

    if (projectId) {
      whereClause += ` AND ResourceAttributes['agentops.project.id'] = {projectId:String}`;
      params.projectId = projectId;
    }

    if (startDate) {
      whereClause += ` AND Timestamp >= parseDateTimeBestEffort({startDate:String})`;
      params.startDate = startDate;
    }

    if (endDate) {
      whereClause += ` AND Timestamp <= parseDateTimeBestEffort({endDate:String})`;
      params.endDate = endDate;
    }

    if (search) {
      whereClause += ` AND (
        TraceId ILIKE {search:String}
        OR SpanAttributes['agentops.tags'] ILIKE {search:String}
        OR SpanName ILIKE {search:String}
      )`;
      params.search = `%${search}%`;
    }

    const query = `
      SELECT count(DISTINCT TraceId) as cnt
      FROM otel_traces
      WHERE ${whereClause}
    `;

    const result = await clickhouse.query({
      query,
      query_params: params,
      format: 'JSONEachRow'
    });

    const rows = await result.json();
    return parseInt(rows[0]?.cnt || 0, 10);
  } catch (error) {
    console.error('[AgentOps DB] Error counting sessions:', error);
    throw error;
  }
}

/**
 * Get session by ID (TraceId) from ClickHouse
 */
async function getSessionById(sessionId) {
  try {
    const query = `
      SELECT
        TraceId,
        min(Timestamp) as init_timestamp,
        max(Timestamp) as end_timestamp,
        count() as span_count,
        any(ResourceAttributes['agentops.project.id']) as project_id,
        anyIf(SpanAttributes['agentops.session.end_state'], SpanName = 'default.session') as end_state,
        anyIf(SpanAttributes['agentops.tags'], SpanName = 'default.session') as tags_json,
        countIf(SpanName = 'openai.chat.completion') as llm_calls,
        countIf(startsWith(SpanName, 'tool_call.')) as tool_calls,
        sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.prompt_tokens']),
              SpanAttributes['gen_ai.usage.prompt_tokens'] != '') as prompt_tokens,
        sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.completion_tokens']),
              SpanAttributes['gen_ai.usage.completion_tokens'] != '') as completion_tokens,
        sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.prompt_cost']),
              SpanAttributes['gen_ai.usage.prompt_cost'] != '')
        + sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.completion_cost']),
                SpanAttributes['gen_ai.usage.completion_cost'] != '') as total_cost,
        countIf(StatusCode = 'Error') as errors
      FROM otel_traces
      WHERE TraceId = {traceId:String}
      GROUP BY TraceId
    `;

    const result = await clickhouse.query({
      query,
      query_params: { traceId: sessionId },
      format: 'JSONEachRow'
    });

    const rows = await result.json();
    if (!rows.length) return null;

    const row = rows[0];
    let tags = [];
    try {
      if (row.tags_json) tags = JSON.parse(row.tags_json);
    } catch (e) { /* ignore */ }

    return {
      id: row.TraceId,
      project_id: row.project_id || '',
      init_timestamp: row.init_timestamp,
      end_timestamp: row.end_timestamp,
      end_state: row.end_state || null,
      end_state_reason: null,
      tags,
      video: null,
      host_env: null,
      cost: row.total_cost || 0,
      llm_calls: row.llm_calls || 0,
      tool_calls: row.tool_calls || 0,
      errors: row.errors || 0,
      span_count: row.span_count || 0,
      prompt_tokens: row.prompt_tokens || 0,
      completion_tokens: row.completion_tokens || 0,
      project_name: null
    };
  } catch (error) {
    console.error('[AgentOps DB] Error fetching session by ID:', error);
    throw error;
  }
}

/**
 * Get events (spans) for a session from ClickHouse
 */
async function getSessionEvents(sessionId) {
  try {
    const query = `
      SELECT
        SpanId as id,
        TraceId as session_id,
        SpanName as event_type,
        ParentSpanId as parent_span_id,
        Timestamp as init_timestamp,
        Timestamp + Duration / 1000000000 as end_timestamp,
        Duration,
        StatusCode as status_code,
        StatusMessage as status_message,
        SpanKind as span_kind,
        SpanAttributes,
        ResourceAttributes,
        ServiceName as service_name
      FROM otel_traces
      WHERE TraceId = {traceId:String}
      ORDER BY Timestamp ASC
    `;

    const result = await clickhouse.query({
      query,
      query_params: { traceId: sessionId },
      format: 'JSONEachRow'
    });

    const rows = await result.json();

    return rows.map(row => ({
      id: row.id,
      session_id: row.session_id,
      event_type: row.event_type,
      parent_span_id: row.parent_span_id,
      init_timestamp: row.init_timestamp,
      end_timestamp: row.end_timestamp,
      duration: row.Duration,
      status_code: row.status_code,
      status_message: row.status_message,
      span_kind: row.span_kind,
      service_name: row.service_name,
      params: row.SpanAttributes || {},
      resource_attributes: row.ResourceAttributes || {}
    }));
  } catch (error) {
    console.error('[AgentOps DB] Error fetching session events:', error);
    throw error;
  }
}

/**
 * Get metrics from ClickHouse with distribution data for analytics
 */
async function getMetrics(options = {}) {
  const { startDate, endDate, projectId } = options;

  try {
    let whereClause = '1=1';
    const params = {};

    if (projectId) {
      whereClause += ` AND ResourceAttributes['agentops.project.id'] = {projectId:String}`;
      params.projectId = projectId;
    }

    if (startDate) {
      whereClause += ` AND Timestamp >= parseDateTimeBestEffort({startDate:String})`;
      params.startDate = startDate;
    }

    if (endDate) {
      whereClause += ` AND Timestamp <= parseDateTimeBestEffort({endDate:String})`;
      params.endDate = endDate;
    }

    // First get per-trace aggregations
    const traceQuery = `
      SELECT
        TraceId,
        min(Timestamp) as trace_start,
        max(Timestamp) as trace_end,
        count() as span_count,
        anyIf(SpanAttributes['agentops.session.end_state'], SpanName = 'default.session') as end_state,
        countIf(SpanName = 'openai.chat.completion') as llm_calls,
        countIf(startsWith(SpanName, 'tool_call.')) as tool_calls,
        sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.prompt_tokens']),
              SpanAttributes['gen_ai.usage.prompt_tokens'] != '') as prompt_tokens,
        sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.completion_tokens']),
              SpanAttributes['gen_ai.usage.completion_tokens'] != '') as completion_tokens,
        sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.prompt_cost']),
              SpanAttributes['gen_ai.usage.prompt_cost'] != '')
        + sumIf(toFloat64OrZero(SpanAttributes['gen_ai.usage.completion_cost']),
                SpanAttributes['gen_ai.usage.completion_cost'] != '') as total_cost,
        countIf(StatusCode = 'Error') as errors
      FROM otel_traces
      WHERE ${whereClause}
      GROUP BY TraceId
    `;

    const result = await clickhouse.query({
      query: traceQuery,
      query_params: params,
      format: 'JSONEachRow'
    });

    const traces = await result.json();

    // Process trace-level data
    let totalSessions = traces.length;
    let successfulSessions = 0;
    let failedSessions = 0;
    let totalCost = 0;
    let totalLLMCalls = 0;
    let totalToolCalls = 0;
    let totalErrors = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const traceDurations = [];
    const traceCostDates = {};
    const failedTracesDates = {};
    const spansPerTrace = {};
    const successTimestamps = [];
    const failTimestamps = [];

    traces.forEach(trace => {
      const startTime = new Date(trace.trace_start);
      const endTime = new Date(trace.trace_end);
      const durationNs = (endTime - startTime) * 1000000; // ms to ns
      const cost = parseFloat(trace.total_cost) || 0;
      const llmCalls = parseInt(trace.llm_calls) || 0;
      const toolCalls = parseInt(trace.tool_calls) || 0;
      const spanCount = parseInt(trace.span_count) || 0;
      const errors = parseInt(trace.errors) || 0;

      totalCost += cost;
      totalLLMCalls += llmCalls;
      totalToolCalls += toolCalls;
      totalErrors += errors;
      totalPromptTokens += parseFloat(trace.prompt_tokens) || 0;
      totalCompletionTokens += parseFloat(trace.completion_tokens) || 0;

      if (trace.end_state === 'Success') {
        successfulSessions++;
        successTimestamps.push(endTime.toISOString());
      } else if (trace.end_state && trace.end_state !== 'Success') {
        failedSessions++;
        failTimestamps.push(endTime.toISOString());
      }

      traceDurations.push(durationNs);

      // Cost by date
      const dateKey = startTime.toISOString().split('T')[0];
      if (cost > 0) {
        traceCostDates[dateKey] = (traceCostDates[dateKey] || 0) + cost;
      }

      // Spans per trace distribution
      spansPerTrace[spanCount] = (spansPerTrace[spanCount] || 0) + 1;

      // Failed traces by date
      if (trace.end_state && trace.end_state !== 'Success') {
        failedTracesDates[dateKey] = (failedTracesDates[dateKey] || 0) + 1;
      }
    });

    const totalSpans = totalLLMCalls + totalToolCalls;
    const avgDurationNs = traceDurations.length > 0
      ? traceDurations.reduce((a, b) => a + b, 0) / traceDurations.length
      : 0;
    const minDurationNs = traceDurations.length > 0 ? Math.min(...traceDurations) : 0;
    const maxDurationNs = traceDurations.length > 0 ? Math.max(...traceDurations) : 0;

    return {
      totalSessions,
      trace_count: totalSessions,
      successfulSessions,
      totalCost,
      totalLLMCalls,
      totalToolCalls,
      totalErrors,
      avgDuration: avgDurationNs / 1000000000, // to seconds
      successRate: totalSessions > 0
        ? (successfulSessions / totalSessions) * 100
        : 0,

      duration_metrics: {
        min_duration_ns: minDurationNs,
        max_duration_ns: maxDurationNs,
        avg_duration_ns: avgDurationNs,
        total_duration_ns: traceDurations.reduce((a, b) => a + b, 0)
      },

      token_metrics: {
        total_cost: totalCost,
        average_cost_per_session: totalSessions > 0 ? (totalCost / totalSessions).toFixed(6) : '0',
        total_tokens: {
          all: totalPromptTokens + totalCompletionTokens,
          success: totalPromptTokens + totalCompletionTokens,
          fail: 0
        },
        prompt_tokens: Math.floor(totalPromptTokens),
        completion_tokens: Math.floor(totalCompletionTokens)
      },

      span_count: {
        total: totalSpans,
        success: totalSpans,
        fail: 0,
        unknown: 0,
        indeterminate: 0
      },

      success_datetime: successTimestamps,
      fail_datetime: failTimestamps,
      indeterminate_datetime: [],

      trace_cost_dates: Object.entries(traceCostDates).map(([date, cost]) => ({ date, cost })),
      trace_durations: traceDurations,
      spans_per_trace: Object.entries(spansPerTrace).map(([count, traces]) => ({
        span_count: parseInt(count),
        trace_count: traces
      })),
      failed_traces_dates: Object.entries(failedTracesDates).map(([date, count]) => ({ date, count }))
    };
  } catch (error) {
    console.error('[AgentOps DB] Error fetching metrics:', error);
    throw error;
  }
}

/**
 * Get projects from AgentOps Postgres with trace counts from ClickHouse
 */
async function getProjects(userId) {
  try {
    // Get projects from Postgres
    const pgResult = await agentopsPool.query(`
      SELECT id, name, api_key
      FROM projects
      ORDER BY name ASC
    `);

    // Get trace counts per project from ClickHouse
    const chResult = await clickhouse.query({
      query: `
        SELECT
          ResourceAttributes['agentops.project.id'] as project_id,
          count(DISTINCT TraceId) as trace_count
        FROM otel_traces
        WHERE ResourceAttributes['agentops.project.id'] != ''
        GROUP BY project_id
      `,
      format: 'JSONEachRow'
    });

    const traceCounts = {};
    const chRows = await chResult.json();
    chRows.forEach(row => {
      traceCounts[row.project_id] = parseInt(row.trace_count) || 0;
    });

    return pgResult.rows.map(row => ({
      ...row,
      trace_count: traceCounts[row.id] || 0
    }));
  } catch (error) {
    console.error('[AgentOps DB] Error fetching projects:', error);
    throw error;
  }
}

/**
 * Create a project in AgentOps Postgres
 */
async function createProject(projectData) {
  const { id, name, apiKey, orgId } = projectData;
  try {
    const result = await agentopsPool.query(
      `INSERT INTO projects (id, org_id, name, api_key, environment)
       VALUES ($1, $2, $3, $4, 'development')
       RETURNING *`,
      [id, orgId, name, apiKey]
    );
    return result.rows[0];
  } catch (error) {
    console.error('[AgentOps DB] Error creating project in Postgres:', error);
    throw error;
  }
}

/**
 * Get the default org from Postgres (for project creation)
 */
async function getDefaultOrg() {
  try {
    const result = await agentopsPool.query(
      `SELECT id FROM orgs ORDER BY created_at ASC LIMIT 1`
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('[AgentOps DB] Error getting default org:', error);
    return null;
  }
}

/**
 * Test both database connections
 */
async function testConnection() {
  try {
    // Test ClickHouse
    const chResult = await clickhouse.query({
      query: 'SELECT 1 as ok',
      format: 'JSONEachRow'
    });
    const chRows = await chResult.json();
    console.log('[AgentOps DB] ClickHouse connection successful');

    // Test Postgres
    await agentopsPool.query('SELECT 1');
    console.log('[AgentOps DB] Postgres connection successful');

    return true;
  } catch (error) {
    console.error('[AgentOps DB] Database connection failed:', error.message);
    return false;
  }
}

module.exports = {
  agentopsPool,
  clickhouse,
  getSessions,
  getSessionCount,
  getSessionById,
  getSessionEvents,
  getMetrics,
  getProjects,
  createProject,
  getDefaultOrg,
  testConnection
};
