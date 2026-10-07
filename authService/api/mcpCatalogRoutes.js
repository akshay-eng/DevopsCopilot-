const express = require('express');
const MCPDeployment = require('../models/MCPDeployment');
const Cluster = require('../models/Cluster');
const { protect } = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

// ========================================
// Helper: get cluster agent URL
// ========================================
async function getClusterAgentUrl(clusterId, userId) {
    const cluster = await Cluster.findOne({ _id: clusterId, userId });
    if (!cluster) throw new Error('Cluster not found');
    if (!cluster.agentEndpoint) {
        throw new Error(`Cluster "${cluster.name}" has no agent endpoint registered. Ensure the cluster agent is running and has checked in.`);
    }
    return { cluster, agentUrl: cluster.agentEndpoint };
}

// @route   POST /api/mcp-catalog/deploy
// @desc    Deploy an MCP server to a cluster
// @access  Private
router.post('/deploy', protect, async (req, res) => {
    try {
        const {
            mcpServerId, clusterId, name, namespace,
            image, port, envVars,
            deployMethod, transportArgs, stdioCmd,
            helmChart, helmRepo, helmRepoUrl, helmValues,
            requiresRBAC,
        } = req.body;
        const userId = req.user._id;

        if (!mcpServerId || !clusterId || !name) {
            return res.status(400).json({ success: false, error: 'Missing required fields: mcpServerId, clusterId, name' });
        }

        // Get cluster and agent URL
        const { cluster, agentUrl } = await getClusterAgentUrl(clusterId, userId);

        // Check for existing deployment of same server on same cluster
        const existing = await MCPDeployment.findOne({ userId, clusterId, mcpServerId });
        if (existing) {
            if (existing.status === 'terminating') {
                return res.status(409).json({
                    success: false,
                    error: `The previous ${name} instance is still terminating. Please wait a moment and try again.`,
                    deployment: existing,
                });
            }
            return res.status(409).json({
                success: false,
                error: `${name} is already deployed on cluster ${cluster.name}`,
                deployment: existing,
            });
        }

        // Create deployment record (pending)
        const ns = namespace || 'mcp-servers';
        const deployment = await MCPDeployment.create({
            userId,
            clusterId,
            mcpServerId,
            name,
            namespace: ns,
            image: image || '',
            port: port || 3000,
            envVars: envVars || {},
            deployMethod: deployMethod || 'docker',
            status: 'pending',
        });

        // Forward deploy request to cluster agent
        try {
            const agentPayload = {
                name,
                namespace: ns,
                deployMethod: deployMethod || 'docker',
                image: image || '',
                port: port || 3000,
                envVars: envVars || {},
                transportArgs: transportArgs || [],
                stdioCmd: stdioCmd || '',
                // Helm fields
                helmChart: helmChart || '',
                helmRepo: helmRepo || '',
                helmRepoUrl: helmRepoUrl || '',
                helmValues: helmValues || {},
                requiresRBAC: requiresRBAC || false,
            };

            const agentResponse = await axios.post(`${agentUrl}/mcp/deploy`, agentPayload, {
                timeout: 60000,  // Helm installs can take time
            });

            // Update deployment record with agent response
            deployment.status = 'running';
            deployment.podName = agentResponse.data.podName || '';
            deployment.sseUrl = agentResponse.data.sseUrl || `http://${name}.${ns}.svc.cluster.local:${port || 3000}/sse`;
            await deployment.save();

            res.status(201).json({
                success: true,
                message: `MCP server "${name}" deployed successfully`,
                deployment,
            });
        } catch (agentErr) {
            // Agent call failed — mark as failed
            deployment.status = 'failed';
            await deployment.save();

            console.error('Cluster agent deploy error:', agentErr.message);
            res.status(502).json({
                success: false,
                error: `Failed to deploy to cluster agent: ${agentErr.message}`,
                deployment,
            });
        }
    } catch (error) {
        console.error('MCP deploy error:', error);
        res.status(500).json({ success: false, error: error.message || 'Server error during deployment' });
    }
});

// @route   GET /api/mcp-catalog/deployments
// @desc    List all MCP deployments for current user
// @access  Private
router.get('/deployments', protect, async (req, res) => {
    try {
        const deployments = await MCPDeployment.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, deployments });
    } catch (error) {
        console.error('List MCP deployments error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch deployments' });
    }
});

