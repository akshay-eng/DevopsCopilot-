const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const AgentOpsProject = require('../models/AgentOpsProject');
const AgentOpsAPIKey = require('../models/AgentOpsAPIKey');
const { createProject: createPgProject, getDefaultOrg, agentopsPool, clickhouse } = require('../utils/agentopsDb');

/**
 * GET /api/agentops/projects
 * Get all projects for the current user
 */
router.get('/', protect, async (req, res) => {
    try {
        const projects = await AgentOpsProject.find({ user_id: req.user.id })
            .sort({ is_default: -1, created_at: -1 });

        // Enrich with trace counts from ClickHouse
        let enrichedProjects = projects.map(p => p.toObject());
        try {
            const chResult = await clickhouse.query({
                query: `SELECT ResourceAttributes['agentops.project.id'] as project_id, count(DISTINCT TraceId) as cnt FROM otel_traces WHERE ResourceAttributes['agentops.project.id'] != '' GROUP BY project_id`,
                format: 'JSONEachRow'
            });
            const traceCounts = {};
            const chRows = await chResult.json();
            chRows.forEach(r => { traceCounts[r.project_id] = parseInt(r.cnt) || 0; });

            for (const proj of enrichedProjects) {
                if (proj.pg_project_id && traceCounts[proj.pg_project_id]) {
                    proj.trace_count = traceCounts[proj.pg_project_id];
                } else {
                    // Fallback: match by project name in Postgres
                    try {
                        const pgRes = await agentopsPool.query(
                            `SELECT id FROM projects WHERE name = $1`, [proj.name]
                        );
                        if (pgRes.rows.length) {
                            const pgId = pgRes.rows[0].id;
                            proj.trace_count = traceCounts[pgId] || 0;
                            proj.pg_project_id = pgId;
                            // Persist the link for future lookups
                            await AgentOpsProject.updateOne(
                                { _id: proj._id },
                                { pg_project_id: pgId }
                            );
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        } catch (chErr) {
            console.error('Error enriching projects with trace counts:', chErr.message);
        }

        res.json({
            success: true,
            projects: enrichedProjects,
            total: enrichedProjects.length
        });
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch projects',
            message: error.message
        });
    }
});

/**
 * POST /api/agentops/projects
 * Create a new project
 */
router.post('/', protect, async (req, res) => {
    try {
        const { name, description, framework, integration_type, llm_provider } = req.body;

        // Validate required fields
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Project name is required'
            });
        }

        // Check if this is the first project (make it default)
        const existingProjects = await AgentOpsProject.countDocuments({ user_id: req.user.id });
        const isDefault = existingProjects === 0;

        // Create project settings
        const settings = {
            framework: framework || 'custom',
            integration_type: integration_type || 'existing'
        };

        // Add llm_provider if provided
        if (llm_provider) {
            settings.llm_provider = llm_provider;
        }

        // Create project
        const project = new AgentOpsProject({
            user_id: req.user.id,
            name,
            description: description || '',
            organization: req.user.name || req.user.email,
            is_default: isDefault,
            settings
        });

        await project.save();

        // Generate default API key (UUID format for AgentOps SDK)
        const apiKey = AgentOpsAPIKey.generateKey();
        const keyHash = AgentOpsAPIKey.hashKey(apiKey);
        const keyPreview = AgentOpsAPIKey.createPreview(apiKey);

        const apiKeyDoc = new AgentOpsAPIKey({
            project_id: project._id,
            user_id: req.user.id,
            key_hash: keyHash,
            key_preview: keyPreview,
            name: 'Default API Key'
        });

        await apiKeyDoc.save();

        // Sync project to AgentOps Postgres so SDK can authenticate
        try {
            const { v4: uuidv4 } = require('uuid');
            const pgProjectId = uuidv4();
            const org = await getDefaultOrg();
            if (org) {
                await createPgProject({
                    id: pgProjectId,
                    name: name,
                    apiKey: apiKey,
                    orgId: org.id
                });
                // Store pg_project_id on MongoDB project for linking
                project.pg_project_id = pgProjectId;
                await project.save();
                console.log(`[AgentOps] Synced project to Postgres: ${pgProjectId} with API key`);
            } else {
                console.warn('[AgentOps] No default org found in Postgres, skipping sync');
            }
        } catch (pgError) {
            console.error('[AgentOps] Failed to sync project to Postgres (non-fatal):', pgError.message);
        }

        res.status(201).json({
            success: true,
            project,
            api_key: apiKey // Only returned once during creation
        });
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create project',
            message: error.message
        });
    }
});

/**
 * PUT /api/agentops/projects/:id
 * Update a project
 */
