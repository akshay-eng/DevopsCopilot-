/**
 * Background job: collects MCP server metrics every 60 seconds
 * and persists them as MCPMetricSnapshot documents in MongoDB.
 */
const MCPDeployment = require('../models/MCPDeployment');
const MCPMetricSnapshot = require('../models/MCPMetricSnapshot');
const Cluster = require('../models/Cluster');
const axios = require('axios');

const COLLECT_INTERVAL_MS = 60 * 1000; // 60 seconds

async function collectMetrics() {
    try {
        // Find all running deployments
        const deployments = await MCPDeployment.find({ status: 'running' });

        for (const dep of deployments) {
            try {
                // Look up the cluster agent URL
                const cluster = await Cluster.findById(dep.clusterId);
                if (!cluster || !cluster.agentEndpoint) continue;

                const agentUrl = cluster.agentEndpoint;
                const res = await axios.get(`${agentUrl}/mcp/metrics/${dep.name}`, {
                    params: { namespace: dep.namespace },
                    timeout: 15000,
                });

                const d = res.data;

                await MCPMetricSnapshot.create({
                    deploymentId: dep._id,
                    cpu: {
                        millicores: d.cpu?.millicores || 0,
                        percent: d.cpu?.percent || 0,
                    },
                    memory: {
                        usageMi: d.memory?.usageMi || 0,
                        percent: d.memory?.percent || 0,
                    },
                    network: {
                        rxMB: d.network?.rxMB || 0,
                        txMB: d.network?.txMB || 0,
                    },
                    timestamp: new Date(),
                });
            } catch (err) {
                // Skip this deployment silently — agent may be unreachable
                console.error(`[MetricsCollector] Failed for ${dep.name}: ${err.message}`);
            }
        }
    } catch (err) {
        console.error('[MetricsCollector] Collection cycle error:', err.message);
    }
}

function startMetricsCollector() {
    console.log(`[MetricsCollector] Started — collecting every ${COLLECT_INTERVAL_MS / 1000}s`);
    // Run immediately on start, then every interval
    collectMetrics();
    setInterval(collectMetrics, COLLECT_INTERVAL_MS);
}

module.exports = { startMetricsCollector };