// @route   GET /api/mcp-catalog/deployments/:id
// @desc    Get single MCP deployment with live status from cluster agent
// @access  Private
router.get('/deployments/:id', protect, async (req, res) => {
    try {
        const deployment = await MCPDeployment.findOne({ _id: req.params.id, userId: req.user._id });
        if (!deployment) {
            return res.status(404).json({ success: false, error: 'Deployment not found' });
        }

        // Try to fetch live status from cluster agent
        try {
            const { agentUrl } = await getClusterAgentUrl(deployment.clusterId, req.user._id);
            const statusRes = await axios.get(`${agentUrl}/mcp/status/${deployment.name}`, {
                params: { namespace: deployment.namespace },
                timeout: 10000,
            });

            // Update local record if status changed
            if (statusRes.data.status && statusRes.data.status !== deployment.status) {
                deployment.status = statusRes.data.status;
                deployment.podName = statusRes.data.podName || deployment.podName;
                await deployment.save();
            }

            res.json({
                success: true,
                deployment,
                liveStatus: statusRes.data,
            });
        } catch (agentErr) {
            // Couldn't reach agent — return cached data
            res.json({ success: true, deployment, liveStatus: null });
        }
    } catch (error) {
        console.error('Get MCP deployment error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch deployment' });
    }
});

// @route   GET /api/mcp-catalog/deployments/:id/metrics
// @desc    Proxy pod metrics from cluster agent
// @access  Private
router.get('/deployments/:id/metrics', protect, async (req, res) => {
    try {
        const deployment = await MCPDeployment.findOne({ _id: req.params.id, userId: req.user._id });
        if (!deployment) {
            return res.status(404).json({ success: false, error: 'Deployment not found' });
        }
        const { agentUrl } = await getClusterAgentUrl(deployment.clusterId, req.user._id);
        const metricsRes = await axios.get(`${agentUrl}/mcp/metrics/${deployment.name}`, {
            params: { namespace: deployment.namespace },
            timeout: 10000,
        });
        res.json({ success: true, ...metricsRes.data });
    } catch (error) {
        console.error('Get MCP metrics error:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch metrics' });
    }
});

// @route   GET /api/mcp-catalog/deployments/:id/logs
// @desc    Proxy pod logs from cluster agent
// @access  Private
router.get('/deployments/:id/logs', protect, async (req, res) => {
    try {
        const deployment = await MCPDeployment.findOne({ _id: req.params.id, userId: req.user._id });
        if (!deployment) {
            return res.status(404).json({ success: false, error: 'Deployment not found' });
        }
        const { agentUrl } = await getClusterAgentUrl(deployment.clusterId, req.user._id);
        const logsRes = await axios.get(`${agentUrl}/mcp/logs/${deployment.name}`, {
            params: { namespace: deployment.namespace, tail: req.query.tail || 200 },
            timeout: 10000,
        });
        res.json({ success: true, ...logsRes.data });
    } catch (error) {
        console.error('Get MCP logs error:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch logs', lines: [] });
    }
});

// @route   GET /api/mcp-catalog/deployments/:id/metrics/history
// @desc    Get historical metrics for an MCP deployment
// @access  Private
router.get('/deployments/:id/metrics/history', protect, async (req, res) => {
    try {
        const MCPMetricSnapshot = require('../models/MCPMetricSnapshot');
        const deployment = await MCPDeployment.findOne({ _id: req.params.id, userId: req.user._id });
        if (!deployment) {
            return res.status(404).json({ success: false, error: 'Deployment not found' });
        }

        const range = req.query.range || '1h';
        const rangeMap = {
            '1h': 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
        };
        const rangeMs = rangeMap[range] || rangeMap['1h'];
        const since = new Date(Date.now() - rangeMs);

        // For longer ranges, downsample by grouping into time buckets
        // 1h/6h: raw points, 24h: 5-min buckets, 7d: 30-min buckets, 30d: 2-hr buckets
        const bucketMinutes = { '1h': 0, '6h': 0, '24h': 5, '7d': 30, '30d': 120 };
        const bucket = bucketMinutes[range] || 0;

        let points;
        if (bucket === 0) {
            // Return raw snapshots
            points = await MCPMetricSnapshot.find({
                deploymentId: deployment._id,
                timestamp: { $gte: since },
            })
                .sort({ timestamp: 1 })
                .select('timestamp cpu memory network -_id')
                .lean();

            points = points.map(p => ({
                timestamp: p.timestamp,
                cpu: p.cpu?.percent || 0,
                cpuMillicores: p.cpu?.millicores || 0,
                memory: p.memory?.percent || 0,
                memoryMi: p.memory?.usageMi || 0,
                rxMB: p.network?.rxMB || 0,
                txMB: p.network?.txMB || 0,
            }));
        } else {
            // Downsample via aggregation
            const bucketMs = bucket * 60 * 1000;
            points = await MCPMetricSnapshot.aggregate([
                { $match: { deploymentId: deployment._id, timestamp: { $gte: since } } },
                {
                    $group: {
                        _id: {
                            $toDate: {
                                $subtract: [
                                    { $toLong: '$timestamp' },
                                    { $mod: [{ $toLong: '$timestamp' }, bucketMs] }
                                ]
                            }
                        },
                        cpu: { $avg: '$cpu.percent' },
                        cpuMillicores: { $avg: '$cpu.millicores' },
                        memory: { $avg: '$memory.percent' },
                        memoryMi: { $avg: '$memory.usageMi' },
                        rxMB: { $avg: '$network.rxMB' },
                        txMB: { $avg: '$network.txMB' },
                    }
                },
                { $sort: { _id: 1 } },
                {
                    $project: {
                        _id: 0,
                        timestamp: '$_id',
                        cpu: { $round: ['$cpu', 1] },
                        cpuMillicores: { $round: ['$cpuMillicores', 1] },
                        memory: { $round: ['$memory', 1] },
                        memoryMi: { $round: ['$memoryMi', 1] },
                        rxMB: { $round: ['$rxMB', 2] },
                        txMB: { $round: ['$txMB', 2] },
                    }
                },
            ]);
        }

        res.json({ success: true, range, points, count: points.length });
    } catch (error) {
        console.error('Get MCP metrics history error:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch history', points: [] });
    }
});

