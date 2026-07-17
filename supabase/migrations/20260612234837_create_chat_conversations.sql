-- General AI study-assistant chat history (mobile app "Asistente de estudio" tab).
-- Unlike aristotle_* (per-course) and lessons_ai_task_messages / exercise_messages
-- (per-lesson / per-exercise), this is a free-form, course-less assistant thread.
-- Mirrors the aristotle_sessions/aristotle_messages conventions: user-owned via
-- RLS (user_id = auth.uid()), tenant_id kept for integrity + explicit client
-- filtering, messages cascade on conversation delete.

-- Conversation threads (one row per chat)
CREATE TABLE IF NOT EXISTS chat_conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Nueva conversación',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Messages within a conversation
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_chat_conversations_user_tenant ON chat_conversations(user_id, tenant_id);
CREATE INDEX idx_chat_conversations_updated ON chat_conversations(updated_at DESC);
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);

-- Updated_at trigger for chat_conversations (bumped when a new message lands)
CREATE OR REPLACE FUNCTION update_chat_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chat_conversations_updated_at
    BEFORE UPDATE ON chat_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_conversations_updated_at();

-- RLS
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- chat_conversations: users can only see/manage their own conversations
CREATE POLICY "Users can manage their own chat conversations"
    ON chat_conversations
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- chat_messages: users can only manage messages inside their own conversations
CREATE POLICY "Users can manage messages in their own conversations"
    ON chat_messages
    FOR ALL
    USING (
        conversation_id IN (
            SELECT c.conversation_id FROM chat_conversations c
            WHERE c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        conversation_id IN (
            SELECT c.conversation_id FROM chat_conversations c
            WHERE c.user_id = auth.uid()
        )
    );
