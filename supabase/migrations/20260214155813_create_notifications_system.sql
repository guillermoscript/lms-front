-- Create notification_templates table for reusable notification templates
CREATE TABLE IF NOT EXISTS notification_templates (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('system', 'course', 'payment', 'enrollment', 'exam', 'custom')),
    variables JSONB DEFAULT '[]'::jsonb, -- Array of variable names like ["student_name", "course_title"]
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create notifications table for system announcements and targeted messages
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('announcement', 'alert', 'info', 'success', 'warning', 'error')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    -- Targeting
    target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all', 'role', 'course', 'user', 'custom')),
    target_roles TEXT[], -- Array of role names ['student', 'teacher']
    target_course_id BIGINT REFERENCES courses(id) ON DELETE CASCADE,
    target_user_ids UUID[], -- Array of specific user IDs
    
    -- Delivery
    delivery_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'], -- ['in_app', 'email', 'push']
    scheduled_for TIMESTAMPTZ, -- NULL = send immediately
    sent_at TIMESTAMPTZ, -- When notification was sent
    expires_at TIMESTAMPTZ, -- NULL = never expires
    
    -- Metadata
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
    created_by UUID REFERENCES auth.users(id),
    template_id BIGINT REFERENCES notification_templates(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional data (action links, etc.)
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_notifications table for individual notification delivery tracking
CREATE TABLE IF NOT EXISTS user_notifications (
    id BIGSERIAL PRIMARY KEY,
    notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Delivery status per channel
    in_app_read BOOLEAN DEFAULT FALSE,
    in_app_read_at TIMESTAMPTZ,
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    push_sent BOOLEAN DEFAULT FALSE,
    push_sent_at TIMESTAMPTZ,
    
    -- User actions
    dismissed BOOLEAN DEFAULT FALSE,
    dismissed_at TIMESTAMPTZ,
    action_taken TEXT, -- URL or action identifier
    action_taken_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(notification_id, user_id)
);

-- Create notification_preferences table for user notification settings
CREATE TABLE IF NOT EXISTS notification_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Channel preferences
    in_app_enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT FALSE,
    
    -- Category preferences (user can disable specific types)
    system_notifications BOOLEAN DEFAULT TRUE,
    course_notifications BOOLEAN DEFAULT TRUE,
    payment_notifications BOOLEAN DEFAULT TRUE,
    enrollment_notifications BOOLEAN DEFAULT TRUE,
    exam_notifications BOOLEAN DEFAULT TRUE,
    
    -- Frequency settings
    email_frequency TEXT DEFAULT 'immediate' CHECK (email_frequency IN ('immediate', 'daily_digest', 'weekly_digest', 'never')),
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_scheduled_for ON notifications(scheduled_for);
CREATE INDEX idx_notifications_target_type ON notifications(target_type);
CREATE INDEX idx_notifications_created_by ON notifications(created_by);
CREATE INDEX idx_notification_templates_category ON notification_templates(category);
CREATE INDEX idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX idx_user_notifications_notification_id ON user_notifications(notification_id);
CREATE INDEX idx_user_notifications_in_app_read ON user_notifications(user_id, in_app_read) WHERE in_app_read = FALSE;

-- Enable RLS
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notification_templates
-- Admins and teachers can view all templates
CREATE POLICY "Admins and teachers can view templates" ON notification_templates
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.role_name IN ('admin', 'teacher')
        )
    );

-- Only admins can create/update/delete templates
CREATE POLICY "Admins can manage templates" ON notification_templates
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.role_name = 'admin'
        )
    );

-- RLS Policies for notifications
-- Admins can view all notifications
CREATE POLICY "Admins can view all notifications" ON notifications
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.role_name = 'admin'
        )
    );

-- Teachers can view notifications they created or for their courses
CREATE POLICY "Teachers can view their notifications" ON notifications
    FOR SELECT
    TO authenticated
    USING (
        created_by = auth.uid()
        OR (
            target_type = 'course'
            AND target_course_id IN (
                SELECT course_id FROM courses WHERE author_id = auth.uid()
            )
        )
    );

-- Admins can manage all notifications
CREATE POLICY "Admins can manage notifications" ON notifications
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.role_name = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.role_name = 'admin'
        )
    );

-- Teachers can create notifications for their courses
CREATE POLICY "Teachers can create course notifications" ON notifications
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.role_name = 'teacher'
        )
        AND (
            target_type = 'course'
            AND target_course_id IN (
                SELECT course_id FROM courses WHERE author_id = auth.uid()
            )
        )
    );

-- RLS Policies for user_notifications
-- Users can view their own notifications
CREATE POLICY "Users can view their notifications" ON user_notifications
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read, dismissed)
CREATE POLICY "Users can update their notifications" ON user_notifications
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- System can insert user notifications (via admin/trigger)
CREATE POLICY "Admins can manage user notifications" ON user_notifications
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.role_name = 'admin'
        )
    );

-- RLS Policies for notification_preferences
-- Users can view and update their own preferences
CREATE POLICY "Users can view their preferences" ON notification_preferences
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their preferences" ON notification_preferences
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert their preferences" ON notification_preferences
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_notification_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_templates_updated_at();

CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();

CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_preferences_updated_at();

-- Create default notification templates
INSERT INTO notification_templates (name, title, content, category, variables) VALUES
    ('welcome_student', 'Welcome to {{platform_name}}!', 'Hello {{student_name}},\n\nWelcome to our learning platform! We''re excited to have you join us.\n\nGet started by browsing our course catalog and enrolling in your first course.\n\nBest regards,\nThe {{platform_name}} Team', 'system', '["student_name", "platform_name"]'),
    
    ('course_enrollment', 'Successfully Enrolled in {{course_title}}', 'Hi {{student_name}},\n\nYou''ve been successfully enrolled in {{course_title}}!\n\nYou can now access all course materials, lessons, and exercises. Start learning at your own pace.\n\nGood luck!', 'enrollment', '["student_name", "course_title"]'),
    
    ('exam_graded', 'Exam Results Available: {{exam_title}}', 'Hello {{student_name}},\n\nYour exam "{{exam_title}}" has been graded.\n\nScore: {{score}}/{{total}}\n\nView your detailed results and feedback in the course dashboard.\n\nKeep up the great work!', 'exam', '["student_name", "exam_title", "score", "total"]'),
    
    ('payment_success', 'Payment Successful', 'Hi {{student_name}},\n\nYour payment of {{amount}} {{currency}} has been processed successfully.\n\nTransaction ID: {{transaction_id}}\nDate: {{date}}\n\nThank you for your purchase!', 'payment', '["student_name", "amount", "currency", "transaction_id", "date"]'),
    
    ('lesson_completed', 'Great Job! Lesson Completed', 'Congratulations {{student_name}}!\n\nYou''ve completed the lesson "{{lesson_title}}" in {{course_title}}.\n\nKeep going! You''re making excellent progress.', 'course', '["student_name", "lesson_title", "course_title"]'),
    
    ('system_announcement', 'Platform Announcement', '{{announcement_content}}', 'system', '["announcement_content"]')
ON CONFLICT DO NOTHING;
