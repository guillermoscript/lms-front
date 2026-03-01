-- Create MCP audit log table for tracking all MCP server actions
-- This provides compliance and security audit trail

CREATE TABLE mcp_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role TEXT NOT NULL CHECK (user_role IN ('teacher', 'admin')),
  
  -- Request details
  method TEXT NOT NULL, -- e.g., "tools/call", "resources/read"
  tool_name TEXT,       -- e.g., "create_course", "update_lesson"
  
  -- Context
  request_params JSONB, -- Tool parameters (sanitized)
  response_data JSONB,  -- Tool response summary (optional)
  
  -- Result
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  
  -- Network metadata
  ip_address INET,
  user_agent TEXT
);

-- Indexes for common query patterns
CREATE INDEX idx_mcp_audit_user_id ON mcp_audit_log(user_id);
CREATE INDEX idx_mcp_audit_created_at ON mcp_audit_log(created_at DESC);
CREATE INDEX idx_mcp_audit_tool_name ON mcp_audit_log(tool_name) WHERE tool_name IS NOT NULL;
CREATE INDEX idx_mcp_audit_success ON mcp_audit_log(success) WHERE success = false;
CREATE INDEX idx_mcp_audit_user_role ON mcp_audit_log(user_role);

-- Enable Row Level Security
ALTER TABLE mcp_audit_log ENABLE ROW LEVEL SECURITY;

-- Teachers can view their own audit logs
CREATE POLICY "Teachers view own audit logs"
  ON mcp_audit_log FOR SELECT
  USING (user_id = auth.uid());

-- Admins can view all audit logs
CREATE POLICY "Admins view all audit logs"
  ON mcp_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Only the system (service role) can insert logs
-- Service role bypasses RLS, so this policy is permissive
CREATE POLICY "System inserts audit logs"
  ON mcp_audit_log FOR INSERT
  WITH CHECK (true);

-- Add helpful comments
COMMENT ON TABLE mcp_audit_log IS 'Audit trail for all MCP server actions. Logs are immutable (no UPDATE/DELETE allowed).';
COMMENT ON COLUMN mcp_audit_log.method IS 'MCP protocol method (e.g., tools/call, resources/read)';
COMMENT ON COLUMN mcp_audit_log.tool_name IS 'Name of the tool invoked (null for non-tool methods)';
COMMENT ON COLUMN mcp_audit_log.request_params IS 'Sanitized request parameters (sensitive data filtered)';
COMMENT ON COLUMN mcp_audit_log.success IS 'Whether the operation succeeded';
COMMENT ON COLUMN mcp_audit_log.duration_ms IS 'Operation duration in milliseconds';

-- Create a view for easy querying by admins
CREATE VIEW mcp_audit_summary AS
SELECT
  date_trunc('hour', created_at) as hour,
  user_role,
  tool_name,
  success,
  COUNT(*) as request_count,
  AVG(duration_ms) as avg_duration_ms,
  MAX(duration_ms) as max_duration_ms
FROM mcp_audit_log
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC;

COMMENT ON VIEW mcp_audit_summary IS 'Hourly summary of MCP actions for monitoring and analytics';
