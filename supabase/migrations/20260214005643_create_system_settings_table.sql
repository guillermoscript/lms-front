-- Create system_settings table for platform configuration
CREATE TABLE IF NOT EXISTS system_settings (
    id BIGSERIAL PRIMARY KEY,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    category TEXT NOT NULL CHECK (category IN ('general', 'email', 'payment', 'enrollment')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on category for faster queries
CREATE INDEX idx_system_settings_category ON system_settings(category);

-- Create index on setting_key for faster lookups
CREATE INDEX idx_system_settings_key ON system_settings(setting_key);

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Create policy: Only admins can read settings
CREATE POLICY "Admins can read settings" ON system_settings
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Create policy: Only admins can insert settings
CREATE POLICY "Admins can insert settings" ON system_settings
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Create policy: Only admins can update settings
CREATE POLICY "Admins can update settings" ON system_settings
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Create policy: Only admins can delete settings
CREATE POLICY "Admins can delete settings" ON system_settings
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_updated_at();

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value, category, description) VALUES
    -- General settings
    ('site_name', '{"value": "LMS V2"}', 'general', 'Platform name displayed across the site'),
    ('site_description', '{"value": "A modern learning management system"}', 'general', 'Platform description for SEO and about pages'),
    ('contact_email', '{"value": "contact@example.com"}', 'general', 'Main contact email for the platform'),
    ('support_email', '{"value": "support@example.com"}', 'general', 'Support email for user inquiries'),
    ('timezone', '{"value": "America/New_York"}', 'general', 'Default timezone for the platform'),
    ('maintenance_mode', '{"enabled": false, "message": ""}', 'general', 'Enable maintenance mode with custom message'),
    
    -- Email settings
    ('smtp_host', '{"value": ""}', 'email', 'SMTP server hostname'),
    ('smtp_port', '{"value": 587}', 'email', 'SMTP server port'),
    ('smtp_username', '{"value": ""}', 'email', 'SMTP authentication username'),
    ('smtp_password', '{"value": ""}', 'email', 'SMTP authentication password (encrypted)'),
    ('smtp_from_email', '{"value": "noreply@example.com"}', 'email', 'Email address used as sender'),
    ('smtp_from_name', '{"value": "LMS V2"}', 'email', 'Sender name displayed in emails'),
    ('email_notifications', '{"enabled": true}', 'email', 'Enable/disable email notifications globally'),
    
    -- Payment settings
    ('stripe_enabled', '{"enabled": true}', 'payment', 'Enable Stripe payment processing'),
    ('paypal_enabled', '{"enabled": false}', 'payment', 'Enable PayPal payment processing'),
    ('currency', '{"value": "USD"}', 'payment', 'Default currency for transactions'),
    ('tax_rate', '{"value": 0}', 'payment', 'Default tax rate percentage'),
    ('invoice_prefix', '{"value": "INV"}', 'payment', 'Prefix for invoice numbers'),
    ('require_payment_approval', '{"enabled": false}', 'payment', 'Require admin approval for payments'),
    
    -- Enrollment settings
    ('auto_enrollment', '{"enabled": false}', 'enrollment', 'Automatically enroll users in courses'),
    ('require_enrollment_approval', '{"enabled": false}', 'enrollment', 'Require admin approval for enrollments'),
    ('max_enrollments_per_user', '{"value": 0}', 'enrollment', 'Maximum enrollments per user (0 = unlimited)'),
    ('allow_self_enrollment', '{"enabled": true}', 'enrollment', 'Allow students to enroll themselves in courses'),
    ('enrollment_expiration_days', '{"value": 365}', 'enrollment', 'Days until enrollment expires (0 = never)'),
    ('course_capacity_enabled', '{"enabled": false}', 'enrollment', 'Enable course capacity limits')
ON CONFLICT (setting_key) DO NOTHING;