// @route   DELETE /api/mcp-catalog/deployments/:id
// @desc    Undeploy / delete an MCP server
// @access  Private
router.delete('/deployments/:id', protect, async (req, res) => {
    try {
        const deployment = await MCPDeployment.findOne({ _id: req.params.id, userId: req.user._id });
        if (!deployment) {
            return res.status(404).json({ success: false, error: 'Deployment not found' });
        }

        // Mark as terminating immediately
        deployment.status = 'terminating';
        await deployment.save();

        // Try to undeploy from cluster agent
        try {
            const { agentUrl } = await getClusterAgentUrl(deployment.clusterId, req.user._id);
            await axios.delete(`${agentUrl}/mcp/undeploy/${deployment.name}`, {
                params: {
                    namespace: deployment.namespace,
                    deployMethod: deployment.deployMethod || 'docker',
                },
                timeout: 30000,
            });
        } catch (agentErr) {
            console.warn('Agent undeploy call failed (continuing with cleanup):', agentErr.message);
        }

        // Poll K8s until pod is actually gone (max 60s), then clean up DB
        const deploymentId = deployment._id;
        const deploymentName = deployment.name;
        const deploymentNs = deployment.namespace;
        const deploymentClusterId = deployment.clusterId;
        const userId = req.user._id;

        // Respond immediately so the UI gets the terminating state
        res.json({ success: true, status: 'terminating', message: `MCP server "${deploymentName}" is being removed...` });

        // Background cleanup: wait for pod to terminate, then delete DB record
        (async () => {
            const maxWait = 60000;
            const interval = 3000;
            const start = Date.now();
            while (Date.now() - start < maxWait) {
                await new Promise(r => setTimeout(r, interval));
                try {
                    const { agentUrl } = await getClusterAgentUrl(deploymentClusterId, userId);
                    const statusRes = await axios.get(`${agentUrl}/mcp/status/${deploymentName}`, {
                        params: { namespace: deploymentNs },
                        timeout: 10000,
                    });
                    // Pod still exists
                    if (statusRes.data.status === 'not_found') break;
                } catch (err) {
                    // Agent unreachable or 404 = pod gone
                    break;
                }
            }
            // Pod is gone or timed out — remove the DB record
            await MCPDeployment.deleteOne({ _id: deploymentId });
            console.log(`[MCP] Cleanup complete: ${deploymentName} removed from DB`);
        })().catch(err => {
            console.error(`[MCP] Background cleanup failed for ${deploymentName}:`, err.message);
            // Force delete the DB record anyway
            MCPDeployment.deleteOne({ _id: deploymentId }).catch(() => {});
        });
    } catch (error) {
        console.error('Delete MCP deployment error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete deployment' });
    }
});