router.put('/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, framework, integration_type, llm_provider, is_default } = req.body;

        const project = await AgentOpsProject.findOne({
            _id: id,
            user_id: req.user.id
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Update fields
        if (name) project.name = name;
        if (description !== undefined) project.description = description;
        if (is_default !== undefined) project.is_default = is_default;
        if (framework) project.settings.framework = framework;
        if (integration_type) project.settings.integration_type = integration_type;
        if (llm_provider !== undefined) project.settings.llm_provider = llm_provider;

        await project.save();

        res.json({
            success: true,
            project
        });
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update project',
            message: error.message
        });
    }
});

/**
 * DELETE /api/agentops/projects/:id
 * Delete a project
 */
router.delete('/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;

        const project = await AgentOpsProject.findOne({
            _id: id,
            user_id: req.user.id
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Delete associated API keys
        await AgentOpsAPIKey.deleteMany({ project_id: id });

        // Delete project
        await project.deleteOne();

        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete project',
            message: error.message
        });
    }
});

/**
 * GET /api/agentops/projects/:id/api-keys
 * Get API keys for a project
 */
router.get('/:id/api-keys', protect, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify project ownership
        const project = await AgentOpsProject.findOne({
            _id: id,
            user_id: req.user.id
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        const apiKeys = await AgentOpsAPIKey.find({
            project_id: id,
            user_id: req.user.id
        }).select('-key_hash').sort({ created_at: -1 });

        res.json({
            success: true,
            api_keys: apiKeys
        });
    } catch (error) {
        console.error('Error fetching API keys:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch API keys',
            message: error.message
        });
    }
});

/**
 * POST /api/agentops/projects/:id/api-keys
 * Generate a new API key for a project
 */
router.post('/:id/api-keys', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        // Verify project ownership
        const project = await AgentOpsProject.findOne({
            _id: id,
            user_id: req.user.id
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Generate new API key (UUID format for AgentOps SDK)
        const apiKey = AgentOpsAPIKey.generateKey();
        const keyHash = AgentOpsAPIKey.hashKey(apiKey);
        const keyPreview = AgentOpsAPIKey.createPreview(apiKey);

        const apiKeyDoc = new AgentOpsAPIKey({
            project_id: id,
            user_id: req.user.id,
            key_hash: keyHash,
            key_preview: keyPreview,
            name: name || 'API Key'
        });

        await apiKeyDoc.save();

        // Sync: update the project's API key in AgentOps Postgres
        try {
            const { agentopsPool } = require('../utils/agentopsDb');
            await agentopsPool.query(
                `UPDATE projects SET api_key = $1 WHERE name = $2`,
                [apiKey, project.name]
            );
        } catch (pgError) {
            console.error('[AgentOps] Failed to sync API key to Postgres (non-fatal):', pgError.message);
        }

        res.status(201).json({
            success: true,
            api_key: apiKey, // Only returned once
            key_preview: keyPreview,
            key_id: apiKeyDoc._id
        });
    } catch (error) {
        console.error('Error generating API key:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate API key',
            message: error.message
        });
    }
});

/**
 * DELETE /api/agentops/projects/:projectId/api-keys/:keyId
 * Revoke an API key
 */
router.delete('/:projectId/api-keys/:keyId', protect, async (req, res) => {
    try {
        const { projectId, keyId } = req.params;

        const apiKey = await AgentOpsAPIKey.findOne({
            _id: keyId,
            project_id: projectId,
            user_id: req.user.id
        });

        if (!apiKey) {
            return res.status(404).json({
                success: false,
                error: 'API key not found'
            });
        }

        await apiKey.deleteOne();

        res.json({
            success: true,
            message: 'API key revoked successfully'
        });
    } catch (error) {
        console.error('Error revoking API key:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to revoke API key',
            message: error.message
        });
    }
});

/**
 * POST /api/agentops/verify-installation
 * Verify that AgentOps is installed and working
 */
router.post('/verify-installation', protect, async (req, res) => {
    try {
        const { api_key } = req.body;

        if (!api_key) {
            return res.status(400).json({
                success: false,
                error: 'API key is required'
            });
        }

        // Hash the provided key
        const keyHash = AgentOpsAPIKey.hashKey(api_key);

        // Find the API key
        const apiKeyDoc = await AgentOpsAPIKey.findOne({
            key_hash: keyHash,
            user_id: req.user.id,
            is_active: true
        });

        if (!apiKeyDoc) {
            return res.status(404).json({
                success: false,
                error: 'Invalid API key'
            });
        }

        // Record usage
        await apiKeyDoc.recordUsage();

        res.json({
            success: true,
            message: 'API key verified successfully',
            project_id: apiKeyDoc.project_id
        });
    } catch (error) {
        console.error('Error verifying installation:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify installation',
            message: error.message
        });
    }
});

module.exports = router;
