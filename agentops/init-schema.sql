-- AgentOps Database Schema
-- Simplified version for local development

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    project_id_secondary UUID REFERENCES projects(id) ON DELETE SET NULL,
    init_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    end_timestamp TIMESTAMP WITH TIME ZONE,
    end_state VARCHAR(50),
    end_state_reason TEXT,
    tags TEXT[],
    video TEXT,
    host_env JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stats table
CREATE TABLE IF NOT EXISTS stats (
    session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    cost DECIMAL(10, 6) DEFAULT 0,
    llm_calls INTEGER DEFAULT 0,
    tool_calls INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(100),
    init_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    end_timestamp TIMESTAMP WITH TIME ZONE,
    params JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_init_timestamp ON sessions(init_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(init_timestamp);

-- Insert a sample project for testing
INSERT INTO projects (id, name, api_key)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default Project',
    'ao_' || substr(md5(random()::text), 1, 32)
)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE projects IS 'AgentOps projects';
COMMENT ON TABLE sessions IS 'Agent execution sessions (traces)';
COMMENT ON TABLE stats IS 'Session statistics and metrics';
COMMENT ON TABLE events IS 'Session events and spans';