// @route   POST /api/mcp-catalog/deploy-from-integration
// @desc    Deploy an MCP server using credentials stored in an integration
// @access  Private
router.post('/deploy-from-integration', protect, async (req, res) => {
    try {
        const { integrationType, clusterId } = req.body;
        const userId = req.user._id;

        if (!integrationType || !clusterId) {
            return res.status(400).json({ success: false, error: 'integrationType and clusterId are required' });
        }

        // Map integration types to MCP catalog entries
        const integrationMap = {
            snow: {
                mcpServerId: 'servicenow',
                name: 'servicenow-mcp',
                image: 'ak3hay/servicenow-mcp:latest',
                port: 8000,
                envMapper: (config) => ({
                    SERVICENOW_INSTANCE_URL: config.instance_url,
                    SERVICENOW_USERNAME: config.username,
                    SERVICENOW_PASSWORD: config.password,
                }),
            },
        };

        const mapping = integrationMap[integrationType];
        if (!mapping) {
            return res.status(400).json({ success: false, error: `No MCP server available for integration type: ${integrationType}` });
        }

        // Load and decrypt integration credentials
        const Integration = require('../models/Integration');
        const crypto = require('crypto');
        const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || '';

        const integration = await Integration.findOne({ userId, type: integrationType });
        if (!integration || !integration.encryptedConfig) {
            return res.status(404).json({ success: false, error: `No ${integrationType} integration configured. Please save credentials first.` });
        }

        // Decrypt
        let config;
        try {
            const enc = integration.encryptedConfig;
            const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'hex'));
            decipher.setAuthTag(Buffer.from(enc.authTag, 'hex'));
            let dec = decipher.update(enc.encryptedData, 'hex', 'utf8');
            dec += decipher.final('utf8');
            config = JSON.parse(dec);
        } catch (decErr) {
            console.error('Failed to decrypt integration config:', decErr.message);
            return res.status(500).json({ success: false, error: 'Failed to decrypt integration credentials' });
        }

        // Map credentials to env vars
        const envVars = mapping.envMapper(config);

        // Check for existing deployment
        const existing = await MCPDeployment.findOne({ userId, clusterId, mcpServerId: mapping.mcpServerId });
        if (existing) {
            if (existing.status === 'terminating') {
                return res.status(409).json({
                    success: false,
                    error: `The previous ServiceNow MCP instance is still terminating. Please wait a moment and try again.`,
                    deployment: existing,
                });
            }
            return res.status(409).json({
                success: false,
                error: `ServiceNow MCP is already deployed on this cluster`,
                deployment: existing,
            });
        }

        // Get cluster agent URL
        const { cluster, agentUrl } = await getClusterAgentUrl(clusterId, userId);
        const ns = 'mcp-servers';

        // Create deployment record
        const deployment = await MCPDeployment.create({
            userId,
            clusterId,
            mcpServerId: mapping.mcpServerId,
            name: mapping.name,
            namespace: ns,
            image: mapping.image,
            port: mapping.port,
            envVars,
            deployMethod: 'docker',
            status: 'pending',
        });

        // Deploy to cluster agent
        try {
            const agentPayload = {
                name: mapping.name,
                namespace: ns,
                deployMethod: 'docker',
                image: mapping.image,
                port: mapping.port,
                envVars,
                transportArgs: [],
                stdioCmd: '',
            };

            const agentResponse = await axios.post(`${agentUrl}/mcp/deploy`, agentPayload, { timeout: 60000 });

            deployment.status = 'running';
            deployment.podName = agentResponse.data.podName || '';
            deployment.sseUrl = agentResponse.data.sseUrl || `http://${mapping.name}.${ns}.svc.cluster.local:${mapping.port}/sse`;
            await deployment.save();

            console.log(`[MCP] Deployed ${mapping.name} from ${integrationType} integration on cluster ${cluster.name}`);

            res.status(201).json({
                success: true,
                message: `ServiceNow MCP server deployed successfully on ${cluster.name}`,
                deployment,
            });
        } catch (agentErr) {
            deployment.status = 'failed';
            await deployment.save();
            console.error('[MCP] Deploy from integration failed:', agentErr.message);
            res.status(502).json({
                success: false,
                error: `Failed to deploy to cluster: ${agentErr.message}`,
                deployment,
            });
        }
    } catch (error) {
        console.error('Deploy from integration error:', error);
        res.status(500).json({ success: false, error: error.message || 'Server error' });
    }
});

// @route   GET /api/mcp-catalog/deployments/:id/tools
// @desc    Fetch tools dynamically from a running MCP server
// @access  Private
router.get('/deployments/:id/tools', protect, async (req, res) => {
    try {
        const deployment = await MCPDeployment.findOne({ _id: req.params.id, userId: req.user._id });
        if (!deployment) {
            return res.status(404).json({ success: false, error: 'Deployment not found' });
        }
        if (deployment.status !== 'running') {
            return res.status(400).json({ success: false, error: `MCP server is ${deployment.status}, not running`, tools: [] });
        }

        const { agentUrl } = await getClusterAgentUrl(deployment.clusterId, req.user._id);
        const response = await axios.get(`${agentUrl}/mcp/tools/${deployment.name}`, {
            params: { namespace: deployment.namespace, port: deployment.port },
            timeout: 30000,
        });

        res.json({ success: true, tools: response.data.tools || [], count: response.data.count || 0 });
    } catch (error) {
        console.error('[MCP] Fetch tools error:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch tools', tools: [] });
    }
});

module.exports = router;
