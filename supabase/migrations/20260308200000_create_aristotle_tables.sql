-- Aristotle: Course-level AI tutor
-- Tables: course_ai_tutors, aristotle_sessions, aristotle_messages

-- Teacher configuration per course (one-to-one)
CREATE TABLE IF NOT EXISTS course_ai_tutors (
    tutor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id INTEGER NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    persona TEXT DEFAULT '',
    teaching_approach TEXT DEFAULT '',
    boundaries TEXT DEFAULT '',
    enabled BOOLEAN DEFAULT false,
    model_config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(course_id)
);

-- Student chat sessions (session-based with memory)
CREATE TABLE IF NOT EXISTS aristotle_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id INTEGER NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    summary TEXT,
    topics_discussed TEXT[] DEFAULT '{}',
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ
);

-- Chat messages within sessions
CREATE TABLE IF NOT EXISTS aristotle_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES aristotle_sessions(session_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    context_page TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_course_ai_tutors_course ON course_ai_tutors(course_id);
CREATE INDEX idx_course_ai_tutors_tenant ON course_ai_tutors(tenant_id);
CREATE INDEX idx_aristotle_sessions_user_course ON aristotle_sessions(user_id, course_id);
CREATE INDEX idx_aristotle_sessions_tenant ON aristotle_sessions(tenant_id);
CREATE INDEX idx_aristotle_messages_session ON aristotle_messages(session_id);

-- Updated_at trigger for course_ai_tutors
CREATE OR REPLACE FUNCTION update_course_ai_tutors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_course_ai_tutors_updated_at
    BEFORE UPDATE ON course_ai_tutors
    FOR EACH ROW
    EXECUTE FUNCTION update_course_ai_tutors_updated_at();

-- RLS
ALTER TABLE course_ai_tutors ENABLE ROW LEVEL SECURITY;
ALTER TABLE aristotle_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE aristotle_messages ENABLE ROW LEVEL SECURITY;

-- course_ai_tutors: teachers/admins can manage, students can read if enabled
CREATE POLICY "Teachers can manage their course AI tutors"
    ON course_ai_tutors
    FOR ALL
    USING (
        tenant_id IN (
            SELECT tu.tenant_id FROM tenant_users tu
            WHERE tu.user_id = auth.uid()
            AND tu.role IN ('teacher', 'admin')
        )
    );

CREATE POLICY "Students can read enabled AI tutors"
    ON course_ai_tutors
    FOR SELECT
    USING (
        enabled = true
        AND tenant_id IN (
            SELECT tu.tenant_id FROM tenant_users tu
            WHERE tu.user_id = auth.uid()
        )
    );

-- aristotle_sessions: users can manage their own sessions
CREATE POLICY "Users can manage their own sessions"
    ON aristotle_sessions
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- aristotle_messages: users can manage messages in their sessions
CREATE POLICY "Users can manage messages in their sessions"
    ON aristotle_messages
    FOR ALL
    USING (
        session_id IN (
            SELECT s.session_id FROM aristotle_sessions s
            WHERE s.user_id = auth.uid()
        )
    )
    WITH CHECK (
        session_id IN (
            SELECT s.session_id FROM aristotle_sessions s
            WHERE s.user_id = auth.uid()
        )
    );
